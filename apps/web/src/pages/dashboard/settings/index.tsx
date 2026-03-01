import { useState, useEffect } from 'react'
import { User, Building2, Bell, Shield, Loader2, ShieldCheck, ShieldOff } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { api } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
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

// ── Change password dialog ─────────────────────────────────────────────────

const changePasswordSchema = z
  .object({
    password: z.string().min(8, 'Mínimo 8 caracteres'),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    message: 'As senhas não coincidem',
    path: ['confirm'],
  })

type ChangePasswordForm = z.infer<typeof changePasswordSchema>

function ChangePasswordDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordForm>({ resolver: zodResolver(changePasswordSchema) })

  const onSubmit = async (data: ChangePasswordForm) => {
    const { error } = await supabase.auth.updateUser({ password: data.password })
    if (error) { toast.error(error.message); return }
    toast.success('Senha alterada com sucesso!')
    reset()
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Alterar senha</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <div className="space-y-4 mt-2">
            <div>
              <Label htmlFor="new-password">Nova senha</Label>
              <Input id="new-password" type="password" placeholder="••••••••" autoComplete="new-password" className="mt-1.5" aria-invalid={!!errors.password} {...register('password')} />
              {errors.password && <p className="text-xs text-destructive mt-1">{errors.password.message}</p>}
            </div>
            <div>
              <Label htmlFor="confirm-password">Confirmar senha</Label>
              <Input id="confirm-password" type="password" placeholder="••••••••" autoComplete="new-password" className="mt-1.5" aria-invalid={!!errors.confirm} {...register('confirm')} />
              {errors.confirm && <p className="text-xs text-destructive mt-1">{errors.confirm.message}</p>}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button type="submit" loading={isSubmitting}>Salvar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ── 2FA enrollment dialog ──────────────────────────────────────────────────

function TotpEnrollDialog({
  open,
  onClose,
  onEnrolled,
}: {
  open: boolean
  onClose: () => void
  onEnrolled: () => void
}) {
  const [step, setStep] = useState<'qr' | 'verify'>('qr')
  const [factorId, setFactorId] = useState('')
  const [qrCode, setQrCode] = useState('')
  const [secret, setSecret] = useState('')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setStep('qr')
    setCode('')
    setError(null)
    setQrCode('')
    setSecret('')
    supabase.auth.mfa.enroll({ factorType: 'totp' }).then(({ data, error: err }) => {
      if (err || !data) { setError(err?.message ?? 'Erro ao iniciar 2FA'); return }
      setFactorId(data.id)
      setQrCode(data.totp.qr_code)
      setSecret(data.totp.secret)
    })
  }, [open])

  const handleVerify = async () => {
    if (!code || !factorId) return
    setLoading(true)
    setError(null)
    const { error: err } = await supabase.auth.mfa.challengeAndVerify({ factorId, code })
    setLoading(false)
    if (err) { setError('Código inválido. Tente novamente.'); return }
    toast.success('Autenticação em dois fatores ativada!')
    onEnrolled()
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ativar autenticação em dois fatores</DialogTitle>
          <DialogDescription>Use um app autenticador como Google Authenticator ou Authy</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {error && (
            <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</p>
          )}

          {step === 'qr' && (
            <>
              <p className="text-sm text-muted-foreground">
                Escaneie o QR code abaixo com seu app autenticador.
              </p>
              {qrCode ? (
                <div className="flex justify-center">
                  <img src={qrCode} alt="QR code para 2FA" className="w-48 h-48 rounded-lg border border-border" />
                </div>
              ) : (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              )}
              {secret && (
                <div>
                  <Label className="text-xs text-muted-foreground">Ou insira a chave manualmente</Label>
                  <code className="block mt-1 text-xs font-mono bg-muted rounded px-2 py-1.5 break-all">{secret}</code>
                </div>
              )}
              <Button className="w-full" onClick={() => setStep('verify')} disabled={!qrCode}>
                Já escaneei → Verificar código
              </Button>
            </>
          )}

          {step === 'verify' && (
            <>
              <p className="text-sm text-muted-foreground">
                Digite o código de 6 dígitos gerado pelo seu app autenticador.
              </p>
              <div>
                <Label htmlFor="totp-code">Código de verificação</Label>
                <Input
                  id="totp-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  className="mt-1.5 font-mono tracking-widest text-center text-lg"
                  maxLength={6}
                  autoFocus
                />
              </div>
            </>
          )}
        </div>

        {step === 'verify' && (
          <DialogFooter>
            <Button variant="ghost" onClick={() => setStep('qr')}>Voltar</Button>
            <Button onClick={handleVerify} loading={loading} disabled={code.length !== 6}>
              Verificar e ativar
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────

export function SettingsPage() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [tenantName, setTenantName] = useState('')
  const [changePasswordOpen, setChangePasswordOpen] = useState(false)
  const [totpEnrollOpen, setTotpEnrollOpen] = useState(false)
  const [mfaRefreshKey, setMfaRefreshKey] = useState(0)

  const { data: tenant, isLoading } = useQuery({
    queryKey: ['tenant', 'me'],
    queryFn: () => api.get<Tenant>('/tenants/me'),
  })

  const { data: factors = [] } = useQuery({
    queryKey: ['mfa-factors', mfaRefreshKey],
    queryFn: async () => {
      const { data } = await supabase.auth.mfa.listFactors()
      return data?.totp ?? []
    },
  })

  const verifiedFactor = factors.find((f) => f.status === 'verified')

  const unenrollMutation = useMutation({
    mutationFn: async (factorId: string) => {
      const { error } = await supabase.auth.mfa.unenroll({ factorId })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('2FA desativado')
      setMfaRefreshKey((k) => k + 1)
    },
    onError: () => toast.error('Erro ao desativar 2FA'),
  })

  useEffect(() => {
    if (tenant?.name) setTenantName(tenant.name)
  }, [tenant?.name])

  const isDirty = tenantName.trim() !== (tenant?.name ?? '')

  const saveMutation = useMutation({
    mutationFn: (name: string) => api.patch('/tenants/me', { name }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tenant', 'me'] })
      toast.success('Alterações salvas!')
    },
    onError: () => toast.error('Erro ao salvar. Tente novamente.'),
  })

  return (
    <div className="p-6 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Configurações</h1>
        <p className="text-muted-foreground mt-0.5 text-sm">Preferências e dados da sua conta</p>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground py-12 justify-center">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Carregando...</span>
        </div>
      ) : (
        <div className="space-y-8">
          <SettingsSection icon={User} title="Perfil" description="Informações pessoais associadas à sua conta Supabase">
            <div className="space-y-4">
              <div>
                <Label>Email</Label>
                <Input value={user?.email ?? ''} readOnly className="mt-1.5 bg-muted cursor-not-allowed" />
                <p className="text-xs text-muted-foreground mt-1">Para alterar o email, acesse as configurações de conta</p>
              </div>
            </div>
          </SettingsSection>

          <Separator />

          <SettingsSection icon={Building2} title="Organização" description="Dados da sua empresa ou projeto no Zap-Conecta">
            <div className="space-y-4">
              <div>
                <Label htmlFor="org-name">Nome</Label>
                <Input id="org-name" value={tenantName} onChange={(e) => setTenantName(e.target.value)} className="mt-1.5" placeholder="Nome da sua empresa" />
              </div>
              <div>
                <Label>Slug</Label>
                <Input value={tenant?.slug ?? ''} readOnly className="mt-1.5 bg-muted font-mono text-sm cursor-not-allowed" />
                <p className="text-xs text-muted-foreground mt-1">Identificador único — usado nas URLs dos webhooks</p>
              </div>
              <Button variant="default" disabled={!isDirty || saveMutation.isPending} loading={saveMutation.isPending} onClick={() => saveMutation.mutate(tenantName.trim())}>
                Salvar alterações
              </Button>
            </div>
          </SettingsSection>

          <Separator />

          <SettingsSection icon={Bell} title="Notificações" description="Configure como deseja receber alertas do sistema">
            <p className="text-sm text-muted-foreground">Configurações de notificações disponíveis em breve.</p>
          </SettingsSection>

          <Separator />

          <SettingsSection icon={Shield} title="Segurança" description="Autenticação e controle de acesso à conta">
            <div className="space-y-3">
              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="text-sm font-medium text-foreground">Senha</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Altere sua senha de acesso</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => setChangePasswordOpen(true)}>
                  Alterar senha
                </Button>
              </div>
              <Separator />
              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="text-sm font-medium text-foreground flex items-center gap-1.5">
                    {verifiedFactor
                      ? <><ShieldCheck className="w-4 h-4 text-green-500" aria-hidden="true" />2FA ativado</>
                      : <><ShieldOff className="w-4 h-4 text-muted-foreground" aria-hidden="true" />Autenticação em dois fatores</>
                    }
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {verifiedFactor ? 'Sua conta está protegida com TOTP' : 'Adicione uma camada extra de segurança'}
                  </p>
                </div>
                {verifiedFactor ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    loading={unenrollMutation.isPending}
                    onClick={() => unenrollMutation.mutate(verifiedFactor.id)}
                  >
                    Desativar 2FA
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => setTotpEnrollOpen(true)}>
                    Ativar 2FA
                  </Button>
                )}
              </div>
              <Separator />
              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="text-sm font-medium text-foreground">ID do tenant</p>
                  <p className="text-xs text-muted-foreground mt-0.5 font-mono">{tenant?.id ?? '—'}</p>
                </div>
              </div>
            </div>
          </SettingsSection>
        </div>
      )}

      <ChangePasswordDialog open={changePasswordOpen} onClose={() => setChangePasswordOpen(false)} />
      <TotpEnrollDialog
        open={totpEnrollOpen}
        onClose={() => setTotpEnrollOpen(false)}
        onEnrolled={() => setMfaRefreshKey((k) => k + 1)}
      />
    </div>
  )
}
