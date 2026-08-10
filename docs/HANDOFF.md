# Flight Replay — Handoff Spec for Claude Code

**Paste this whole file to Claude Code as the opening prompt.**

---

## 0. What you're building

A publicly shareable **Vercel-deployed web app** that renders cinematic 3-D replays of real
flights, driven entirely by **actual ADS-B broadcast positions** — not idealized great-circle
arcs. Each flight is a self-contained "story": real track, real terrain, timed event callouts,
scrub timeline, chase/orbit cameras.

The differentiator, and the thing every design decision must protect:

> **Every point is the aircraft's actual broadcast position.**

Competing free tools (MapAnim, FlightMapper) animate a fake arc between two airport codes.
FlightAware/ADS-B Exchange have real tracks but render them as flat 2-D utility maps. This app
is the only thing that is *both* real and beautiful. If accuracy is ever traded for looks, the
whole premise dies — the aviation audience will catch it immediately.

### Working prototypes (attached / in repo)

Three single-file HTML prototypes already exist and work. Treat them as **reference
implementations**, not as the architecture:

| File | Flight | Shows |
|---|---|---|
| `AS1282-door-plug-flight-replay.html` | Alaska 1282, door plug, Jan 5 2024 | Night scene, emergency return, event beats |
| `AAL3229-jackson-hole-teton-approach.html` | JFK→Jackson Hole, Aug 9 2026 | Daylight, terrain-relative HUD |
| `N2YV-denali-summit-flight.html` | Denali summit tour, Aug 7 2026 | Real DEM mesh, true-scale toggle, best of the three |

**`N2YV-denali-summit-flight.html` is the most correct.** When the three disagree, follow it.

---

## 1. Architecture

Keep the renderer client-side; move data prep to build time.

```
/app
  /flights/[slug]/page.tsx     # one replay per route
  /page.tsx                    # gallery of flights
/components
  FlightReplay.tsx             # three.js canvas (the whole renderer)
  HUD.tsx  Timeline.tsx  EventToast.tsx  Controls.tsx
/lib
  track.ts        # stateAt(), Catmull-Rom, arc-length mapping
  terrain.ts      # DEM decode + mesh build
  aircraft/       # procedural models, one per ICAO type
/public/flights/<slug>/
  track.json      # smoothed 1 Hz track
  terrain.bin     # Int16 DEM heightmap
  meta.json       # title, events, peaks, aircraft type, camera defaults
/scripts
  ingest.ts       # ADSBx trace -> track.json  (RUNS AT BUILD TIME, NOT IN BROWSER)
  terrain.ts      # terrarium tiles -> terrain.bin
  verify.ts       # THE VERIFICATION HARNESS — see §4
```

**Stack:** Next.js (App Router) + TypeScript + three.js + Tailwind, deployed on Vercel.
Static export is fine — no server runtime needed. Assets are static files.

**Do not fetch ADS-B or elevation tiles from the browser at runtime.** ADS-B Exchange requires
a `Referer` header and would be hammered by every visitor; elevation tiles would be hundreds of
requests per page load. Everything is baked into `/public/flights/<slug>/` by build scripts.

**Upgrade the renderer from three.js r128 to current.** The prototypes are pinned to r128 only
because of the CDN available in the prototyping sandbox. On npm, use latest three. Note r128 has
no `CapsuleGeometry` — that constraint disappears once you upgrade.

**Budget:** each flight is ~350 KB (track + DEM). Lazy-load per route; don't bundle all flights.

---

## 2. THE GOTCHAS (this is the valuable part)

Every one of these was a real bug found by numeric verification. Re-introducing any of them
produces output that *looks* plausible and is wrong.

### 2.1 Track data

1. **Resample to uniform 1 Hz.** Raw ADS-B gaps swing from 1 s to 20 s. Linear interpolation
   across uneven spacing creates a velocity discontinuity at every sample — visible as constant
   jerkiness. Resample with Catmull-Rom to a uniform grid, then interpolate cubically at render
   time.
