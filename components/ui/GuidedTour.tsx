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
  page: 'screener' | 'ticker' | 'any'
  action: TourAction
  optional?: boolean
  multiple?: boolean
  navigate?: boolean
  dotTarget?: string  // separate selector for pulsing dot position
}

const STEPS: TourStep[] = [
  { page: 'any', target: '[data-tour-id="nav-menu-panel"]', dotTarget: '[data-tour-id="nav-tour-button"]', action: 'tap', instruction: 'The menu is always here. Tap anywhere to continue.' },
  { page: 'screener', target: '[data-tour-primary-stock="true"]', action: 'click', navigate: true, instruction: 'Pick a stock and click on it.' },
  { page: 'ticker', target: '[data-tour-id="ticker-header"]',           action: 'tap',   instruction: 'This is the stock you selected.' },
  { page: 'ticker', target: '[data-tour-id="overview"]',                action: 'click', instruction: 'Click here for the stock overview.' },
  { page: 'ticker', target: '[data-tour-id="price-projection"]',        action: 'click', instruction: 'This section shows the stock\'s estimated future price.' },
  { page: 'ticker', target: '[data-tour-id="scorecard"]',               action: 'click', instruction: 'Click here to understand the stock at a glance.' },
  { page: 'ticker', target: '[data-tour-id="business"]',                action: 'click', instruction: 'This section explains what the company does.' },
  { page: 'ticker', target: '[data-tour-id="price-methods"]',           action: 'click', instruction: 'How do we calculate the future price?' },
  { page: 'ticker', target: '[data-tour-id="methodology-toggle"]',      action: 'click', instruction: 'These are the methods we use to calculate the future price.' },
  { page: 'ticker', target: '[data-tour-id="method-1"]',                action: 'tap',   multiple: true, instruction: 'Method 1 uses future EBITDA or P/E to estimate price.' },
  { page: 'ticker', target: '[data-tour-id="method-2"]',                action: 'tap',   multiple: true, instruction: 'Method 2 uses future Free Cash Flow to estimate price.' },
  { page: 'ticker', target: '[data-tour-id="method-3"]',                action: 'tap',   multiple: true, instruction: 'Method 3 uses future Dividends when applicable.' },
  { page: 'ticker', target: '[data-tour-id="blended-projection"]',      action: 'tap',   instruction: 'We average all available future prices into one target.' },
  { page: 'ticker', target: '[data-tour-id="growth-layer"]',            action: 'click', instruction: 'This layer measures the company\'s growth quality.' },
  { page: 'ticker', target: '[data-tour-id="growth-yoy"]',              action: 'tap',   instruction: 'This part shows the year-over-year performance.' },
  { page: 'ticker', target: '[data-tour-id="growth-sp500"]',            action: 'tap',   optional: true, instruction: 'The red line shows the S&P 500 performance.' },
  { page: 'ticker', target: '[data-tour-id="growth-metrics"]',          action: 'tap',   instruction: 'We cover Revenue, EBITDA and Free Cash Flow.' },
  { page: 'ticker', target: '[data-tour-id="growth-score"]',            action: 'tap',   instruction: 'We score their growth performance against the S&P 500.' },
  { page: 'ticker', target: '[data-tour-id="health-layer"]',            action: 'click', instruction: 'This layer checks the company\'s financial strength.' },
  { page: 'ticker', target: '[data-tour-id="health-summary"]',          action: 'tap',   instruction: 'This is the overall Financial Health score.' },
  { page: 'ticker', target: '[data-tour-id="health-balance-sheet"]',    action: 'tap',   instruction: 'Balance Sheet checks cover cash, debt and equity.' },
  { page: 'ticker', target: '[data-tour-id="health-income-statement"]', action: 'tap',   instruction: 'Income Statement checks cover profit and earnings quality.' },
  { page: 'ticker', target: '[data-tour-id="health-cash-flow"]',        action: 'tap',   instruction: 'Cash Flow checks show how reliably the business produces cash.' },
  { page: 'ticker', target: '[data-tour-id="health-metric"]',           action: 'click', optional: true, instruction: 'Click the arrow to expand a check and see its five-year history, then tap to continue.' },
  { page: 'ticker', target: '[data-tour-id="final-layer"]',             action: 'click', instruction: 'The final layer combines every score into one verdict.' },
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
  const [consentTick, setConsentTick] = useState(0)
  const [activatedStep, setActivatedStep] = useState<number | null>(null)
  const [readyStep, setReadyStep] = useState<number | null>(null)
  const [showTransition, setShowTransition] = useState(false)
  const [tvPhase, setTvPhase] = useState<'off' | 'crush' | 'shrink' | 'done'>('off')
  const [calloutVisible, setCalloutVisible] = useState(true)   // callout bubble always shown; text inside hidden until arrived
  const [calloutTextVisible, setCalloutTextVisible] = useState(false)
  const [targetReady, setTargetReady] = useState(false)

  // displayRect is the single source of truth for the animated spotlight.
  // It stays live after the transition so expanding accordions and viewport
  // changes cannot leave the tutorial hit-area behind.
  const [displayRect, setDisplayRect] = useState<HighlightRect | null>(null)
  const [crossPagePending, setCrossPagePending] = useState(false)
  const transitionRunRef = useRef(0)
  const routeLoadingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const spotlightRef = useRef<{ top: number; left: number; width: number; height: number } | null>(null)
  const crossPagePendingRef = useRef(false)
  crossPagePendingRef.current = crossPagePending
  // Stable callout position — set when step changes so callout travels independently from the collapsing rectangle
  type CalloutPos = { left: number; width: number; above: boolean; top?: number; bottom?: number }
  const [stableCallout, setStableCallout] = useState<CalloutPos | null>(null)
  const calloutRef = useRef<CalloutPos | null>(null)

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
    if (state.status === 'active' && state.step === 0) {
      window.dispatchEvent(new Event('tour-open-menu'))
    }
  }, [state.status, state.step])

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
  const pageMatches = step && (step.page === 'any' ? true : step.page === 'screener' ? pathname === '/screener' : /^\/screener\/[^/]+$/.test(pathname))
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
    const ticker = state.step === 1
      ? document.querySelector<HTMLElement>(STEPS[1].target)?.dataset.tourTicker
      : state.ticker
    save({ status: 'active', step: nextStep, ticker })
    const nextDef = STEPS[nextStep]
    const currentDef = STEPS[state.step]
    if (!currentDef?.navigate) {
      if (nextDef?.page === 'screener' && pathname !== '/screener') router.push('/screener')
      else if (nextDef?.page === 'ticker' && ticker && pathname !== `/screener/${ticker}`) router.push(`/screener/${ticker}`)
    }
  }, [pathname, router, save, state.step, state.ticker])

  useEffect(() => {
    const run = ++transitionRunRef.current
    setCalloutTextVisible(false)   // hide text — callout bubble stays shown (UFO)
    setTargetReady(false)

    if (!mounted || state.status !== 'active' || !step) {
      setDisplayRect(null)
      setCalloutVisible(false)
      return
    }
    if (!pageMatches) {
      // Cross-page navigation in progress — keep callout bubble alive at its last position
      // so the UFO stays visible above the TV loading screen during page transition.
      if (!crossPagePendingRef.current) {
        setDisplayRect(null)
        setCalloutVisible(false)
      }
      return
    }
    setCalloutVisible(true)

    let cancelled = false
    let targets: HTMLElement[] = []
    let observer: ResizeObserver | null = null
    let retryTimer: number | null = null
    let settleTimer: number | null = null
    let revealTimer: number | null = null
    let travelTimer: number | null = null
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
          setStableCallout(null)  // callout now derived from expanded spotlight
          setCalloutTextVisible(true)
          setTargetReady(true)
        }, 80)
      }
      return true
    }

    const isInViewport = (b: DOMRect) => b.width > 0 && b.top >= 0 && b.bottom <= window.innerHeight

    const locate = () => {
      const matches = Array.from(document.querySelectorAll<HTMLElement>(step.target))
      targets = step.multiple ? matches : matches.slice(0, 1)
      const hasVisibleTarget = targets.some(t => { const b = t.getBoundingClientRect(); return b.width > 0 && b.height > 0 })
      if (targets.length === 0 || !hasVisibleTarget) {
        attempts += 1
        if (step.optional && attempts >= 6) { advance(); return }
        retryTimer = window.setTimeout(locate, 250)
        return
      }
      const isLast = state.step === STEPS.length - 1
      targets[0].scrollIntoView({ behavior: 'auto', block: isLast ? 'start' : 'center' })
      settleTimer = window.setTimeout(() => updateRect(true), 50)
      observer = new ResizeObserver(() => updateRect())
      targets.forEach(t => observer?.observe(t))
    }

    const computeCalloutPos = (el: HTMLElement): CalloutPos => {
      const b = el.getBoundingClientRect()
      const navBottom = document.querySelector<HTMLElement>('nav')?.getBoundingClientRect().bottom ?? 0
      const above = b.top - navBottom >= 52
      const width = Math.min(window.innerWidth - 24, Math.max(240, b.width))
      const left = Math.max(12, Math.min(window.innerWidth - width - 12, b.left))
      return above
        ? { left, width, above: true, bottom: window.innerHeight - b.top }
        : { left, width, above: false, top: b.top + b.height }
    }

    // UFO animation: collapse rectangle → callout travels at full size → rectangle expands
    const prev = spotlightRef.current
    const prevCallout = calloutRef.current  // full-size callout before collapse
    if (prev && prevCallout) {
      // Keep callout at full size while rectangle collapses (stableCallout overrides derived)
      setStableCallout(prevCallout)
      const navBottom = document.querySelector<HTMLElement>('nav')?.getBoundingClientRect().bottom ?? 0
      const calloutAbove = prev.top - navBottom >= 52
      // Phase 1: collapse rectangle to thin bar at callout edge
      setDisplayRect(calloutAbove
        ? { top: prev.top, left: prev.left, width: prev.width, height: 2 }
        : { top: prev.top + prev.height - 2, left: prev.left, width: prev.width, height: 2 })

      travelTimer = window.setTimeout(() => {
        if (cancelled || transitionRunRef.current !== run) return
        const nextEl = !step.multiple ? document.querySelector<HTMLElement>(step.target) : null
        if (nextEl && isInViewport(nextEl.getBoundingClientRect())) {
          // Target is visible — travel callout to its position, then expand
          const newCalloutPos = computeCalloutPos(nextEl)
          const b = nextEl.getBoundingClientRect()
          const isNearby = Math.abs(b.top - prev.top) < 60 && Math.abs(b.left - prev.left) < 60
          if (isNearby) {
            // Same area — skip animation, just locate
            setStableCallout(null)
            locate()
          } else {
            // Phase 2: callout travels to new position (stays full size)
            setStableCallout(newCalloutPos)
            const newAbove = newCalloutPos.above
            setDisplayRect(newAbove
              ? { top: b.top, left: b.left, width: b.width, height: 2 }
              : { top: b.top + b.height - 2, left: b.left, width: b.width, height: 2 })
            // Phase 3: expand rectangle
            travelTimer = window.setTimeout(() => {
              if (cancelled || transitionRunRef.current !== run) return
              setStableCallout(null)
              locate()
            }, 320)
          }
        } else {
          // Off-screen or cross-page — skip travel, let locate() scroll+expand
          if (nextEl) setStableCallout(computeCalloutPos(nextEl))
          locate()
        }
      }, 320)
    } else {
      setDisplayRect(null)
      // No previous position — just locate directly (first step or post-page-load)
      travelTimer = window.setTimeout(locate, step.page === 'ticker' ? 200 : 0)
    }
    const onViewportChange = () => { updateRect() }
    window.addEventListener('scroll', onViewportChange, true)
    window.addEventListener('resize', onViewportChange)
    return () => {
      cancelled = true
      if (travelTimer !== null) window.clearTimeout(travelTimer)
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
  }, [save])
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
  const derivedCallout = spotlight ? (() => {
    const width = Math.min(window.innerWidth - 24, Math.max(240, spotlight.width))
    const left = Math.max(12, Math.min(window.innerWidth - width - 12, spotlight.left))
    const navBottom = document.querySelector<HTMLElement>('nav')?.getBoundingClientRect().bottom ?? 0
    const above = spotlight.top - navBottom >= 52
    return above
      ? { bottom: window.innerHeight - spotlight.top, left, width, above: true }
      : { top: spotlight.top + spotlight.height, left, width, above: false }
  })() : null
  // Keep calloutRef up to date so the effect can read the pre-collapse callout position
  if (derivedCallout) calloutRef.current = derivedCallout
  // stableCallout overrides during travel so callout moves independently of rectangle
  const callout = stableCallout ?? derivedCallout

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
          {/* Overlay panels — block all clicks outside spotlight so menus/dropdowns can't be dismissed */}
          <div className="pointer-events-auto absolute bg-black/80" onClick={e => e.stopPropagation()} style={{ top: 0, left: 0, right: 0, height: spotlight.top, transition: 'height 300ms cubic-bezier(0.4,0,0.2,1)' }} />
          <div className="pointer-events-auto absolute bg-black/80" onClick={e => e.stopPropagation()} style={{ top: spotlight.top, left: 0, width: spotlight.left, height: spotlight.height, transition: TRANSITION }} />
          <div className="pointer-events-auto absolute bg-black/80" onClick={e => e.stopPropagation()} style={{ top: spotlight.top, left: spotlight.left + spotlight.width, right: 0, height: spotlight.height, transition: TRANSITION }} />
          <div className="pointer-events-auto absolute bg-black/80" onClick={e => e.stopPropagation()} style={{ top: spotlight.top + spotlight.height, left: 0, right: 0, bottom: 0, transition: 'top 300ms cubic-bezier(0.4,0,0.2,1)' }} />
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
            data-tour-spotlight="true"
            className="pointer-events-auto absolute cursor-pointer touch-pan-y bg-transparent disabled:cursor-default"
            style={{ ...spotlight, transition: TRANSITION }}
          />
          {/* Dot — on dotTarget element if specified, otherwise right-center of spotlight */}
          {(() => {
            let dotLeft = spotlight.left + spotlight.width - 20
            let dotTop = spotlight.top + spotlight.height / 2 - 6
            if (step.dotTarget) {
              const dotEl = document.querySelector<HTMLElement>(step.dotTarget)
              if (dotEl) {
                const b = dotEl.getBoundingClientRect()
                dotLeft = b.left + b.width / 2 - 6
                dotTop = b.top + b.height / 2 - 6
              }
            }
            return (
              <div
                className="pointer-events-none absolute z-[902] h-3 w-3"
                style={{ left: dotLeft, top: dotTop, transition: 'left 300ms cubic-bezier(0.4,0,0.2,1), top 300ms cubic-bezier(0.4,0,0.2,1)' }}
                aria-hidden="true"
              >
                {canAdvance && <span className="absolute inset-0 animate-ping rounded-full bg-[#00ff41] opacity-70" />}
                <span className="absolute inset-[2px] rounded-full bg-[#00ff41] shadow-[0_0_10px_#00ff41]" />
              </div>
            )
          })()}
          <button onClick={skipWithSound} className="pointer-events-auto fixed left-4 top-[14px] z-[1203] min-h-11 px-3 text-[10px] font-bold tracking-widest text-black border border-[#ff4d4d] rounded transition-colors bg-[#ff4d4d] hover:bg-[#ff6666] shadow-[0_0_14px_rgba(255,77,77,0.35)]">SKIP TOUR</button>
          {/* Callout */}
          {callout && calloutVisible && (
            <div
              className="pointer-events-none fixed z-[1350] bg-[#00ff41] shadow-[0_0_20px_rgba(0,255,65,0.4)]"
              style={{
                left: callout.left,
                width: callout.width,
                ...(callout.above ? { bottom: (callout as { bottom: number }).bottom } : { top: (callout as { top: number }).top }),
                borderRadius: callout.above ? '6px 6px 0 0' : '0 0 6px 6px',
                borderBottom: callout.above ? '1px solid rgba(0,0,0,0.15)' : undefined,
                borderTop: !callout.above ? '1px solid rgba(0,0,0,0.15)' : undefined,
                transition: 'left 320ms cubic-bezier(0.4,0,0.2,1), top 320ms cubic-bezier(0.4,0,0.2,1), bottom 320ms cubic-bezier(0.4,0,0.2,1), width 320ms cubic-bezier(0.4,0,0.2,1)',
                overflow: 'hidden',
                minHeight: calloutTextVisible ? undefined : 8,
              }}
            >
              {calloutTextVisible && (
                <div className="flex items-center justify-between gap-3 text-[#001a08] px-3 py-2.5">
                  <p className="text-xs font-bold leading-snug">{step.instruction}</p>
                  <p className="shrink-0 text-[9px] font-bold tracking-[0.15em] opacity-60">{state.step + 1}/{STEPS.length}</p>
                </div>
              )}
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
