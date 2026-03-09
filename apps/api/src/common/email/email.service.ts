/**
 * EmailService — Transactional email dispatch via Brevo (ex-Sendinblue).
 *
 * Battle-tested patterns from modulo-pagamento-email:
 *  - Parse "Name <email>" format for sender
 *  - Fallback to console when BREVO_API_KEY is missing (dev)
 *  - Never throws — returns boolean (true = accepted, false = failed)
 *  - 10s timeout on Brevo API calls
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface SendEmailOpts {
  to: string;
  subject: string;
  html: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  private readonly apiKey: string | undefined;
  private readonly senderName: string;
  private readonly senderEmail: string;

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<string>('BREVO_API_KEY');

    const fromRaw =
      this.config.get<string>('EMAIL_FROM') ?? 'Zap-Conecta <noreply@zapconectapi.com.br>';

    // Parse "Name <email>" format
    const match = fromRaw.match(/^(.+?)\s*<(.+?)>$/);
    this.senderName = match ? match[1].trim() : 'Zap-Conecta';
    this.senderEmail = match ? match[2].trim() : 'noreply@zapconectapi.com.br';

    if (!this.apiKey) {
      this.logger.warn('BREVO_API_KEY not configured — emails will be logged to console');
    }
  }

  /**
   * Send a transactional email via Brevo.
   * Returns true if accepted by Brevo API, false on any failure.
   * Never throws.
   */
  async send(opts: SendEmailOpts): Promise<boolean> {
    if (!this.apiKey) {
      this.logger.log(`[dev] Email to: ${opts.to} | subject: ${opts.subject}`);
      return false;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    try {
      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sender: { name: this.senderName, email: this.senderEmail },
          to: [{ email: opts.to }],
          subject: opts.subject,
          htmlContent: opts.html,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const err = await res.text().catch(() => '');
        this.logger.error(`Brevo failed: ${res.status} ${err} | to: ${opts.to}`);
        return false;
      }

      return true;
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        this.logger.error(`Brevo timeout (10s) | to: ${opts.to}`);
      } else {
        this.logger.error(`Brevo network error: ${err} | to: ${opts.to}`);
      }
      return false;
    } finally {
      clearTimeout(timeout);
    }
  }
}
