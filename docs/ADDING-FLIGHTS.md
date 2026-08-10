# Adding a new ADS-B flight

How to take a real flight from "a callsign over an airport" to a shipped, verified
replay in this repo. Follow it end-to-end for any new ADS-B flight (Innsbruck is the
worked example throughout).

> ⚠️ **This must be run where the ADS-B hosts are reachable — NOT in the Claude
> sandbox.** The sandbox's egress proxy denies (`HTTP 403`, org policy) every host
> this runbook fetches from:
> `api.adsb.lol`, `hexdb.io`, `globe.adsbexchange.com`.
> Those denials are policy, not transient — do not retry them there. Run steps 1–4
> on your own machine / a CI runner with open outbound HTTPS. Steps 5–8 (author,
> DEM, verify) run anywhere, though the DEM step needs `s3.amazonaws.com`.

The non-negotiable rule this whole pipeline exists to protect
(`docs/HANDOFF.md` §7): **every rendered point is the aircraft's actual broadcast
position. Gaps are shown as gaps. Never fabricate a path.**

---

## 0. Prerequisites

```bash
git clone <this repo> && cd re-flight
npm install
# tools used below: curl, jq, node (>=18), and the repo's own tsx scripts
```

Data flows like this:

```
adsb.lol (discover)  ->  hexdb.io (confirm type)  ->  globe.adsbexchange.com (trace)
   -> your processing script (the gotchas) -> 1 Hz TrackData
   -> reference/prototypes/<slug>.html  (<script id="flightdata">)
   -> npm run data     (scripts/ingest.ts)   -> public/flights/<slug>/track.json + meta.json
   -> npm run terrain  (scripts/terrain.ts)  -> public/flights/<slug>/terrain.bin
   -> npm run verify   (scripts/verify.ts)   -> SHIP / NO-SHIP gate
```

---

## 1. Discover a candidate flight over a location

`adsb.lol` is free, no key, and **live** — it reports what is airborne *right now*.
Use it to (a) sanity-check that the field even has coverage, and (b) learn which
airframes/operators serve it, so you can then pick a historical date to replay.

```bash
# /v2/point/{lat}/{lon}/{radius}   — radius is in NAUTICAL MILES (max 250)
# Innsbruck LOWI aerodrome ref point 47.2602, 11.3439, 20 NM:
curl -s "https://api.adsb.lol/v2/point/47.2602/11.3439/20" | jq '.ac[] | {hex, flight, t, alt_baro, gs}'
```

