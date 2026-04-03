import type { ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router-dom'

type Props = Omit<LinkProps, 'className' | 'children'> & {
  children: ReactNode
  className?: string
}

export function ButtonLink({ className, ...props }: Props) {
  return (
    <Link
      {...props}
      className={["ui-button", className].filter(Boolean).join(' ')}
    />
  )
}
