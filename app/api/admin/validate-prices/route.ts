export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/auth-helpers-nextjs'
import { supabaseAdmin } from '@/lib/supabase'

const ADMIN_EMAIL = 'stocksnack88@gmail.com'
const FMP_BASE    = 'https://financialmodelingprep.com/api/v3'
const SAMPLE_SIZE = 15

export type ValidationResult = {
  ticker:       string
  storedPrice:  number | null
  fmpPrice:     number | null
  priceDiffPct: number | null   // absolute %, e.g. 12.3 means 12.3%
  storedPe:     number | null
  fmpPe:        number | null
  peDiffPct:    number | null
  priceFlag:    boolean
  peFlag:       boolean
}

export type ValidateResponse = {
  results:    ValidationResult[]
  checkedAt:  string
  error?:     string
}

export async function GET(req: NextRequest) {
  // Auth — admin only
  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll() {},
      },
    }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const fmpKey = process.env.FMP_API_KEY
  if (!fmpKey) {
    return NextResponse.json({ error: 'FMP_API_KEY not configured' }, { status: 500 })
  }

  // Pick random tickers that have a stored pe_ratio
  const { data: allScores } = await supabaseAdmin
    .from('stock_scores')
    .select('ticker, pe_ratio')
    .not('pe_ratio', 'is', null)

  if (!allScores || allScores.length === 0) {
    return NextResponse.json({ error: 'No scored tickers found' }, { status: 500 })
  }

  const shuffled = [...allScores].sort(() => Math.random() - 0.5).slice(0, SAMPLE_SIZE)
  const tickers  = shuffled.map(r => r.ticker)
  const peMap    = new Map(shuffled.map(r => [r.ticker, r.pe_ratio as number | null]))

  // Stored prices
  const { data: priceRows } = await supabaseAdmin
    .from('stock_prices')
    .select('ticker, current_price')
    .in('ticker', tickers)

  const storedPriceMap = new Map(
    (priceRows ?? []).map(p => [p.ticker, p.current_price as number | null])
  )

  // FMP bulk quote
  const tickerStr = tickers.join(',')
  let fmpMap = new Map<string, { price: number | null; pe: number | null }>()
  try {
    const fmpRes  = await fetch(`${FMP_BASE}/quote/${tickerStr}?apikey=${fmpKey}`, { cache: 'no-store' })
    const fmpData = await fmpRes.json()
    if (Array.isArray(fmpData)) {
      for (const q of fmpData) {
        fmpMap.set(q.symbol, { price: q.price ?? null, pe: q.pe ?? null })
      }
    }
  } catch {
    return NextResponse.json({ error: 'FMP API call failed' }, { status: 502 })
  }

  const results: ValidationResult[] = tickers.map(ticker => {
    const storedPrice = storedPriceMap.get(ticker) ?? null
    const storedPe    = peMap.get(ticker) ?? null
    const fmp         = fmpMap.get(ticker)
    const fmpPrice    = fmp?.price ?? null
    const fmpPe       = fmp?.pe    ?? null

    const priceDiffPct = storedPrice != null && fmpPrice != null && fmpPrice > 0
      ? Math.abs(storedPrice - fmpPrice) / fmpPrice * 100
      : null

    const peDiffPct = storedPe != null && fmpPe != null && fmpPe > 0
      ? Math.abs(storedPe - fmpPe) / fmpPe * 100
      : null

    return {
      ticker,
      storedPrice,
      fmpPrice,
      priceDiffPct: priceDiffPct != null ? Math.round(priceDiffPct * 10) / 10 : null,
      storedPe,
      fmpPe,
      peDiffPct:    peDiffPct    != null ? Math.round(peDiffPct    * 10) / 10 : null,
      priceFlag:    priceDiffPct != null && priceDiffPct > 10,
      peFlag:       peDiffPct    != null && peDiffPct    > 10,
    }
  })

  return NextResponse.json({ results, checkedAt: new Date().toISOString() } satisfies ValidateResponse)
}
