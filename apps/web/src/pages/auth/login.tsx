import { useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Zap, Eye, EyeOff, Mail, Lock, ShieldCheck } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'

const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'Senha deve ter pelo menos 6 caracteres'),
})

type LoginForm = z.infer<typeof loginSchema>

// ── Forgot password dialog ─────────────────────────────────────────────────

function ForgotPasswordDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) return
    setLoading(true)
    setError(null)
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/login`,
    })
    setLoading(false)
    if (err) { setError(err.message); return }
    setSent(true)
  }

  const handleClose = () => { setEmail(''); setSent(false); setError(null); onClose() }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Recuperar senha</DialogTitle>
        </DialogHeader>
        {sent ? (
          <div className="py-4 text-center space-y-2">
            <p className="text-sm font-medium text-foreground">Email enviado!</p>
            <p className="text-sm text-muted-foreground">
              Verifique sua caixa de entrada e siga as instruções para redefinir sua senha.
            </p>
            <Button className="mt-4 w-full" onClick={handleClose}>Fechar</Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            <div className="space-y-4 mt-2">
              <p className="text-sm text-muted-foreground">
                Digite seu email e enviaremos um link para redefinir sua senha.
              </p>
              {error && (
                <div role="alert" className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              )}
              <div>
                <Label htmlFor="reset-email">Email</Label>
                <Input id="reset-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@empresa.com" autoComplete="email" className="mt-1.5" required />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={handleClose}>Cancelar</Button>
              <Button type="submit" loading={loading} disabled={!email}>Enviar link</Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ── MFA challenge dialog ───────────────────────────────────────────────────

function MfaChallengeDialog({
  open,
  factorId,
  onVerified,
  onCancel,
}: {
  open: boolean
  factorId: string
  onVerified: () => void
  onCancel: () => void
}) {
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleVerify = async () => {
    if (code.length !== 6) return
    setLoading(true)
    setError(null)
    const { error: err } = await supabase.auth.mfa.challengeAndVerify({ factorId, code })
    setLoading(false)
    if (err) { setError('Código inválido. Tente novamente.'); return }
    onVerified()
  }

  return (
    <Dialog open={open} onOpenChange={onCancel}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-primary" aria-hidden="true" />
            Verificação em dois fatores
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">
            Digite o código de 6 dígitos do seu app autenticador para continuar.
          </p>
          {error && (
            <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</p>
          )}
          <div>
            <Label htmlFor="mfa-code">Código</Label>
            <Input
              id="mfa-code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              className="mt-1.5 font-mono tracking-widest text-center text-lg"
              maxLength={6}
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') handleVerify() }}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>Cancelar</Button>
          <Button onClick={handleVerify} loading={loading} disabled={code.length !== 6}>
            Verificar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Login page ─────────────────────────────────────────────────────────────

export function LoginPage() {
  const navigate = useNavigate()
  const [showPassword, setShowPassword] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [forgotOpen, setForgotOpen] = useState(false)
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) })

  const onSubmit = async (data: LoginForm) => {
    setServerError(null)
    const { error } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    })

    if (error) {
      setServerError(
        error.message === 'Invalid login credentials'
          ? 'Email ou senha incorretos'
          : 'Erro ao fazer login. Tente novamente.',
      )
      return
    }

    // Check if MFA is required
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (aal && aal.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') {
      const { data: factorsData } = await supabase.auth.mfa.listFactors()
      const factor = factorsData?.totp?.find((f) => f.status === 'verified')
      if (factor) { setMfaFactorId(factor.id); return }
    }

    await navigate({ to: '/dashboard' })
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-accent/30 p-4">
      <div className="w-full max-w-sm animate-fade-in">
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-2xl gradient-brand shadow-lg shadow-primary/30">
            <Zap className="size-6 text-white" aria-hidden="true" />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-bold tracking-tight">Zap-Conecta</h1>
            <p className="text-sm text-muted-foreground">API WhatsApp SaaS</p>
          </div>
        </div>

        <Card className="shadow-xl">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">Entrar na sua conta</CardTitle>
            <CardDescription>Acesse o painel de controle da sua API</CardDescription>
          </CardHeader>

          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            <CardContent className="space-y-4">
              {serverError && (
                <div role="alert" className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2.5 text-sm text-destructive">
                  {serverError}
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="voce@empresa.com"
                  autoComplete="email"
                  startIcon={<Mail aria-hidden="true" />}
                  aria-invalid={!!errors.email}
                  aria-describedby={errors.email ? 'email-error' : undefined}
                  {...register('email')}
                />
                {errors.email && <p id="email-error" className="text-xs text-destructive" role="alert">{errors.email.message}</p>}
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Senha</Label>
                  <button type="button" onClick={() => setForgotOpen(true)} className="text-xs text-primary hover:underline">
                    Esqueci a senha
                  </button>
                </div>
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  startIcon={<Lock aria-hidden="true" />}
                  endIcon={
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                      aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                    >
                      {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  }
                  aria-invalid={!!errors.password}
                  aria-describedby={errors.password ? 'password-error' : undefined}
                  {...register('password')}
                />
                {errors.password && <p id="password-error" className="text-xs text-destructive" role="alert">{errors.password.message}</p>}
              </div>
            </CardContent>

            <CardFooter className="flex flex-col gap-3 pt-2">
              <Button type="submit" className="w-full" size="lg" loading={isSubmitting}>
                Entrar
              </Button>
              <p className="text-sm text-center text-muted-foreground">
                Ainda não tem conta?{' '}
                <Link to="/auth/signup" className="text-primary font-medium hover:underline">
                  Criar conta grátis
                </Link>
              </p>
            </CardFooter>
          </form>
        </Card>
      </div>

      <ForgotPasswordDialog open={forgotOpen} onClose={() => setForgotOpen(false)} />

      {mfaFactorId && (
        <MfaChallengeDialog
          open={!!mfaFactorId}
          factorId={mfaFactorId}
          onVerified={() => navigate({ to: '/dashboard' })}
          onCancel={() => { setMfaFactorId(null); supabase.auth.signOut() }}
        />
      )}
    </div>
  )
}
