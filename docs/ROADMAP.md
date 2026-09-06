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

Exit criteria passed: the repository has a stable unified Shot model and cross-platform quality gate.

## Gate 1 — director interaction (complete)
- [x] Transform gizmos with snapping and numeric entry
- [x] undo/redo command stack
- [x] pose library and humanoid skeleton retarget contract
- [x] actor/camera/light paths with keyframes and easing
- [x] camera rigs and director lens presets
- [x] exposure, shadow and selectable light gizmos
- [x] GLB/FBX ingest normalization and asset diagnostics

Exit criteria passed: a director can stage and previs a complete dialogue/action shot without editing JSON.

## Gate 2 — editorial and sound (complete)
- [x] deterministic timeline engine
- [x] waveform-backed dialogue/music/SFX/ambience tracks
- [x] frame-accurate markers and notes
- [x] animatic/reference H.264/AAC MP4 export
- [x] OTIO import/export

Exit criteria passed: reference export is frame deterministic and editorial round-trip is regression tested.

## Gate 3 — collaboration and review (complete)
- [x] authenticated projects, roles and permissions
- [x] presence, object ownership and Shot locks
- [x] immutable versions, comments, frame annotations, WIP/Review/Approved
- [x] asset registry with checksum/provenance/license metadata
- [x] conflict and rollback tests

Exit criteria passed on `main` commit `561fe7c6371cd94a8b405cc10e5e8362149225b4`: authenticated collaboration, stale-write protection, immutable review versions, Windows + Ubuntu CI and production build.

## Gate 4 — pipeline interoperability (complete)
- [x] OpenUSD USDA scene composition and PDS round-trip payload
- [x] OCIO 2.5 / ACES 2.0 project configuration
- [x] MaterialX 1.39 material references
- [x] Blender/Maya/Houdini/Unreal/Nuke/Resolve adapter manifests
- [x] storage abstraction and deterministic media proxy strategy
- [x] interchange package workspace and automated round-trip tests

Exit criteria passed on `main` commit `0e5ed09b0f02dfd2fecc726e10071c5fca592380`: interchange data preserves PDS meter/Y-up/timebase/color/material identities and deterministic adapter manifests across Windows and Ubuntu. Hosted CI validates interchange structure and PDS round-trip; it does not claim licensed third-party DCC applications are installed in CI.

## Gate 5 — AI production (complete)
- [x] deterministic screenplay breakdown → structured scene candidates
- [x] frame-authoritative pose/depth/lineart/camera-reference control analysis
- [x] local structural storyboard generation and PDS-HTTP storyboard/video generation envelope
- [x] whole-Shot sampled structural conditioning for video requests
- [x] model/profile registry with revisioned parameter snapshots
- [x] prompt/control/source-Shot SHA-256 reproducibility metadata
- [x] generated/failed media provenance, approval/rejection and Asset Registry promotion
- [x] runtime credential isolation and HTTPS endpoint policy

Exit criteria passed on `main` commit `656668af05a8064f0a64a49da50e17c9efbc8a43`: AI outputs and failures remain traceable to source Shot content, model/profile revisions, prompts and structural controls; generation is additive and does not overwrite approved Shot data. PR head and merged `main` both passed static, Windows compatibility, collaboration, pipeline, AI, regression and production-build gates on Windows + Ubuntu.

## Roadmap status

**Gate 0 → Gate 5 are complete under the repository's defined acceptance criteria.** Future work is post-1.0 product hardening, vendor-specific certification, deployment/operations, and feature evolution rather than an unfinished roadmap gate.
