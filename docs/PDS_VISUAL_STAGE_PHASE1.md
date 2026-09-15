# PDS Visual ↔ Stage — Phase 1

Phase 1 only establishes a stable contract and interaction shell between visual deliverables and the existing PDS Stage. It does not add model inference, network generation, backend orchestration, or automatic Stage mutation.

## Stable names

UI copy is contract-visible and intentionally fixed:

- Workspace: `Visual ↔ Stage`
- Visual side: `PDS Visual`
- Stage side: `Stage`
- Directions: `Visual → Stage` and `Stage → Visual`

Artifact contract versions:

- Visual deliverable: `pds-visual-1`
- Stage artifact: `pds-stage-1`
- Link intent: `pds-visual-stage-1`

## Stable filenames

Visual fixtures:

```text
<shot>__visual__<variant>__f000012.png
```

Stage snapshots:

```text
<shot>__stage__f000012.pds-stage.json
```

Phase 1 fixture variants are `composition`, `lighting`, and `look`.

## Boundary

A Stage artifact is a deterministic snapshot sampled from the active PDS Shot at an integer frame. A Visual fixture is a deterministic reference for the same Shot/frame. Creating a bridge records a `draft` link intent only.

No Phase 1 operation changes actors, camera, lights, approval state, project schema, existing workspace mode, or persisted Stage data. The existing PDS workspaces remain authoritative.
