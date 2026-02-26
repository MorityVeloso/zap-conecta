import React from 'react'
import { cn } from '@/lib/utils'

interface AlertProps {
  variant?: 'default' | 'destructive' | 'warning' | 'success'
  className?: string
  children: React.ReactNode
}

const variantClasses = {
  default: 'bg-muted border-border text-foreground',
  destructive: 'bg-destructive/10 border-destructive/30 text-destructive',
  warning: 'bg-yellow-500/10 border-yellow-500/30 text-yellow-700 dark:text-yellow-400',
  success: 'bg-green-500/10 border-green-500/30 text-green-700 dark:text-green-400',
}

export function Alert({ variant = 'default', className, children }: AlertProps) {
  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-lg border p-4 text-sm',
        variantClasses[variant],
        className,
      )}
    >
      {children}
    </div>
  )
}

export function AlertTitle({ children }: { children: React.ReactNode }) {
  return <p className="font-medium leading-none">{children}</p>
}

export function AlertDescription({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 opacity-80">{children}</p>
}
