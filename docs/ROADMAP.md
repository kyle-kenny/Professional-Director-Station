# Industrialization Roadmap

## Gate 0 — foundation (complete)
- [x] Unified Shot contract
- [x] 3D blocking/previs viewport
- [x] 2D floor plan + 180° axis
- [x] 2D frame derived from camera geometry
- [x] lighting presets
- [x] timeline/audio data skeleton
- [x] project import/export and version status
- [x] CI + static quality gate

## Gate 1 — director interaction (complete)
- [x] Transform gizmos with snapping and numeric entry
- [x] undo/redo command stack
- [x] pose library and humanoid skeleton retarget contract
- [x] actor/camera/light paths with keyframes and easing
- [x] camera rigs and director lens presets
- [x] exposure, shadow and selectable light gizmos
- [x] GLB/FBX ingest normalization and asset diagnostics

Exit criteria: a director can stage and previs a complete dialogue/action shot without editing JSON.

Acceptance passed on `main`: Windows + Ubuntu CI matrix, static quality audit, Windows compatibility audit, regression tests, and production build.

## Gate 2 — editorial and sound (completion candidate)
- [x] deterministic timeline engine
- [x] waveform-backed dialogue/music/SFX/ambience tracks
- [x] frame-accurate markers and notes
- [x] animatic/reference H.264/AAC MP4 export
- [x] OTIO import/export

Exit criteria: reference export is frame deterministic and editorial round-trip is tested.

Gate 2 becomes complete only after the implementation PR and its merged `main` commit both pass the Windows + Ubuntu CI matrix.

## Gate 3 — collaboration and review (next)
- [ ] authenticated projects, roles and permissions
- [ ] presence, object ownership and Shot locks
- [ ] immutable versions, comments, frame annotations, WIP/Review/Approved
- [ ] asset registry with checksum/provenance/license metadata
- [ ] conflict and rollback tests

Exit criteria: two departments can work concurrently without silent data loss.

## Gate 4 — pipeline interoperability
- [ ] USD scene composition
- [ ] OCIO/ACES project configuration
- [ ] MaterialX material references
- [ ] DCC/editor adapters
- [ ] storage abstraction and media proxy strategy

Exit criteria: interchange fixtures round-trip against reference applications.

## Gate 5 — AI production
- [ ] script breakdown → structured scene candidates
- [ ] pose/depth/lineart/camera-reference analysis
- [ ] structure-conditioned storyboard/video generation
- [ ] model/profile registry with reproducible prompt/control metadata
- [ ] generated media provenance and approval

Exit criteria: AI outputs remain traceable to Shot versions and never overwrite approved director data.
