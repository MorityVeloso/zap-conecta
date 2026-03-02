import { useState } from 'react'
import { Zap, Check, ArrowRight, CreditCard, Calendar, AlertCircle, ChevronDown } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'

interface Plan {
  id: string
  name: string
  displayName: string
  priceBrlCents: number
  messagesPerMonth: number
  instancesLimit: number
  apiKeysLimit: number
}

interface Subscription {
  id: string
  status: 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'PAUSED'
  currentPeriodStart: string | null
  currentPeriodEnd: string | null
  cancelledAt: string | null
}

interface Tenant {
  id: string
  name: string
  plan: Plan
}

interface SubscribeResult {
  asaasSubscriptionId: string
  status: string
  nextDueDate: string
}

interface AsaasPayment {
  id: string
  status: string
  value: number
  dueDate: string
  paymentDate?: string
  billingType: string
}

function formatPrice(cents: number): string {
  if (cents === 0) return 'Grátis'
  return `R$ ${(cents / 100).toFixed(0)}/mês`
}

const PLAN_FEATURES: Record<string, string[]> = {
  free: ['300 mensagens/mês', '1 número WhatsApp', '2 API Keys', 'Suporte por email'],
  starter: ['5.000 mensagens/mês', '3 números WhatsApp', '5 API Keys', 'Suporte prioritário', 'Webhooks'],
  pro: ['30.000 mensagens/mês', '10 números WhatsApp', 'API Keys ilimitadas', 'Suporte dedicado', 'SLA 99.9%'],
}

const PAYMENT_STATUS_BADGE: Record<string, { label: string; variant: 'success' | 'warning' | 'destructive' | 'secondary' }> = {
  RECEIVED: { label: 'Pago', variant: 'success' },
  CONFIRMED: { label: 'Confirmado', variant: 'success' },
  PENDING: { label: 'Pendente', variant: 'warning' },
  OVERDUE: { label: 'Em atraso', variant: 'destructive' },
  REFUNDED: { label: 'Estornado', variant: 'secondary' },
}

// ── Subscribe / Change Plan Modal ─────────────────────────────────────────