Each `ac[]` entry gives you `hex` (the ICAO24 address — the key for everything
downstream), `flight` (callsign), `t` (type, *don't trust this yet*), `alt_baro`,
`gs`. To catch a scenic **approach**, run it when an arrival is on final (low
`alt_baro`, descending, a few miles out). Note the `hex` of the aircraft you want.

There is no historical query here — `adsb.lol/point` is a live snapshot. Its job is
discovery and a coverage smoke-test. The historical track comes from step 3.

---

## 2. Confirm the aircraft type (don't trust the live feed's `t`)

```bash
# hexdb.io/api/v1/aircraft/{hex}
curl -s "https://hexdb.io/api/v1/aircraft/3c6591" | jq
# -> { "ICAOTypeCode":"A320", "Manufacturer":"Airbus", "Type":"A320 214",
#      "Registration":"D-AIUA", "RegisteredOwner":"Lufthansa", ... }
```

This is authoritative for **registration ↔ hex ↔ type ↔ operator**. Use these
values for the flight's `callsign` / `aircraft.registration` / `aircraft.operator`
and to pick the rendered model.

**Map the real type to one of the three available models** (`lib/aircraft/index.ts`
— `DHC3`, `B39M`, `A319`; do **not** add a new model). Note the mapping in a comment.

| Real type (examples)                     | `aircraft.icao` | Note                          |
| ---------------------------------------- | --------------- | ----------------------------- |
| A319 / A320 / A321 / A32x                 | `A319`          | closest narrowbody Airbus     |
| 737-700/-800/-900, 737 MAX               | `B39M`          | closest 737                   |
| DHC-3 Otter, other single-engine bushplane | `DHC3`        | closest GA / bush             |

Set `aircraft.wingspanM` to the **real airframe's** span (it drives true-scale and
camera distances — gotcha #24). A319/A320 with wingtip fences ≈ 34.1 m, with
sharklets ≈ 35.8 m; 737 MAX 9 ≈ 35.9 m; DHC-3 = 17.7 m.

---

## 3. Fetch the historical trace from ADS-B Exchange

```
https://globe.adsbexchange.com/globe_history/{YYYY}/{MM}/{DD}/traces/{last2ofhex}/trace_full_{hex}.json
```

- `{hex}` is the **lowercase** ICAO24 (e.g. `3c6591`).
- `{last2ofhex}` is the last two characters of that hex (e.g. `91`).
- **The `Referer` header is required** — without it you get 403.

```bash
HEX=3c6591
Y=2026 M=02 D=14
curl -s \
  -H 'Referer: https://globe.adsbexchange.com/' \
  -H 'User-Agent: re-flight/1.0' \
  "https://globe.adsbexchange.com/globe_history/${Y}/${M}/${D}/traces/${HEX: -2}/trace_full_${HEX}.json" \
  -o raw_trace.json
jq '{icao, r, t, timestamp, rows: (.trace|length)}' raw_trace.json
```

**File shape:**

```jsonc
{
  "icao": "3c6591",
  "r": "D-AIUA",         // registration
  "t": "A320",           // type
  "timestamp": 1739491200, // epoch seconds; each row's time is timestamp + dt
  "trace": [
    // [ dt_sec, lat, lon, alt_baro, gs, track, flags, vrate, aircraft?, "source", alt_geom, geom_rate, ... ]
    [   0.00, 47.61, 11.90, 20000, 280, 250, 0, -1600, null, "adsb_icao", 20325, -1550 ],
    ...
  ]
}
```

**Row indices** (the ones you need):

| idx | field       | notes                                                        |
| --- | ----------- | ------------------------------------------------------------ |
| 0   | `dt_sec`    | seconds since `timestamp`; absolute UTC = `timestamp + dt`   |
| 1   | `lat`       |                                                              |
| 2   | `lon`       |                                                              |
| 3   | `alt_baro`  | feet — **or the string `"ground"`**                          |
| 4   | `gs`        | knots, **broadcast groundspeed** (use this, gotcha #4)       |
| 5   | `track`     | deg, broadcast (quantized — do **not** use for heading, #5)  |
| 7   | `vrate`     | baro vertical rate, fpm                                       |
| 10  | `alt_geom`  | feet, **geometric/GPS altitude** (use vs terrain, gotcha #7) |

One airframe can fly several sectors in a day — `trace_full` is the whole UTC day.
Slice to the single arrival you want (step 4).

There is also `trace_recent_{hex}.json` (last few hours). Use `trace_full` for a
past day.

---

## 4. Process the raw trace into a uniform 1 Hz track — **the gotchas**

This is where correctness is won or lost. Every step below is a real bug that was
caught by numeric verification (`docs/HANDOFF.md` §2). The renders always *looked*
fine while being wrong.

Produce a `TrackData` object exactly as `lib/types.ts` defines it:

```ts
// Sample = [lat, lon, altFt, gsKt, trkDegUnwrapped, vsFpm, turnDegPerSec]
interface TrackData { t0: number; hz: 1; base?: number; s: Sample[] }
```

Processing order:

1. **Parse & timestamp.** For each row, `tAbs = timestamp + dt_sec`. Keep
   `lat, lon, alt_baro, gs, alt_geom, vrate`. Mark rows whose `alt_baro === "ground"`.
2. **Slice to the one arrival.** Trim to the contiguous descent-to-landing you want
   (drop earlier sectors / the long high cruise if it isn't the story — you can still
   keep the cruise-in and just set `startAtT` later; but never keep a *different*
   flight's rows).
3. **Drop stale positions (gotcha #3).** Walking the kept list, drop any *airborne*
   sample that moved **< 40 m in > 3 s** from the last kept sample. Undetected, this
   collapses derived quantities and makes the aircraft spin.
4. **Pick the altitude column (gotcha #7).** Prefer `alt_geom` (index 10) wherever
   terrain is rendered — it's the only altitude valid against a DEM (baro and geom
   differed ~302 ft on Denali, enough to bury the aircraft under a ridge). If
   `alt_geom` is absent, use `alt_baro` and plan a QNH correction (step 9 / config).
5. **Map `"ground"` → field elevation (gotcha #6).** Ground rows are **not** altitude
   0; set them to the field elevation (LOWI = 1907 ft) or the aircraft dives
   underground at touchdown.
6. **Detect gaps > 60 s (gotcha #2).** Where consecutive kept samples are more than
   ~60 s apart, **do not interpolate across** — end the window there, or emit an
   explicit dashed "no data" bridge. A 286 s dropout once splined a straight line
   through a mountain. For a clean approach, trim to the contiguous run ending at
   landing.
7. **Resample to a uniform 1 Hz grid (gotcha #1).** For each integer second from
   `tStart` to `tEnd`, interpolate `lat, lon, altitude` with **Catmull-Rom** (reuse
   `catmullRom` from `lib/replay/track.ts` so it matches the renderer). Never let an
   interpolation span a >60 s gap.
8. **Speed = broadcast `gs` (gotcha #4).** Interpolate the broadcast `gs` field onto
   the 1 Hz grid. Do **not** derive speed from position deltas (that produced a
   reported 77 kt for an A319 at 18,000 ft).
9. **Heading = derived from smoothed positions (gotcha #5).** Compute the bearing
   between successive 1 Hz positions, **unwrap** it (accumulate so there's no 359→0
   jump), and store `trkDegUnwrapped`. (Yes: speed broadcast, heading derived —
   opposite sources, each for its own reason.)
10. **Vertical speed & turn rate (derived).** `vsFpm` from smoothed altitude deltas
    (fpm); `turnDegPerSec` from the unwrapped heading deltas (deg/s). These feed
    derived pitch and bank — `bank = atan(ω·V/g)` with ω in **rad/s**, V in **m/s**
    (gotcha #8); the verify harness will reject it if it's wrong.
11. **Emit `TrackData`.** `t0 =` seconds-of-day Z of the first sample
    (`tStart % 86400`); `hz = 1`; `base =` unix epoch of 00:00:00Z that day
    (`Math.floor(tStart/86400)*86400`, for local-time display); `s =` the samples.

A minimal processing skeleton (adapt; import `catmullRom` from the repo so the math
matches the engine exactly):

```ts
import { catmullRom } from '../lib/replay/track';

const FIELD_FT = 1907;         // LOWI
const GAP_S = 60, STALE_M = 40, STALE_S = 3;
const raw = JSON.parse(fs.readFileSync('raw_trace.json', 'utf8'));
const t0epoch = raw.timestamp;

// 1–2: parse + slice (fill in your window)
type P = { t: number; lat: number; lon: number; alt: number; gs: number; ground: boolean };
let pts: P[] = raw.trace.map((r: any[]) => ({
  t: t0epoch + r[0], lat: r[1], lon: r[2],
  alt: r[10] ?? (r[3] === 'ground' ? FIELD_FT : r[3]),  // 4/5: prefer geometric; "ground" -> field elev
  gs: r[4] ?? 0, ground: r[3] === 'ground',
})).filter((p: P) => p.lat != null && p.lon != null);
pts = pts.filter((p) => p.t >= WINDOW_START && p.t <= WINDOW_END);

// 3: drop stale airborne samples
const kept: P[] = [];
for (const p of pts) {
  const q = kept[kept.length - 1];
  if (q && !p.ground) {
    const dm = haversineM(q.lat, q.lon, p.lat, p.lon);
    if (p.t - q.t > STALE_S && dm < STALE_M) continue;
  }
  kept.push(p);
}

// 6: refuse to bridge gaps > 60 s (trim, or split the window)
for (let i = 1; i < kept.length; i++)
  if (kept[i].t - kept[i-1].t > GAP_S) { /* end window at i, or mark a bridge */ }

// 7–10: resample to 1 Hz, gs broadcast, heading derived + unwrapped, vs/turn derived
// ... build s: [lat, lon, altFt, gsKt, trkUnwrapped, vsFpm, turnDegPerSec]

const track = { t0: Math.round(kept[0].t) % 86400, hz: 1,
                base: Math.floor(kept[0].t / 86400) * 86400, s };
```

**Wrap it for the existing ingest.** The build ingests each flight from a prototype
HTML's `<script id="flightdata">` block (`scripts/ingest.ts`), so a net-new flight
needs a tiny wrapper file:

```bash
# reference/prototypes/innsbruck-lowi-approach.html  (matches sourceHtml in the config)
printf '<!doctype html><meta charset="utf-8"><title>innsbruck source</title>\n<script id="flightdata" type="application/json">%s</script>\n' \
  "$(cat track.json)" > reference/prototypes/innsbruck-lowi-approach.html
```

(`reference/` is git-tracked but excluded from `tsconfig`, so this is safe.) That
`sourceHtml` name must match the flight's config.

---

## 5. Author / finalize the flight config

For Innsbruck the draft already exists at **`data/candidates/innsbruck.ts`**. Finish it:

- Set `callsign`, `aircraft.registration`, `aircraft.operator`, `aircraft.wingspanM`
  from steps 2–3, and `aircraft.icao` from the mapping table.
- Set `dateISO` / `dateLabel` to the real flight day (must match the `globe_history`
  URL date).
- Set `altitudeType`: `'geometric'` if you used `alt_geom`; else `'baro'` **and**
  add `altCorrectionFt = FIELD_FT - baroTouchdownAlt` (ingest adds it to every
  sample so touchdown == field elevation — gotcha #7; it's disclosed in the UI).
- **Set the absolute event/phase times.** The draft expresses them as `T0 + offset`
  with `T0 = 0`. Set `T0` to the real track's `t0` (seconds-of-day Z), then
  **re-time every beat against the actual track** — confirm the aircraft really is
  abeam each named peak / on final at that moment. The relative spacing is
  illustrative only.
- Confirm the landing runway (08 vs 26) and touchdown heading from the track; fix
  the `decorations.runways` bearing and the "RUNWAY 26" copy if needed.

Then **move the finished object into `data/authored.ts`'s `FLIGHTS` array** — the
build scripts only read `data/authored.ts` (the `data/candidates/` file is never
ingested). Keep `embeddedTerrain: false` and a `terrainBox`/`terrainN` (384).

---

## 6. Build the DEM

```bash
npm run data        # scripts/ingest.ts  -> track.json + meta.json from the prototype + config
npm run terrain     # scripts/terrain.ts -> terrain.bin, patches meta.json terrain box
# or both:  npm run pipeline
```

`terrain.ts` fetches **AWS terrarium z12 tiles** (free, no key:
`s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png`,
`elev_m = R*256 + G + B/256 - 32768`) over the flight's `terrainBox`, mosaics them,
and resamples to an `n×n` Int16 heightmap. Keep the box **tight** to the flight's
real extent (+~10 km) so posts stay fine enough to resolve the peaks (gotcha #20):
too wide and the Alpine spires smear. No vertical exaggeration (gotcha #21).

---

## 7. Verify — the ship / no-ship gate

```bash
npm run verify      # scripts/verify.ts  (also runs automatically as `prebuild`)
```

It exercises the exact renderer math and fails the build on any gate. **A flight
that fails does not ship. Fix the data, never the thresholds.**

| Check                              | Threshold                                  |
| ---------------------------------- | ------------------------------------------ |
| Trail tip vs aircraft position     | < 200 m worst case                         |
| Samples below the terrain mesh     | 0                                          |
| Max bank angle                     | < 35°, and < 5% of samples at the clamp    |
| Max pitch angle                    | < 20°                                      |
| Groundspeed plausibility for type  | e.g. A319/B39M 95–600 kt airborne          |
| Gap / teleport integrity           | max 1 s step < 700 kt-equivalent           |
| Touchdown vs field elevation       | within ~50 ft (uses `fieldElevationFt`)    |
| Reference peak in DEM vs published | within 3% (uses `meta.reference`)          |

If "samples below terrain" fires, you're almost certainly on baro instead of
geometric altitude (gotcha #7). If bank pins at the clamp, the ω/V units are wrong
(gotcha #8). If touchdown is off, check the `"ground"` mapping and any QNH
correction.

---

## 8. Preview and ship

```bash
npm run dev         # open the flight route locally and eyeball it
# then commit track.json / terrain.bin / meta.json + the authored config,
# and deploy (Vercel). Add the flight to the roster only once verify passes.
```

---

## Coverage — check before you commit

Receiver density decides everything (`docs/HANDOFF.md` §3). US / Europe / Alaska are
excellent; the Himalayas are not (Paro's approach is invisible — coverage dies 38 km
out). **Verify coverage before building a flight**, using the step-1 live query and
by confirming the `trace_full` actually contains the low-altitude approach segment,
not just the cruise.

**LOWI specifically:** the Inn valley sits in dense European coverage, so en-route
and mid-valley tracking are reliable — this is the best untested scenic candidate on
the roster. But it is a deep Alpine valley: expect the **lowest, terrain-shadowed
part of the final approach and rollout to be patchy** (line-of-sight to ground
receivers is blocked by the valley walls). Inspect the tail of the trace; if the last
turn onto final or the touchdown itself has a >60 s hole, honour gotcha #2 (show the
gap / trim) rather than splining through the valley — and let the touchdown-vs-field
verify check tell you whether the last real sample is close enough to land honestly.

---

## Hosted / automated alternative (paid APIs)

The free `globe_history` path is great for a one-off but is `Referer`-gated and rate
limited — awkward for an unattended CI job. For a hosted/automated pipeline, consider
a paid provider (mind each one's terms + attribution for a public app, and update
`trackAttribution` if you switch sources):

- **ADSB Exchange via RapidAPI** (`adsbexchange-com1.p.rapidapi.com`) — live and
  historical endpoints, `X-RapidAPI-Key` auth, stable JSON. Closest drop-in to the
  free feed above.
- **FlightRadar24 API** (`fr24api.flightradar24.com`) — official, token auth, historic
  flight positions/tracks. Good for automation; commercial terms.

Either can replace steps 1–3; steps 4–8 (processing, DEM, verify) are unchanged.
Whatever the source, the same rule holds: **only render positions the aircraft
actually broadcast.**
