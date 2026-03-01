import { useState, useEffect } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Zap, Lock, EyeOff, Eye } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'

export function ResetPasswordPage() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    // Wait for Supabase to process the hash and establish session
    const check = async () => {
      // Give Supabase a moment to process the URL hash fragment
      await new Promise((r) => setTimeout(r, 500))
      const { data } = await supabase.auth.getSession()
      if (data.session) {
        setReady(true)
      } else {
        // No session = user navigated here directly without a recovery link
        void navigate({ to: '/auth/login' })
      }
    }
    void check()
  }, [navigate])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (password.length < 6) {
      setError('A senha deve ter pelo menos 6 caracteres.')
      return
    }
    if (password !== confirm) {
      setError('As senhas não coincidem.')
      return
    }

    setLoading(true)
    const { error: err } = await supabase.auth.updateUser({ password })
    setLoading(false)

    if (err) {
      setError(err.message)
      return
    }

    setSuccess(true)
    setTimeout(() => { void navigate({ to: '/dashboard' }) }, 2000)
  }

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-accent/30 p-4">
        <p className="text-muted-foreground text-sm">Verificando link de recuperação...</p>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-accent/30 p-4">
      <div className="w-full max-w-sm animate-fade-in">
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-2xl gradient-brand shadow-lg shadow-primary/30">
            <Zap className="size-6 text-white" aria-hidden="true" />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-bold tracking-tight">Zap-Conecta</h1>
            <p className="text-sm text-muted-foreground">Redefinir senha</p>
          </div>
        </div>

        <Card className="shadow-xl">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">Nova senha</CardTitle>
            <CardDescription>Digite sua nova senha abaixo.</CardDescription>
          </CardHeader>

          {success ? (
            <CardContent>
              <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-4 text-center space-y-2">
                <p className="text-sm font-medium text-emerald-900">Senha alterada com sucesso!</p>
                <p className="text-xs text-emerald-700">Redirecionando para o painel...</p>
              </div>
            </CardContent>
          ) : (
            <form onSubmit={handleSubmit} noValidate>
              <CardContent className="space-y-4">
                {error && (
                  <div role="alert" className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2.5 text-sm text-destructive">
                    {error}
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="new-password">Nova senha</Label>
                  <Input
                    id="new-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="new-password"
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
                    autoFocus
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="confirm-password">Confirmar senha</Label>
                  <Input
                    id="confirm-password"
                    type={showPassword ? 'text' : 'password'}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="new-password"
                    startIcon={<Lock aria-hidden="true" />}
                  />
                </div>
              </CardContent>

              <CardFooter className="pt-2">
                <Button type="submit" className="w-full" size="lg" loading={loading} disabled={!password || !confirm}>
                  Redefinir senha
                </Button>
              </CardFooter>
            </form>
          )}
        </Card>
      </div>
    </div>
  )
}
