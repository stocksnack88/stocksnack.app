export default function DashboardLoading() {
  return (
    <div
      className="min-h-screen bg-black flex items-center justify-center"
      style={{ fontFamily: "var(--font-geist-mono), 'Courier New', monospace" }}
    >
      <span
        className="text-xs tracking-[0.3em] animate-pulse"
        style={{ color: 'rgba(0,255,65,0.4)' }}
      >
        LOADING...
      </span>
    </div>
  )
}
