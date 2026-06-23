'use client'
import Link from 'next/link'
import { playClick } from '@/lib/sounds'

export default function NavSoundLink({ href, className, style, children }: {
  href: string
  className?: string
  style?: React.CSSProperties
  children: React.ReactNode
}) {
  return (
    <Link href={href} className={className} style={style} onClick={() => playClick()}>
      {children}
    </Link>
  )
}
