import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary/10 text-primary',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        destructive: 'border-transparent bg-destructive/10 text-destructive',
        outline: 'border-border text-foreground',
        success: 'border-transparent bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
        warning: 'border-transparent bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
        info: 'border-transparent bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {
  dot?: boolean
}

function Badge({ className, variant, dot, children, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props}>
      {dot && (
        <span
          className={cn('size-1.5 rounded-full', {
            'bg-primary': variant === 'default',
            'bg-emerald-500': variant === 'success',
            'bg-amber-500': variant === 'warning',
            'bg-destructive': variant === 'destructive',
            'bg-blue-500': variant === 'info',
          })}
          aria-hidden="true"
        />
      )}
      {children}
    </div>
  )
}

export { Badge, badgeVariants }
