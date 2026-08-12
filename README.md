# Re:Flight

Cinematic 3-D replays of real flights, driven entirely by **actual ADS-B broadcast
positions** over **real terrain** — not idealised great-circle arcs.

Competing free tools animate a fake curve between two airport codes. The utility
maps (FlightAware, ADS-B Exchange) have real tracks but render them flat. Re:Flight
is the one that is *both* real and beautiful. The differentiator, and the thing every
design decision protects:

> **Every point is the aircraft's actual broadcast position.**

Four flights ship today:

| Flight | Aircraft | Story |
|---|---|---|
| **N2YV — Over the Summit of Denali** | DHC-3 Turbo Otter | A bushplane 660 m from the highest peak in North America, at 20,432 ft, over a real DEM of the Alaska Range. |
| **American 3229 — The Teton Approach** | Airbus A319 | JFK→Jackson Hole, threading the valley 5,408 ft below the Grand Teton to a mountain runway. |
| **Alaska 1282 — The Door-Plug Flight** | Boeing 737 MAX 9 | Nineteen minutes over Portland at night; door plug gone at 16,000 ft, emergency return, all 177 survive. |
| **Austrian 676 — The Inn Valley Approach** | Airbus A320 | Warsaw→Innsbruck, down the Inn valley under the Karwendel wall to a 1,907 ft runway ringed by Alps. |

The three started as single-file HTML prototypes (kept in `reference/prototypes/`
for provenance). This project unifies them into one config-driven renderer, upgrades
the two that faked mountains as cones to real elevation meshes, and gates everything
on a numeric verification harness.

## Architecture

Next.js (App Router) on Vercel. The curated gallery + flight pages are statically
prerendered (SSG) with all their data baked in at build time, so a visitor never hits
ADS-B Exchange or fetches hundreds of elevation tiles. **"Fly your own log"** adds one
small serverless function (`/api/terrain`) — the only runtime piece — because browsers
can't fetch the elevation tiles directly (the bucket sends no CORS headers). Remove
`app/replay` + `app/api/terrain` and re-add `output: 'export'` to `next.config.mjs` to
go back to a pure static site.

```
app/                     gallery (/) and per-flight routes (/flights/[slug])
app/replay/              "fly your own log" — drop a GPX/KML/CSV and watch it
app/api/terrain/         serverless DEM endpoint (builds terrain on demand for uploads)
components/FlightReplay   client wrapper: lazy-loads the flight data, mounts the engine
components/UploadReplay   the upload flow: parse → process → verify → fetch terrain → fly
lib/replay/engine.ts      the whole renderer (imperative three.js), config-driven by meta.json
lib/replay/track.ts       the numeric core: stateAt, Catmull-Rom, arc-length, bank/pitch, DEM
lib/pipeline/             uploads: parse (gpx/kml/csv) → process (gotchas 1-7) → verify → meta
lib/terrain/build.ts      server-side DEM builder (bbox → Int16 heightmap) for the terrain API
lib/aircraft/             parametric model library: ICAO type registry (240+ types with real
                          dimensions) + config-driven builder, plus 3 bespoke liveried models
data/authored.ts          the human-written half of each flight (events, peaks, decorations)
scripts/ingest.ts         prototypes → public/flights/<slug>/{track.json, meta.json, terrain.bin}
scripts/terrain.ts        terrarium z12 tiles → Int16 DEM for the non-embedded flights
scripts/verify.ts         THE VERIFICATION HARNESS (runs as prebuild — a flight that fails does not ship)
public/flights/<slug>/    track.json (1 Hz track) · terrain.bin (Int16 DEM) · meta.json (scene config)
```

Each flight is ~250–400 KB (track + DEM), lazy-loaded per route. three.js is code-split
into its own chunk, so the gallery's initial JS stays ~100 KB.

## The verification harness

