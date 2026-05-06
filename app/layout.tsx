import type { Metadata } from 'next'
import { Geist, Geist_Mono, Figtree } from 'next/font/google'
import './globals.css'

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] })
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })
const figtree = Figtree({ variable: '--font-figtree', subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'GEO Visibility Analyzer',
  description: 'Measure your brand\'s visibility in AI-generated responses — and fix it.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${figtree.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-[#FAFAF8]">{children}</body>
    </html>
  )
}