2. **Never interpolate across a large gap.** A 286-second dropout made the spline cut straight
   through a mountain ridge. Detect gaps > ~60 s and either end the window there or mark the
   segment as a dashed "no data" bridge. Never silently fabricate the path.
3. **Filter stale positions.** Aircraft sometimes rebroadcast an identical position for many
   seconds. Drop any airborne sample that moved < 40 m in > 3 s. Undetected, this collapses
   derived speed to near-zero and makes the aircraft spin.
4. **Use BROADCAST groundspeed, not derived.** The `gs` field is directly measured and survives
   stale positions. Deriving speed from position deltas produced a reported 77 kt for an A319 at
   18,000 ft.
5. **Derive heading from smoothed positions, not the broadcast track field** — broadcast heading
   is quantized to whole degrees and steps visibly. (Speed: broadcast. Heading: derived. Yes,
   opposite sources — each for its own reason.)
6. **`'ground'` samples are not altitude 0.** Map them to field elevation, or the aircraft dives
   underground at touchdown.
7. **Baro vs geometric altitude.** ADS-B carries both. Barometric (`alt_baro`) is what ATC uses;
   **geometric** (`alt_geom`, index 10 in ADSBx trace rows) is GPS-derived and is the *only* one
   valid against terrain. They differed by ~302 ft on the Denali flight — enough to put the
   aircraft below a ridge. Use geometric wherever terrain is rendered. If only baro is available,
   apply a QNH correction so touchdown equals field elevation, and disclose it.

### 2.2 Attitude (pitch/roll are NOT broadcast — they're derived)

8. **Bank = `atan(ω·V / g)`**, with ω in **radians/sec** and V in **m/s**. The original
   `bank = turn * 9` conflated degrees-per-second with radians and pinned the aircraft at
   maximum bank for the entire flight. Sanity ceiling: an airliner should peak around 25–30°,
   a tight GA orbit around 30–35°. If most samples sit at the clamp, the formula is wrong.
9. **Pitch** = flight-path angle from V/S and groundspeed, plus a small AoA offset (~2°).
10. **Euler order `YXZ`** (yaw → pitch → roll) so bank and pitch apply in the aircraft's frame.
11. Always **disclose in the UI** that attitude is derived, not broadcast.

### 2.3 The trail ribbon (subtle and high-value)

12. **`TubeGeometry` rings are spaced by ARC LENGTH, not by curve parameter or time.** It builds
    rings via `getPointAt()`. Advancing `setDrawRange` linearly in time therefore desynchronizes
    the trail from the aircraft wherever speed varies — the gap reached **12 km** on AS1282.
13. Fix: build a cumulative arc-length table **from the curve itself**:
    `curve.arcLengthDivisions = 4000; curve.updateArcLengths(); const LEN = curve.getLengths(4000)`
    then map time → arc fraction through `LEN`. Summing straight-line distances between points is
    *not* equivalent — Catmull-Rom bows outward between control points (that error alone was
    745 m in tight turns).
14. **Build the curve from every sample**, not every 2nd, or the spline cuts corners the
    arc-length table doesn't know about.
15. Vertex colors along the tube must be indexed through the same arc-length mapping, or event
    coloring lands on the wrong stretch of track.
16. **Trail radius must scale with aircraft scale.** The default 0.62 scene units was 37 m — the
    tube was *thicker than the 17.7 m aircraft*. Rebuild the tube geometry on scale change.

### 2.4 Terrain

17. **Never approximate peaks as cones.** A cone with a realistic base radius puts its surface
    thousands of feet above the true valley floor; the aircraft visibly flies *into* the
    mountain. This is the single worst-looking bug in the whole project.
18. **Use a real DEM mesh.** AWS terrarium tiles are free, no key, no auth:
    `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png`
    Decode: `elevation_m = (R * 256 + G + B / 256) - 32768`
19. **Zoom level:** real detail runs out around **z13** (~8.7 m at 63°N); z14 is interpolated.
    z12 (~17 m) is a good size/quality balance.
