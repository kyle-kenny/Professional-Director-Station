# Gate 5 — AI Production

Gate 5 adds a reproducible AI production layer without giving generated media authority over director-approved Shot data.

## Script breakdown

PDS provides deterministic screenplay parsing for English and Chinese scene headings. Scene candidates record the source script SHA-256, location/time classification, characters, beats, explicit prop labels and a suggested shot count. The parser is a production-structure assistant; it does not silently create or approve Shots.

## Structural controls

All AI visual conditioning comes from the same frame-authoritative Shot state used by Editorial:

- actor Pose / Action and sampled transforms
- camera-relative Depth values
- projected head/center/feet Lineart anchors
- camera position/target/lens/sensor/FOV/focus data
- sampled lights

Storyboard requests use the active frame control bundle. Video requests include a bounded whole-Shot control sequence, including first and last frames, so actor and camera motion remain explicit conditions.

## Reproducible generation envelope

Every generation request records:

- source Project ID
- source Shot ID and version
- canonical source Shot SHA-256
- active frame/FPS when applicable
- model Profile ID, provider, model ID and revision
- effective parameter snapshot
- prompt and negative prompt
- prompt SHA-256
- control SHA-256

Runtime authorization tokens are transport-only and are never written into Project JSON or Profile snapshots.

## Providers

### `local-structural`

The built-in profile generates deterministic SVG structural storyboards locally from PDS frame geometry. It requires no external model or credential and creates hashed `pds://ai/` media stored in local pipeline storage.

### `pds-http`

A studio may register a remote Storyboard/Video inference profile. Non-local endpoints must use HTTPS. Localhost HTTP is accepted only for development. Requests time out, inline base64 responses are bounded, and large media should be returned by URL.

The generic protocol is documented in `docs/PDS_AI_ENDPOINT.md`. PDS does not hard-code one vendor model; profile snapshots make the selected provider/model/revision reproducible.

## Provenance and approval

Generated and failed attempts are additive Project records. They never mutate the source Shot. Each record keeps source Shot, prompt and control hashes. Failed attempts keep the same provenance fields plus an error summary.

Generated media starts in `generated` state. Only owner/director authority can approve or reject it. Only approved generated media may be promoted to the Asset Registry, where it receives generated provenance, parent Shot identity, content hash when available, model revision, prompt hash and control hash.

Approved Shot data is never overwritten by AI generation. A generated image/video is a separately reviewed production artifact.

## Automated acceptance

- deterministic script breakdown
- deterministic frame control analysis
- local storyboard output with content SHA-256
- Approved source Shot immutability during generation
- whole-Shot video control sequence
- runtime token isolation from Project/Profile/request body
- insecure remote HTTP rejection
- traceable failed-attempt records
- role-gated generated-media approval
- approved output → Asset Registry provenance
- legacy `pds-1` compatibility without AI metadata
- `audit:ai`, all regression tests and production build run on Windows + Ubuntu

Gate 5 is complete only after both the PR head and merged `main` commit pass the full cross-platform matrix.
