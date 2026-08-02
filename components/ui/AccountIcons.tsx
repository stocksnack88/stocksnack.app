// Small two-tone line icons for account settings rows -- dim outline +
// bright accent stroke, no emoji.

export function InstallIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
      <rect x="4" y="2" width="16" height="20" rx="3" stroke="rgba(0,255,65,0.35)" strokeWidth="1.6" />
      <path d="M12 7v8m0 0l-3-3m3 3l3-3" stroke="#00ff41" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 19h6" stroke="#00ff41" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

export function CardIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="rgba(0,255,65,0.5)" strokeWidth="1.8">
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 10h20" />
    </svg>
  )
}

export function SoundIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="rgba(0,255,65,0.5)" strokeWidth="1.8">
      <path d="M4 9v6h4l5 5V4L8 9H4z" />
      <path d="M16 9a4 4 0 010 6" strokeLinecap="round" />
    </svg>
  )
}

export function FeedbackIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="rgba(0,255,65,0.5)" strokeWidth="1.8">
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
    </svg>
  )
}
