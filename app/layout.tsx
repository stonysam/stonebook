import type { Metadata, Viewport } from 'next';
import '@fontsource-variable/work-sans';
import '@fontsource-variable/fraunces';
import './globals.css';

export const metadata: Metadata = {
  title: 'Stonebook',
  description: 'The Black Wolf Farm family logbook',
  applicationName: 'Stonebook',
  appleWebApp: { capable: true, title: 'Stonebook', statusBarStyle: 'default' },
  icons: {
    icon: [{ url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
  },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f4efe4' },
    { media: '(prefers-color-scheme: dark)', color: '#141a15' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
