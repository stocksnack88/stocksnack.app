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
  chapter: string
  title: string
  body: string
  target: string
  page: 'screener' | 'ticker'
  action: TourAction
}

const STEPS: TourStep[] = [
  { page: 'screener', target: '[data-tour-primary-stock="true"]', action: 'click', chapter: 'START HERE', title: 'Start with today\'s BUY', body: 'Tap this stock to see why StockSnack rates it as an opportunity.' },
  { page: 'ticker', target: '[data-tour-id="overview"]', action: 'click', chapter: 'QUICK OVERVIEW', title: 'What matters at a glance?', body: 'Open the overview to see potential return, business quality, and financial health.' },
  { page: 'ticker', target: '[data-tour-id="price-projection"]', action: 'click', chapter: 'QUICK OVERVIEW', title: 'What could this stock return?', body: 'Open the five-year price projection.' },
  { page: 'ticker', target: '[data-tour-id="price-projection-data"]', action: 'tap', chapter: 'QUICK OVERVIEW', title: 'Read the projected return', body: 'Compare today\'s price with the projected price, CAGR, and total five-year return. Tap the highlighted card to continue.' },
  { page: 'ticker', target: '[data-tour-id="scorecard"]', action: 'click', chapter: 'QUICK OVERVIEW', title: 'How does it compare?', body: 'Open this scorecard for the stock-versus-S&P 500 summary.' },
  { page: 'ticker', target: '[data-tour-id="scorecard-data"]', action: 'tap', chapter: 'QUICK OVERVIEW', title: 'Potential and risk together', body: 'Projected return is only useful when growth quality and financial health support it.' },
  { page: 'ticker', target: '[data-tour-id="business"]', action: 'click', chapter: 'THE BUSINESS', title: 'What does this company do?', body: 'Open the business section before judging the numbers.' },
  { page: 'ticker', target: '[data-tour-id="business-data"]', action: 'tap', chapter: 'THE BUSINESS', title: 'Know what you own', body: 'Use the description, product mix, and geographic mix to understand where revenue comes from.' },
  { page: 'ticker', target: '[data-tour-id="price-methods"]', action: 'click', chapter: 'PRICE PROJECTION', title: 'How is the price projected?', body: 'Open Layer 1 to inspect the valuation logic.' },
  { page: 'ticker', target: '[data-tour-id="methodology-toggle"]', action: 'click', chapter: 'PRICE PROJECTION', title: 'Reveal the methodology', body: 'StockSnack blends independent methods instead of trusting one estimate.' },
  { page: 'ticker', target: '[data-tour-id="methodology-table"]', action: 'tap', chapter: 'PRICE PROJECTION', title: 'Earnings multiple method', body: 'This method projects operating earnings and applies an appropriate EBITDA or P/E valuation multiple.' },
  { page: 'ticker', target: '[data-tour-id="methodology-table"]', action: 'tap', chapter: 'PRICE PROJECTION', title: 'Free cash flow method', body: 'This method values the cash the business can generate. If it is unavailable, the table explains why.' },
  { page: 'ticker', target: '[data-tour-id="methodology-table"]', action: 'tap', chapter: 'PRICE PROJECTION', title: 'Dividend method', body: 'Dividend valuation is used only when the yield is meaningful. Otherwise StockSnack marks it not applicable.' },
  { page: 'ticker', target: '[data-tour-id="blended-projection"]', action: 'tap', chapter: 'PRICE PROJECTION', title: 'One blended target', body: 'Applicable methods are averaged into one five-year price target, reducing dependence on any single model.' },
  { page: 'ticker', target: '[data-tour-id="growth-layer"]', action: 'click', chapter: 'GROWTH QUALITY', title: 'Is the business really growing?', body: 'Open Layer 2 to compare growth with the S&P 500 benchmark.' },
  { page: 'ticker', target: '[data-tour-id="growth-revenue"]', action: 'tap', chapter: 'GROWTH QUALITY', title: 'Revenue versus the S&P 500', body: 'Revenue shows whether customer demand is expanding faster than the market benchmark.' },
  { page: 'ticker', target: '[data-tour-id="growth-ebitda"]', action: 'tap', chapter: 'GROWTH QUALITY', title: 'Are earnings keeping pace?', body: 'EBITDA helps reveal whether sales growth is translating into operating earnings.' },
  { page: 'ticker', target: '[data-tour-id="growth-free-cash-flow"]', action: 'tap', chapter: 'GROWTH QUALITY', title: 'Is growth producing cash?', body: 'Free cash flow shows whether accounting growth is becoming usable cash.' },
  { page: 'ticker', target: '[data-tour-id="growth-score"]', action: 'tap', chapter: 'GROWTH QUALITY', title: 'The combined growth score', body: 'StockSnack combines growth rates and trend quality into one comparable score.' },
  { page: 'ticker', target: '[data-tour-id="health-layer"]', action: 'click', chapter: 'FINANCIAL HEALTH', title: 'Can the balance sheet support growth?', body: 'Open Layer 3 to inspect financial resilience.' },
  { page: 'ticker', target: '[data-tour-id="health-summary"]', action: 'tap', chapter: 'FINANCIAL HEALTH', title: 'Four groups of checks', body: 'Balance Sheet, Income Statement, Cash Flow, and Business Traits combine into the health score.' },
  { page: 'ticker', target: '[data-tour-id="health-metric"]', action: 'click', chapter: 'FINANCIAL HEALTH', title: 'Inspect one metric', body: 'Tap this arrow to see the underlying five-year detail—not just PASS or FAIL.' },
  { page: 'ticker', target: '[data-tour-id="final-layer"]', action: 'click', chapter: 'FINAL VERDICT', title: 'Do the three pillars agree?', body: 'Open the final layer to combine projected return, growth quality, and financial health.' },
  { page: 'ticker', target: '[data-tour-id="final-score"]', action: 'tap', chapter: 'FINAL VERDICT', title: 'You can now read StockSnack', body: 'The weighted score produces the final BUY, HOLD, or SELL signal. Tap to return to the screener.' },
]

