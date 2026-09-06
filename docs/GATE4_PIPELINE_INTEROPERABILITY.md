# Gate 4 — Pipeline Interoperability

Gate 4 defines a deterministic interchange boundary between PDS and external DCC/editor/color pipelines.

## Standards baseline

- OpenUSD target: `OpenUSD-26.08`
- USDA text layer: `#usda 1.0`
- Stage units: `metersPerUnit = 1`
- Stage up axis: `Y`
- PDS camera/actor convention remains right-handed, Y-up, -Z forward, meter 1:1.
- OpenColorIO project contract: `2.5`
- ACES project contract: `2.0`
- MaterialX document contract: `1.39`; library release metadata: `1.39.5`
- Editorial timing remains OTIO/frame-authoritative from Gate 2.

## USD

PDS exports a USDA layer containing actor transforms, camera/lens metadata, light placement, FPS/timeCode metadata and asset references. A canonical PDS Shot payload is embedded in custom metadata so PDS-generated USDA can be losslessly re-imported without guessing application-specific USD transforms.

The USD boundary is intentionally explicit: meters and Y-up are stage metadata, and PDS-specific camera target / review semantics are custom attributes rather than silently mapped to incompatible DCC assumptions.

## OCIO / ACES

Pipeline color configuration is stored at Project level and travels with interchange manifests. Color manifests include the OCIO config URI and optional SHA-256, ACES version, working/interchange spaces, display/view selection and a deterministic project color fingerprint.

The default working space is ACEScg and interchange space is ACES2065-1. PDS also exports an ACES metadata sidecar for reference handoff.

## MaterialX

PDS creates MaterialX 1.39 documents for registered scene assets. Material assignment identity is preserved by stable PDS Asset IDs and material assignment paths. Material documents explicitly record the project working color space.

## DCC/editor adapters

The package manifest emits deterministic handoff manifests for:

- Blender
- Maya / MayaUSD
- Houdini Solaris / LOPs
- Unreal Engine
- Nuke
- DaVinci Resolve

Each adapter receives the same USD scene URI, OTIO editorial URI, MaterialX URI, color manifest, ACES metadata URI, coordinate convention and color fingerprint. Adapter-specific notes document what must remain authoritative.

## Storage and media proxy

`StorageProvider` separates logical `pds://` URIs from browser/local persistence. The browser implementation uses IndexedDB; tests use an isolated in-memory provider.

The proxy planner is deterministic from project policy. Video/image resolution, video bitrate and audio sample rate decide whether a proxy is required. The policy is project data rather than hidden machine state.

## Automated acceptance

- USDA export validates header, meter scale, Y-up and timebase.
- PDS USDA metadata round-trips Shot identity and staging data.
- MaterialX assignment identity round-trips.
- OCIO/ACES manifests produce stable SHA-256 fingerprints.
- All six DCC/editor manifests share the same coordinate/color authority.
- Proxy decisions are deterministic.
- StorageProvider tests prove caller mutation cannot corrupt stored bytes.
- Legacy `pds-1` projects without pipeline metadata receive current defaults.
- `audit:pipeline`, all regression tests and production build run on Windows + Ubuntu.

Gate 4 is complete only after both the PR head and its merged `main` commit pass the full matrix.
