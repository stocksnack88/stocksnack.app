'use client'

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { createPortal } from 'react-dom'

const STORAGE_KEY = 'ss_guided_tour_v1'
const INTENT_KEY = 'ss_tour_intent'
const COOKIE_KEY = 'cookie-consent'

type TourStatus = 'idle' | 'active' | 'paused' | 'completed'
type TourState = { status: TourStatus; step: number; ticker?: string }
type TourAction = 'click' | 'tap'

type TourStep = {
  instruction: string
  target: string
  page: 'screener' | 'ticker'
  action: TourAction
  optional?: boolean
  multiple?: boolean
}

const STEPS: TourStep[] = [
  { page: 'screener', target: '[data-tour-primary-stock="true"]', action: 'click', instruction: 'Pick a stock and click on it.' },
  { page: 'ticker', target: '[data-tour-id="ticker-header"]', action: 'tap', instruction: 'This is the stock you selected.' },
  { page: 'ticker', target: '[data-tour-id="overview"]', action: 'click', instruction: 'Open the Overview.' },
  { page: 'ticker', target: '[data-tour-id="price-projection"]', action: 'click', instruction: 'Open Price Projection.' },
  { page: 'ticker', target: '[data-tour-id="price-projection-data"]', action: 'tap', instruction: 'Compare today\'s price with the five-year projection.' },
  { page: 'ticker', target: '[data-tour-id="scorecard"]', action: 'click', instruction: 'Open What You Are Buying.' },
  { page: 'ticker', target: '[data-tour-id="scorecard-data"]', action: 'tap', instruction: 'Compare return, growth quality and financial health.' },
  { page: 'ticker', target: '[data-tour-id="business"]', action: 'click', instruction: 'Open The Business.' },
  { page: 'ticker', target: '[data-tour-id="business-data"]', action: 'tap', optional: true, instruction: 'See what the company sells and where it earns revenue.' },
  { page: 'ticker', target: '[data-tour-id="price-methods"]', action: 'click', instruction: 'Open Layer 1 — Price Projection.' },
  { page: 'ticker', target: '[data-tour-id="methodology-toggle"]', action: 'click', instruction: 'Show how the price is calculated.' },
  { page: 'ticker', target: '[data-tour-id="method-1"]', action: 'tap', multiple: true, instruction: 'Read Method 1 — EBITDA or P/E.' },
  { page: 'ticker', target: '[data-tour-id="method-2"]', action: 'tap', multiple: true, instruction: 'Read Method 2 — Free Cash Flow.' },
  { page: 'ticker', target: '[data-tour-id="method-3"]', action: 'tap', multiple: true, instruction: 'Check whether the Dividend method applies.' },
  { page: 'ticker', target: '[data-tour-id="blended-projection"]', action: 'tap', instruction: 'See how the methods become one price target.' },
  { page: 'ticker', target: '[data-tour-id="growth-layer"]', action: 'click', instruction: 'Open Layer 2 — Growth Quality.' },
  { page: 'ticker', target: '[data-tour-id="growth-revenue"]', action: 'tap', optional: true, instruction: 'Compare Revenue growth with the S&P 500.' },
  { page: 'ticker', target: '[data-tour-id="growth-ebitda"]', action: 'tap', optional: true, instruction: 'Compare EBITDA growth with the S&P 500.' },
  { page: 'ticker', target: '[data-tour-id="growth-free-cash-flow"]', action: 'tap', optional: true, instruction: 'Compare Free Cash Flow growth with the S&P 500.' },
  { page: 'ticker', target: '[data-tour-id="growth-score"]', action: 'tap', instruction: 'Review the combined Growth Quality score.' },
  { page: 'ticker', target: '[data-tour-id="health-layer"]', action: 'click', instruction: 'Open Layer 3 — Financial Health.' },
  { page: 'ticker', target: '[data-tour-id="health-summary"]', action: 'tap', instruction: 'Review the overall Financial Health score.' },
  { page: 'ticker', target: '[data-tour-id="health-balance-sheet"]', action: 'tap', instruction: 'Review the Balance Sheet checks.' },
  { page: 'ticker', target: '[data-tour-id="health-income-statement"]', action: 'tap', instruction: 'Review the Income Statement checks.' },
  { page: 'ticker', target: '[data-tour-id="health-cash-flow"]', action: 'tap', instruction: 'Review the Cash Flow checks.' },
  { page: 'ticker', target: '[data-tour-id="health-metric"]', action: 'click', optional: true, instruction: 'Expand one metric to see its five-year detail.' },
  { page: 'ticker', target: '[data-tour-id="final-layer"]', action: 'click', instruction: 'Open Layer 4 — Final Score.' },
  { page: 'ticker', target: '[data-tour-id="final-score"]', action: 'tap', instruction: 'Review the weighted score and final verdict.' },
]

type TourContextValue = {
  state: TourState
  startTour: () => void
  conversionReady: boolean
  menuLabel: string
}

