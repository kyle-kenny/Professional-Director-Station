# PDS 1.8+ · Full Stage Render Passes

PDS 1.8 introduced browser-rendered scene control passes for Visual ↔ Stage → ComfyUI. PDS 1.9 extends the same contract with authoritative environment / prop / vehicle instances, so the passes now include both characters and imported Stage geometry.

## Runtime path

```text
Current Shot / Frame
  -> sampled actors + FK / IK
  -> authoritative environment / prop / vehicle instances
  -> current Stage camera / lens / aspect
  -> browser offscreen Three.js render
       -> Scene Depth PNG
       -> Scene Normal PNG
       -> Scene Mask PNG
       -> Scene Edge PNG
  -> transient pds-ai-generation-1 request
  -> local PDS ComfyUI bridge
       -> validate Shot / Frame / PNG / SHA-256
  -> ComfyUI /upload/image
  -> mapped LoadImage / ControlNet / adapter graph
  -> /prompt -> /history -> /view
  -> existing PDS generated-media store / provenance
```

## Passes

### Scene Depth

Rendered with the authoritative Shot camera using a Three.js depth material. It includes visible actor meshes, visible Stage asset geometry and the Stage ground.

### Scene Normal

Rendered with a Three.js normal material in the same camera and frame, including imported Stage geometry.

### Scene Mask

Rendered with deterministic object colors. Actor IDs and Stage asset instance IDs each receive stable colors; the Stage ground uses a separate neutral color. The pass is suitable for region / identity / segmentation-style conditioning.

### Scene Edge

Derived from discontinuities in Scene Depth + Scene Normal. Environment and prop silhouettes therefore contribute real geometry edges instead of prompt-only approximations.

## ComfyUI node convention

PDS automatically detects ordinary `LoadImage` nodes titled:

```text
PDS Scene Depth
PDS Scene Normal
PDS Scene Mask
PDS Scene Edge
```

PDS 1.7 structural controls remain independently available:

```text
PDS Pose
PDS Depth
PDS Lineart
```

A workflow may use any subset of the seven image controls. PDS injects the images and does not force a model, ControlNet implementation, adapter or strength.

## Transient transport and provenance

Full-scene PNGs are not persisted in the project JSON or model profile. They exist only for the active generation request.

Each pass carries SHA-256. The bundle has its own SHA-256 identifier and is folded into the normal PDS `controlHashSha256`. PDS 1.9 also includes visible Stage asset instance IDs, source asset versions and transforms in the bundle provenance input. A prop move therefore invalidates the old control state even before downstream generation.

The bridge rejects missing mapped passes, wrong Shot/frame, non-PNG payloads, dimension mismatches, oversize payloads and SHA-256 mismatches.

## Authoritative geometry scope since PDS 1.9

The Shot model now contains authoritative `stageAssets` for imported:

- environment
- prop
- vehicle

The render-pass scene therefore reconstructs:

- current CC0 skinned actor meshes
- sampled actor transforms + FK / IK
- visible Stage asset GLB / FBX geometry and transforms
- current Shot camera / lens / aspect
- Stage ground

The Stage asset binary is loaded from IndexedDB and integrity-checked against its recorded metadata. See `docs/PDS_STAGE_ASSET_INSTANCES.md`.

## Browser validation

CI executes the production build in Chromium. In addition to checking all four PNG outputs and hashes, PDS 1.9 generates a valid GLB audit prop, stores it through the real asset cache, places it into the active Shot, waits for the 3D viewport loader, and verifies Scene Mask changes both on placement and after an Inspector transform.

## Compatibility

- project schema remains `pds-1`; old Shots normalize `stageAssets` to `[]`
- existing PDS 1.7 Pose / Depth / Lineart controls are unchanged
- existing ComfyUI workflows without Scene Pass mappings do not pay the offscreen capture cost
- generated visuals remain additive and never automatically mutate Stage state
