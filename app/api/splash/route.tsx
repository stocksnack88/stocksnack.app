import { ImageResponse } from 'next/og'
import { NextRequest } from 'next/server'

export const runtime = 'edge'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const w = parseInt(searchParams.get('w') ?? '1170', 10)
  const h = parseInt(searchParams.get('h') ?? '2532', 10)

  return new ImageResponse(
    (
      <div
        style={{
          width: w,
          height: h,
          background: '#000000',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span
          style={{
            fontFamily: "'Courier New', monospace",
            fontSize: Math.round(w * 0.038),
            fontWeight: 700,
            color: '#00ff41',
            letterSpacing: '0.3em',
          }}
        >
          STOCKSNACK_
        </span>
      </div>
    ),
    { width: w, height: h }
  )
}
