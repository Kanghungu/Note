import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Note Atelier',
  description: 'A focused workspace for connected notes and project writing.',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  )
}
