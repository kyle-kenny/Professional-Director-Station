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

## Gate 2 — editorial and sound (complete)
- [x] deterministic timeline engine
- [x] waveform-backed dialogue/music/SFX/ambience tracks
- [x] frame-accurate markers and notes
- [x] animatic/reference H.264/AAC MP4 export
- [x] OTIO import/export

Exit criteria: reference export is frame deterministic and editorial round-trip is tested.

Acceptance passed on `main`: frame-authoritative timing, waveform/OTIO/export regression coverage, 35 tests, production build, and Windows + Ubuntu CI matrix.

## Gate 3 — collaboration and review (complete)
- [x] authenticated projects, roles and permissions
- [x] presence, object ownership and Shot locks
- [x] immutable versions, comments, frame annotations, WIP/Review/Approved
- [x] asset registry with checksum/provenance/license metadata
- [x] conflict and rollback tests

Exit criteria: two departments can work concurrently without silent data loss.

Acceptance passed on `main` commit `561fe7c6371cd94a8b405cc10e5e8362149225b4`: Windows + Ubuntu CI, collaboration authentication smoke audit, 42 regression tests and production build.

## Gate 4 — pipeline interoperability (completion candidate)
- [x] OpenUSD USDA scene composition and PDS round-trip payload
- [x] OCIO 2.5 / ACES 2.0 project configuration
- [x] MaterialX 1.39 material references
- [x] Blender/Maya/Houdini/Unreal/Nuke/Resolve adapter manifests
- [x] storage abstraction and deterministic media proxy strategy
- [x] interchange package workspace and automated round-trip tests

Exit criteria: interchange data preserves PDS meter/Y-up/timebase/color/material identities and adapter packages are deterministic across Windows and Ubuntu.

Gate 4 becomes complete only after the implementation PR and merged `main` commit both pass static, collaboration, pipeline, regression and production-build gates on Windows + Ubuntu.

## Gate 5 — AI production (next)
- [ ] script breakdown → structured scene candidates
- [ ] pose/depth/lineart/camera-reference analysis
- [ ] structure-conditioned storyboard/video generation
- [ ] model/profile registry with reproducible prompt/control metadata
- [ ] generated media provenance and approval

Exit criteria: AI outputs remain traceable to Shot versions and never overwrite approved director data.
