import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import CookieBanner from "@/components/ui/CookieBanner";
import PostHogProvider from "@/components/PostHogProvider";
import { GuidedTourProvider } from "@/components/ui/GuidedTour";
import { COVERED_STOCK_COUNT } from "@/lib/constants";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: 'StockSnack — What\'s the best stock in S&P 500?',
  description: `StockSnack scores all ${COVERED_STOCK_COUNT} S&P 500 stocks using 30 financial metrics based on Buffett-style fundamentals. Free to try.`,
  openGraph: {
    title: "What's the best stock in S&P 500?",
    description: `Sign up to get the answer! StockSnack ranks all ${COVERED_STOCK_COUNT} S&P 500 stocks with BUY/HOLD/SELL verdicts backed by 30 financial metrics.`,
    url: 'https://stocksnack.app',
    siteName: 'StockSnack',
    images: [
      {
        url: 'https://stocksnack.app/og-image.png',
        width: 1200,
        height: 630,
        alt: "What's the best stock in S&P 500?",
      },
    ],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: "What's the best stock in S&P 500?",
    description: 'Sign up to get the answer!',
    images: ['https://stocksnack.app/og-image.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // iOS PWA splash screens — custom text instead of icon
  const splashSizes = [
    [640, 1136], [750, 1334], [828, 1792], [1080, 1920],
    [1125, 2436], [1170, 2532], [1179, 2556], [1242, 2208],
    [1242, 2688], [1284, 2778], [1290, 2796], [1320, 2868],
    [2048, 2732], [1668, 2388], [1536, 2048],
  ]
  return (
    <html lang="en" style={{ backgroundColor: '#000000' }}>
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        {splashSizes.map(([w, h]) => (
          <link
            key={`${w}x${h}`}
            rel="apple-touch-startup-image"
            href={`/api/splash?w=${w}&h=${h}`}
            media={`(device-width: ${Math.round(w / 2)}px) and (device-height: ${Math.round(h / 2)}px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)`}
          />
        ))}
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        style={{ backgroundColor: '#000000' }}
      >
        <PostHogProvider>
          <GuidedTourProvider>{children}</GuidedTourProvider>
        </PostHogProvider>
        <CookieBanner />
      </body>
    </html>
  );
}
