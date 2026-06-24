'use client'

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { createPortal } from 'react-dom'
import StockSnackLoader from './StockSnackLoader'

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
  anchor?: string  // data-tour-id of the card header to retract to before expanding
}

const STEPS: TourStep[] = [
  { page: 'screener', target: '[data-tour-id="nav-menu-button"]', action: 'tap', instruction: 'Tap this menu anytime to restart the tour.' },
  { page: 'screener', target: '[data-tour-primary-stock="true"]', action: 'click', navigate: true, instruction: 'Pick a stock and click on it.' },
  { page: 'ticker', target: '[data-tour-id="ticker-header"]',        anchor: 'ticker-header',  action: 'tap', instruction: 'This is the stock you selected.' },
  { page: 'ticker', target: '[data-tour-id="overview"]',             anchor: 'ticker-header',  action: 'click', instruction: 'Click here for the stock overview.' },
  { page: 'ticker', target: '[data-tour-id="price-projection"]',     anchor: 'price-methods-header',  action: 'click', instruction: 'This section shows the stock\'s estimated future price.' },
  { page: 'ticker', target: '[data-tour-id="scorecard"]',            anchor: 'price-methods-header',  action: 'click', instruction: 'Click here to understand the stock at a glance.' },
  { page: 'ticker', target: '[data-tour-id="business"]',             anchor: 'price-methods-header',  action: 'click', instruction: 'This section explains what the company does.' },
  { page: 'ticker', target: '[data-tour-id="price-methods"]',        anchor: 'price-methods-header',  action: 'click', instruction: 'How do we calculate the future price?' },
  { page: 'ticker', target: '[data-tour-id="methodology-toggle"]',   anchor: 'price-methods-header',  action: 'click', instruction: 'These are the methods we use to calculate the future price.' },
  { page: 'ticker', target: '[data-tour-id="method-1"]',             anchor: 'price-methods-header',  action: 'tap', multiple: true, instruction: 'Method 1 uses future EBITDA or P/E to estimate price.' },
  { page: 'ticker', target: '[data-tour-id="method-2"]',             anchor: 'price-methods-header',  action: 'tap', multiple: true, instruction: 'Method 2 uses future Free Cash Flow to estimate price.' },
  { page: 'ticker', target: '[data-tour-id="method-3"]',             anchor: 'price-methods-header',  action: 'tap', multiple: true, instruction: 'Method 3 uses future Dividends when applicable.' },
  { page: 'ticker', target: '[data-tour-id="blended-projection"]',   anchor: 'price-methods-header',  action: 'tap', instruction: 'We average all available future prices into one target.' },
  { page: 'ticker', target: '[data-tour-id="growth-layer"]',         anchor: 'growth-layer-header',   action: 'click', instruction: 'This layer measures the company\'s growth quality.' },
  { page: 'ticker', target: '[data-tour-id="growth-yoy"]',           anchor: 'growth-layer-header',   action: 'tap', instruction: 'This part shows the year-over-year performance.' },
  { page: 'ticker', target: '[data-tour-id="growth-sp500"]',         anchor: 'growth-layer-header',   action: 'tap', optional: true, instruction: 'The red line shows the S&P 500 performance.' },
  { page: 'ticker', target: '[data-tour-id="growth-metrics"]',       anchor: 'growth-layer-header',   action: 'tap', instruction: 'We cover Revenue, EBITDA and Free Cash Flow.' },
  { page: 'ticker', target: '[data-tour-id="growth-score"]',         anchor: 'growth-layer-header',   action: 'tap', instruction: 'We score their growth performance against the S&P 500.' },
  { page: 'ticker', target: '[data-tour-id="health-layer"]',         anchor: 'health-layer-header',   action: 'click', instruction: 'This layer checks the company\'s financial strength.' },
  { page: 'ticker', target: '[data-tour-id="health-summary"]',       anchor: 'health-layer-header',   action: 'tap', instruction: 'This is the overall Financial Health score.' },
  { page: 'ticker', target: '[data-tour-id="health-balance-sheet"]', anchor: 'health-layer-header',   action: 'tap', instruction: 'Balance Sheet checks cover cash, debt and equity.' },
  { page: 'ticker', target: '[data-tour-id="health-income-statement"]', anchor: 'health-layer-header', action: 'tap', instruction: 'Income Statement checks cover profit and earnings quality.' },
  { page: 'ticker', target: '[data-tour-id="health-cash-flow"]',     anchor: 'health-layer-header',   action: 'tap', instruction: 'Cash Flow checks show how reliably the business produces cash.' },
  { page: 'ticker', target: '[data-tour-id="health-metric"]',        anchor: 'health-layer-header',   action: 'click', optional: true, instruction: 'Click the arrow to expand a check and see its five-year history, then tap to continue.' },
  { page: 'ticker', target: '[data-tour-id="final-layer"]',          anchor: 'final-layer-header',    action: 'click', instruction: 'The final layer combines every score into one verdict.' },
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

// Returns the bounding rect of the card header to retract to before expanding.
// Falls back to the ticker-header if the anchor element isn't found.
function getAnchorRect(anchorId?: string): HighlightRect {
  const nav = document.querySelector<HTMLElement>('nav')
  const navBottom = nav?.getBoundingClientRect().bottom ?? 0
  const selector = anchorId ? `[data-tour-id="${anchorId}"]` : '[data-tour-id="ticker-header"]'
  const el = document.querySelector<HTMLElement>(selector)
  if (el) {
    const box = el.getBoundingClientRect()
    if (box.width > 0 && box.height > 0) {
      return { top: box.top, left: box.left, width: box.width, height: box.height }
    }
  }
  // Fallback: full-width strip just below nav
  const header = document.querySelector<HTMLElement>('[data-tour-id="ticker-header"]')
  const h = header ? header.getBoundingClientRect().height || 52 : 52
  return { top: navBottom + 8, left: 0, width: window.innerWidth, height: Math.max(h, 40) }
}

export function GuidedTourProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [mounted, setMounted] = useState(false)
  const [state, setState] = useState<TourState>({ status: 'idle', step: 0 })
  const [consentTick, setConsentTick] = useState(0)
  const [activatedStep, setActivatedStep] = useState<number | null>(null)
  const [readyStep, setReadyStep] = useState<number | null>(null)
  const [showTransition, setShowTransition] = useState(false)
  const [tvPhase, setTvPhase] = useState<'off' | 'crush' | 'shrink' | 'done'>('off')
  const [calloutVisible, setCalloutVisible] = useState(true)
  const [targetReady, setTargetReady] = useState(false)

  // displayRect is the single source of truth for the animated spotlight.
  // It stays live after the transition so expanding accordions and viewport
  // changes cannot leave the tutorial hit-area behind.
  const [displayRect, setDisplayRect] = useState<HighlightRect | null>(null)
  const [crossPagePending, setCrossPagePending] = useState(false)
  const transitionRunRef = useRef(0)
  const routeLoadingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Tracks the live spotlight rect so the transition effect can read it synchronously
  const spotlightRef = useRef<{ top: number; left: number; width: number; height: number } | null>(null)

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
    if (!step || !targetReady || (step.action === 'click' && !controlActivated)) return
    const timer = window.setTimeout(() => setReadyStep(state.step), 900)
    return () => window.clearTimeout(timer)
  }, [controlActivated, state.step, step, targetReady])

  useEffect(() => {
    if (!showTransition) return
    setTvPhase('crush')
    const t1 = window.setTimeout(() => setTvPhase('shrink'), 180)
    const t2 = window.setTimeout(() => setTvPhase('done'), 320)
    const t3 = window.setTimeout(() => { setShowTransition(false); setTvPhase('off') }, 520)
    return () => { window.clearTimeout(t1); window.clearTimeout(t2); window.clearTimeout(t3) }
  }, [showTransition])

  const advance = useCallback(() => {
    if (state.step >= STEPS.length - 1) {
      setShowTransition(true)
      save({ status: 'completed', step: STEPS.length - 1, ticker: state.ticker })
      window.setTimeout(() => router.push('/screener'), 560)
      return
    }
    const nextStep = state.step + 1
    const ticker = state.step === 0
      ? document.querySelector<HTMLElement>(STEPS[0].target)?.dataset.tourTicker
      : state.ticker
    save({ status: 'active', step: nextStep, ticker })
  }, [router, save, state.step, state.ticker])

  useEffect(() => {
    const run = ++transitionRunRef.current
    setCalloutVisible(false)
    setTargetReady(false)

    if (!mounted || state.status !== 'active' || !step || !pageMatches) {
      setDisplayRect(null)
      return
    }

    let cancelled = false
    let targets: HTMLElement[] = []
    let observer: ResizeObserver | null = null
    let retryTimer: number | null = null
    let settleTimer: number | null = null
    let revealTimer: number | null = null
    let attempts = 0

    const updateRect = (reveal = false) => {
      if (cancelled || transitionRunRef.current !== run || targets.length === 0) return false
      const boxes = targets.map(t => t.getBoundingClientRect()).filter(b => b.width > 0 && b.height > 0)
      if (boxes.length === 0) return false
      const top = Math.min(...boxes.map(b => b.top))
      const left = Math.min(...boxes.map(b => b.left))
      const right = Math.max(...boxes.map(b => b.right))
      const bottom = Math.max(...boxes.map(b => b.bottom))
      setDisplayRect({ top, left, width: right - left, height: bottom - top })
      if (reveal) {
        revealTimer = window.setTimeout(() => {
          if (cancelled || transitionRunRef.current !== run) return
          setCrossPagePending(false)
          setCalloutVisible(true)
          setTargetReady(true)
        }, step.page === 'ticker' ? 420 : 80)
      }
      return true
    }

    const locate = () => {
      const matches = Array.from(document.querySelectorAll<HTMLElement>(step.target))
      targets = step.multiple ? matches : matches.slice(0, 1)
      const hasVisibleTarget = targets.some(target => {
        const box = target.getBoundingClientRect()
        return box.width > 0 && box.height > 0
      })
      if (targets.length === 0 || !hasVisibleTarget) {
        attempts += 1
        if (step.optional && attempts >= 6) { advance(); return }
        retryTimer = window.setTimeout(locate, 250)
        return
      }

      // The spotlight performs the animation; the page itself should not slide
      // up and down behind it.
      targets[0].scrollIntoView({ behavior: 'auto', block: 'center' })
      settleTimer = window.setTimeout(() => updateRect(true), 50)
      observer = new ResizeObserver(() => updateRect())
      targets.forEach(t => observer?.observe(t))
    }

    if (step.page === 'ticker') {
      // Collapse the green box toward the callout bubble (the user's "header").
      // Read the previous spotlight position before it changes so we can animate
      // the box down to a thin bar at the callout edge — giving the retract effect.
      const prev = spotlightRef.current
      if (prev) {
        const navBottom = document.querySelector<HTMLElement>('nav')?.getBoundingClientRect().bottom ?? 0
        const calloutAbove = prev.top - navBottom >= 52
        if (calloutAbove) {
          // Callout is above the box — collapse box upward to its top edge
          setDisplayRect({ top: prev.top, left: prev.left, width: prev.width, height: 2 })
        } else {
          // Callout is below the box — collapse box downward to its bottom edge
          setDisplayRect({ top: prev.top + prev.height - 2, left: prev.left, width: prev.width, height: 2 })
        }
      } else {
        setDisplayRect(null)
      }
    } else {
      setDisplayRect(null)
    }

    const timer = window.setTimeout(locate, step.page === 'ticker' ? 420 : 0)
    const onViewportChange = () => { updateRect() }
    window.addEventListener('scroll', onViewportChange, true)
    window.addEventListener('resize', onViewportChange)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
      if (retryTimer !== null) window.clearTimeout(retryTimer)
      if (settleTimer !== null) window.clearTimeout(settleTimer)
      if (revealTimer !== null) window.clearTimeout(revealTimer)
      observer?.disconnect()
      window.removeEventListener('scroll', onViewportChange, true)
      window.removeEventListener('resize', onViewportChange)
    }
  }, [advance, mounted, pageMatches, pathname, state.status, state.step, step])

  const startTour = useCallback(() => {
    if (!hasCookieChoice()) {
      try { localStorage.setItem(INTENT_KEY, 'start') } catch {}
      return
    }
    try { localStorage.removeItem(INTENT_KEY) } catch {}
    // Clear any active screener filters so tour stock is visible
    try { localStorage.removeItem('stocksnack_screener_filters') } catch {}
    window.dispatchEvent(new Event('tour-reset-filters'))
    save({ status: 'active', step: 0 })
    if (pathname !== '/screener') router.push('/screener')
  }, [pathname, router, save])
  const skipTour = useCallback(() => save({ ...state, status: 'completed' }), [save, state])
  const handleSpotlightClick = useCallback(() => {
    if (!step || !targetReady) return

    if (step.action === 'tap' || controlActivated) {
      if (!canAdvance) return
      playTourClick()
      advance()
      return
    }

    const targets = Array.from(document.querySelectorAll<HTMLElement>(step.target))
      .filter(target => {
        const box = target.getBoundingClientRect()
        return box.width > 0 && box.height > 0
      })
    const target = targets[0]
    if (!target) return

    playTourClick()
    const control = target.querySelector<HTMLElement>('[data-tour-control="true"]') ?? target
    control.click()

    if (step.navigate) {
      setCrossPagePending(true)
      advance()
      return
    }
    setActivatedStep(state.step)
  }, [advance, canAdvance, controlActivated, state.step, step, targetReady])
  const skipWithSound = useCallback(() => { playTourClick(); skipTour() }, [skipTour])
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
  const spotlight = displayRect ? (() => {
    const top = Math.max(0, Math.min(window.innerHeight, displayRect.top - pad))
    const left = Math.max(0, Math.min(window.innerWidth, displayRect.left - pad))
    const right = Math.max(left, Math.min(window.innerWidth, displayRect.left + displayRect.width + pad))
    const bottom = Math.max(top, Math.min(window.innerHeight, displayRect.top + displayRect.height + pad))
    return { top, left, width: right - left, height: bottom - top }
  })() : null
  spotlightRef.current = spotlight  // always current for transition effect
  const callout = spotlight ? (() => {
    const width = Math.min(window.innerWidth - 24, Math.max(240, spotlight.width))
    const left = Math.max(12, Math.min(window.innerWidth - width - 12, spotlight.left))
    const navBottom = document.querySelector<HTMLElement>('nav')?.getBoundingClientRect().bottom ?? 0
    const above = spotlight.top - navBottom >= 52
    return above
      ? { bottom: window.innerHeight - spotlight.top, left, width, above: true }
      : { top: spotlight.top + spotlight.height, left, width, above: false }
  })() : null

  const routeLoading = mounted && state.status === 'active' && !!step && (!pageMatches || crossPagePending)

  // Safety: if routeLoading persists for >4s the page never arrived — abort the tour
  // so the screen doesn't stay permanently black.
  useEffect(() => {
    if (routeLoading) {
      routeLoadingTimerRef.current = setTimeout(() => {
        save({ ...state, status: 'completed' })
      }, 4000)
    } else {
      if (routeLoadingTimerRef.current !== null) {
        clearTimeout(routeLoadingTimerRef.current)
        routeLoadingTimerRef.current = null
      }
    }
    return () => {
      if (routeLoadingTimerRef.current !== null) clearTimeout(routeLoadingTimerRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeLoading])

  const TRANSITION = 'top 300ms cubic-bezier(0.4,0,0.2,1), left 300ms cubic-bezier(0.4,0,0.2,1), width 300ms cubic-bezier(0.4,0,0.2,1), height 300ms cubic-bezier(0.4,0,0.2,1)'

  return (
    <TourContext.Provider value={context}>
      {children}
      {mounted && (showTransition || routeLoading) && createPortal(
        <div className="fixed inset-0 z-[1300] flex items-center justify-center bg-black overflow-hidden font-mono">
          <style>{`
            @keyframes ss-tv-crush {
              0%   { height: 100vh; opacity: 1; }
              100% { height: 2px;   opacity: 1; }
            }
            @keyframes ss-tv-shrink {
              0%   { width: 100vw; opacity: 1; }
              80%  { width: 8px;   opacity: 1; }
              100% { width: 0px;   opacity: 0; }
            }
          `}</style>
          {routeLoading && !showTransition && <StockSnackLoader />}
          {showTransition && tvPhase === 'crush' && (
            <div style={{ position: 'absolute', width: '100vw', background: 'white', boxShadow: '0 0 60px 20px white', animation: 'ss-tv-crush 160ms cubic-bezier(0.4,0,1,1) forwards' }} />
          )}
          {showTransition && tvPhase === 'shrink' && (
            <div style={{ position: 'absolute', height: '2px', background: 'white', boxShadow: '0 0 30px 8px white', animation: 'ss-tv-shrink 140ms cubic-bezier(0.4,0,1,1) forwards' }} />
          )}
        </div>,
        document.body,
      )}
      {mounted && state.status === 'active' && step && pageMatches && spotlight && createPortal(
        <div className="pointer-events-none fixed inset-0 z-[1200] font-mono" aria-live="polite">
          {/* Overlay panels — CSS-transition the hole position for smooth retract/expand */}
          <div className="pointer-events-auto absolute bg-black/80" style={{ top: 0, left: 0, right: 0, height: spotlight.top, transition: 'height 300ms cubic-bezier(0.4,0,0.2,1)' }} />
          <div className="pointer-events-auto absolute bg-black/80" style={{ top: spotlight.top, left: 0, width: spotlight.left, height: spotlight.height, transition: TRANSITION }} />
          <div className="pointer-events-auto absolute bg-black/80" style={{ top: spotlight.top, left: spotlight.left + spotlight.width, right: 0, height: spotlight.height, transition: TRANSITION }} />
          <div className="pointer-events-auto absolute bg-black/80" style={{ top: spotlight.top + spotlight.height, left: 0, right: 0, bottom: 0, transition: 'top 300ms cubic-bezier(0.4,0,0.2,1)' }} />
          {/* Spotlight border */}
          <div
            className="absolute pointer-events-none border-2 border-[#00ff41] shadow-[0_0_24px_rgba(0,255,65,0.45)]"
            style={{
              ...spotlight,
              borderRadius: callout?.above ? '0 0 6px 6px' : '6px',
              borderTop: callout?.above ? 'none' : undefined,
              transition: TRANSITION,
            }}
          />
          <button
            aria-label={step.action === 'click' && !controlActivated ? 'Activate highlighted control' : canAdvance ? 'Continue tour' : 'Please read this tour step'}
            disabled={!targetReady || ((step.action === 'tap' || controlActivated) && !canAdvance)}
            onClick={handleSpotlightClick}
            className="pointer-events-auto absolute cursor-pointer touch-pan-y bg-transparent disabled:cursor-default"
            style={{ ...spotlight, transition: TRANSITION }}
          />
          {/* Dot — fixed 20px from right border, vertically centered */}
          <div
            className="pointer-events-none absolute z-[902] h-3 w-3"
            style={{
              left: spotlight.left + spotlight.width - 20,
              top: spotlight.top + spotlight.height / 2 - 6,
              transition: 'left 300ms cubic-bezier(0.4,0,0.2,1), top 300ms cubic-bezier(0.4,0,0.2,1)',
            }}
            aria-hidden="true"
          >
            {canAdvance && <span className="absolute inset-0 animate-ping rounded-full bg-[#00ff41] opacity-70" />}
            <span className="absolute inset-[2px] rounded-full bg-[#00ff41] shadow-[0_0_10px_#00ff41]" />
          </div>
          <button onClick={skipWithSound} className="pointer-events-auto fixed left-4 top-[14px] z-[1203] min-h-11 px-3 text-[10px] font-bold tracking-widest text-black border border-[#ff4d4d] rounded transition-colors bg-[#ff4d4d] hover:bg-[#ff6666] shadow-[0_0_14px_rgba(255,77,77,0.35)]">SKIP TOUR</button>
          {/* Callout */}
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
                transition: 'left 300ms ease, bottom 300ms ease, top 300ms ease, width 300ms ease, opacity 180ms ease',
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
