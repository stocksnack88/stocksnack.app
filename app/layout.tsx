import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import CookieBanner from "@/components/ui/CookieBanner";
import PostHogProvider from "@/components/PostHogProvider";

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
  title: 'StockSnack — Which S&P 500 stock should you buy?',
  description: 'StockSnack scores all 500 S&P 500 stocks using 30 financial metrics and gives you a clear BUY, HOLD or SELL verdict. Start your free trial — no credit card needed.',
  openGraph: {
    title: "What's the best stock in S&P 500?",
    description: 'Sign up to get the answer! StockSnack ranks all 500 S&P 500 stocks with BUY/HOLD/SELL verdicts backed by 30 financial metrics.',
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
  return (
    <html lang="en" style={{ backgroundColor: '#000000' }}>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        style={{ backgroundColor: '#000000' }}
      >
        <PostHogProvider>{children}</PostHogProvider>
        <CookieBanner />
      </body>
    </html>
  );
}
