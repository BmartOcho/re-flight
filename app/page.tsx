import Link from 'next/link';
import { getAllFlightMeta, getFlightPathD } from '@/lib/flights';

export default function Gallery() {
  const flights = getAllFlightMeta();
  return (
    <main className="wrap">
      <header className="hero">
        <div className="eyebrow">Re:Flight</div>
        <h1>
          Real flights,
          <br />
          <span className="thin">really flown.</span>
        </h1>
        <p className="lede">
          Cinematic 3-D replays of real flights, driven entirely by <b>actual ADS-B broadcast positions</b> over real
          elevation data — not idealised great-circle arcs. Competing tools animate a fake curve between two airport
          codes; the utility maps have real tracks but render them flat. This is the one that is both real and
          beautiful.
        </p>
        <span className="claim">EVERY POINT IS THE AIRCRAFT’S ACTUAL BROADCAST POSITION</span>
      </header>

      <div className="section-label">The flights</div>
      <div className="grid">
        {flights.map((f) => {
          const d = getFlightPathD(f.slug);
          return (
            <Link key={f.slug} href={`/flights/${f.slug}/`} className="card" data-theme={f.theme}>
              <div className="sky" />
              <svg className="path" viewBox="0 0 320 210" preserveAspectRatio="xMidYMid meet" aria-hidden>
                <path d={d} fill="none" stroke="rgba(255,255,255,.28)" strokeWidth="4" strokeLinejoin="round" />
                <path d={d} fill="none" stroke="#ffb15a" strokeWidth="1.6" strokeLinejoin="round" />
              </svg>
              <div className="body">
                <div className="cs">{f.callsign}</div>
                <h3>{f.title}</h3>
                <p>{f.blurb}</p>
                <div className="meta">
                  <span className="chip">{f.aircraft.model}</span>
                  <span className="chip">{f.dateLabel}</span>
                  <span className="chip">{f.track.count.toLocaleString()} pts</span>
                  <span className="chip real">{f.dataSource === 'adsb' ? 'ADS-B' : 'RADAR'}</span>
                </div>
              </div>
            </Link>
          );
        })}
        <Link href="/replay/" className="card upload" aria-label="Fly your own log">
          <div className="sky" />
          <div className="glyph">✈︎</div>
          <div className="body">
            <div className="cs">BRING YOUR OWN FLIGHT</div>
            <h3>Fly your own log</h3>
            <p>Drop a GPX, KML, or CSV track from ForeFlight, Garmin, or any GPS logger and watch your own flight over real terrain — processed and verified in your browser.</p>
            <div className="meta">
              <span className="chip">.gpx</span>
              <span className="chip">.kml</span>
              <span className="chip">.csv</span>
              <span className="chip real">GPS</span>
            </div>
          </div>
        </Link>
      </div>

      <footer className="site-foot">
        Tracks: ADS-B Exchange globe history. Terrain: AWS Terrarium / Mapzen elevation tiles. Altitude, attitude and
        aircraft scale are disclosed on every replay — attitude is derived from turn &amp; climb rates, never broadcast.
        Built from three reference prototypes; every flight passes a numeric verification harness before it ships.
      </footer>
    </main>
  );
}