20. **The render grid is usually the real bottleneck, not the source.** A 176×176 mesh over a
    73 km box is 420 m posts — it discards ~90% of a 35 m source. Target **≥ 288×288** over a
    box tightened to the flight's actual extent plus ~10 km margin.
21. **No vertical exaggeration once terrain is real.** Prototypes used ×3 with fake cones; with a
    true DEM, ×1.0 looks better and is honest. (Set scene datum to field elevation for airport
    flights so altitudes read against local ground.)
22. Color terrain by **elevation AND slope** — flat high ground reads as glacier/snowfield, steep
    high ground as rock. Elevation alone looks like a cake.

### 2.5 Scale and camera

23. **Real aircraft are tiny against terrain.** A DHC-3's 17.7 m wingspan is 0.39 scene units
    against a Denali 137 units tall — 350× smaller. Provide a scale toggle (**×25 / ×8 / TRUE**)
    and *state the multiplier on screen*. The true-scale view is a genuinely powerful moment;
    don't hide it.
24. **Camera distances must derive from wingspan**, not fixed constants: chase ≈ 6 wingspans,
    orbit ≈ 18 wingspans. Fixed values leave the aircraft an invisible dot at true scale.
25. **Zoom must be multiplicative** (`r *= 1 + Δ·k`) with a floor near 1 unit. Additive zoom with
    a 60-unit floor makes a 0.39-unit aircraft unreachable.
26. **Enable `logarithmicDepthBuffer`** — the scene spans 0.4 to 6000 units.
27. **A white aircraft vanishes against snow.** Add a dark `EdgesGeometry` outline (line strokes
    stay ~1 px at any distance, so it reads as a silhouette even when tiny) plus a
    constant-screen-size locator ring with `depthTest: false`.

### 2.6 UI

28. **Peak labels must collision-cull.** Un-culled labels pile into an unreadable stack. Sort by
    elevation, place greedily, hide losers, fade distant ones.
29. Interleave prose/event callouts with the visual; don't stack them.
30. Respect `prefers-reduced-motion` (no autoplay, no ambient orbit).

---

## 3. Data pipeline (build-time scripts)

### Finding aircraft
- **`adsb.lol/v2/point/{lat}/{lon}/{radius}`** — free, no key, live. This is how you *discover*
  which aircraft are operating somewhere.
- **`hexdb.io/api/v1/aircraft/{hex}`** — registration ↔ hex, type, operator. Always verify the
  aircraft type this way; don't trust a live feed's type field alone.
- **OpenSky API is now gated** (403/503 without auth). Don't design around it.

### Fetching tracks
```
https://globe.adsbexchange.com/globe_history/{YYYY}/{MM}/{DD}/traces/{last2ofhex}/trace_full_{hex}.json
```
Requires a `Referer: https://globe.adsbexchange.com/` header. Row format:
`[dt_sec, lat, lon, alt_baro, gs, track, flags, vrate, ?, source, alt_geom, ...]`
`alt_baro` may be the string `'ground'`.

**Coverage warning:** receiver density decides everything. US / Europe / Alaska are excellent.
The Himalayas are not — Paro's famous valley approach is invisible; coverage dies 38 km out at
20,550 ft. Verify coverage *before* committing to a flight.

### Terrain
Tighten the bbox to the flight extent + ~10 km, fetch z12 tiles, mosaic, resample to a 288×288
(or denser) grid, emit Int16 little-endian.

---

## 4. Verification harness — build this FIRST

**Every single bug in this project was caught by a numeric check, not by looking at the screen.**
The renders always *looked* fine. Make `scripts/verify.ts` a required build step that fails loudly:

| Check | Threshold |
|---|---|
| Trail tip vs aircraft position, sampled across the flight | **< 200 m** worst case |
| Samples below rendered terrain mesh | **0** |
| Max bank angle | **< 35°**, and < 5% of samples at the clamp |
| Max pitch | **< 20°** |
| Groundspeed plausibility for the type | e.g. airliner 100–600 kt airborne |
| Largest interpolated gap | **< 60 s** |
| Touchdown altitude vs field elevation | within ~50 ft |
| Peak/summit elevation in DEM vs published | within ~1% |

