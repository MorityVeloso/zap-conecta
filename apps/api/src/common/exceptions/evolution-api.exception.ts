import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Thrown when the Evolution API (upstream WhatsApp provider) returns an error.
 * Maps to HTTP 502 Bad Gateway — our server is healthy, the upstream isn't cooperating.
 */
export class EvolutionApiException extends HttpException {
  constructor(
    public readonly upstreamStatus: number,
    public readonly upstreamBody: string,
  ) {
    const parsed = EvolutionApiException.tryParseBody(upstreamBody);

    super(
      {
        statusCode: HttpStatus.BAD_GATEWAY,
        error: 'WhatsApp Provider Error',
        message: parsed.message || `Evolution API returned ${upstreamStatus}`,
        provider: {
          status: upstreamStatus,
          detail: parsed.detail,
        },
      },
      HttpStatus.BAD_GATEWAY,
    );
  }

  private static tryParseBody(body: string): {
    message: string;
    detail: unknown;
  } {
    try {
      const json = JSON.parse(body);
      // Evolution API returns errors as { response: { message: [...] }, status: 400 }
      // or { message: "...", error: "..." }
      const messages = json?.response?.message ?? json?.message;
      const message = Array.isArray(messages) ? messages.join('; ') : String(messages ?? '');
      return { message, detail: json };
    } catch {
      return { message: body.slice(0, 200), detail: body.slice(0, 200) };
    }
  }
}