function SubscribeModal({
  plan,
  open,
  isChangePlan,
  onClose,
  onSuccess,
}: {
  plan: Plan
  open: boolean
  isChangePlan: boolean
  onClose: () => void
  onSuccess: (result: SubscribeResult) => void
}) {
  const [customerName, setCustomerName] = useState('')
  const [cpf, setCpf] = useState('')

  const mutation = useMutation({
    mutationFn: () => {
      if (isChangePlan) {
        return api.patch<SubscribeResult>('/billing/subscription', { planName: plan.name })
      }
      return api.post<SubscribeResult>('/billing/subscribe', {
        planName: plan.name,
        customerName: customerName.trim(),
        cpf: cpf.replace(/\D/g, ''),
        billingType: 'PIX',
      })
    },
    onSuccess: (data) => {
      onSuccess(data)
      onClose()
    },
    onError: (err: Error) => {
      toast.error(err.message ?? 'Erro ao criar assinatura')
    },
  })

  const formatCpf = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 11)
    return digits
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
  }

  const cpfDigits = cpf.replace(/\D/g, '')
  const canSubmit = isChangePlan || (customerName.trim().length >= 2 && cpfDigits.length === 11)

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isChangePlan ? 'Alterar para' : 'Assinar'} plano {plan.displayName}</DialogTitle>
          <DialogDescription>
            {formatPrice(plan.priceBrlCents)} · pagamento via PIX (recorrente mensal)
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {!isChangePlan && (
            <>
              <div>
                <Label htmlFor="sub-name">Nome completo</Label>
                <Input
                  id="sub-name"
                  placeholder="Seu nome ou da empresa"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="mt-1.5"
                  autoFocus
                />
              </div>
              <div>
                <Label htmlFor="sub-cpf">CPF</Label>
                <Input
                  id="sub-cpf"
                  placeholder="000.000.000-00"
                  value={cpf}
                  onChange={(e) => setCpf(formatCpf(e.target.value))}
                  className="mt-1.5"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Necessário para emissão da cobrança via PIX
                </p>
              </div>
            </>
          )}

          {isChangePlan && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 px-4 py-3 text-sm">
              <p className="font-medium text-foreground">Trocar de plano</p>
              <p className="text-muted-foreground mt-1">
                Sua assinatura atual será cancelada e uma nova cobrança via PIX será gerada para o plano {plan.displayName}.
              </p>
            </div>
          )}

          {!isChangePlan && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
              <p className="font-medium text-foreground">Como funciona</p>
              <ol className="list-decimal list-inside text-muted-foreground mt-1.5 space-y-1">
                <li>Confirme os dados e clique em assinar</li>
                <li>Um PIX será gerado e enviado automaticamente</li>
                <li>Após o pagamento, seu plano é ativado automaticamente</li>
              </ol>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            variant="gradient"
            onClick={() => mutation.mutate()}
            loading={mutation.isPending}
            disabled={!canSubmit}
          >
            {isChangePlan ? 'Confirmar troca' : `Assinar plano ${plan.displayName}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Cancel confirmation ───────────────────────────────────────────────────

function CancelConfirmDialog({
  open,
  onClose,
  onConfirm,
  loading,
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  loading: boolean
}) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancelar assinatura</DialogTitle>
          <DialogDescription>
            Tem certeza que deseja cancelar? Seu plano será rebaixado para Free ao final do período.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Manter assinatura</Button>
          <Button variant="destructive" onClick={onConfirm} loading={loading}>
            Cancelar assinatura
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Payment history ───────────────────────────────────────────────────────

function PaymentHistory() {
  const [open, setOpen] = useState(false)
  const { data: payments = [], isLoading } = useQuery({
    queryKey: ['billing', 'payments'],
    queryFn: () => api.get<AsaasPayment[]>('/billing/payments'),
    enabled: open,
  })

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-sm text-primary hover:underline"
      >
        <Calendar className="w-4 h-4" />
        Histórico de pagamentos
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <Card className="mt-3 overflow-hidden">
          {isLoading ? (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">Carregando…</div>
          ) : payments.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">Nenhum pagamento encontrado</div>
          ) : (
            <div className="divide-y divide-border">
              {payments.map((p) => {
                const badge = PAYMENT_STATUS_BADGE[p.status] ?? { label: p.status, variant: 'secondary' as const }
                return (
                  <div key={p.id} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="text-sm font-medium">
                        R$ {p.value.toFixed(2).replace('.', ',')}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Vencimento: {new Date(p.dueDate).toLocaleDateString('pt-BR')}
                        {p.paymentDate && (
                          <> · Pago em: {new Date(p.paymentDate).toLocaleDateString('pt-BR')}</>
                        )}
                      </p>
                    </div>
                    <Badge variant={badge.variant}>{badge.label}</Badge>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      )}
    </div>
  )
}

// ── BillingPage ──────────────────────────────────────────────────────────────

export function BillingPage() {
  const queryClient = useQueryClient()
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null)
  const [subscribeResult, setSubscribeResult] = useState<SubscribeResult | null>(null)
  const [cancelOpen, setCancelOpen] = useState(false)

  const { data: tenant } = useQuery({
    queryKey: ['tenant', 'me'],
    queryFn: () => api.get<Tenant>('/tenants/me'),
  })

  const { data: plans = [] } = useQuery({
    queryKey: ['billing', 'plans'],
    queryFn: () => api.get<Plan[]>('/billing/plans'),
  })

  const { data: subscriptionData } = useQuery({
    queryKey: ['billing', 'subscription'],
    queryFn: () => api.get<{ subscription: Subscription | null; plan: Plan }>('/billing/subscription'),
  })

  const cancelMutation = useMutation({
    mutationFn: () => api.delete<void>('/billing/subscription'),
    onSuccess: () => {
      toast.success('Assinatura cancelada')
      setCancelOpen(false)
      void queryClient.invalidateQueries({ queryKey: ['billing'] })
      void queryClient.invalidateQueries({ queryKey: ['tenant'] })
    },
    onError: (err: Error) => {
      toast.error(err.message ?? 'Erro ao cancelar assinatura')
    },
  })

  const currentPlanName = tenant?.plan?.name?.toLowerCase() ?? 'free'
  const sub = subscriptionData?.subscription
  const hasActiveSub = sub && sub.status !== 'CANCELLED'
  const isChangePlan = hasActiveSub && sub.status === 'ACTIVE'

  const STATUS_BADGE = {
    ACTIVE: { label: 'Ativo', variant: 'success' as const },
    TRIALING: { label: 'Período de teste', variant: 'warning' as const },
    PAST_DUE: { label: 'Pagamento atrasado', variant: 'destructive' as const },
    CANCELLED: { label: 'Cancelado', variant: 'secondary' as const },
    PAUSED: { label: 'Pausado', variant: 'secondary' as const },
  }

  const invalidateAll = () => {
    void queryClient.invalidateQueries({ queryKey: ['billing'] })
    void queryClient.invalidateQueries({ queryKey: ['tenant'] })
  }

  return (
    <div className="p-6 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Billing</h1>
        <p className="text-muted-foreground mt-0.5 text-sm">
          Gerencie seu plano e assinatura
        </p>
      </div>

      {/* PIX pending banner */}
      {subscribeResult && (
        <div className="mb-6 rounded-lg border border-primary/20 bg-primary/5 px-4 py-4 flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Zap className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">Assinatura criada! Realize o pagamento PIX.</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              O pagamento via PIX é gerado pelo Asaas. Após confirmação, seu plano será ativado automaticamente.
            </p>
            <p className="text-xs text-muted-foreground/70 mt-1 font-mono">
              ID: {subscribeResult.asaasSubscriptionId}
            </p>
          </div>
          <Button variant="ghost" size="sm" className="shrink-0 h-7 text-xs" onClick={() => setSubscribeResult(null)}>
            ✕
          </Button>
        </div>
      )}

      {/* Current plan card */}
      <Card className="p-5 mb-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Zap className="w-5 h-5 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-foreground">
                Plano {tenant?.plan?.displayName ?? 'Free'}
              </span>
              {sub ? (
                <Badge variant={STATUS_BADGE[sub.status]?.variant ?? 'secondary'} dot>
                  {STATUS_BADGE[sub.status]?.label ?? sub.status}
                </Badge>
              ) : (
                <Badge variant="success" dot>Ativo</Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              {tenant?.plan ? formatPrice(tenant.plan.priceBrlCents) : 'Grátis'}
              {sub?.currentPeriodEnd && (
                <> · renova em {new Date(sub.currentPeriodEnd).toLocaleDateString('pt-BR')}</>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {sub?.status === 'PAST_DUE' && (
            <div className="flex items-center gap-1.5 text-sm text-destructive">
              <AlertCircle className="w-4 h-4" />
              Pagamento em atraso
            </div>
          )}
          <Button variant="outline" size="sm" disabled>
            <CreditCard className="w-4 h-4 mr-1.5" />
            Método de pagamento
          </Button>
          {hasActiveSub && currentPlanName !== 'free' && (
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => setCancelOpen(true)}
            >
              Cancelar
            </Button>
          )}
        </div>
      </Card>

      {/* Payment history */}
      <div className="mb-8">
        <PaymentHistory />
      </div>

      {/* Plans grid */}
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">
        Planos disponíveis
      </h2>
      <div className="grid grid-cols-3 gap-4">
        {(plans.length > 0 ? plans : [
          { id: 'free', name: 'free', displayName: 'Free', priceBrlCents: 0, messagesPerMonth: 300, instancesLimit: 1, apiKeysLimit: 2 },
          { id: 'starter', name: 'starter', displayName: 'Starter', priceBrlCents: 9700, messagesPerMonth: 5000, instancesLimit: 3, apiKeysLimit: 5 },
          { id: 'pro', name: 'pro', displayName: 'Pro', priceBrlCents: 29700, messagesPerMonth: 30000, instancesLimit: 10, apiKeysLimit: -1 },
        ]).map((plan) => {
          const isCurrent = plan.name === currentPlanName
          const isHighlight = plan.name === 'starter'
          const features = PLAN_FEATURES[plan.name] ?? []
          const currentCents = plans.find((p) => p.name === currentPlanName)?.priceBrlCents ?? 0
          const isUpgrade = plan.priceBrlCents > currentCents

          return (
            <div
              key={plan.id}
              className={[
                'relative rounded-xl border p-5 transition-all',
                isHighlight ? 'border-primary shadow-lg shadow-primary/10' : 'border-border',
                isCurrent ? 'bg-muted/50' : 'bg-card',
              ].join(' ')}
            >
              {isHighlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className="bg-primary text-primary-foreground px-3">Popular</Badge>
                </div>
              )}

              <div className="mb-4">
                <h3 className="font-bold text-foreground text-lg">{plan.displayName}</h3>
                <div className="mt-1">
                  <span className="text-2xl font-bold text-foreground">
                    {plan.priceBrlCents === 0 ? 'Grátis' : `R$ ${plan.priceBrlCents / 100}`}
                  </span>
                  {plan.priceBrlCents > 0 && (
                    <span className="text-muted-foreground text-sm">/mês</span>
                  )}
                </div>
              </div>

              <ul className="space-y-2 mb-5">
                {features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Check className="w-4 h-4 text-green-500 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>

              {isCurrent ? (
                <Button variant="outline" className="w-full" disabled>
                  Plano atual
                </Button>
              ) : plan.priceBrlCents === 0 ? (
                <Button variant="outline" className="w-full" disabled title="Para fazer downgrade, cancele sua assinatura">
                  Fazer downgrade
                </Button>
              ) : (
                <Button
                  variant={isHighlight ? 'gradient' : 'outline'}
                  className="w-full"
                  onClick={() => setSelectedPlan(plan)}
                >
                  {isUpgrade ? 'Fazer upgrade' : 'Mudar plano'}
                  <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              )}
            </div>
          )
        })}
      </div>

      <p className="text-xs text-muted-foreground mt-4 text-center">
        Pagamentos processados com segurança via Asaas · PIX recorrente mensal · Cancele a qualquer momento
      </p>

      {/* Subscribe / change plan modal */}
      {selectedPlan && (
        <SubscribeModal
          plan={selectedPlan}
          open
          isChangePlan={!!isChangePlan}
          onClose={() => setSelectedPlan(null)}
          onSuccess={(result) => {
            setSubscribeResult(result)
            invalidateAll()
          }}
        />
      )}

      {/* Cancel confirmation */}
      <CancelConfirmDialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onConfirm={() => cancelMutation.mutate()}
        loading={cancelMutation.isPending}
      />
    </div>
  )
}
