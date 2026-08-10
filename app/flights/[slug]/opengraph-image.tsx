import { ImageResponse } from 'next/og';
import { OgCard, OG_SIZE } from '@/lib/og-card';
import { getFlightSlugs, getFlightMeta } from '@/lib/flights';

export const dynamic = 'force-static';
export const size = OG_SIZE;
export const contentType = 'image/png';

export function generateStaticParams() {
  return getFlightSlugs().map((slug) => ({ slug }));
}

export const alt = 'Re:Flight replay';

export default async function OpengraphImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = getFlightMeta(slug);
  return new ImageResponse(
    (
      <OgCard
        theme={m.theme}
        eyebrow={`RE:FLIGHT · ${m.dataSource === 'adsb' ? 'ADS-B' : 'RADAR'} TRACK`}
        title={m.callsign}
        sub={m.title}
        stat={`${m.aircraft.model} · ${m.dateLabel} · ${m.track.count.toLocaleString()} real positions`}
      />
    ),
    size,
  );
}
