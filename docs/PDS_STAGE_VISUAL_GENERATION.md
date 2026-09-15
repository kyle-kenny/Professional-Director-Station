# PDS 1.5 — Stage → Visual Generation

## Scope

PDS 1.5 turns the Phase 1 Visual ↔ Stage contract into an executable Stage → Visual path. It does not mutate Stage from generated images; Visual → Stage understanding remains a later phase.

## Flow

1. Read the active Shot and playhead frame.
2. Build a deterministic `pds-stage-1` Stage Artifact.
3. Select a Visual target: `composition`, `lighting`, or `look`.
4. Build a `pds-stage-visual-generation-1` preview using the existing PDS AI generation envelope.
5. Send pose/depth/line-art/camera/light controls plus the tagged Visual prompt to the selected storyboard provider.
6. Persist the generated media through the existing AI provenance store.
7. Show only outputs that match the exact Shot, frame, and Visual target.

## Providers

### Local structural

The built-in `local-structural-v1` provider produces a deterministic SVG storyboard. It is the zero-configuration validation path and is useful for contract testing.

### PDS-HTTP

A `pds-http` profile can point at a real image-generation backend. The endpoint receives the existing `pds-ai-generation-1` request, including frame-authoritative controls:

- actor pose / rig references
- depth controls
- line-art / screen-space actor placement
- camera focal length and reference data
- light controls
- tagged Stage → Visual prompt

Remote non-local endpoints must use HTTPS. Runtime bearer tokens remain in component memory and are never persisted into the project JSON or model profile snapshot.

## Prompt binding

Every Stage → Visual prompt begins with a machine-readable line:

`PDS_VISUAL_TARGET=<variant>;SHOT=<shotId>;FRAME=<frame>;STAGE=<stageArtifactFilename>`

This lets the workspace recover the Visual target from existing AI provenance without introducing a second media registry.

## Safety / authority

Generated media is additive. PDS 1.5 does not automatically change actor transforms, camera state, lighting, Shot approval status, or other Stage facts. Approval and asset promotion continue to use the existing AI production workflow.

## Next phase

The intended next phase is Visual → Stage Understanding: analyze a selected image, produce camera / blocking / lighting suggestions, show a diff, and only apply changes after explicit user approval.
