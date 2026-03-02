import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from './button'

interface PaginationProps {
  page: number
  limit: number
  total: number
  onPageChange: (page: number) => void
}

export function Pagination({ page, limit, total, onPageChange }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / limit))

  if (totalPages <= 1) return null

  return (
    <div className="flex items-center justify-between px-4 py-3 text-sm text-muted-foreground">
      <span>
        {total} {total === 1 ? 'item' : 'itens'} &middot; Página {page} de {totalPages}
      </span>
      <div className="flex gap-1">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label="Página anterior"
        >
          <ChevronLeft className="w-4 h-4" aria-hidden="true" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          aria-label="Próxima página"
        >
          <ChevronRight className="w-4 h-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  )
}
