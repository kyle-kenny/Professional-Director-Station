# QA Report — Gate 0.1

Date: 2026-09-06

## Verified

- PASS — required architecture/file inventory
- PASS — fixed production coordinate contract (right-handed, Y-up, -Z forward, meters)
- PASS — 3D viewport uses focal-length/sensor lens math
- PASS — 3D runtime disposes recreated GPU geometry/material resources
- PASS — 2D floor plan includes camera cone and 180-degree action axis
- PASS — 2D director frame derives composition from the 3D camera geometry
- PASS — current Shot schema covers blocking, camera, lighting, audio, review status and version
- PASS — static quality gate
- PASS — TransformControls integration
- PASS — Windows compatibility scanner
- PASS — standard cast covers male/female × child/teen/adult/elderly
- PASS — GitHub write access and main-branch delivery

## GitHub CI verification

The first production CI run exposed two TypeScript 7 build-contract defects: missing Vite CSS side-effect type declarations and an invalid `allowImportingTsExtensions` configuration. Both were fixed in commit `1c8dff38c1df98d20cdf48cf4b1d736c6256416f`.

CI run `34036650094` then completed successfully on both runners:

### Ubuntu

- PASS — npm install
- PASS — static quality gate
- PASS — Windows compatibility gate
- PASS — Vitest: 6/6 tests
- PASS — production build

### Windows

- PASS — npm install
- PASS — static quality gate
- PASS — Windows compatibility gate
- PASS — Vitest: 6/6 tests
- PASS — production build

This establishes Windows 11 as an actively tested platform rather than a documentation-only claim.

## Windows acceptance baseline

- Windows 11 x64 is a first-class target.
- `start-windows.cmd` provides a native CMD launcher for source builds.
- Runtime source rejects common POSIX-only path assumptions.
- Project/asset identity remains platform-neutral and must not persist machine-specific drive roots as canonical URIs.

## Standard director cast

The procedural foundation cast contains eight distinct directing presets: boy child, girl child, teenage boy, teenage girl, adult man, adult woman, elderly man and elderly woman. Their silhouettes are driven by height, eye height, shoulder width, body depth, head radius and age posture data rather than recoloring one mannequin.

## Industrial readiness

Gate 0.1 is a production-oriented foundation, **not yet industrial-complete**. Remaining industrial gates are documented in `docs/ROADMAP.md`: full director interaction, deterministic timeline/export, collaboration/review, pipeline interchange, and AI production/provenance.
