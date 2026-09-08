import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import './globals.css'

/**
 * Sora, self-hosted. The comp uses six weights of it (100/200/300/400/600/700)
 * and the family ships as a single variable file, so one request covers the lot
 * and the study can run with no network.
 */
const sora = localFont({
  src: [
    { path: '../../public/fonts/Sora-latin.woff2', weight: '100 800', style: 'normal' },
    { path: '../../public/fonts/Sora-latin-ext.woff2', weight: '100 800', style: 'normal' },
  ],
  variable: '--font-sora',
  display: 'swap',
  preload: true,
})

export const metadata: Metadata = {
  title: 'Construct your digital twin',
  description:
    'A mediated research instrument on the transfer of self-attributes to a digital self.',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#F1EFF0',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={sora.variable}>
      <body>{children}</body>
    </html>
  )
}
