'use client'
import { useRouter } from 'next/navigation'

export default function TrialExpiredModal({ onClose }: { onClose: () => void }) {
  const router = useRouter()

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-6"
      style={{ background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(4px)' }}
    >
      <div
        className="w-full max-w-sm rounded-lg overflow-hidden"
        style={{ border: '1px solid rgba(0,255,65,0.25)', background: '#030f03', fontFamily: "var(--font-geist-mono), 'Courier New', monospace" }}
      >
        <div className="px-6 py-5" style={{ borderBottom: '1px solid rgba(0,255,65,0.12)', background: 'rgba(0,255,65,0.04)' }}>
          <p className="text-xs tracking-[0.3em] mb-1" style={{ color: 'rgba(0,255,65,0.35)' }}>FREE TRIAL</p>
          <p className="text-lg font-bold tracking-widest" style={{ color: '#00ff41' }}>YOUR TRIAL HAS ENDED</p>
        </div>

        <div className="px-6 py-6">
          <p className="text-xs leading-relaxed mb-6" style={{ color: 'rgba(0,255,65,0.55)' }}>
            Verify your phone number and get 15 more minutes free.
          </p>

          <div className="space-y-3">
            <button
              onClick={() => router.push('/verify-phone')}
              className="w-full py-3 rounded font-bold text-xs tracking-widest transition-opacity hover:opacity-90"
              style={{ background: '#00ff41', color: '#000' }}
            >
              VERIFY PHONE → GET 15 MIN
            </button>
            <button
              onClick={() => router.push('/pricing')}
              className="w-full py-3 rounded font-bold text-xs tracking-widest transition-colors"
              style={{ border: '1px solid rgba(0,255,65,0.2)', color: 'rgba(0,255,65,0.4)', background: 'transparent' }}
            >
              UPGRADE TO PRO →
            </button>
            <button
              onClick={() => { onClose(); router.push('/screener') }}
              className="w-full py-2 text-xs tracking-widest transition-colors"
              style={{ color: 'rgba(0,255,65,0.25)', background: 'transparent' }}
            >
              BACK TO SCREENER
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
