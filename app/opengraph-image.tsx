import { ImageResponse } from 'next/og';
import { OgCard, OG_SIZE } from '@/lib/og-card';

export const dynamic = 'force-static';
export const size = OG_SIZE;
export const contentType = 'image/png';
export const alt = 'Re:Flight — real flights, really flown';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <OgCard
        theme="site"
        eyebrow="RE:FLIGHT · FLIGHT REPLAY"
        title="Real flights, really flown."
        sub="Cinematic 3-D replays over real terrain, from actual ADS-B positions."
      />
    ),
    size,
  );
}
