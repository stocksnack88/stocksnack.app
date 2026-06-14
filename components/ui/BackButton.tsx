'use client'
import { useState } from 'react'
import Link from 'next/link'

function playClick() {
  try {
    const stored = typeof window !== 'undefined' ? localStorage.getItem('ss_sound') : null
    if (stored === '0') return
    const AudioCtx = (window.AudioContext || (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)!
    const ctx = new AudioCtx()
    const bufferSize = ctx.sampleRate * 0.04
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 8)
    }
    const noise = ctx.createBufferSource()
    noise.buffer = buffer
    const noiseGain = ctx.createGain()
    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = 1800
    filter.Q.value = 0.8
    noise.connect(filter)
    filter.connect(noiseGain)
    noiseGain.connect(ctx.destination)
    noiseGain.gain.setValueAtTime(0.4, ctx.currentTime)
    noiseGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04)
    noise.start(ctx.currentTime)
    const osc = ctx.createOscillator()
    const oscGain = ctx.createGain()
    osc.connect(oscGain)
    oscGain.connect(ctx.destination)
    osc.type = 'sine'
    osc.frequency.setValueAtTime(1000, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.03)
    oscGain.gain.setValueAtTime(0.2, ctx.currentTime)
    oscGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.03)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.03)
  } catch {}
}

export default function BackButton() {
  const [active, setActive] = useState(false)
  return (
    <Link
      href="/screener"
      className="text-xs tracking-widest transition-colors"
      style={{ color: active ? '#00ff41' : 'rgba(0,255,65,0.5)' }}
      onClick={() => { playClick(); setActive(true) }}
    >
      ← SCREENER
    </Link>
  )
}
