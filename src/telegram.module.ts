import { Body, Controller, Injectable, Post, Req, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TransactionType } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { AuthGuard, AuthUser, CurrentUser } from './auth';
import { DatabaseService } from './database.service';
import { FinanceService, TransactionDto } from './finance.module';

export function parseExpense(text: string) {
  const match = text.trim().match(/^(\d+(?:\.\d+)?)\s*(.*)$/u);
  if (!match || !match[2].trim()) throw new Error('MALFORMED_EXPENSE');
  const amount = Math.round(Number(match[1]));
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('INVALID_AMOUNT');
  return { amount, description: match[2].trim(), type: TransactionType.expense };
}

type TelegramButtonUpdate = {
  id?: string;
  data?: string;
  from?: { id?: number | string };
  message?: { message_id?: number; chat?: { id?: number | string } };
};

@Injectable()
export class TelegramService {
  constructor(
    private readonly db: DatabaseService,
    private readonly finance: FinanceService,
    private readonly config: ConfigService,
  ) {}

  private async api(method: string, payload: Record<string, unknown>) {
    const token = this.config.get<string>('TELEGRAM_BOT_TOKEN');
    if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not configured');
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = (await response.json()) as { ok?: boolean; description?: string };
    if (!response.ok || !result.ok) throw new Error(result.description || 'Telegram API request failed');
    return result;
  }

  private async sendMessage(chatId: string | number, text: string, transactionId?: string) {
    return this.api('sendMessage', {
      chat_id: chatId,
      text,
      ...(transactionId
        ? {
            reply_markup: {
              inline_keyboard: [[
                { text: '✅ Confirm', callback_data: `confirm:${transactionId}` },
                { text: '❌ Cancel', callback_data: `cancel:${transactionId}` },
              ]],
            },
          }
        : {}),
    });
  }

