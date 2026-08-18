import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from "@nestjs/common";
@Catch()
export class HttpErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger("Http");
  catch(error: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse();
    const code = error instanceof Error ? error.message : "";
    const status =
      error instanceof HttpException
        ? error.getStatus()
        : {
            NOT_FOUND: 404,
            INVALID_DATE_RANGE: 400,
            INVALID_PAY_DAY: 400,
            MALFORMED_EXPENSE: 400,
            INVALID_AMOUNT: 400,
            INVALID_WEBHOOK_SECRET: 401,
          }[code] || 500;
    if (status >= 500)
      this.logger.error(
        error instanceof Error ? error.message : "Unknown error",
      );
    res
      .status(status)
      .json({
        statusCode: status,
        message:
          status >= 500
            ? "Internal server error"
            : error instanceof HttpException
              ? error.getResponse()
              : code,
      });
  }
}
