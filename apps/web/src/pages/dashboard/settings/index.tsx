import { useState, useEffect } from 'react'
import { User, Building2, Bell, Shield, Loader2 } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { useAuth } from '@/hooks/use-auth'

interface Tenant {
  id: string
  slug: string
  name: string
}

function SettingsSection({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ElementType
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <div className="grid grid-cols-[240px_1fr] gap-8">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Icon className="w-4 h-4 text-muted-foreground" />
          <h3 className="font-medium text-foreground text-sm">{title}</h3>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
      </div>
      <Card className="p-5">{children}</Card>
    </div>
  )
}

export function SettingsPage() {
  const { user } = useAuth()
  const [tenantName, setTenantName] = useState('')

  const { data: tenant, isLoading } = useQuery({
    queryKey: ['tenant', 'me'],
    queryFn: () => api.get<Tenant>('/tenants/me'),
  })

  useEffect(() => {
    if (tenant?.name) setTenantName(tenant.name)
  }, [tenant?.name])

  return (
    <div className="p-6 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Configurações</h1>
        <p className="text-muted-foreground mt-0.5 text-sm">
          Preferências e dados da sua conta
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground py-12 justify-center">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Carregando...</span>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Profile */}
          <SettingsSection
            icon={User}
            title="Perfil"
            description="Informações pessoais associadas à sua conta Supabase"
          >
            <div className="space-y-4">
              <div>
                <Label>Email</Label>
                <Input
                  value={user?.email ?? ''}
                  readOnly
                  className="mt-1.5 bg-muted cursor-not-allowed"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Para alterar o email, acesse as configurações de conta
                </p>
              </div>
            </div>
          </SettingsSection>

          <Separator />

          {/* Organization */}
          <SettingsSection
            icon={Building2}
            title="Organização"
            description="Dados da sua empresa ou projeto no Zap-Conecta"
          >
            <div className="space-y-4">
              <div>
                <Label htmlFor="org-name">Nome</Label>
                <Input
                  id="org-name"
                  value={tenantName}
                  onChange={(e) => setTenantName(e.target.value)}
                  className="mt-1.5"
                  placeholder="Nome da sua empresa"
                />
              </div>
              <div>
                <Label>Slug</Label>
                <Input
                  value={tenant?.slug ?? ''}
                  readOnly
                  className="mt-1.5 bg-muted font-mono text-sm cursor-not-allowed"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Identificador único — usado nas URLs dos webhooks
                </p>
              </div>
              <Button variant="default" disabled title="Em breve">
                Salvar alterações
              </Button>
            </div>
          </SettingsSection>

          <Separator />

          {/* Notifications */}
          <SettingsSection
            icon={Bell}
            title="Notificações"
            description="Configure como deseja receber alertas do sistema"
          >
            <p className="text-sm text-muted-foreground">
              Configurações de notificações disponíveis em breve.
            </p>
          </SettingsSection>

          <Separator />

          {/* Security */}
          <SettingsSection
            icon={Shield}
            title="Segurança"
            description="Autenticação e controle de acesso à conta"
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="text-sm font-medium text-foreground">Senha</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Altere sua senha de acesso
                  </p>
                </div>
                <Button variant="outline" size="sm" disabled title="Em breve">
                  Alterar senha
                </Button>
              </div>
              <Separator />
              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="text-sm font-medium text-foreground">ID do tenant</p>
                  <p className="text-xs text-muted-foreground mt-0.5 font-mono">
                    {tenant?.id ?? '—'}
                  </p>
                </div>
              </div>
            </div>
          </SettingsSection>
        </div>
      )}
    </div>
  )
}
