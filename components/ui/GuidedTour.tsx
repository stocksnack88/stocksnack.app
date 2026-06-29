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
  openLayerIds?: number[]  // layer IDs to open before locating this step's target
  locateDelay?: number    // ms to wait before locate() — overrides default 320ms (use when target is inside an accordion being opened)
  scrollFraction?: number  // fraction of usable viewport height below nav to place element top (default 0.25)
  skipUfo?: boolean  // skip UFO travel; collapse then expand upward in-place
}

const STEPS: TourStep[] = [
  { page: 'any',      target: '[data-tour-id="nav-menu-panel"]',          dotTarget: '[data-tour-id="nav-tour-button"]', action: 'tap',   instruction: 'The menu is always here. Tap anywhere to continue.' },
  { page: 'screener', target: '[data-tour-primary-stock="true"]',                                                        action: 'click', navigate: true, instruction: 'Pick a stock and click on it.' },
  { page: 'ticker',   target: '[data-tour-id="ticker-header"]',                                                          action: 'tap',   instruction: 'This is the stock you selected.' },
  { page: 'ticker',   target: '[data-tour-id="overview"]',                                                               action: 'click', instruction: 'Click here for the stock overview.' },
  { page: 'ticker',   target: '[data-tour-id="price-projection"]',        openLayerIds: [0],                             action: 'click', instruction: 'This section shows the stock\'s estimated future price.' },
  { page: 'ticker',   target: '[data-tour-id="scorecard"]',               openLayerIds: [0],                             action: 'click', instruction: 'Click here to understand the stock at a glance.' },
  { page: 'ticker',   target: '[data-tour-id="business"]',                openLayerIds: [0, 8, 12],                      action: 'tap',   instruction: 'This shows what the company does and sells.' },
  { page: 'ticker',   target: '[data-tour-id="price-methods"]',                                                          action: 'click', instruction: 'How do we calculate the future price?' },
  { page: 'ticker',   target: '[data-tour-id="methodology-toggle"]',      openLayerIds: [2],                             action: 'click', instruction: 'These are the methods we use to calculate the future price.' },
  { page: 'ticker',   target: '[data-tour-id="method-1"]',                openLayerIds: [2],                             action: 'tap',   multiple: true, skipUfo: true, instruction: 'Method 1 uses future EBITDA or P/E to estimate price.' },
  { page: 'ticker',   target: '[data-tour-id="method-2"]',                openLayerIds: [2],                             action: 'tap',   multiple: true, skipUfo: true, instruction: 'Method 2 uses future Free Cash Flow to estimate price.' },
  { page: 'ticker',   target: '[data-tour-id="method-3"]',                openLayerIds: [2],                             action: 'tap',   multiple: true, skipUfo: true, instruction: 'Method 3 uses future Dividends when applicable.' },
  { page: 'ticker',   target: '[data-tour-id="blended-projection"]',      openLayerIds: [2], locateDelay: 200,          action: 'tap',   instruction: 'We average all available future prices into one target.' },
  { page: 'ticker',   target: '[data-tour-id="growth-layer"]',            openLayerIds: [3], locateDelay: 400, scrollFraction: 0.0, action: 'tap',   instruction: 'This layer measures the company\'s growth quality.' },
  { page: 'ticker',   target: '[data-tour-id="growth-yoy"]',              openLayerIds: [3],                             action: 'tap',   instruction: 'This part shows the year-over-year performance.' },
  { page: 'ticker',   target: '[data-tour-id="growth-sp500"]',            openLayerIds: [3],                             action: 'tap',   optional: true, instruction: 'The red line shows the S&P 500 performance.' },
  { page: 'ticker',   target: '[data-tour-id="growth-metrics"]',          openLayerIds: [3],                             action: 'tap',   instruction: 'We cover Revenue, EBITDA and Free Cash Flow.' },
  { page: 'ticker',   target: '[data-tour-id="growth-score"]',            openLayerIds: [3],                             action: 'tap',   instruction: 'We score their growth performance against the S&P 500.' },
  { page: 'ticker',   target: '[data-tour-id="health-summary"]',          openLayerIds: [4],                             action: 'tap',   instruction: 'This layer checks the company\'s financial strength.' },
  { page: 'ticker',   target: '[data-tour-id="health-balance-sheet"]',    openLayerIds: [4],                             action: 'tap',   instruction: 'Balance Sheet checks cover cash, debt and equity.' },
  { page: 'ticker',   target: '[data-tour-id="health-income-statement"]', openLayerIds: [4],                             action: 'tap',   instruction: 'Income Statement checks cover profit and earnings quality.' },
  { page: 'ticker',   target: '[data-tour-id="health-cash-flow"]',        openLayerIds: [4],                             action: 'tap',   instruction: 'Cash Flow checks show how reliably the business produces cash.' },
  { page: 'ticker',   target: '[data-tour-id="health-metric"]',           openLayerIds: [4],                             action: 'click', optional: true, instruction: 'Click the arrow to expand a check and see its five-year history, then tap to continue.' },
  { page: 'ticker',   target: '[data-tour-id="final-score"]',           openLayerIds: [5], locateDelay: 500,          action: 'click', instruction: 'The final layer combines every score into one verdict.' },
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
  const [displayedText, setDisplayedText] = useState('')
  const typingTimerRef = useRef<number | null>(null)

  // displayRect is the single source of truth for the animated spotlight.
  // It stays live after the transition so expanding accordions and viewport
  // changes cannot leave the tutorial hit-area behind.
  const [displayRect, setDisplayRect] = useState<HighlightRect | null>(null)
  const [crossPagePending, setCrossPagePending] = useState(false)
  const [showCompletionLoader, setShowCompletionLoader] = useState(false)
  const transitionRunRef = useRef(0)
  const routeLoadingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const spotlightRef = useRef<{ top: number; left: number; width: number; height: number } | null>(null)
  const crossPagePendingRef = useRef(false)
  crossPagePendingRef.current = crossPagePending
  // Stable callout position — set when step changes so callout travels independently from the collapsing rectangle
  // Always uses `top` positioning (never `bottom`) so CSS can transition smoothly when above/below flips.
  type CalloutPos = { left: number; width: number; above: boolean; top: number }
  const [stableCallout, setStableCallout] = useState<CalloutPos | null>(null)
  const [spotlightHidden, setSpotlightHidden] = useState(false)
  const calloutRef = useRef<CalloutPos | null>(null)
  const calloutElRef = useRef<HTMLDivElement>(null)  // DOM ref to measure actual callout height

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

  // Hide completion loader once the screener page has actually loaded (variable time)
  useEffect(() => {
    if (!showCompletionLoader || pathname !== '/screener') return
    const t = window.setTimeout(() => setShowCompletionLoader(false), 500)
    return () => window.clearTimeout(t)
  }, [showCompletionLoader, pathname])

  const advance = useCallback(() => {
    // Close nav menu when leaving step 0
    if (state.step === 0) window.dispatchEvent(new Event('tour-close-menu'))

    if (state.step >= STEPS.length - 1) {
      setShowCompletionLoader(true)
      save({ status: 'completed', step: STEPS.length - 1, ticker: state.ticker })
      window.setTimeout(() => router.push('/screener'), 1200)
      return
    }
    const nextStep = state.step + 1
    const ticker = state.step === 1
      ? document.querySelector<HTMLElement>(STEPS[1].target)?.dataset.tourTicker
      : state.ticker
    save({ status: 'active', step: nextStep, ticker })
    const nextDef = STEPS[nextStep]
    const currentDef = STEPS[state.step]
    // Pre-open required parent layers for the next step
    if (nextDef?.openLayerIds?.length) {
      window.dispatchEvent(new CustomEvent('tour-open-layer', { detail: nextDef.openLayerIds }))
    }
    if (!currentDef?.navigate) {
      if (nextDef?.page === 'screener' && pathname !== '/screener') router.push('/screener')
      else if (nextDef?.page === 'ticker' && ticker && pathname !== `/screener/${ticker}`) router.push(`/screener/${ticker}`)
    }
  }, [pathname, router, save, state.step, state.ticker])

  useEffect(() => {
    const run = ++transitionRunRef.current
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

    // Failsafe: if crossPagePending is still set once the correct page has loaded,
    // force-clear it after 2.5s so the loading screen never gets permanently stuck.
    let crossPageClearTimer: number | null = null
    if (crossPagePendingRef.current) {
      crossPageClearTimer = window.setTimeout(() => {
        if (!cancelled && transitionRunRef.current === run) setCrossPagePending(false)
      }, 2500)
    }

    let cancelled = false
    let targets: HTMLElement[] = []
    let observer: ResizeObserver | null = null
    let retryTimer: number | null = null
    let settleTimer: number | null = null
    let revealTimer: number | null = null
    let travelTimer: number | null = null
    let expandTimer: number | null = null
    let ufoMode = false   // true during UFO transition — spotlight stays as sliver until callout arrives
    let attempts = 0
    // Scroll-idle reveal callback — set by single-target locate(); cleared once reveal fires.
    // onViewportChange resets the idle timer on every scroll event so reveal only fires
    // after the page has actually stopped moving (150ms of silence).
    let onScrollReveal: (() => void) | null = null
    // Boxes captured at reveal time — reused by expandTimer so drift between reveal and
    // expand doesn't flip the callout above/below.
    let revealBoxes: DOMRect[] | null = null

    const updateRect = (reveal = false) => {
      if (cancelled || transitionRunRef.current !== run || targets.length === 0) return false
      const boxes = targets.map(t => t.getBoundingClientRect()).filter(b => b.width > 0 && b.height > 0)
      if (boxes.length === 0) return false
      const top = Math.min(...boxes.map(b => b.top))
      const left = Math.min(...boxes.map(b => b.left))
      const right = Math.max(...boxes.map(b => b.right))
      const bottom = Math.max(...boxes.map(b => b.bottom))
      if (ufoMode) {
        // Always anchor sliver at element TOP — callout is above (skipUfo forceAbove)
        // or standard UFO where callout travels separately. Expansion grows downward.
        setDisplayRect({ top: top, left, width: right - left, height: 2 })
      } else {
        setDisplayRect({ top, left, width: right - left, height: bottom - top })
      }
      if (reveal) {
        revealTimer = window.setTimeout(() => {
          if (cancelled || transitionRunRef.current !== run) return
          setCrossPagePending(false)
          // skipUfo: sliver is anchored at element BOTTOM, so derivedCallout.above flips
          // wrongly (sliver near viewport bottom → canBeAbove=true) until the spotlight
          // expands to full size. Hold stableCallout through the expand; clear it there.
          if (!step.skipUfo) setStableCallout(null)
          setCalloutTextVisible(true)
          setTargetReady(true)
          if (ufoMode) {
            // After callout arrives (~320ms), expand spotlight visibly from sliver to full
            expandTimer = window.setTimeout(() => {
              if (cancelled || transitionRunRef.current !== run) return
              ufoMode = false
              // Use reveal-time positions so accordion drift can't flip above/below after reveal
              const expandBoxes = (revealBoxes && revealBoxes.length > 0 ? revealBoxes : targets.map(t => t.getBoundingClientRect())).filter(b => b.width > 0 && b.height > 0)
              // Step 1: update displayRect to full element size while panels are still hidden.
              // The spotlight position snaps to the correct element rect (invisible under the overlay).
              if (expandBoxes.length > 0) {
                setDisplayRect({
                  top: Math.min(...expandBoxes.map(b => b.top)),
                  left: Math.min(...expandBoxes.map(b => b.left)),
                  width: Math.max(...expandBoxes.map(b => b.right)) - Math.min(...expandBoxes.map(b => b.left)),
                  height: Math.max(...expandBoxes.map(b => b.bottom)) - Math.min(...expandBoxes.map(b => b.top)),
                })
              }
              if (step.skipUfo && !step.multiple) setStableCallout(null)
              // Step 2: one rAF later, show panels. They transition from h=0 to full height
              // with the spotlight already at its correct position — no sliver-sized intermediate state.
              window.requestAnimationFrame(() => {
                if (cancelled || transitionRunRef.current !== run) return
                setSpotlightHidden(false)
              })
            }, 400)
          } else {
            setSpotlightHidden(false)  // no UFO animation, reveal immediately
          }
        }, 80)
      }
      return true
    }

    // Pre-position stableCallout at the correct final position for the new step's targets.
    // Must be called AFTER scroll settles so getBoundingClientRect reflects the resting position.
    // forceAbove: true on skipUfo steps so callout stays above the element consistently
    // (avoids above/below oscillation when the same method columns are revisited).
    const prePositionCallout = (tgts: HTMLElement[], forceAbove = false) => {
      const boxes = tgts.map(t => t.getBoundingClientRect()).filter(b => b.width > 0 && b.height > 0)
      if (boxes.length === 0) return
      const etop = Math.min(...boxes.map(b => b.top))
      const ebot = Math.max(...boxes.map(b => b.bottom))
      const eleft = Math.min(...boxes.map(b => b.left))
      const eright = Math.max(...boxes.map(b => b.right))
      const spTop = Math.max(0, etop - pad)
      const spBot = Math.min(window.innerHeight, ebot + pad)
      const width  = Math.min(window.innerWidth - 24, Math.max(240, (eright + pad) - (eleft - pad)))
      const left   = Math.max(12, Math.min(window.innerWidth - width - 12, eleft - pad))
      const navBottom = document.querySelector<HTMLElement>('nav')?.getBoundingClientRect().bottom ?? 0
      const calloutH  = calloutElRef.current?.offsetHeight ?? 48
      const canBeAbove  = spTop - navBottom >= calloutH + 4
      const mustBeAbove = spBot + calloutH + 12 > window.innerHeight
      const above = forceAbove || canBeAbove || mustBeAbove
      const top = above ? spTop - calloutH : spBot
      setStableCallout({ top, left, width, above })
    }

    const locate = () => {
      const matches = Array.from(document.querySelectorAll<HTMLElement>(step.target))
      targets = step.multiple ? matches : matches.slice(0, 1)
      const hasVisibleTarget = targets.some(t => { const b = t.getBoundingClientRect(); return b.width > 0 && b.height > 0 })
      if (targets.length === 0 || !hasVisibleTarget) {
        attempts += 1
        // On first retry, try to expand a collapsed ancestor accordion
        if (attempts === 1 && targets.length > 0) {
          let el = targets[0].parentElement
          while (el) {
            const ctrl = el.querySelector<HTMLElement>('[data-tour-control]')
            if (ctrl && ctrl !== el) { ctrl.click(); break }
            el = el.parentElement
          }
        }
        if (step.optional && attempts >= 6) { advance(); return }
        retryTimer = window.setTimeout(locate, 250)
        return
      }
      if (targets.length > 1) {
        // Multiple targets (e.g. method-1/2/3 columns) — scroll first into horizontal view,
        // then center the whole group vertically
        targets[0].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
        const firstTop = targets[0].getBoundingClientRect().top + window.scrollY
        const lastBottom = targets[targets.length - 1].getBoundingClientRect().bottom + window.scrollY
        const groupCenter = (firstTop + lastBottom) / 2
        window.scrollTo({ top: Math.max(0, groupCenter - window.innerHeight * 0.5), behavior: 'smooth' })
      } else {
        // Single target — place in upper portion of viewport (~25% below nav)
        const scrollToTarget = () => {
          const navH = document.querySelector<HTMLElement>('nav')?.getBoundingClientRect().bottom ?? 0
          const usableH = window.innerHeight - navH
          const targetTopInViewport = navH + usableH * (step.scrollFraction ?? 0.25)
          const currentTopAbsolute = targets[0].getBoundingClientRect().top + window.scrollY
          window.scrollTo({ top: Math.max(0, currentTopAbsolute - targetTopInViewport), behavior: 'smooth' })
        }
        scrollToTarget()
        updateRect()
        // Scroll-idle reveal: fire only after the page has stopped scrolling for 150ms.
        // Prevents the callout from appearing mid-scroll when the target is far down the page.
        // onViewportChange resets this timer on every scroll event.
        const doReveal = () => {
          onScrollReveal = null
          if (cancelled || transitionRunRef.current !== run) return
          revealBoxes = targets.map(t => t.getBoundingClientRect()).filter(b => b.width > 0 && b.height > 0)
          updateRect(true)
          observer = new ResizeObserver(() => { updateRect() })
          targets.forEach(t => observer?.observe(t))
        }
        onScrollReveal = doReveal
        // Fallback: if element is already in view (no scroll events fire), reveal after 200ms.
        settleTimer = window.setTimeout(doReveal, 200)
        return
      }
      // skipUfo multiple targets (method-1/2/3) are already in view — 200ms is enough for scroll settle.
      // Other multiple targets use 600ms for smooth-scroll centering to complete.
      // Pre-position callout here (after scroll) so it moves once to the correct resting position.
      settleTimer = window.setTimeout(() => {
        if (step.skipUfo) {
          if (step.multiple) {
            // Use the middle skipUfo+multiple element as anchor so all method steps share the same callout position
            const allEls = STEPS
              .filter(s => s.skipUfo && s.multiple)
              .flatMap(s => Array.from(document.querySelectorAll<HTMLElement>(s.target)))
              .filter(el => el.getBoundingClientRect().width > 0)
              .sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left)
            const anchor = allEls[Math.floor(allEls.length / 2)] ?? targets[0]
            if (anchor) prePositionCallout([anchor], true)
          } else {
            prePositionCallout(targets, true)
          }
        }
        updateRect(true)
      }, step.skipUfo ? 200 : 600)
      observer = new ResizeObserver(() => updateRect())
      targets.forEach(t => observer?.observe(t))
    }



    // UFO animation:
    // Phase 1 (0–320ms): hide border + collapse spotlight height to 0. Callout stays at old position.
    // Phase 2 (320ms+): locate() scrolls page and expands spotlight at new element (border still hidden).
    // Reveal (settle+80ms): callout slides to new position (320ms CSS), border fades in (120ms CSS).
    // Callout moves exactly ONCE, only after the spotlight is fully settled — never during scroll.
    //
    // skipUfo steps (method-1/2/3): collapse in-place → expand upward from bottom sliver. No travel.
    const prev = spotlightRef.current
    const prevCallout = calloutRef.current
    const prevStep = state.step > 0 ? STEPS[state.step - 1] : null
    const continuingSkipUfo = prevStep?.skipUfo && prevStep?.multiple && step.skipUfo && step.multiple
    if (prev && prevCallout && step.skipUfo) {
      if (continuingSkipUfo) {
        // Consecutive method step — skip collapse, jump straight to locate so spotlight
        // slides directly to the new column with no shrink/expand animation.
        ufoMode = true
        setSpotlightHidden(false)
        locate()
      } else {
      // skipUfo: collapse toward the callout direction (visible), then hide and locate.
      ufoMode = true
      setSpotlightHidden(false)
      setStableCallout(prevCallout)
      setDisplayRect({ top: prev.top + pad, left: prev.left + pad, width: prev.width - 2 * pad, height: 0 })
      travelTimer = window.setTimeout(() => {
        if (cancelled || transitionRunRef.current !== run) return
        setSpotlightHidden(true)
        locate()
      }, 320)
      }
    } else if (prev && prevCallout) {
      ufoMode = true
      setStableCallout(prevCallout)
      // Visible collapse: spotlight shrinks to 0 at its current position before hiding and
      // traveling. Panels animate closed (300ms CSS), giving every step a smooth disappear.
      // When displayRect.height reaches 0 the panel gap also closes (see h calculation below).
      setSpotlightHidden(false)
      setDisplayRect({ top: prev.top + pad, left: prev.left + pad, width: prev.width - 2 * pad, height: 0 })
      travelTimer = window.setTimeout(() => {
        if (cancelled || transitionRunRef.current !== run) return
        setSpotlightHidden(true)
        // locateDelay on the step controls how long to wait after collapse before measuring
        // the target (useful when the target is inside an accordion that needs time to open).
        const travelMs = step.locateDelay ?? 100
        travelTimer = window.setTimeout(() => {
          if (cancelled || transitionRunRef.current !== run) return
          locate()
        }, travelMs)
      }, 320)
    } else {
      setSpotlightHidden(false)
      setDisplayRect(null)
      travelTimer = window.setTimeout(locate, step.page === 'ticker' ? 200 : 0)
    }
    const onViewportChange = () => {
      updateRect()
      // If waiting for scroll-idle to reveal, reset the idle timer on each scroll event.
      if (onScrollReveal) {
        if (settleTimer !== null) window.clearTimeout(settleTimer)
        settleTimer = window.setTimeout(onScrollReveal, 150)
      }
    }
    window.addEventListener('scroll', onViewportChange, true)
    window.addEventListener('resize', onViewportChange)
    return () => {
      cancelled = true
      if (travelTimer !== null) window.clearTimeout(travelTimer)
      if (retryTimer !== null) window.clearTimeout(retryTimer)
      if (settleTimer !== null) window.clearTimeout(settleTimer)
      if (revealTimer !== null) window.clearTimeout(revealTimer)
      if (expandTimer !== null) window.clearTimeout(expandTimer)
      if (crossPageClearTimer !== null) window.clearTimeout(crossPageClearTimer)
      observer?.disconnect()
      window.removeEventListener('scroll', onViewportChange, true)
      window.removeEventListener('resize', onViewportChange)
    }
  }, [advance, mounted, pageMatches, pathname, state.status, state.step, step])

  // Typewriter effect — types out instruction text whenever it changes
  useEffect(() => {
    const text = step?.instruction ?? ''
    if (typingTimerRef.current !== null) { window.clearTimeout(typingTimerRef.current); typingTimerRef.current = null }
    setDisplayedText('')
    if (!text) return
    let i = 0
    const tick = () => {
      i++
      setDisplayedText(text.slice(0, i))
      if (i < text.length) typingTimerRef.current = window.setTimeout(tick, 10)
      else typingTimerRef.current = null
    }
    typingTimerRef.current = window.setTimeout(tick, 10)
    return () => { if (typingTimerRef.current !== null) { window.clearTimeout(typingTimerRef.current); typingTimerRef.current = null } }
  }, [step?.instruction])

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
  const handleSpotlightClick = useCallback((e: React.MouseEvent) => {
    if (e.detail > 1) return   // ignore double-click — only respond to first click of a sequence
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
    const calloutH = calloutElRef.current?.offsetHeight ?? 48
    // Prefer above whenever there's room; only go below if element is too close to nav.
    // skipUfo steps (method columns) force above=true so the callout never flips side.
    const canBeAbove = spotlight.top - navBottom >= calloutH + 4
    const mustBeAbove = spotlight.top + spotlight.height + calloutH + 12 > window.innerHeight
    const above = !!(step?.skipUfo) || canBeAbove || mustBeAbove
    const top = above ? spotlight.top - calloutH : spotlight.top + spotlight.height
    return { top, left, width, above }
  })() : null
  // Keep calloutRef up to date so the effect can read the pre-collapse callout position
  if (derivedCallout) calloutRef.current = derivedCallout
  // stableCallout overrides during travel so callout moves independently of rectangle
  const callout = stableCallout ?? derivedCallout

  const routeLoading = mounted && state.status === 'active' && !!step && (!pageMatches || crossPagePending)

  // Safety: if routeLoading persists for >6s the page never arrived — pause the tour
  // so the user can resume manually rather than losing progress.
  useEffect(() => {
    if (routeLoading) {
      routeLoadingTimerRef.current = setTimeout(() => {
        save({ ...state, status: 'paused' })
      }, 6000)
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
      {mounted && (showTransition || routeLoading || showCompletionLoader) && createPortal(
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
          {(routeLoading || showCompletionLoader) && !showTransition && <StockSnackLoader />}
          {showTransition && tvPhase === 'crush' && (
            <div style={{ position: 'absolute', width: '100vw', background: 'white', boxShadow: '0 0 60px 20px white', animation: 'ss-tv-crush 160ms cubic-bezier(0.4,0,1,1) forwards' }} />
          )}
          {showTransition && tvPhase === 'shrink' && (
            <div style={{ position: 'absolute', height: '2px', background: 'white', boxShadow: '0 0 30px 8px white', animation: 'ss-tv-shrink 140ms cubic-bezier(0.4,0,1,1) forwards' }} />
          )}
        </div>,
        document.body,
      )}
      {mounted && state.status === 'active' && !spotlight && !routeLoading && !showTransition && createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 1199, background: 'transparent', pointerEvents: 'all' }} />,
        document.body,
      )}
      {mounted && state.status === 'active' && step && pageMatches && spotlight && createPortal(
        <div className="pointer-events-none fixed inset-0 z-[1200] font-mono" aria-live="polite">
          {/* Overlay panels — always 4-panel so the cutout collapses with CSS animation when UFO starts.
              When spotlightHidden (UFO travel), close the gap so the sliver doesn't show through. */}
          {(() => {
            // Close the overlay gap when spotlightHidden OR when collapsed to sliver (height≤2).
            // Even with displayRect.height=0 the spotlight renders 16px tall due to padding — this
            // ensures the gap fully closes so the sliver never leaks outside the callout box.
            const h = (spotlightHidden || (displayRect?.height ?? 99) <= 2) ? 0 : spotlight.height
            return <>
              <div className="pointer-events-auto absolute bg-black/80" onClick={e => e.stopPropagation()} style={{ top: 0, left: 0, right: 0, height: spotlight.top, transition: 'height 300ms cubic-bezier(0.4,0,0.2,1)' }} />
              <div className="pointer-events-auto absolute bg-black/80" onClick={e => e.stopPropagation()} style={{ top: spotlight.top, left: 0, width: spotlight.left, height: h, transition: TRANSITION }} />
              <div className="pointer-events-auto absolute bg-black/80" onClick={e => e.stopPropagation()} style={{ top: spotlight.top, left: spotlight.left + spotlight.width, right: 0, height: h, transition: TRANSITION }} />
              <div className="pointer-events-auto absolute bg-black/80" onClick={e => e.stopPropagation()} style={{ top: spotlight.top + h, left: 0, right: 0, bottom: 0, transition: 'top 300ms cubic-bezier(0.4,0,0.2,1)' }} />
            </>
          })()}
          {/* Spotlight border — hidden during UFO animation so the collapsing/traveling box is invisible */}
          <div
            className="absolute pointer-events-none border-2 border-[#00ff41] shadow-[0_0_24px_rgba(0,255,65,0.45)]"
            style={{
              ...spotlight,
              borderRadius: '6px',
              opacity: (spotlightHidden || (displayRect?.height ?? 99) <= 2) ? 0 : 1,
              transition: TRANSITION + ', opacity 120ms ease',
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
                style={{ left: dotLeft, top: dotTop, opacity: (spotlightHidden || (displayRect?.height ?? 99) <= 2) ? 0 : 1, transition: 'left 300ms cubic-bezier(0.4,0,0.2,1), top 300ms cubic-bezier(0.4,0,0.2,1), opacity 120ms ease' }}
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
              ref={calloutElRef}
              className="pointer-events-none fixed z-[1350] bg-[#00ff41] shadow-[0_0_20px_rgba(0,255,65,0.4)]"
              style={{
                left: callout.left,
                width: callout.width,
                top: callout.top,
                borderRadius: '6px',
                transition: 'left 320ms cubic-bezier(0.4,0,0.2,1), top 320ms cubic-bezier(0.4,0,0.2,1), width 320ms cubic-bezier(0.4,0,0.2,1)',
                overflow: 'hidden',
                minHeight: calloutTextVisible ? undefined : 8,
              }}
            >
              {calloutTextVisible && (
                <div className="flex items-center justify-between gap-3 text-[#001a08] px-3 py-2.5">
                  <p className="text-xs font-bold leading-snug">{displayedText}</p>
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
