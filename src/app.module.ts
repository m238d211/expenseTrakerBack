import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { ThrottlerModule } from "@nestjs/throttler";
import { DatabaseService } from "./database.service";
import { AuthController, AuthService } from "./auth.module";
import { FinanceController, FinanceService } from "./finance.module";
import { AnalyticsController, AnalyticsService } from "./analytics.module";
import { TelegramController, TelegramService } from "./telegram.module";
import {
  NotificationsController,
  NotificationsService,
} from "./notifications.module";
import { HealthController } from "./health.controller";
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: (env) => {
        if (!env.DATABASE_URL) throw new Error("DATABASE_URL is required");
        if (!env.JWT_SECRET) throw new Error("JWT_SECRET is required");
        return env;
      },
    }),
    JwtModule.registerAsync({
      global: true,
      useFactory: (c: ConfigService) => ({
        secret: c.getOrThrow("JWT_SECRET"),
        signOptions: { expiresIn: c.get("JWT_EXPIRES_IN", "15m") },
      }),
      inject: [ConfigService],
    }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
  ],
  controllers: [
    HealthController,
    AuthController,
    FinanceController,
    AnalyticsController,
    TelegramController,
    NotificationsController,
  ],
  providers: [
    DatabaseService,
    AuthService,
    FinanceService,
    AnalyticsService,
    TelegramService,
    NotificationsService,
  ],
})
export class AppModule {}
