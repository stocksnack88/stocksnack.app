'use client'
import { useState, useEffect } from 'react'

const WORD = 'STOCKSNACK'
const CHAR_MS = 80

export default function TickerLoading() {
  const [displayed, setDisplayed] = useState('')
  const [cursor, setCursor] = useState(true)

  useEffect(() => {
    let t: ReturnType<typeof setTimeout>
    let idx = 0

    function step() {
      idx++
      setDisplayed(WORD.slice(0, idx))
      if (idx < WORD.length) {
        t = setTimeout(step, CHAR_MS)
      } else {
        t = setTimeout(() => {
          idx = 0
          setDisplayed('')
          t = setTimeout(step, CHAR_MS)
        }, 700)
      }
    }

    t = setTimeout(step, CHAR_MS)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    const id = setInterval(() => setCursor(v => !v), 530)
    return () => clearInterval(id)
  }, [])

  return (
    <div
      className="min-h-screen bg-black flex items-center justify-center"
      style={{ fontFamily: "var(--font-geist-mono), 'Courier New', monospace" }}
    >
      <span className="text-sm font-bold tracking-[0.3em]" style={{ color: '#00ff41' }}>
        {displayed}
        <span style={{ opacity: cursor ? 1 : 0 }}>_</span>
      </span>
    </div>
  )
}
