import React from 'react'
import { cn } from '../utils/cn'

// Definisi varian tipografi menggunakan class Tailwind v4 yang mengambil variabel dari @theme
const typographyVariants = {
  h1: 'font-mono text-2xl font-semibold text-text-primary md:text-3xl',
  h2: 'font-mono text-xl font-semibold text-text-primary',
  subtitle: 'font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-text-muted', // Pengganti .label lama
  body: 'font-sans text-base text-text-secondary',
  caption: 'font-mono text-[9px] tracking-widest text-text-muted',
}

interface TypographyProps extends React.HTMLAttributes<HTMLElement> {
  variant?: keyof typeof typographyVariants
  as?: React.ElementType
  children: React.ReactNode
}

export const Typography = ({
  variant = 'body',
  as,
  className,
  children,
  ...props
}: TypographyProps) => {
  // Pemetaan default tag HTML jika prop 'as' tidak diberikan
  const defaultTags: Record<keyof typeof typographyVariants, React.ElementType> = {
    h1: 'h1',
    h2: 'h2',
    subtitle: 'h3',
    body: 'p',
    caption: 'span',
  }

  const Component = as || defaultTags[variant]

  return (
    <Component
      className={cn(typographyVariants[variant], className)}
      {...props}
    >
      {children}
    </Component>
  )
}