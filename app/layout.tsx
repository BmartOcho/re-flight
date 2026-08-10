import type { Metadata } from 'next';
import './globals.css';
import '@/styles/replay.css';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://re-flight.vercel.app';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: 'Re:Flight — real flights, really flown',
  description:
    'Cinematic 3-D replays of real flights, driven entirely by actual ADS-B broadcast positions over real terrain. Every point is the aircraft’s actual position.',
  openGraph: {
    title: 'Re:Flight — real flights, really flown',
    description:
      'Cinematic 3-D replays of real flights over real terrain. Every point is the aircraft’s actual broadcast position.',
    type: 'website',
  },
  twitter: { card: 'summary_large_image' },
  icons: { icon: '/icon.svg' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
