# Re:Flight

Cinematic 3-D replays of real flights, driven entirely by **actual ADS-B broadcast
positions** over **real terrain** — not idealised great-circle arcs.

Competing free tools animate a fake curve between two airport codes. The utility
maps (FlightAware, ADS-B Exchange) have real tracks but render them flat. Re:Flight
is the one that is *both* real and beautiful. The differentiator, and the thing every
design decision protects:

> **Every point is the aircraft's actual broadcast position.**

Three flights ship today:

| Flight | Aircraft | Story |
|---|---|---|
| **N2YV — Over the Summit of Denali** | DHC-3 Turbo Otter | A bushplane 660 m from the highest peak in North America, at 20,432 ft, over a real DEM of the Alaska Range. |
| **American 3229 — The Teton Approach** | Airbus A319 | JFK→Jackson Hole, threading the valley 5,408 ft below the Grand Teton to a mountain runway. |
| **Alaska 1282 — The Door-Plug Flight** | Boeing 737 MAX 9 | Nineteen minutes over Portland at night; door plug gone at 16,000 ft, emergency return, all 177 survive. |

The three started as single-file HTML prototypes (kept in `reference/prototypes/`
for provenance). This project unifies them into one config-driven renderer, upgrades
the two that faked mountains as cones to real elevation meshes, and gates everything
on a numeric verification harness.

## Architecture

Static Next.js (App Router) site — **no server runtime**. All the heavy data is baked
into static files at build time, so a visitor never hits ADS-B Exchange or fetches
hundreds of elevation tiles.

```
app/                     gallery (/) and per-flight routes (/flights/[slug])
components/FlightReplay   client wrapper: lazy-loads the flight data, mounts the engine
lib/replay/engine.ts      the whole renderer (imperative three.js), config-driven by meta.json
lib/replay/track.ts       the numeric core: stateAt, Catmull-Rom, arc-length, bank/pitch, DEM
lib/aircraft/             procedural DHC-3 / 737 MAX 9 / A319 models
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
npm run pipeline       # = ingest (extract tracks + Denali's DEM) then terrain (fetch DEMs)
npm run verify         # numeric gate
```

`npm run terrain` fetches AWS terrarium tiles (free, no key) and caches them under
`scripts/.tilecache/`. The generated `.bin`/`.json` are committed so production builds
are hermetic and offline.

## Deploy

The build is a fully static export (`out/`), deployable to any static host. `npm run
build` runs the verification gate first (`prebuild`), then exports.

- **Vercel** — import the repo; framework preset **Next.js** detects `output: 'export'`
  automatically. No env vars needed for a root deploy.
- **Netlify / Cloudflare Pages / S3 / any static host** — build command `npm run build`,
  publish directory `out`.
- **GitHub Pages** (served under a subpath) — set `NEXT_PUBLIC_BASE_PATH=/<repo>` before
  building; `next.config.mjs` and asset fetches both honour it.

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