Print a table per flight. A flight that fails does not ship.

---

## 5. Flight roster

### Built and verified
1. **Alaska 1282** — door plug, PDX, Jan 5 2024. Night, emergency return, 16,325 ft.
2. **American 3229** — JFK→Jackson Hole, Aug 9 2026. Tetons, 5,408 ft below Grand Teton.
3. **N2YV Denali** — Talkeetna Air Taxi DHC-3, Aug 7 2026. 660 m from the summit at 20,432 ft.

### Verified data exists, not yet built
4. **NOAA N42RF "Kermit"** — Hurricane Hunter, Gulf of Mexico storm mission, Aug 5 2026.
   2,286 points, 14 major reversals, pattern flying at 10,000 ft. Ocean scene; the *pattern* is
   the story. Do not fabricate the storm — if you render one, derive its center from the
   aircraft's own repeated center fixes, or use NHC best-track and cite it.

### Strong candidates — VERIFY COVERAGE BEFORE BUILDING
- **Innsbruck (LOWI)** — curved RNP through the Inn valley, dense European coverage. Best
  untested scenic candidate.
- **Queenstown (NZQN)** — Remarkables approach.
- **Aspen (KASE)** — 6.6° LOC/DME-E, steepest airline approach in the US.
- **Madeira (LPMA)** — legendary crosswind approach on a stilted runway.
- **Barra (EGPR), Scotland** — the only scheduled airline service landing **on a beach**, tide
  dependent. Charming, unique, Twin Otter.
- **Courchevel (LFLJ)** — 18.6% gradient altiport.
- **UA328** — Denver 777 engine failure, Feb 20 2021, tight return loop.
- **SPAR19** — Pelosi's Taiwan flight, Aug 2 2022. Most-tracked flight ever (~708k concurrent).
- **Boeing 787 "self-portrait"** — Aug 2017, a 787 outline drawn across 22 states over 18 hours.
  Spectacular from above; poor in a chase cam. Would need a dedicated top-down mode.

### ⚠️ Sully (US1549) — read before attempting
**There is no ADS-B data for this flight.** Jan 15 2009 predates meaningful ADS-B deployment;
the aircraft wasn't equipped and the receiver network didn't exist. ADS-B Exchange history only
goes back to ~2016. Any "ADS-B track" of US1549 would be fabricated, and publishing one would
destroy the app's entire credibility claim.

**The legitimate path:** the NTSB **Flight Path Study** in the AAR-10/03 docket contains
radar-derived position/altitude data. That is a real, citable source. If you use it, label it
clearly as *radar-derived from the NTSB docket*, never as ADS-B — and consider a visually
distinct treatment for archival flights. The same route opens up other pre-ADS-B history
(Gimli Glider, UA232 Sioux City, BA9 volcanic ash). This is a genuinely good second data tier,
but it must never be silently mixed with the ADS-B tier.

---

## 6. Build order

1. Repo scaffold, three.js upgrade, TypeScript port of `stateAt` + arc-length mapping.
2. **Verification harness** (§4) with the three existing flights as fixtures.
3. Terrain pipeline → `terrain.bin`; DEM mesh component.
4. Port the Denali renderer into `FlightReplay.tsx`, driven by `meta.json`.
5. Gallery page, per-flight routes, OG images for sharing.
6. Deploy to Vercel; add flights 4+ only once each passes verification.

## 7. Non-negotiables

- Never render a position the aircraft didn't broadcast. Gaps are shown as gaps.
- Always disclose: derived attitude, aircraft scale multiplier, altitude type, terrain source.
- Attribution: ADS-B Exchange for tracks; terrarium/Mapzen/AWS for terrain. If TessaDEM is ever
  used instead, note it is **ODbL (share-alike)** — a licensing consideration for a public app.
- Accessibility floor: keyboard-reachable controls, visible focus, reduced-motion respected.
