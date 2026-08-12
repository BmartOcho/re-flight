# HANDOFF — re-flight

**Updated:** 2026-08-12 15:35 CDT · **Branch:** `main` · **HEAD:** `4be0f0d`
**State:** tree clean & pushed · PRs #7 and #8 merged · memory updated · `npm run verify` green (6/6)

## Next steps
1. **Test `/find` on the deployed Vercel URL — not localhost.** That single test gates the
   r/aviation decision. Use a tail+date already known good: `OE-LBP` / `2026-02-14`
   (Innsbruck) or `CS-TVA` / `2026-08-09` (Madeira). Watch for two failure modes: the
   ADS-B archive refusing a datacenter IP, and terrain being skipped entirely (any track
   spanning ≥ 3° gets none — WAW→INN is 9.78°).
2. Test `/replay` with one real GPX/KML/CSV log. If both features fail on prod, cut them
   from any public post and ship the six curated flights alone.
3. If posting: lead with the six verified flights + the verification harness. Label
   upload/search explicitly experimental.

## Open loops
- [ ] **Aspen (KASE) unbuilt** — the last of the four shortlist candidates. 18 CRJ-700
      airframes × 6 dates found zero landings; that is a *sampling* failure, NOT a
      coverage verdict, and is deliberately not recorded as a no-ship. What was already
      tried, and the `api.adsb.lol/v2/type/CRJ7` fleet-list method, are in
      `docs/HANDOFF.md` — read it before re-sweeping.
- [ ] **`/find` + `/replay` unverified on production** — never tested in the 2026-08-12
      session; only the curated pipeline was verified. See Next step 1.
- [ ] **3° terrain cliff in `/api/flight`** — a track spanning ≥ 3° in either axis renders
      with no terrain at all. Known, measured, unfixed. `app/api/flight/route.ts` ~line 60.
- [ ] **r/aviation post decision** — Benjamin's call; gated on the two tests above.

## Gotchas
- **Never run `npm run build` while `npm run dev` is running** — they share `.next` and the
  build clobbers the dev server (throws `__webpack_modules__[moduleId] is not a function`).
  Kill dev, `rm -rf .next`, restart. Hit this twice today.
- **`npm run data` and `npm run terrain` both rewrite `meta.json` and wipe the imagery
  fields.** Always finish with `npm run imagery`, or just run `npm run pipeline` (which
  orders them correctly).
- **If `npm run imagery` fails with a bare `fetch failed`,** it is this machine's flaky
  IPv6 path to `tiles.maps.eox.at`, not the host blocking you. Re-run as
  `NODE_OPTIONS=--no-network-family-autoselection npm run imagery`. The script now prints
  this hint itself.
- **Measure `alt_geom`'s datum per-trace** (gotcha #7b) — Madeira's is ellipsoidal and
  needed −158 ft; Queenstown's one flight later is MSL and needed none.
- Claude does not merge or tag — Benjamin owns every merge in every repo.

## Pointers
- `ROADMAP.md` — created this session; first pass, correct it freely.
- `docs/HANDOFF.md` — candidate shortlist with per-airport coverage verdicts (Barra is a
  proven no-ship; Aspen's search notes live here).
- `docs/ADDING-FLIGHTS.md` — the runbook; gotchas 1–10 plus #7b, and the confirmed LOWI
  deep-valley coverage numbers.
- Memory: `reflight-status`, `reflight-lookup-fidelity-gap`.

## Log
- 2026-08-12 15:35 — PR #8 merged: Madeira + Queenstown shipped, Barra proven unbuildable, Aspen search recorded as unfinished. Roster 4 → 6 flights.
- 2026-08-12 12:20 — PR #7 merged: Sentinel-2 imagery baked for Denali/Jackson, Innsbruck flight added, imagery IPv6 diagnostics.
