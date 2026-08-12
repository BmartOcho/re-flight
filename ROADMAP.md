# Re:Flight — Roadmap

> First pass, drafted 2026-08-12 at closeout from the state of the repo. Correct the
> headline and horizons freely — this is a living doc, not a contract.

**Goal:** the one flight-replay tool that is *both* real and beautiful — every rendered
point is the aircraft's actual broadcast position, over real terrain, and provably so.

The non-negotiable that everything else serves (`docs/HANDOFF.md` §7): **never fabricate a
path. Gaps are shown as gaps.** The verification harness (`npm run verify`) is the gate —
a flight that fails does not ship, and thresholds are never relaxed to make one pass.

---

## Now

- **Prove the two unfinished features, or cut them.** `/find` (tail-number search) and
  `/replay` (upload your own log) are both **untested on production**. `/find` is the
  risk: it needs a Vercel serverless function to fetch `globe.adsbexchange.com`, which
  may be refused from a datacenter IP. Until tested, neither should be promoted.
- **Decide on a public post (r/aviation).** Gated on the above. Six verified flights are
  the product; the unproven features need honest labelling or omission.

## Next

- **Aspen (KASE)** — the one remaining candidate from the original shortlist. Discovery
  is unsolved, *not* disproven; see `docs/HANDOFF.md` for what was already swept so the
  next attempt doesn't repeat it.
- **The 3° terrain cliff.** `/api/flight` skips terrain entirely when a track spans ≥ 3°
  in either axis, so an ordinary medium-haul search renders with no terrain. Options:
  tighten the lookup box around the interesting segment rather than the whole track, or
  raise the cap.

## Later

- More curated flights. Live candidates and their coverage verdicts are tracked in
  `docs/HANDOFF.md` — Madeira, Queenstown and Innsbruck came off that list; **Barra is
  permanently ruled out** (the field is invisible to the receiver network).
- **The radar tier** for pre-ADS-B history (Sully, Gimli Glider, UA232) from NTSB Flight
  Path Studies — labelled honestly as radar-derived. The two tiers are never silently
  mixed. See `docs/HANDOFF.md` §5.

## Constraints worth remembering

- **Imagery is CC BY-NC-SA (Sentinel-2 cloudless via EOX) — non-commercial.** Swap the
  provider in `lib/terrain/imagery.ts` before any commercial use.
- Alaska 1282 is a real incident with people aboard; treat its framing deliberately.
- Baked artifacts (`terrain.bin`, `imagery.jpg`, `track.json`) are committed on purpose so
  production builds stay hermetic and offline.
