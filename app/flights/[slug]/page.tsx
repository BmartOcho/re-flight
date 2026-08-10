import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import FlightReplay from '@/components/FlightReplay';
import { getFlightSlugs, getFlightMeta } from '@/lib/flights';

export function generateStaticParams() {
  return getFlightSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  if (!getFlightSlugs().includes(slug)) return {};
  const m = getFlightMeta(slug);
  const title = `${m.callsign} — ${m.title} · Re:Flight`;
  const description = `${m.blurb} Real ${m.dataSource === 'adsb' ? 'ADS-B' : 'radar'} track, ${m.track.count.toLocaleString()} points, over real terrain.`;
  return { title, description, openGraph: { title, description, type: 'website' } };
}

export default async function FlightPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!getFlightSlugs().includes(slug)) notFound();
  const meta = getFlightMeta(slug);
  return (
    <main className="flight-page">
      <Link href="/" className="brand-link">
        ◂ RE:FLIGHT
      </Link>
      <FlightReplay meta={meta} />
    </main>
  );
}
