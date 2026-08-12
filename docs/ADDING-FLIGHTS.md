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

**Set `aircraft.icao` to the real ICAO type designator** (from hexdb's
`ICAOTypeCode`). The parametric model library (`lib/aircraft/registry.ts`, 240+
types) renders the correct silhouette — wing position, engines, tail, dimensions —
for what actually flew. Check the type exists in the registry (`npm run
check-aircraft` lists everything; the unlinked `/hangar` page previews any type);
if it's missing, add a registry row with published span/length and the right
archetype rather than mapping to a lookalike. Leave `aircraft.livery` unset —
the bespoke liveried models (`talkeetna-otter`, `alaska-max9`, `american-a319`)
belong to the three original flights only; new flights get the neutral stylised
livery, which the UI already discloses.

Set `aircraft.wingspanM` to the **real airframe's** span (it drives true-scale and
camera distances — gotcha #24); it should match the registry row's span for the type.

**Optional satellite drape:** after `npm run terrain`, run `npm run imagery` on a
machine that can reach `tiles.maps.eox.at` — it bakes `imagery.jpg` next to
`terrain.bin` and patches meta.json. Skipped automatically for night themes; the
procedural palette covers any flight without it. Sentinel-2 cloudless is
CC BY-NC-SA 4.0 (attribution shows in the disclosure footer).

> **If it reports `fetch failed` while `curl` to the same tile URL works**, you are
> probably on a machine with a broken IPv6 path. `tiles.maps.eox.at` is dual-stack
> (the DEM host, `s3.amazonaws.com`, is IPv4-only, which is why `npm run terrain`
> is unaffected); when the AAAA record resolves but has no route, Node's
> happy-eyeballs can surface the dead IPv6 attempt as `ETIMEDOUT` rather than
> falling back, and roughly half the tiles die. Confirm with
> `curl -6 -sS -o /dev/null https://tiles.maps.eox.at/`, then re-run as
> `NODE_OPTIONS=--no-network-family-autoselection npm run imagery`. The script
> prints this hint itself on a socket-level failure. It is deliberately not worked
> around in code — pinning the address family would break IPv6-only networks.

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

   ⚠️ **But check `alt_geom`'s datum before you trust it (gotcha #7b).** Some
   equipment broadcasts height above the **WGS84 ellipsoid (HAE)**, not MSL, and the
   DEM is MSL. Madeira exposed this: `alt_geom` read ~350 ft while the aircraft sat
   on a 192 ft runway, because the island sits on a ~+50 m geoid high — all four
   LPMA arrivals sampled showed the same 158–208 ft bias. Left alone the aircraft
   floats ~50 m over the terrain and the touchdown check fails by >150 ft. Innsbruck
   showed no such bias, so **this is per-trace, not per-region — always measure it**:

   ```
   offset = (alt_geom reported while ON THE GROUND at the field) - published field elevation
   ```

   Put `-offset` in the flight's `altCorrectionFt` (ingest applies it to every
   sample and the UI discloses it), and write the ground rows in the *pre-correction*
   frame so they land exactly on field elevation.

   Also note `alt_geom` is quantised to **25 ft**. Through the flare Madeira's trace
   stepped 350 → 325 → 350, and after the offset that 25 ft dip put the aircraft
   *below the runway it was landing on* — 3 samples under the mesh. An aircraft over
   the airport cannot be below field elevation: floor the last ~1.5 km at the field
   (same class of fix as gotcha #6) and disclose it.
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

Innsbruck shipped this way — see the `innsbruck` entry in **`data/authored.ts`** for a
finished example of every field below. (It started as a draft under `data/candidates/`;
that directory is empty now, but the same shape works for staging a new flight whose
track you can't fetch yet.) What to fill in:

- Set `callsign`, `aircraft.registration`, `aircraft.operator`, `aircraft.wingspanM`
  from steps 2–3, and `aircraft.icao` from the mapping table.
- Set `dateISO` / `dateLabel` to the real flight day (must match the `globe_history`
  URL date).
- Set `altitudeType`: `'geometric'` if you used `alt_geom`; else `'baro'` **and**
  add `altCorrectionFt = FIELD_FT - baroTouchdownAlt` (ingest adds it to every
  sample so touchdown == field elevation — gotcha #7; it's disclosed in the UI).
- **Set the absolute event/phase times.** A draft usually expresses them as
  `T0 + offset` with `T0 = 0`. Set `T0` to the real track's `t0` (seconds-of-day Z),
  then **re-time every beat against the actual track** — confirm the aircraft really
  is abeam each named peak / on final at that moment. The relative spacing is
  illustrative only. (Innsbruck's drafted 10-minute timeline became a 5m48s one; the
  beats were re-derived from closest-approach times, not rescaled.)
- Confirm the landing runway and touchdown heading from the track; fix the
  `decorations.runways` bearing and any runway copy to match.
- **Verify every peak coordinate against the built DEM before shipping.** Drafted
  coordinates are guesses. Innsbruck's were approximate and three were badly wrong —
  Grosser Bettelwurf sat ~6 km off and read 19% low. Pull them from OSM
  `natural=peak` nodes (name + `ele`) and re-probe the DEM; verify's 3% gate only
  checks the single `reference` peak, so the rest are on you. Pick a `reference`
  whose DEM match is tight *and* that the aircraft actually passes.
- **Sanity-check decorations against the real world too.** Innsbruck's drafted river
  polyline ran 26 m from the aerodrome reference point — it drew the Inn straight
  down the runway. On a day scene the satellite drape already shows real water;
  drop a decoration rather than re-guess it.

Then **move the finished object into `data/authored.ts`'s `FLIGHTS` array** — the
build scripts only read `data/authored.ts`. Keep `embeddedTerrain: false` and a
`terrainBox`/`terrainN` (384). If the type is new to the roster, add a groundspeed
band for it in `scripts/verify.ts` (`GS_BAND`) — the unknown-type fallback is a very
loose 0–700 kt.

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

**LOWI — CONFIRMED, this is what it actually looked like.** The prediction here was
right, so it is now recorded as fact for the next deep-valley field. On AUA676
(OE-LBP, 14 Feb 2026) the Inn valley tracked beautifully down to short final —
~6 s sampling, no gap over 20 s from 27 km out — and then:

- The **last airborne sample is 218 ft above the field, ~1 km out.** The next sample
  is 34 s later, already on the ground at 31 kt. **The touchdown itself is not
  captured** — the valley walls shadow the field exactly as expected.
- 34 s is inside the 60 s no-bridge rule, so it is legal to resample across. Check
  the physics before you do: the implied mean was ~80 kt across the gap, consistent
  with a rollout decelerating 135 → 31 kt. If the arithmetic had implied something
  impossible, that would be the signal to trim instead.
- **Stop at the first on-ground sample.** The next burst (another 34 s later) is the
  aircraft turning off the runway, and the uneven spacing makes Catmull-Rom whip the
  path through a **35 °/s hook** — an artifact, not a manoeuvre. It is visible in
  `max |turn|` before it ever reaches verify's bank gate, so check that number on
  the processed track.
- Watch for Catmull-Rom **overshoot at the descent→flare corner**: clamp interpolated
  altitude to the bracket of its two real samples, or the spline dips below the
  runway and trips "samples below terrain".
- Touchdown-vs-field landed at **Δ3 ft** on a 50 ft gate, which is how you know the
  last real sample was close enough to land honestly.

The general rule stands: inspect the tail of the trace, and never spline through a
>60 s hole in a valley.

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
