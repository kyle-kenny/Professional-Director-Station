# Architecture

## Product boundary

Professional Director Station is a director-facing pre-production system, not a general DCC. The source of truth is the shot contract; 3D, floor plan, frame composition, timeline, review and AI adapters are views/services around that contract.

## Coordinate contract

- Right-handed world
- Y up
- -Z forward
- 1 unit = 1 meter
- Camera optics represented by focal length + sensor width, never an arbitrary UI FOV alone

Imported assets must be normalized before becoming approved production assets.

## Domain hierarchy

`Project → Sequence → Shot → Version`

Shot owns blocking, camera, lights, audio, annotations and review state. Asset identity is stable and versioned; project instances refer to assets rather than silently duplicating them.

## Modules

- `domain/`: schemas, production contracts, lighting presets
- `store/`: application state and persistence boundary
- `engine/`: deterministic 3D interpretation of Shot data
- `components/`: director-facing 2D/3D/timeline tools
- `collab/`: collaboration transport boundary; domain remains transport-agnostic
- `utils/`: lens/projection math and pipeline validation
- `tests/`: domain and geometry gates

## Collaboration strategy

Production collaboration must separate three concerns:

1. **Presence** — who is online and what they are viewing.
2. **Ownership/locking** — who is allowed to alter a Shot/Asset/object at the moment.
3. **Version history** — immutable reviewable checkpoints and rollback.

CRDT synchronization is not a substitute for authorization or review. Yjs is kept behind an adapter so an authenticated server can replace the V1 transport.

## Planned interchange

- OpenUSD: scene composition and asset exchange
- OpenTimelineIO: editorial/timeline exchange
- OCIO/ACES: color pipeline
- MaterialX: material exchange
- GLB/FBX: ingest formats, normalized at import

## Quality gates

Every production increment should pass: schema validation → unit tests → production build → deterministic fixture export → visual regression → review/approval. No phase is considered industrial-ready merely because the UI works.
