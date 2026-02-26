import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Copy, Trash2, Key, CheckCircle, Loader2, Eye, EyeOff } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Alert } from '@/components/ui/alert'
import { formatRelativeTime } from '@/lib/utils'

interface ApiKey {
  id: string
  name: string
  keyPrefix: string
  lastUsedAt: string | null
  expiresAt: string | null
  revokedAt: string | null
  createdAt: string
}

interface CreatedApiKey extends ApiKey {
  plainKey: string
}

export function ApiKeysPage() {
  const queryClient = useQueryClient()
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newKeyName, setNewKeyName] = useState('')
  const [createdKey, setCreatedKey] = useState<CreatedApiKey | null>(null)
  const [showKey, setShowKey] = useState(false)

  const { data: keys = [], isLoading } = useQuery({
    queryKey: ['api-keys'],
    queryFn: () => api.get<ApiKey[]>('/api-keys'),
  })

  const createMutation = useMutation({
    mutationFn: (name: string) => api.post<CreatedApiKey>('/api-keys', { name }),
    onSuccess: (data) => {
      setCreatedKey(data)
      setNewKeyName('')
      setShowCreateModal(false)
      void queryClient.invalidateQueries({ queryKey: ['api-keys'] })
    },
  })

  const revokeMutation = useMutation({
    mutationFn: (keyId: string) => api.delete<void>(`/api-keys/${keyId}`),
    onSuccess: () => {
      toast.success('Chave revogada com sucesso')
      void queryClient.invalidateQueries({ queryKey: ['api-keys'] })
    },
  })

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => toast.success('Copiado!'))
  }

  const activeKeys = keys.filter((k) => !k.revokedAt)

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">API Keys</h1>
          <p className="text-muted-foreground mt-0.5 text-sm">
            Use essas chaves para autenticar chamadas à API do Zap-Conecta
          </p>
        </div>
        <Button variant="gradient" onClick={() => setShowCreateModal(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Nova chave
        </Button>
      </div>

      {/* Reveal newly created key */}
      {createdKey && (
        <Alert variant="success" className="mb-6">
          <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="font-medium">Chave criada com sucesso!</p>
            <p className="text-sm opacity-80 mt-0.5">
              Copie agora — este valor não será exibido novamente.
            </p>
            <div className="flex items-center gap-2 mt-3">
              <div className="relative flex-1">
                <Input
                  readOnly
                  value={showKey ? createdKey.plainKey : createdKey.plainKey.replace(/./g, '•')}
                  className="font-mono text-xs pr-10 bg-background/50"
                />
                <button
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowKey(!showKey)}
                >
                  {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <Button variant="outline" size="sm" onClick={() => copyToClipboard(createdKey.plainKey)}>
                <Copy className="w-4 h-4 mr-1.5" />
                Copiar
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setCreatedKey(null)}>
                ✕
              </Button>
            </div>
          </div>
        </Alert>
      )}

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground py-12 justify-center">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Carregando...</span>
        </div>
      ) : activeKeys.length === 0 ? (
        <Card className="p-12 flex flex-col items-center text-center">
          <div className="w-14 h-14 bg-muted rounded-2xl flex items-center justify-center mb-4">
            <Key className="w-7 h-7 text-muted-foreground" />
          </div>
          <h3 className="font-semibold text-foreground">Nenhuma chave criada</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-xs">
            Crie uma API key para começar a usar os endpoints REST do Zap-Conecta
          </p>
          <Button variant="gradient" className="mt-4" onClick={() => setShowCreateModal(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Criar primeira chave
          </Button>
        </Card>
      ) : (
        <Card>
          <div className="divide-y divide-border">
            <div className="grid grid-cols-[1fr_180px_140px_80px] gap-4 px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
              <span>Nome</span>
              <span>Último uso</span>
              <span>Criada em</span>
              <span />
            </div>

            {activeKeys.map((key) => (
              <div
                key={key.id}
                className="grid grid-cols-[1fr_180px_140px_80px] gap-4 items-center px-4 py-3.5 hover:bg-muted/30 transition-colors"
              >
                <div className="min-w-0 flex items-center gap-2">
                  <span className="font-medium text-foreground truncate">{key.name}</span>
                  <Badge variant="secondary" className="font-mono text-[10px] shrink-0">
                    {key.keyPrefix}…
                  </Badge>
                </div>

                <span className="text-sm text-muted-foreground">
                  {key.lastUsedAt ? formatRelativeTime(new Date(key.lastUsedAt)) : 'Nunca'}
                </span>

                <span className="text-sm text-muted-foreground">
                  {formatRelativeTime(new Date(key.createdAt))}
                </span>

                <div className="flex justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => revokeMutation.mutate(key.id)}
                    loading={revokeMutation.isPending}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Criar nova API Key</DialogTitle>
            <DialogDescription>
              Dê um nome descritivo para identificar onde essa chave será usada
            </DialogDescription>
          </DialogHeader>

          <div className="py-2">
            <Label htmlFor="key-name">Nome da chave</Label>
            <Input
              id="key-name"
              placeholder="Ex: Produção, Staging, App mobile..."
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newKeyName.trim()) {
                  createMutation.mutate(newKeyName.trim())
                }
              }}
              className="mt-1.5"
              autoFocus
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateModal(false)}>
              Cancelar
            </Button>
            <Button
              variant="gradient"
              onClick={() => createMutation.mutate(newKeyName.trim())}
              loading={createMutation.isPending}
              disabled={!newKeyName.trim()}
            >
              Criar chave
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