  async linkToken(userId: string) {
    const raw = randomBytes(24).toString('base64url');
    const bot = (await this.api('getMe', {})) as {
      result?: { username?: string };
    };
    const username = bot.result?.username;
    if (!username) throw new Error('Telegram bot username is unavailable');
    await this.db.telegramLinkToken.create({
      data: {
        tokenHash: createHash('sha256').update(raw).digest('hex'),
        userId,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });
    return {
      token: raw,
      link: `https://t.me/${username}?start=${encodeURIComponent(raw)}`,
      expiresInSeconds: 600,
    };
  }

  async unlink(userId: string) {
    return this.db.telegramAccount.deleteMany({ where: { userId } });
  }

  async webhook(body: any, secret?: string) {
    const expected = this.config.get<string>('TELEGRAM_WEBHOOK_SECRET');
    if (expected && secret !== expected) throw new Error('INVALID_WEBHOOK_SECRET');

    const updateId = body?.update_id;
    if (!Number.isInteger(updateId)) return { ok: true };
    try {
      await this.db.telegramUpdate.create({ data: { updateId } });
    } catch {
      return { ok: true, duplicate: true };
    }

    const callback = body?.callback_query as TelegramButtonUpdate | undefined;
    const text = body?.message?.text as string | undefined;
    const telegramUserId = String(body?.message?.from?.id ?? callback?.from?.id ?? '');
    if (callback) return this.callback(callback, telegramUserId);
    if (!text || !telegramUserId) return { ok: true };

    const chatId = String(body.message.chat.id);
    if (text.startsWith('/start ')) return this.startLink(text.slice(7).trim(), telegramUserId, chatId);
    if (text === '/start') {
      await this.safeMessage(chatId, 'Send the linking link from the app first, then send your expense.');
      return { ok: true };
    }

    const account = await this.db.telegramAccount.findUnique({ where: { telegramUserId } });
    if (!account) {
      await this.safeMessage(chatId, 'This Telegram account is not linked to the app yet.');
      return { ok: true, reason: 'unlinked' };
    }

    try {
      const parsed = parseExpense(text);
      const transaction = await this.finance.createTransaction(account.userId, {
        ...parsed,
        source: 'telegram',
        status: 'pending',
      } as TransactionDto);
      await this.safeMessage(chatId, `Record ${transaction.amount} for "${transaction.description}"?`, transaction.id);
      return { ok: true, transactionId: transaction.id };
    } catch (error) {
      if (error instanceof Error && ['MALFORMED_EXPENSE', 'INVALID_AMOUNT'].includes(error.message)) {
        await this.safeMessage(chatId, 'Use this format: 25000 description');
        return { ok: true, reason: 'invalid_expense' };
      }
      throw error;
    }
  }

  private async startLink(raw: string, telegramUserId: string, chatId: string) {
    const tokenHash = createHash('sha256').update(raw).digest('hex');
    const token = await this.db.telegramLinkToken.findFirst({ where: { tokenHash, expiresAt: { gt: new Date() } } });
    if (!token) {
      await this.safeMessage(chatId, 'This linking link is expired or invalid.');
      return { ok: true, reason: 'invalid_link' };
    }
    await this.db.$transaction([
      this.db.telegramAccount.upsert({
        where: { telegramUserId },
        create: { telegramUserId, chatId, userId: token.userId },
        update: { chatId, userId: token.userId },
      }),
      this.db.telegramLinkToken.delete({ where: { id: token.id } }),
    ]);
    await this.safeMessage(chatId, 'Telegram account linked successfully. You can now send expenses.');
    return { ok: true, linked: true };
  }

  private async callback(callback: TelegramButtonUpdate, telegramUserId: string) {
    const account = await this.db.telegramAccount.findUnique({ where: { telegramUserId } });
    const match = String(callback.data || '').match(/^(confirm|cancel):([\w-]+)$/);
    if (!account || !match) {
      await this.answerCallback(callback.id, 'This action is expired or not yours.');
      return { ok: true, reason: 'expired_or_unowned' };
    }
    const transaction = await this.db.transaction.findFirst({ where: { id: match[2], userId: account.userId, status: 'pending' } });
    if (!transaction) {
      await this.answerCallback(callback.id, 'This transaction is already processed.');
      return { ok: true, reason: 'expired_or_unowned' };
    }
    const status = match[1] === 'confirm' ? 'confirmed' : 'cancelled';
    await this.db.transaction.update({ where: { id: transaction.id }, data: { status } });
    await this.answerCallback(callback.id, status === 'confirmed' ? 'Expense confirmed.' : 'Expense cancelled.');
    const chatId = callback.message?.chat?.id;
    if (chatId !== undefined && callback.message?.message_id !== undefined) await this.safeEdit(chatId, callback.message.message_id, `${status === 'confirmed' ? '✅ Confirmed' : '❌ Cancelled'}: ${transaction.amount} for "${transaction.description}"`);
    return { ok: true, status };
  }

  private async answerCallback(callbackId?: string, text?: string) {
    if (!callbackId) return;
    await this.safeApi('answerCallbackQuery', { callback_query_id: callbackId, text });
  }

  private async safeEdit(chatId: string | number, messageId: number, text: string) {
    await this.safeApi('editMessageText', { chat_id: chatId, message_id: messageId, text });
  }

  private async safeMessage(chatId: string | number, text: string, transactionId?: string) {
    await this.safeApi('sendMessage', {
      chat_id: chatId,
      text,
      ...(transactionId ? { reply_markup: { inline_keyboard: [[{ text: '✅ Confirm', callback_data: `confirm:${transactionId}` }, { text: '❌ Cancel', callback_data: `cancel:${transactionId}` }]] } } : {}),
    });
  }

  private async safeApi(method: string, payload: Record<string, unknown>) {
    try {
      await this.api(method, payload);
    } catch {
      // Telegram delivery failures must not cause Telegram to retry the database update.
    }
  }
}

@Controller('telegram')
export class TelegramController {
  constructor(private readonly telegram: TelegramService) {}
  @UseGuards(AuthGuard)
  @Post('link-token') token(@CurrentUser() user: AuthUser) { return this.telegram.linkToken(user.id); }
  @UseGuards(AuthGuard)
  @Post('unlink') unlink(@CurrentUser() user: AuthUser) { return this.telegram.unlink(user.id); }
  @Post('webhook') webhook(@Body() body: any, @Req() request: any) { return this.telegram.webhook(body, request.headers['x-telegram-bot-api-secret-token']); }
}
