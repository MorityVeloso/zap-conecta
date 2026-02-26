import { Zap, Check, ArrowRight, CreditCard, Calendar } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface Plan {
  id: string
  name: string
  displayName: string
  priceBrlCents: number
  messagesPerMonth: number
  instancesLimit: number
  apiKeysLimit: number
}

interface Tenant {
  id: string
  name: string
  plan: Plan
}

function formatPrice(cents: number): string {
  if (cents === 0) return 'Grátis'
  return `R$ ${(cents / 100).toFixed(0)}/mês`
}

const PLANS = [
  {
    key: 'free',
    name: 'Free',
    price: 0,
    messages: '300',
    instances: '1',
    apiKeys: '2',
    features: ['300 mensagens/mês', '1 número WhatsApp', '2 API Keys', 'Suporte por email'],
  },
  {
    key: 'starter',
    name: 'Starter',
    price: 9700,
    messages: '5.000',
    instances: '3',
    apiKeys: '5',
    features: ['5.000 mensagens/mês', '3 números WhatsApp', '5 API Keys', 'Suporte prioritário', 'Webhooks'],
    highlight: true,
  },
  {
    key: 'pro',
    name: 'Pro',
    price: 29700,
    messages: '30.000',
    instances: '10',
    apiKeys: 'Ilimitado',
    features: ['30.000 mensagens/mês', '10 números WhatsApp', 'API Keys ilimitadas', 'Suporte dedicado', 'SLA 99.9%'],
  },
]

export function BillingPage() {
  const { data: tenant } = useQuery({
    queryKey: ['tenant', 'me'],
    queryFn: () => api.get<Tenant>('/tenants/me'),
  })

  const currentPlanKey = tenant?.plan?.name?.toLowerCase() ?? 'free'

  return (
    <div className="p-6 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Billing</h1>
        <p className="text-muted-foreground mt-0.5 text-sm">
          Gerencie seu plano e assinatura
        </p>
      </div>

      {/* Current plan */}
      <Card className="p-5 mb-8 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Zap className="w-5 h-5 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-foreground">
                Plano {tenant?.plan?.displayName ?? 'Free'}
              </span>
              <Badge variant="success" dot>Ativo</Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              {tenant?.plan
                ? formatPrice(tenant.plan.priceBrlCents)
                : 'Grátis'}
              {' · '}
              {tenant?.plan?.messagesPerMonth ?? 300} mensagens/mês
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <CreditCard className="w-4 h-4 mr-1.5" />
            Método de pagamento
          </Button>
          <Button variant="outline" size="sm">
            <Calendar className="w-4 h-4 mr-1.5" />
            Histórico
          </Button>
        </div>
      </Card>

      {/* Plans */}
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">
        Planos disponíveis
      </h2>
      <div className="grid grid-cols-3 gap-4">
        {PLANS.map((plan) => {
          const isCurrent = plan.key === currentPlanKey
          return (
            <div
              key={plan.key}
              className={`
                relative rounded-xl border p-5 transition-all
                ${plan.highlight
                  ? 'border-primary shadow-lg shadow-primary/10'
                  : 'border-border'}
                ${isCurrent ? 'bg-muted/50' : 'bg-card'}
              `}
            >
              {plan.highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className="bg-primary text-primary-foreground px-3">Popular</Badge>
                </div>
              )}

              <div className="mb-4">
                <h3 className="font-bold text-foreground text-lg">{plan.name}</h3>
                <div className="mt-1">
                  <span className="text-2xl font-bold text-foreground">
                    {plan.price === 0 ? 'Grátis' : `R$ ${plan.price / 100}`}
                  </span>
                  {plan.price > 0 && (
                    <span className="text-muted-foreground text-sm">/mês</span>
                  )}
                </div>
              </div>

              <ul className="space-y-2 mb-5">
                {plan.features.map((f) => (
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
              ) : (
                <Button
                  variant={plan.highlight ? 'gradient' : 'outline'}
                  className="w-full"
                  disabled
                  title="Em breve — integração Asaas na Fase 6"
                >
                  {plan.price > currentPlanPrice(currentPlanKey) ? 'Fazer upgrade' : 'Fazer downgrade'}
                  <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              )}
            </div>
          )
        })}
      </div>

      <p className="text-xs text-muted-foreground mt-4 text-center">
        Integração de pagamentos via Asaas disponível em breve.
        Entre em contato para upgrade antecipado.
      </p>
    </div>
  )
}

function currentPlanPrice(planKey: string): number {
  return PLANS.find((p) => p.key === planKey)?.price ?? 0
}
