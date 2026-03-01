import React, { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

let dialogTitleIdCounter = 0

interface DialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
}

export function Dialog({ open, onOpenChange, children }: DialogProps) {
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    // Escape key closes dialog
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onOpenChange(false)
      }
      // Focus trap: keep Tab/Shift+Tab inside the dialog
      if (e.key === 'Tab' && overlayRef.current) {
        const focusable = overlayRef.current.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])',
        )
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (!focusable.length) return
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault()
            last.focus()
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault()
            first.focus()
          }
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    // Focus first focusable element
    const raf = requestAnimationFrame(() => {
      const first = overlayRef.current?.querySelector<HTMLElement>(
        'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])',
      )
      first?.focus()
    })

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      cancelAnimationFrame(raf)
    }
  }, [open, onOpenChange])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      ref={overlayRef}
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
        aria-hidden="true"
      />
      <div className="relative z-10 w-full max-w-md animate-in fade-in zoom-in-95 duration-200">
        {children}
      </div>
    </div>
  )
}

interface DialogContentProps {
  className?: string
  children: React.ReactNode
  'aria-labelledby'?: string
}

export function DialogContent({ className, children, 'aria-labelledby': labelledBy }: DialogContentProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      className={cn(
        'bg-card border border-border rounded-xl shadow-2xl p-6 mx-4',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function DialogHeader({ children }: { children: React.ReactNode }) {
  return <div className="mb-4">{children}</div>
}

export function DialogTitle({ children, id, className }: { children: React.ReactNode; id?: string; className?: string }) {
  // Auto-generate a stable id when none is provided
  const autoId = useRef(`dialog-title-${++dialogTitleIdCounter}`)
  return (
    <h2 id={id ?? autoId.current} className={cn('text-lg font-semibold text-foreground', className)}>
      {children}
    </h2>
  )
}

export function DialogDescription({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground mt-1">{children}</p>
}

export function DialogFooter({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-end gap-2 mt-6">{children}</div>
  )
}
