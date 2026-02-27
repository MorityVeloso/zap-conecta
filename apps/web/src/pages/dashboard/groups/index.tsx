import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Users, Loader2, Shield, ChevronDown } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'

interface GroupItem {
  id: string
  subject: string
  size: number
  creation: number
  owner: string
  desc?: string
}

export function GroupsPage() {
  const queryClient = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [showParticipants, setShowParticipants] = useState<string | null>(null)
  const [newSubject, setNewSubject] = useState('')
  const [newParticipants, setNewParticipants] = useState('')

  const { data: groups = [], isLoading } = useQuery({
    queryKey: ['groups'],
    queryFn: () => api.get<GroupItem[]>('/whatsapp/groups'),
  })

  const { data: participants = [], isLoading: loadingParticipants } = useQuery({
    queryKey: ['group-participants', showParticipants],
    queryFn: () => api.get<Record<string, unknown>[]>(`/whatsapp/groups/${showParticipants}/participants`),
    enabled: !!showParticipants,
  })

  const createMutation = useMutation({
    mutationFn: () =>
      api.post('/whatsapp/groups', {
        subject: newSubject,
        participants: newParticipants.split(',').map((p) => p.trim()).filter(Boolean),
      }),
    onSuccess: () => {
      toast.success('Grupo criado com sucesso!')
      setShowCreate(false)
      setNewSubject('')
      setNewParticipants('')
      void queryClient.invalidateQueries({ queryKey: ['groups'] })
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Erro ao criar grupo')
    },
  })

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Grupos</h1>
          <p className="text-muted-foreground mt-0.5 text-sm">
            Gerencie seus grupos de WhatsApp
          </p>
        </div>
        <Button variant="gradient" onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4 mr-2" aria-hidden="true" />
          Novo grupo
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground py-12 justify-center">
          <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
          <span>Carregando...</span>
        </div>
      ) : groups.length === 0 ? (
        <Card className="p-12 flex flex-col items-center text-center">
          <div className="w-14 h-14 bg-muted rounded-2xl flex items-center justify-center mb-4">
            <Users className="w-7 h-7 text-muted-foreground" aria-hidden="true" />
          </div>
          <h3 className="font-semibold text-foreground">Nenhum grupo encontrado</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-xs">
            Crie um novo grupo ou conecte uma instância WhatsApp que já possui grupos.
          </p>
        </Card>
      ) : (
        <div className="grid gap-3">
          {groups.map((group) => (
            <Card key={group.id} className="p-4">
              <div className="flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-foreground truncate">{group.subject}</h3>
                  <div className="flex items-center gap-3 mt-1">
                    <Badge variant="secondary" className="text-xs">
                      <Users className="w-3 h-3 mr-1" aria-hidden="true" />
                      {group.size} membros
                    </Badge>
                    {group.desc && (
                      <span className="text-xs text-muted-foreground truncate max-w-[300px]">
                        {group.desc}
                      </span>
                    )}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowParticipants(group.id)}
                >
                  <ChevronDown className="w-4 h-4" aria-hidden="true" />
                  <span className="ml-1.5">Participantes</span>
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create group dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Criar grupo</DialogTitle>
            <DialogDescription>
              Informe o nome e os participantes do novo grupo
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="group-subject">Nome do grupo</Label>
              <Input
                id="group-subject"
                placeholder="Meu grupo"
                value={newSubject}
                onChange={(e) => setNewSubject(e.target.value)}
                className="mt-1.5"
                autoFocus
              />
            </div>
            <div>
              <Label htmlFor="group-participants">Participantes (números separados por vírgula)</Label>
              <Input
                id="group-participants"
                placeholder="5511999998888, 5511888887777"
                value={newParticipants}
                onChange={(e) => setNewParticipants(e.target.value)}
                className="mt-1.5 font-mono text-sm"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>
              Cancelar
            </Button>
            <Button
              variant="gradient"
              onClick={() => createMutation.mutate()}
              loading={createMutation.isPending}
              disabled={!newSubject.trim() || !newParticipants.trim()}
            >
              Criar grupo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Participants dialog */}
      <Dialog open={!!showParticipants} onOpenChange={() => setShowParticipants(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Participantes</DialogTitle>
            <DialogDescription>
              Membros do grupo selecionado
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[400px] overflow-y-auto space-y-2 py-2">
            {loadingParticipants ? (
              <div className="flex items-center gap-2 text-muted-foreground py-6 justify-center">
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                <span className="text-sm">Carregando...</span>
              </div>
            ) : (
              participants.map((p, i) => (
                <div key={i} className="flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-muted/30">
                  <div className="w-8 h-8 bg-muted rounded-full flex items-center justify-center">
                    {(p as { admin?: string }).admin === 'admin' || (p as { admin?: string }).admin === 'superadmin' ? (
                      <Shield className="w-4 h-4 text-primary" aria-hidden="true" />
                    ) : (
                      <Users className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-mono text-foreground truncate">
                      {String((p as { id?: string }).id ?? '').replace('@s.whatsapp.net', '')}
                    </p>
                  </div>
                  {((p as { admin?: string }).admin === 'admin' || (p as { admin?: string }).admin === 'superadmin') && (
                    <Badge variant="secondary" className="text-[10px]">admin</Badge>
                  )}
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
