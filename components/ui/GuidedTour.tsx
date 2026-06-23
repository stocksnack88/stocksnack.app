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
  navigate?: boolean
}

const STEPS: TourStep[] = [
  { page: 'screener', target: '[data-tour-primary-stock="true"]', action: 'click', navigate: true, instruction: 'Pick a stock and click on it.' },
  { page: 'ticker', target: '[data-tour-id="ticker-header"]', action: 'tap', instruction: 'This is the stock you selected.' },
  { page: 'ticker', target: '[data-tour-id="overview"]', action: 'click', instruction: 'Click here for the stock overview.' },
  { page: 'ticker', target: '[data-tour-id="price-projection"]', action: 'click', instruction: 'This section estimates the stock\'s future price.' },
  { page: 'ticker', target: '[data-tour-id="price-projection-data"]', action: 'tap', instruction: 'This shows the estimated stock price five years from now.' },
  { page: 'ticker', target: '[data-tour-id="scorecard"]', action: 'click', instruction: 'Click here to understand the stock at a glance.' },
  { page: 'ticker', target: '[data-tour-id="scorecard-data"]', action: 'tap', instruction: 'An overview of the stock\'s performance.' },
  { page: 'ticker', target: '[data-tour-id="business"]', action: 'click', instruction: 'This section explains what the company does.' },
  { page: 'ticker', target: '[data-tour-id="business-data"]', action: 'tap', optional: true, instruction: 'See how the business makes money.' },
  { page: 'ticker', target: '[data-tour-id="price-methods"]', action: 'click', instruction: 'How do we calculate the future price?' },
  { page: 'ticker', target: '[data-tour-id="methodology-toggle"]', action: 'click', instruction: 'Expand to see the valuation methods.' },
  { page: 'ticker', target: '[data-tour-id="method-1"]', action: 'tap', multiple: true, instruction: 'Method 1 uses future EBITDA or P/E to estimate price.' },
  { page: 'ticker', target: '[data-tour-id="method-2"]', action: 'tap', multiple: true, instruction: 'Method 2 uses future Free Cash Flow to estimate price.' },
  { page: 'ticker', target: '[data-tour-id="method-3"]', action: 'tap', multiple: true, instruction: 'Method 3 uses future Dividends when applicable.' },
  { page: 'ticker', target: '[data-tour-id="blended-projection"]', action: 'tap', instruction: 'We average all available future prices into one target.' },
  { page: 'ticker', target: '[data-tour-id="growth-layer"]', action: 'click', instruction: 'This layer measures the company\'s growth quality.' },
  { page: 'ticker', target: '[data-tour-id="growth-yoy"]', action: 'tap', instruction: 'This part shows the year-over-year performance.' },
  { page: 'ticker', target: '[data-tour-id="growth-sp500"]', action: 'tap', optional: true, instruction: 'The red line shows the S&P 500 performance.' },
  { page: 'ticker', target: '[data-tour-id="growth-metrics"]', action: 'tap', instruction: 'We cover Revenue, EBITDA and Free Cash Flow.' },
  { page: 'ticker', target: '[data-tour-id="growth-score"]', action: 'tap', instruction: 'We score their growth performance against the S&P 500.' },
  { page: 'ticker', target: '[data-tour-id="health-layer"]', action: 'click', instruction: 'This layer checks the company\'s financial strength.' },
  { page: 'ticker', target: '[data-tour-id="health-summary"]', action: 'tap', instruction: 'This is the overall Financial Health score.' },
  { page: 'ticker', target: '[data-tour-id="health-balance-sheet"]', action: 'tap', instruction: 'Balance Sheet checks cover cash, debt and equity.' },
  { page: 'ticker', target: '[data-tour-id="health-income-statement"]', action: 'tap', instruction: 'Income Statement checks cover profit and earnings quality.' },
  { page: 'ticker', target: '[data-tour-id="health-cash-flow"]', action: 'tap', instruction: 'Cash Flow checks show how reliably the business produces cash.' },
  { page: 'ticker', target: '[data-tour-id="health-metric"]', action: 'click', optional: true, instruction: 'Expand one check to see its five-year history.' },
  { page: 'ticker', target: '[data-tour-id="final-layer"]', action: 'click', instruction: 'The final layer combines every score above.' },
  { page: 'ticker', target: '[data-tour-id="final-score"]', action: 'tap', instruction: 'The final score weights future return, growth and financial health.' },
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

function playTourClick() {
  try {
    const AudioCtx = (window.AudioContext || (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)!
    const ctx = new AudioCtx()
    const oscillator = ctx.createOscillator()
    const gain = ctx.createGain()
    oscillator.connect(gain)
    gain.connect(ctx.destination)
    oscillator.type = 'square'
    oscillator.frequency.setValueAtTime(760, ctx.currentTime)
    oscillator.frequency.exponentialRampToValueAtTime(480, ctx.currentTime + 0.045)
    gain.gain.setValueAtTime(0.09, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05)
    oscillator.start(ctx.currentTime)
    oscillator.stop(ctx.currentTime + 0.05)
    oscillator.onended = () => { void ctx.close() }
  } catch {}
}

export function GuidedTourProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [mounted, setMounted] = useState(false)
  const [state, setState] = useState<TourState>({ status: 'idle', step: 0 })
  const [rect, setRect] = useState<HighlightRect | null>(null)
  const [consentTick, setConsentTick] = useState(0)
  const [activatedStep, setActivatedStep] = useState<number | null>(null)
  const [readyStep, setReadyStep] = useState<number | null>(null)
  const [showTransition, setShowTransition] = useState(false)
  const [calloutVisible, setCalloutVisible] = useState(true)

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
  const controlActivated = activatedStep === state.step
  const canAdvance = readyStep === state.step

  useEffect(() => {
    if (!step || (step.action === 'click' && !controlActivated)) return
    const timer = window.setTimeout(() => setReadyStep(state.step), 900)
    return () => window.clearTimeout(timer)
  }, [controlActivated, state.step, step])

  // Fade callout out on step change, then back in after spotlight has slid
  useEffect(() => {
    setCalloutVisible(false)
    const timer = window.setTimeout(() => setCalloutVisible(true), 280)
    return () => window.clearTimeout(timer)
  }, [state.step])

  useEffect(() => {
    if (!showTransition || pathname !== '/screener') return
    const timer = window.setTimeout(() => setShowTransition(false), 250)
    return () => window.clearTimeout(timer)
  }, [pathname, showTransition])

  const advance = useCallback(() => {
    if (state.step >= STEPS.length - 1) {
      setShowTransition(true)
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
      // Only clear rect when tour is fully inactive — not between steps — so the
      // spotlight can slide smoothly instead of blinking out
      if (state.status !== 'active') setRect(null)
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
      playTourClick()
      if (step.navigate) {
        window.setTimeout(advance, 350)
        return
      }
      setActivatedStep(state.step)
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
  }, [advance, mounted, pageMatches, state.status, state.step, step])

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
  const tapToAdvance = useCallback(() => {
    if (!canAdvance) return
    playTourClick()
    advance()
  }, [advance, canAdvance])
  const skipWithSound = useCallback(() => {
    playTourClick()
    skipTour()
  }, [skipTour])
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
  const callout = spotlight ? (() => {
    // Match spotlight width exactly (capped to viewport with small margin)
    const width = Math.min(window.innerWidth - 24, Math.max(240, spotlight.width))
    const left = Math.max(12, Math.min(window.innerWidth - width - 12, spotlight.left))
    // Place callout flush above spotlight when there's room, otherwise below
    const above = spotlight.top >= 60
    return above
      ? { bottom: window.innerHeight - spotlight.top, left, width, above: true }
      : { top: spotlight.top + spotlight.height, left, width, above: false }
  })() : null

  return (
    <TourContext.Provider value={context}>
      {children}
      {mounted && (showTransition || (state.status === 'active' && step && !pageMatches)) && createPortal(
        <div className="fixed inset-0 z-[950] flex items-center justify-center bg-black font-mono">
          <span className="animate-pulse text-sm font-bold tracking-[0.3em] text-[#00ff41]">STOCKSNACK_</span>
        </div>,
        document.body,
      )}
      {mounted && state.status === 'active' && step && pageMatches && spotlight && createPortal(
        <div className="pointer-events-none fixed inset-0 z-[900] font-mono" aria-live="polite">
          {/* Overlay panels — transition so they slide with the spotlight */}
          <div className="pointer-events-auto absolute bg-black/80" style={{ top: 0, left: 0, right: 0, height: spotlight.top, transition: 'height 350ms ease' }} />
          <div className="pointer-events-auto absolute bg-black/80" style={{ top: spotlight.top, left: 0, width: spotlight.left, height: spotlight.height, transition: 'top 350ms ease, width 350ms ease, height 350ms ease' }} />
          <div className="pointer-events-auto absolute bg-black/80" style={{ top: spotlight.top, left: spotlight.left + spotlight.width, right: 0, height: spotlight.height, transition: 'top 350ms ease, left 350ms ease, height 350ms ease' }} />
          <div className="pointer-events-auto absolute bg-black/80" style={{ top: spotlight.top + spotlight.height, left: 0, right: 0, bottom: 0, transition: 'top 350ms ease' }} />
          {/* Spotlight border — square top corners when callout sits flush above */}
          <div
            className="absolute pointer-events-none border-2 border-[#00ff41] shadow-[0_0_24px_rgba(0,255,65,0.45)]"
            style={{
              ...spotlight,
              borderRadius: callout?.above ? '0 0 6px 6px' : '6px',
              borderTop: callout?.above ? 'none' : undefined,
              transition: 'top 350ms ease, left 350ms ease, width 350ms ease, height 350ms ease',
            }}
          />
          {(step.action === 'tap' || controlActivated) && (
            <button
              aria-label={canAdvance ? 'Continue tour' : 'Please read this tour step'}
              disabled={!canAdvance}
              onClick={tapToAdvance}
              className="pointer-events-auto absolute cursor-pointer touch-pan-y bg-transparent disabled:cursor-default"
              style={spotlight}
            />
          )}

          {/* Dot — vertically centered, 14px inset from right edge */}
          <div
            className="pointer-events-none absolute z-[902] h-3 w-3"
            style={{
              left: spotlight.left + spotlight.width - 20,
              top: spotlight.top + spotlight.height / 2 - 6,
              transition: 'left 350ms ease, top 350ms ease',
            }}
            aria-hidden="true"
          >
            {(step.action === 'click' && !controlActivated) || canAdvance ? (
              <span className="absolute inset-0 animate-ping rounded-full bg-[#00ff41] opacity-70" />
            ) : null}
            <span className="absolute inset-[2px] rounded-full bg-[#00ff41] shadow-[0_0_10px_#00ff41]" />
          </div>

          <button onClick={skipWithSound} className="pointer-events-auto fixed left-2 top-2 z-[903] min-h-11 px-3 text-[10px] font-bold tracking-widest text-[#ff4444] hover:text-[#ff6666] border border-[#ff4444]/40 hover:border-[#ff6666] rounded transition-colors">SKIP TOUR</button>

          {/* Callout — flush above spotlight, fades on step change */}
          {callout && (
            <div
              className="pointer-events-none fixed z-[902] bg-[#00ff41] px-3 py-2.5 shadow-[0_0_20px_rgba(0,255,65,0.4)]"
              style={{
                left: callout.left,
                width: callout.width,
                ...(callout.above ? { bottom: (callout as { bottom: number }).bottom } : { top: (callout as { top: number }).top }),
                borderRadius: callout.above ? '6px 6px 0 0' : '0 0 6px 6px',
                borderBottom: callout.above ? '1px solid rgba(0,0,0,0.15)' : undefined,
                borderTop: !callout.above ? '1px solid rgba(0,0,0,0.15)' : undefined,
                transition: 'left 350ms ease, bottom 350ms ease, top 350ms ease, width 350ms ease, opacity 200ms ease',
                opacity: calloutVisible ? 1 : 0,
              }}
            >
              <div className="flex items-center justify-between gap-3 text-[#001a08]">
                <p className="text-xs font-bold leading-snug">{step.instruction}</p>
                <p className="shrink-0 text-[9px] font-bold tracking-[0.15em] opacity-60">{state.step + 1}/{STEPS.length}</p>
              </div>
            </div>
          )}
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
