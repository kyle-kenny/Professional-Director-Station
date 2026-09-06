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

## Gate 1 — director interaction (current)
- [x] Transform gizmos with snapping and numeric entry
- [x] undo/redo command stack
- [x] pose library and humanoid skeleton retarget contract
- [~] actor/camera/light paths with keyframes and easing — actor + camera complete; light animation pending
- [~] camera rigs and lens presets — Dolly/Crane/Orbit complete; lens preset library pending
- [x] exposure, shadow and selectable light gizmos
- [ ] GLB/FBX ingest normalization and asset diagnostics

Exit criteria: a director can stage and previs a complete dialogue/action shot without editing JSON.

## Gate 2 — editorial and sound
- [ ] deterministic timeline engine
- [ ] waveform-backed dialogue/music/SFX/ambience tracks
- [ ] frame-accurate markers and notes
- [ ] animatic/reference MP4 export
- [ ] OTIO import/export

Exit criteria: reference export is frame deterministic and editorial round-trip is tested.

## Gate 3 — collaboration and review
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