**Every bug in this project was caught by a numeric check, never by looking at the
screen** — the renders always looked plausible while a trail was 12 km out of sync or
an aircraft was pinned at maximum bank. `scripts/verify.ts` runs the exact math the
renderer uses (and three.js's own `CatmullRomCurve3` for the trail) and fails the build
on any violation:

| Check | Threshold |
|---|---|
| Trail tip vs aircraft position | < 200 m worst case |
| Samples below the terrain mesh | 0 |
| Max bank angle | < 35°, and < 5% of samples at the clamp |
| Max pitch angle | < 20° |
| Groundspeed plausibility (per type) | e.g. airliner 95–600 kt airborne |
| Gap / teleport integrity | < 700 kt equivalent per second |
| Touchdown vs field elevation | within ~50 ft |
| Peak elevation in DEM vs published | within 3% (grid DEMs undersample sharp spires; readouts use published values) |

Run it any time with `npm run verify`.

## Develop

```bash
npm install
npm run dev            # http://localhost:3000
```

Regenerate the flight data from the reference prototypes (writes `public/flights/`):

```bash
npm run pipeline       # = ingest (extract tracks + Denali's DEM), terrain (fetch DEMs), imagery
npm run verify         # numeric gate
npm run check-aircraft # numeric gate for the aircraft model library
```

`npm run terrain` fetches AWS terrarium tiles (free, no key) and caches them under
`scripts/.tilecache/`. The generated `.bin`/`.json` are committed so production builds
are hermetic and offline.

## The aircraft is what actually flew

Every flight renders the real airframe type. The tail-number lookup already resolves a
registration to its **ICAO type designator** (adsbdb/hexdb); `lib/aircraft/registry.ts`
maps 240+ designators — GA singles, turboprops, bizjets, regional and widebody airliners,
helicopters — to published dimensions and configuration (wing position/sweep, engine
count/type/placement, tail kind, winglets, gear), and `lib/aircraft/parametric.ts` builds a
correctly-proportioned low-poly model from that spec. A C172 renders as a strutted
high-wing single, a King Air as a T-tail turboprop twin, an MD-11 with its fin-root #2
engine. Unknown designators fall back family → class, and the UI **discloses** when the
model is a closest-match guess. Liveries stay deliberately neutral/stylised (also
disclosed); the three original flights keep their hand-built liveried models. Uploads take
any registry type. `scripts/check-aircraft.ts` numerically gates the library (bounding box
vs published span/length for every type), and the unlinked `/hangar` page spins any type
for eyeballing.

## Terrain look: two tiers

The DEM mesh's **procedural palette** is land-cover aware: a latitude-based treeline
(tropics ~3.9 km → Alaska ~0.7 km) places forest below and rock/scree above, with snow
~700 m higher; perfectly-flat DEM cells render as water (lakes, rivers, sea — real flatness
is the detector, nothing is drawn that isn't in the elevation data); per-vertex noise breaks
up banding and high-relief valleys get subtle ambient shading. The sky is a three-stop
gradient with horizon haze and a sun disc matching the scene light; night scenes get a
deterministic star field.

On top of that, an optional **satellite imagery drape** (Sentinel-2 cloudless via EOX,
`lib/terrain/imagery.ts`) can texture the mesh with the real landscape: `npm run imagery`
bakes `imagery.jpg` per curated flight (committed, like the DEMs), and the `/api/terrain` +
`/api/flight` endpoints build it on demand for uploads and lookups. It is best-effort by
design — where the tile host is unreachable the procedural palette renders instead, and
night scenes always stay procedural (daylight imagery under a night sky reads wrong).
**Licensing note:** Sentinel-2 cloudless is **CC BY-NC-SA 4.0** (attribution is shown in
the disclosure footer; non-commercial). Swap the provider in `lib/terrain/imagery.ts` for
commercial use.

## Fly your own log

`/replay` lets a pilot drop a track log (**.gpx / .kml / .csv** from ForeFlight,
Garmin, CloudAhoy, any GPS logger) and watch their own flight in 3-D. The log is
parsed and processed **entirely in the browser** — resampled to 1 Hz, de-glitched,
attitude and groundspeed derived, then run through the client-side verification
checks before it renders. The only thing that leaves the browser is the flight's
bounding box, sent to `/api/terrain` to build a DEM on demand. Everything is
disclosed: uploads render as a `gps` track ("your actual recorded position"), with
derived attitude and the on-demand terrain source called out.

## Search by tail number

`/find` takes an aircraft **registration** + **date** and pulls that day's real
track from the ADS-B archive, verifies it, and flies it over terrain built on
demand — the same renderer, from `dataSource: 'adsb'`. The lookup runs in
`/api/terrain`'s sibling function `/api/flight` (server-side, because the data hosts
aren't reachable from a browser), and is **provider-swappable**: the default pulls
ADS-B Exchange's free `globe_history` archive (best-effort — it may rate-limit or
refuse server requests, and coverage starts ~2016), and a paid feed can be dropped
in behind `ADSB_PROVIDER` / an API key without touching the ingest or renderer.
Responses cache hard (a given tail+date is deterministic), which also keeps the app
light on the free archive. Every lookup is disclosed as an ADS-B track with derived
attitude and a stylised model.

## Adding curated flights

The curated tier needs real ADS-B data, which must be fetched where ADS-B Exchange is
reachable (not every sandbox allows it). See **`docs/ADDING-FLIGHTS.md`** for the full
runbook (discover → confirm type → fetch trace → process per gotchas 1-7 → build
terrain → verify) — Innsbruck is the worked example, start to finish. The shortlist of
next candidates lives in `docs/HANDOFF.md` §"Strong candidates".

## Deploy

`npm run build` runs the verification gate first (`prebuild`), then builds. Because of
the terrain function, this deploys as a **Vercel-hosted Next.js app** (the curated
pages still prerender as static HTML; only `/api/terrain` runs at request time).

- **Vercel** — import the repo; framework preset **Next.js** is auto-detected. No env
  vars needed for a root deploy.
- **Pure static host** (Netlify/S3/GitHub Pages) — remove `app/replay` + `app/api/terrain`
  and re-add `output: 'export'` to `next.config.mjs`; then the build emits a static `out/`.
  `NEXT_PUBLIC_BASE_PATH=/<repo>` supports subpath hosts.

## Provenance & attribution

- **Tracks:** ADS-B Exchange globe history (the real broadcast positions).
- **Terrain:** AWS Terrarium / Mapzen elevation tiles.
- Every replay **discloses** its altitude type, that attitude (pitch/roll) is *derived*
  from turn & climb rates rather than broadcast, the aircraft scale multiplier, and the
  terrain source. Alaska 1282's barometric altitude is QNH-corrected to field elevation
  and says so.

### The ADS-B tier and the radar tier

The data model carries a `dataSource` of `adsb` or `radar`. Everything shipped today is
`adsb`. This leaves a clean path to an **archival tier** for pre-ADS-B history (Sully,
the Gimli Glider, UA232) using NTSB Flight Path Study radar data — labelled honestly as
radar-derived and given a distinct treatment. **The two tiers are never silently mixed:**
an app whose entire pitch is "every point is real" cannot pass off a fabricated or
radar-derived track as ADS-B. See `docs/HANDOFF.md` §5.

## License

MIT — see `LICENSE`.
