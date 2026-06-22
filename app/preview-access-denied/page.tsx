import SignOutButton from '@/components/ui/SignOutButton'

export default function PreviewAccessDeniedPage() {
  return (
    <main className="min-h-screen bg-black px-6 text-[#00ff41]" style={{ fontFamily: "var(--font-geist-mono), 'Courier New', monospace" }}>
      <div className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center text-center">
        <p className="text-[10px] font-bold tracking-[0.25em] text-[#00ff41]/40">STOCKSNACK · INTERNAL PREVIEW</p>
        <h1 className="mt-4 text-xl font-bold tracking-widest">ACCESS RESTRICTED</h1>
        <p className="mt-3 text-xs leading-6 text-[#00ff41]/50">
          This preview is available only to approved StockSnack accounts.
        </p>
        <div className="mt-8 rounded border border-[#00ff41]/40 px-5 py-2.5 hover:border-[#00ff41]">
          <SignOutButton redirectTo="/login" />
        </div>
      </div>
    </main>
  )
}
