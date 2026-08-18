import {
  Body,
  ConflictException,
  Controller,
  Get,
  Injectable,
  Post,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { IsEmail, IsOptional, IsString, MinLength } from "class-validator";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { DatabaseService } from "./database.service";
import { AuthGuard, AuthUser, CurrentUser } from "./auth";
export class RegisterDto {
  @IsString() @MinLength(2) name!: string;
  @IsEmail() email!: string;
  @IsString() @MinLength(10) password!: string;
  @IsOptional() @IsString() currency?: string;
}
export class LoginDto {
  @IsEmail() email!: string;
  @IsString() password!: string;
}
@Injectable()
export class AuthService {
  constructor(
    private readonly db: DatabaseService,
    private readonly jwt: JwtService,
  ) {}
  private view(u: {
    id: string;
    name: string;
    email: string;
    currency: string;
    createdAt: Date;
    updatedAt: Date;
  }) {
    const { id, name, email, currency, createdAt, updatedAt } = u;
    return { id, name, email, currency, createdAt, updatedAt };
  }
  async register(dto: RegisterDto) {
    const email = dto.email.trim().toLowerCase();
    const exists = await this.db.user.findUnique({ where: { email } });
    if (exists) throw new Error("EMAIL_ALREADY_EXISTS");
    const u = await this.db.user.create({
      data: {
        name: dto.name.trim(),
        email,
        passwordHash: await bcrypt.hash(dto.password, 12),
        currency: dto.currency?.trim().toUpperCase() || "IQD",
      },
    });
    return {
      user: this.view(u),
      accessToken: this.jwt.sign({ id: u.id, email: u.email }),
    };
  }
  async login(dto: LoginDto) {
    const u = await this.db.user.findUnique({
      where: { email: dto.email.trim().toLowerCase() },
    });
    if (!u || !(await bcrypt.compare(dto.password, u.passwordHash)))
      throw new Error("INVALID_CREDENTIALS");
    return {
      user: this.view(u),
      accessToken: this.jwt.sign({ id: u.id, email: u.email }),
    };
  }
  me(userId: string) {
    return this.db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        currency: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }
}
@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}
  @Post("register") register(@Body() dto: RegisterDto) {
    return this.auth.register(dto).catch((e) => {
      if (e.message === "EMAIL_ALREADY_EXISTS")
        throw new ConflictException("Email already registered");
      throw e;
    });
  }
  @Post("login") login(@Body() dto: LoginDto) {
    return this.auth.login(dto).catch((e) => {
      if (e.message === "INVALID_CREDENTIALS")
        throw new UnauthorizedException("Invalid credentials");
      throw e;
    });
  }
  @UseGuards(AuthGuard) @Get("me") me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id);
  }
}