type HighlightRect = { top: number; left: number; width: number; height: number }

const TourContext = createContext<TourContextValue | null>(null)

function readState(): TourState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as TourState
  } catch {}
  return { status: 'idle', step: 0 }
}

function hasCookieChoice() {
  try { return !!localStorage.getItem(COOKIE_KEY) } catch { return false }
}

export function GuidedTourProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [mounted, setMounted] = useState(false)
  const [state, setState] = useState<TourState>({ status: 'idle', step: 0 })
  const [rect, setRect] = useState<HighlightRect | null>(null)
  const [consentTick, setConsentTick] = useState(0)

  const save = useCallback((next: TourState) => {
    setState(next)
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch {}
    window.dispatchEvent(new CustomEvent('stocksnack:tour-status', { detail: next.status }))
  }, [])

  const activateFromIntent = useCallback(() => {
    try {
      if (localStorage.getItem(INTENT_KEY) !== 'start' || !hasCookieChoice()) return
      localStorage.removeItem(INTENT_KEY)
      save({ status: 'active', step: 0 })
      if (pathname !== '/screener') router.push('/screener')
    } catch {}
  }, [pathname, router, save])

  useEffect(() => {
    setMounted(true)
    const stored = readState()
    setState(stored)
    if (stored.status === 'active') return
    activateFromIntent()
  }, [activateFromIntent])

  useEffect(() => {
    const onOnboarding = (event: Event) => {
      const choice = (event as CustomEvent<'start' | 'skip'>).detail
      if (choice === 'skip') save({ status: 'completed', step: 0 })
      else activateFromIntent()
    }
    const onCookie = () => {
      setConsentTick(value => value + 1)
      activateFromIntent()
    }
    window.addEventListener('stocksnack:onboarding-choice', onOnboarding)
    window.addEventListener('cookie-consent-accepted', onCookie)
    window.addEventListener('cookie-consent-declined', onCookie)
    return () => {
      window.removeEventListener('stocksnack:onboarding-choice', onOnboarding)
      window.removeEventListener('cookie-consent-accepted', onCookie)
      window.removeEventListener('cookie-consent-declined', onCookie)
    }
  }, [activateFromIntent, save])

  const step = STEPS[state.step]
  const pageMatches = step && (step.page === 'screener' ? pathname === '/screener' : /^\/screener\/[^/]+$/.test(pathname))

  const advance = useCallback(() => {
    if (state.step >= STEPS.length - 1) {
      save({ status: 'completed', step: STEPS.length - 1, ticker: state.ticker })
      router.push('/screener')
      return
    }
    const nextStep = state.step + 1
    const ticker = state.step === 0
      ? document.querySelector<HTMLElement>(STEPS[0].target)?.dataset.tourTicker
      : state.ticker
    save({ status: 'active', step: nextStep, ticker })
  }, [router, save, state.step, state.ticker])

  useEffect(() => {
    if (!mounted || state.status !== 'active' || !step || !pageMatches) {
      setRect(null)
      return
    }
    let cancelled = false
    let targets: HTMLElement[] = []
    let observer: ResizeObserver | null = null
    let retryTimer: number | null = null
    let attempts = 0
    const updateRect = () => {
      if (cancelled || targets.length === 0) return
      const boxes = targets.map(target => target.getBoundingClientRect()).filter(box => box.width > 0 && box.height > 0)
      if (boxes.length === 0) return
      const top = Math.min(...boxes.map(box => box.top))
      const left = Math.min(...boxes.map(box => box.left))
      const right = Math.max(...boxes.map(box => box.right))
      const bottom = Math.max(...boxes.map(box => box.bottom))
      setRect({ top, left, width: right - left, height: bottom - top })
    }
    const locate = () => {
      const matches = Array.from(document.querySelectorAll<HTMLElement>(step.target))
      targets = step.multiple ? matches : matches.slice(0, 1)
      if (targets.length === 0) {
        attempts += 1
        if (step.optional && attempts >= 20) {
          advance()
          return
        }
        retryTimer = window.setTimeout(locate, 250)
        return
      }
      targets[0].scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' })
      window.setTimeout(updateRect, 250)
      observer = new ResizeObserver(updateRect)
      targets.forEach(target => observer?.observe(target))
    }
    const timer = window.setTimeout(locate, 350)
    const onClick = (event: MouseEvent) => {
      if (step.action !== 'click' || !targets.some(target => target.contains(event.target as Node))) return
      window.setTimeout(advance, 350)
    }
    document.addEventListener('click', onClick, true)
    window.addEventListener('scroll', updateRect, true)
    window.addEventListener('resize', updateRect)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
      if (retryTimer !== null) window.clearTimeout(retryTimer)
      observer?.disconnect()
      document.removeEventListener('click', onClick, true)
      window.removeEventListener('scroll', updateRect, true)
      window.removeEventListener('resize', updateRect)
    }
  }, [advance, mounted, pageMatches, state.status, step])

  const startTour = useCallback(() => {
    if (!hasCookieChoice()) {
      try { localStorage.setItem(INTENT_KEY, 'start') } catch {}
      return
    }
    try { localStorage.removeItem(INTENT_KEY) } catch {}
    save({ status: 'active', step: 0 })
    if (pathname !== '/screener') router.push('/screener')
  }, [pathname, router, save])
  const skipTour = useCallback(() => save({ ...state, status: 'completed' }), [save, state])
  const resumeTour = useCallback(() => {
    save({ ...state, status: 'active' })
    const resumeStep = STEPS[state.step]
    if (resumeStep?.page === 'screener' && pathname !== '/screener') router.push('/screener')
    if (resumeStep?.page === 'ticker' && state.ticker && pathname !== `/screener/${state.ticker}`) router.push(`/screener/${state.ticker}`)
  }, [pathname, router, save, state])
  const conversionReady = mounted && state.status !== 'active' && (() => {
    try { return localStorage.getItem('ss_onboarding_seen') === '1' && hasCookieChoice() } catch { return false }
  })() && consentTick >= 0
  const menuLabel = state.status === 'paused' ? '🧭 CONTINUE TOUR' : state.status === 'completed' ? '🧭 RESTART TOUR' : '🧭 GUIDED TOUR'
  const context = useMemo(() => ({ state, startTour: state.status === 'paused' ? resumeTour : startTour, conversionReady, menuLabel }), [conversionReady, menuLabel, resumeTour, startTour, state])

  const pad = 8
  const spotlight = rect ? (() => {
    const top = Math.max(0, Math.min(window.innerHeight, rect.top - pad))
    const left = Math.max(0, Math.min(window.innerWidth, rect.left - pad))
    const right = Math.max(left, Math.min(window.innerWidth, rect.left + rect.width + pad))
    const bottom = Math.max(top, Math.min(window.innerHeight, rect.top + rect.height + pad))
    return { top, left, width: right - left, height: bottom - top }
  })() : null

  return (
    <TourContext.Provider value={context}>
      {children}
      {mounted && state.status === 'active' && step && !pageMatches && createPortal(
        <div className="fixed inset-0 z-[950] flex items-center justify-center bg-black font-mono">
          <span className="animate-pulse text-sm font-bold tracking-[0.3em] text-[#00ff41]">STOCKSNACK_</span>
        </div>,
        document.body,
      )}
      {mounted && state.status === 'active' && step && pageMatches && spotlight && createPortal(
        <div className="pointer-events-none fixed inset-0 z-[900] font-mono" aria-live="polite">
          <div className="pointer-events-auto absolute bg-black/80" style={{ top: 0, left: 0, right: 0, height: spotlight.top }} />
          <div className="pointer-events-auto absolute bg-black/80" style={{ top: spotlight.top, left: 0, width: spotlight.left, height: spotlight.height }} />
          <div className="pointer-events-auto absolute bg-black/80" style={{ top: spotlight.top, left: spotlight.left + spotlight.width, right: 0, height: spotlight.height }} />
          <div className="pointer-events-auto absolute bg-black/80" style={{ top: spotlight.top + spotlight.height, left: 0, right: 0, bottom: 0 }} />
          <div className="absolute pointer-events-none rounded-md border-2 border-[#00ff41] shadow-[0_0_24px_rgba(0,255,65,0.45)]" style={spotlight} />
          {step.action === 'tap' && <button aria-label="Continue tour" onClick={advance} className="pointer-events-auto absolute cursor-pointer touch-pan-y bg-transparent" style={spotlight} />}

          <div className="pointer-events-none fixed left-3 right-3 top-3 z-[902] rounded-lg border border-[#00ff41]/40 bg-[#030603]/95 px-3 py-2.5 shadow-2xl md:left-1/2 md:right-auto md:w-[440px] md:-translate-x-1/2">
            <div className="flex items-center justify-between">
              <button onClick={skipTour} className="pointer-events-auto min-h-9 px-1 text-[9px] tracking-widest text-[#00ff41]/35 hover:text-[#00ff41]">SKIP TOUR</button>
              <p className="text-[9px] font-bold tracking-[0.2em] text-[#00ff41]/40">{state.step + 1}/{STEPS.length}</p>
            </div>
            <p className="pb-1 text-xs font-bold leading-relaxed text-[#00ff41]">{step.instruction}</p>
          </div>
        </div>,
        document.body,
      )}
    </TourContext.Provider>
  )
}

export function useGuidedTour() {
  const context = useContext(TourContext)
  if (!context) throw new Error('useGuidedTour must be used inside GuidedTourProvider')
  return context
}

export function TourConversionGate({ children }: { children: React.ReactNode }) {
  const { conversionReady } = useGuidedTour()
  return conversionReady ? <>{children}</> : null
}
