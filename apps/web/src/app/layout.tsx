import type { Metadata, Viewport } from 'next';
import { Bricolage_Grotesque, Instrument_Sans, JetBrains_Mono } from 'next/font/google';
import type { ReactNode } from 'react';

import { themeInitScript } from '@/components/theme-toggle';

import './globals.css';

const bricolage = Bricolage_Grotesque({
  subsets: ['latin'],
  variable: '--font-bricolage',
  display: 'swap',
});

const instrument = Instrument_Sans({
  subsets: ['latin'],
  variable: '--font-instrument',
  display: 'swap',
});

const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'Agri Robot Store',
    template: '%s · Agri Robot Store',
  },
  description: 'Control and analyse your field robot.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Matches the light and dark grounds so the browser chrome does not fight the page.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#e4eadf' },
    { media: '(prefers-color-scheme: dark)', color: '#121a14' },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${bricolage.variable} ${instrument.variable} ${jetbrains.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Before first paint, so a stored dark choice never flashes light first. */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
