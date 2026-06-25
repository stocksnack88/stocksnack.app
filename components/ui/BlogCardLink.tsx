'use client'
import Link from 'next/link'
import { playClick } from '@/lib/sounds'

export default function BlogCardLink({
  href,
  children,
  className,
  style,
}: {
  href: string
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <Link href={href} className={className} style={style} onClick={() => playClick()}>
      {children}
    </Link>
  )
}
