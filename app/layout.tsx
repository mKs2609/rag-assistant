import type { Metadata } from 'next'
import localFont from 'next/font/local'
import './globals.css'

// these were loaded with next/font/google, which downloads the files during the build. a
// failed download does not degrade to a fallback font, it fails the whole build, and the
// error names an internal turbopack module rather than the network, so it reads as a
// missing package. it took down two scheduled end-to-end runs before anyone recognised it.
// the files now sit in the repo, 109 KB of latin subsets, and the build touches no network.
//
// Fraunces and IBM Plex Sans are variable fonts, so one file covers their whole weight
// range. IBM Plex Mono ships a file per weight. All are SIL Open Font License 1.1.

const fraunces = localFont({
  src: './fonts/fraunces-variable.woff2',
  variable: '--font-display',
  weight: '300 600',
  display: 'swap',
})

const plexSans = localFont({
  src: './fonts/ibm-plex-sans-variable.woff2',
  variable: '--font-body',
  weight: '400 600',
  display: 'swap',
})

const plexMono = localFont({
  src: [
    { path: './fonts/ibm-plex-mono-400.woff2', weight: '400', style: 'normal' },
    { path: './fonts/ibm-plex-mono-500.woff2', weight: '500', style: 'normal' },
  ],
  variable: '--font-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'RAG Assistant',
  description: 'Chat with your documents, grounded in real citations.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${fraunces.variable} ${plexSans.variable} ${plexMono.variable}`}>
      <body>{children}</body>
    </html>
  )
}