type TourContextValue = {
  state: TourState
  startTour: () => void
  pauseTour: () => void
  skipTour: () => void
  conversionReady: boolean
  menuLabel: string
}

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
  const [rect, setRect] = useState<DOMRect | null>(null)
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
    let target: HTMLElement | null = null
    let observer: ResizeObserver | null = null
    const updateRect = () => { if (!cancelled && target) setRect(target.getBoundingClientRect()) }
    const locate = () => {
      target = document.querySelector<HTMLElement>(step.target)
      if (!target) {
        window.setTimeout(() => { if (!cancelled) advance() }, 900)
        return
      }
      target.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' })
      window.setTimeout(updateRect, 250)
      observer = new ResizeObserver(updateRect)
      observer.observe(target)
    }
    const timer = window.setTimeout(locate, 350)
    const onClick = (event: MouseEvent) => {
      if (step.action !== 'click' || !target || !target.contains(event.target as Node)) return
      window.setTimeout(advance, 350)
    }
    document.addEventListener('click', onClick, true)
    window.addEventListener('scroll', updateRect, true)
    window.addEventListener('resize', updateRect)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
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
  const pauseTour = useCallback(() => save({ ...state, status: 'paused' }), [save, state])
  const skipTour = useCallback(() => save({ ...state, status: 'completed' }), [save, state])
  const resumeTour = useCallback(() => {
    save({ ...state, status: 'active' })
    const resumeStep = STEPS[state.step]
    if (resumeStep?.page === 'screener' && pathname !== '/screener') router.push('/screener')
    if (resumeStep?.page === 'ticker' && state.ticker && pathname !== `/screener/${state.ticker}`) router.push(`/screener/${state.ticker}`)
  }, [pathname, router, save, state])
  const goBack = useCallback(() => {
    if (state.step === 0) return
    const previousStep = state.step - 1
    save({ ...state, step: previousStep })
    if (STEPS[previousStep].page === 'screener' && pathname !== '/screener') router.push('/screener')
  }, [pathname, router, save, state])

  const conversionReady = mounted && state.status !== 'active' && (() => {
    try { return localStorage.getItem('ss_onboarding_seen') === '1' && hasCookieChoice() } catch { return false }
  })() && consentTick >= 0
  const menuLabel = state.status === 'paused' ? '🧭 CONTINUE TOUR' : state.status === 'completed' ? '🧭 RESTART TOUR' : '🧭 GUIDED TOUR'
  const context = useMemo(() => ({ state, startTour: state.status === 'paused' ? resumeTour : startTour, pauseTour, skipTour, conversionReady, menuLabel }), [conversionReady, menuLabel, pauseTour, resumeTour, skipTour, startTour, state])

  const pad = 8
  const spotlight = rect ? {
    top: Math.max(0, rect.top - pad), left: Math.max(0, rect.left - pad),
    width: Math.min(window.innerWidth - Math.max(0, rect.left - pad), rect.width + pad * 2),
    height: Math.min(window.innerHeight - Math.max(0, rect.top - pad), rect.height + pad * 2),
  } : null

  return (
    <TourContext.Provider value={context}>
      {children}
      {mounted && state.status === 'active' && step && pageMatches && spotlight && createPortal(
        <div className="pointer-events-none fixed inset-0 z-[900] font-mono" aria-live="polite">
          <div className="pointer-events-auto absolute bg-black/80" style={{ top: 0, left: 0, right: 0, height: spotlight.top }} />
          <div className="pointer-events-auto absolute bg-black/80" style={{ top: spotlight.top, left: 0, width: spotlight.left, height: spotlight.height }} />
          <div className="pointer-events-auto absolute bg-black/80" style={{ top: spotlight.top, left: spotlight.left + spotlight.width, right: 0, height: spotlight.height }} />
          <div className="pointer-events-auto absolute bg-black/80" style={{ top: spotlight.top + spotlight.height, left: 0, right: 0, bottom: 0 }} />
          <div className="absolute pointer-events-none rounded-md border-2 border-[#00ff41] shadow-[0_0_24px_rgba(0,255,65,0.45)]" style={spotlight} />
          {step.action === 'tap' && <button aria-label="Continue tour" onClick={advance} className="pointer-events-auto absolute cursor-pointer bg-transparent" style={spotlight} />}

          <div className="pointer-events-auto fixed left-3 right-3 bottom-3 z-[902] rounded-lg border border-[#00ff41]/40 bg-[#030603] p-4 shadow-2xl md:left-1/2 md:right-auto md:w-[440px] md:-translate-x-1/2">
            <div className="mb-3 flex items-start justify-between gap-4">
              <div>
                <p className="text-[9px] font-bold tracking-[0.2em] text-[#00ff41]/45">{step.chapter} · {state.step + 1}/{STEPS.length}</p>
                <p className="mt-1 text-sm font-bold text-[#00ff41]">{step.title}</p>
              </div>
              <button onClick={skipTour} className="min-h-11 px-2 text-[9px] tracking-widest text-[#00ff41]/35 hover:text-[#00ff41]">SKIP TOUR</button>
            </div>
            <p className="text-xs leading-relaxed text-[#00ff41]/65">{step.body}</p>
            <div className="mt-3 flex items-center justify-between border-t border-[#00ff41]/10 pt-3">
              <button onClick={goBack} disabled={state.step === 0} className="min-h-11 px-2 text-[10px] tracking-widest text-[#00ff41]/40 disabled:invisible">← BACK</button>
              <p className="text-[9px] tracking-widest text-[#00ff41]/35">{step.action === 'click' ? 'TAP THE HIGHLIGHTED CONTROL' : 'TAP THE HIGHLIGHTED AREA'}</p>
              <button onClick={pauseTour} className="min-h-11 px-2 text-[10px] tracking-widest text-[#00ff41]/40 hover:text-[#00ff41]">PAUSE</button>
            </div>
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
