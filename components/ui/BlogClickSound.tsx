'use client'
import { useEffect, useRef } from 'react'
import { playClick } from '@/lib/sounds'

export default function BlogProseWithSound({ html }: { html: string }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const handler = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest('a, button')) playClick()
    }
    el.addEventListener('click', handler)
    return () => el.removeEventListener('click', handler)
  }, [])

  return (
    <div
      ref={ref}
      className="blog-prose"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
