/**
 * BillingEmailService — Billing-specific transactional emails.
 *
 * Uses the global EmailService (Brevo) underneath.
 * All methods are fire-and-forget safe (never throw).
 */

import { Injectable, Logger } from '@nestjs/common';
import { EmailService } from '../common/email/email.service';

function formatBRL(cents: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(cents / 100);
}

function emailWrapper(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'DM Sans',Helvetica Neue,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#0f172a;border-radius:16px;overflow:hidden;">
          <tr>
            <td style="padding:28px 40px 20px;text-align:center;border-bottom:1px solid rgba(255,255,255,0.07);">
              <div style="display:inline-block;background:rgba(34,197,94,0.12);border:1px solid rgba(34,197,94,0.25);border-radius:8px;padding:6px 14px;margin-bottom:12px;">
                <span style="font-size:11px;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;color:#4ade80;">Zap-Conecta</span>
              </div>
              <div style="font-size:20px;font-weight:700;color:#f8fafc;line-height:1.3;">${title}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 40px;">
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:18px 40px 26px;border-top:1px solid rgba(255,255,255,0.07);text-align:center;">
              <p style="margin:0;color:#64748b;font-size:12px;line-height:1.5;">
                Zap-Conecta &mdash; Plataforma de WhatsApp para negócios
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

@Injectable()
export class BillingEmailService {
  private readonly logger = new Logger(BillingEmailService.name);

  constructor(private readonly email: EmailService) {}

  /** Email: Pagamento confirmado — assinatura ativa. */
  async sendPaymentConfirmed(
    email: string,
    planName: string,
    amountCents: number,
  ): Promise<void> {
    const subject = `Pagamento confirmado — Plano ${planName}`;
    const body = `
      <p style="margin:0 0 14px;color:#cbd5e1;font-size:15px;line-height:1.6;">
        Seu pagamento de <strong style="color:#4ade80;">${formatBRL(amountCents)}</strong>
        foi confirmado com sucesso.
      </p>
      <div style="background:rgba(34,197,94,0.06);border:1px solid rgba(34,197,94,0.15);border-radius:8px;padding:14px 16px;">
        <p style="margin:0;color:#86efac;font-size:14px;line-height:1.5;">
          Seu plano <strong>${planName}</strong> está ativo. Continue usando o Zap-Conecta normalmente.
        </p>
      </div>
    `;

    const ok = await this.email.send({ to: email, subject, html: emailWrapper(subject, body) });
    if (!ok) this.logger.warn(`Failed to send payment confirmed email to ${email}`);
  }

  /** Email: Pagamento atrasado — aviso de vencimento. */
  async sendPaymentOverdue(email: string, planName: string): Promise<void> {
    const subject = `Pagamento pendente — Plano ${planName}`;
    const body = `
      <p style="margin:0 0 14px;color:#cbd5e1;font-size:15px;line-height:1.6;">
        O pagamento do seu plano <strong style="color:#f8fafc;">${planName}</strong> está em atraso.
      </p>
      <div style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.2);border-radius:8px;padding:12px 16px;">
        <p style="margin:0;color:#fbbf24;font-size:13px;line-height:1.5;">
          Regularize seu pagamento para evitar a suspensão do serviço.
          Se já realizou o pagamento, por favor desconsidere este aviso.
        </p>
      </div>
    `;

    const ok = await this.email.send({ to: email, subject, html: emailWrapper(subject, body) });
    if (!ok) this.logger.warn(`Failed to send payment overdue email to ${email}`);
  }

  /** Email: Pagamento estornado — acesso revogado. */
  async sendPaymentRefunded(
    email: string,
    planName: string,
    amountCents: number,
  ): Promise<void> {
    const subject = `Estorno processado — Plano ${planName}`;
    const body = `
      <p style="margin:0 0 14px;color:#cbd5e1;font-size:15px;line-height:1.6;">
        O estorno de <strong style="color:#f87171;">${formatBRL(amountCents)}</strong>
        referente ao plano <strong style="color:#f8fafc;">${planName}</strong> foi processado.
      </p>
      <div style="background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.15);border-radius:8px;padding:14px 16px;">
        <p style="margin:0;color:#fca5a5;font-size:14px;line-height:1.5;">
          Sua assinatura foi cancelada e o acesso foi revertido para o plano <strong>Free</strong>.
          Caso deseje, você pode assinar novamente a qualquer momento.
        </p>
      </div>
    `;

    const ok = await this.email.send({ to: email, subject, html: emailWrapper(subject, body) });
    if (!ok) this.logger.warn(`Failed to send payment refunded email to ${email}`);
  }

  /** Email: Assinatura renovada — novo ciclo mensal. */
  async sendSubscriptionRenewed(email: string, planName: string): Promise<void> {
    const subject = `Assinatura renovada — Plano ${planName}`;
    const body = `
      <p style="margin:0 0 14px;color:#cbd5e1;font-size:15px;line-height:1.6;">
        Sua assinatura do plano <strong style="color:#4ade80;">${planName}</strong>
        foi renovada com sucesso para mais um ciclo mensal.
      </p>
      <div style="background:rgba(34,197,94,0.06);border:1px solid rgba(34,197,94,0.15);border-radius:8px;padding:14px 16px;">
        <p style="margin:0;color:#86efac;font-size:14px;line-height:1.5;">
          Continue usando o Zap-Conecta normalmente. O próximo pagamento será cobrado automaticamente.
        </p>
      </div>
    `;

    const ok = await this.email.send({ to: email, subject, html: emailWrapper(subject, body) });
    if (!ok) this.logger.warn(`Failed to send subscription renewed email to ${email}`);
  }

  /** Email: Assinatura cancelada. */
  async sendSubscriptionCancelled(email: string, planName: string): Promise<void> {
    const subject = `Assinatura cancelada — ${planName}`;
    const body = `
      <p style="margin:0 0 14px;color:#cbd5e1;font-size:15px;line-height:1.6;">
        Sua assinatura do plano <strong style="color:#f8fafc;">${planName}</strong>
        foi cancelada com sucesso.
      </p>
      <p style="margin:0 0 14px;color:#cbd5e1;font-size:15px;line-height:1.6;">
        Seu acesso foi revertido para o plano <strong style="color:#f8fafc;">Free</strong>.
        Você pode fazer upgrade novamente a qualquer momento.
      </p>
    `;

    const ok = await this.email.send({ to: email, subject, html: emailWrapper(subject, body) });
    if (!ok) this.logger.warn(`Failed to send subscription cancelled email to ${email}`);
  }
}
