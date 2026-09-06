# QA Report — Gate 0.1

Date: 2026-09-06

## Verified in this build environment

- PASS — required architecture/file inventory
- PASS — fixed production coordinate contract (right-handed, Y-up, -Z forward, meters)
- PASS — 3D viewport uses focal-length/sensor lens math
- PASS — 3D runtime disposes recreated GPU geometry/material resources
- PASS — 2D floor plan includes camera cone and 180-degree action axis
- PASS — 2D director frame derives composition from the 3D camera geometry
- PASS — current Shot schema covers blocking, camera, lighting, audio, review status and version
- PASS — static quality gate executes with zero third-party dependencies
- PASS — TransformControls implementation follows current Three.js addon API
- PASS — Windows compatibility static scanner
- PASS — standard cast covers male/female × child/teen/adult/elderly
- PASS — GitHub write access verified against `kyle-kenny/Professional-Director-Station`

Local zero-dependency gates:

```bash
npm run audit:static
npm run audit:windows
```

## CI-dependent verification

The provided execution container could not complete `npm install` because outbound npm registry access timed out. Therefore this report does **not** claim local `vitest` or `vite build` success.

GitHub Actions is configured to run on both `ubuntu-latest` and `windows-latest` and must execute install → static gate → Windows gate → unit tests → production build. A release is not accepted until these checks are green.

## Windows acceptance baseline

- Windows 11 x64 is a first-class target.
- `start-windows.cmd` provides a native CMD launcher for source builds.
- Runtime source rejects common POSIX-only path assumptions.
- Project/asset identity remains platform-neutral and must not persist machine-specific drive roots as canonical URIs.

## Standard director cast

The procedural foundation cast contains eight distinct directing presets: boy child, girl child, teenage boy, teenage girl, adult man, adult woman, elderly man and elderly woman. Their silhouettes are driven by height, eye height, shoulder width, body depth, head radius and age posture data rather than recoloring one mannequin.

## Industrial readiness

Gate 0.1 is a production-oriented foundation, **not yet industrial-complete**. Remaining industrial gates are documented in `docs/ROADMAP.md`: full director interaction, deterministic timeline/export, collaboration/review, pipeline interchange, and AI production/provenance.
