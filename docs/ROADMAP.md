# Industrialization Roadmap

## Gate 0 — foundation (current)
- Unified Shot contract
- 3D blocking/previs viewport
- 2D floor plan + 180° axis
- 2D frame derived from camera geometry
- lighting presets
- timeline/audio data skeleton
- project import/export and version status
- CI + static quality gate

## Gate 1 — director interaction
- Transform gizmos with snapping and numeric entry
- undo/redo command stack
- pose library and skeleton retarget contract
- actor/camera/light paths with keyframes and easing
- camera rigs and lens presets
- exposure, shadow and light gizmos
- GLB/FBX ingest normalization and asset diagnostics

Exit criteria: a director can stage and previs a complete dialogue/action shot without editing JSON.

## Gate 2 — editorial and sound
- deterministic timeline engine
- waveform-backed dialogue/music/SFX/ambience tracks
- frame-accurate markers and notes
- animatic/reference MP4 export
- OTIO import/export

Exit criteria: reference export is frame deterministic and editorial round-trip is tested.

## Gate 3 — collaboration and review
- authenticated projects, roles and permissions
- presence, object ownership and Shot locks
- immutable versions, comments, frame annotations, WIP/Review/Approved
- asset registry with checksum/provenance/license metadata
- conflict and rollback tests

Exit criteria: two departments can work concurrently without silent data loss.

## Gate 4 — pipeline interoperability
- USD scene composition
- OCIO/ACES project configuration
- MaterialX material references
- DCC/editor adapters
- storage abstraction and media proxy strategy

Exit criteria: interchange fixtures round-trip against reference applications.

## Gate 5 — AI production
- script breakdown → structured scene candidates
- pose/depth/lineart/camera-reference analysis
- structure-conditioned storyboard/video generation
- model/profile registry with reproducible prompt/control metadata
- generated media provenance and approval

Exit criteria: AI outputs remain traceable to Shot versions and never overwrite approved director data.
