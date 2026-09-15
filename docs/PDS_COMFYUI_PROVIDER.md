# PDS 1.6+ · ComfyUI Provider

PDS 1.6 introduced the real ComfyUI generation path. PDS 1.7 added Stage-derived Pose / Depth / Lineart raster controls. PDS 1.8 added browser-rendered Scene Depth / Normal / Mask / Edge passes. PDS 1.9 makes imported environment / prop / vehicle instances authoritative Shot geometry, so those same Scene Pass inputs now carry the actual placed set geometry as well.

## Runtime path

```text
PDS Visual ↔ Stage
  -> pds-ai-generation-1 request
  -> optional browser full-Stage render passes
       -> actors + FK / IK
       -> environment / prop / vehicle GLB / FBX instances
       -> Stage camera / lens / aspect
  -> local PDS ComfyUI bridge (127.0.0.1:8790)
  -> optional structural-map raster + ComfyUI /upload/image
  -> optional verified Scene Pass upload
  -> ComfyUI /prompt
  -> ComfyUI /history/{prompt_id}
  -> ComfyUI /view
  -> image bytes
  -> existing PDS AI media store / provenance
```

The bridge is intentionally a separate localhost service so the browser does not need direct CORS access to ComfyUI.

## Start the bridge

Run ComfyUI normally, typically on `http://127.0.0.1:8188`, then start:

```bash
npm run comfyui:bridge
```

The PDS bridge defaults to `http://127.0.0.1:8790/v1/generate`. Health is available at `http://127.0.0.1:8790/health`.

## Register a ComfyUI workflow in Visual ↔ Stage

1. In ComfyUI, export the workflow in **API format JSON**.
2. Open `Visual ↔ Stage` and expand `添加 ComfyUI Provider`.
3. Load the API workflow JSON.
4. PDS auto-detects common KSampler-linked Positive / Negative prompt nodes, seed, numeric size nodes, SaveImage/PreviewImage output, and an optional `PDS Control JSON` text node.
5. Add any structural `LoadImage` controls you need and title them `PDS Pose`, `PDS Depth`, and/or `PDS Lineart`.
6. Add any full-scene `LoadImage` controls you need and title them `PDS Scene Depth`, `PDS Scene Normal`, `PDS Scene Mask`, and/or `PDS Scene Edge`.
7. Review or override detected node IDs and connect the images to the ControlNet / adapter graph required by your model.
8. Register the provider, select it, and click `生成 Visual`.

For custom Flux graphs or custom nodes whose relationships cannot be inferred safely, automatic detection is only a convenience; manual node-ID mapping remains authoritative.

If Output is omitted, the bridge uses the first image output found in ComfyUI history.

## Default node input conventions

- Prompt: `text`
- Negative prompt: `text`
- Seed: `seed`
- Width: `width`
- Height: `height`
- PDS Control JSON: `text`
- all PDS `LoadImage` mappings: `image`

The bridge supports alternate input-name parameters without changing the top-level PDS generation contract.

## Structural controls from PDS 1.7

The normal AI request includes exact Shot/frame, actor transform and sampled FK / IK state, OpenPose-compatible 18-point `pose2d`, actor camera-depth values, line-art structure, camera/lens, lighting, Visual target, and generation dimensions.

If mapped, PDS rasterizes Pose / Depth / Lineart PNGs in the bridge, uploads them to ComfyUI `input/pds-control`, and patches the mapped LoadImage nodes before `/prompt`.

See `docs/PDS_STAGE_CONTROL_MAPS.md`.

## Full Stage render passes from PDS 1.8+

If one or more Scene Pass nodes are mapped, Visual ↔ Stage captures the current Shot/frame in browser WebGL before generation and attaches a transient `pds-stage-render-passes-1` bundle containing:

- Scene Depth PNG
- Scene Normal PNG
- Scene Mask PNG
- Scene Edge PNG

PDS 1.9 reconstructs visible Shot `stageAssets` in this offscreen scene using their integrity-checked GLB / FBX binaries, authoritative transforms, visibility and shadow settings. Actor and Stage-asset instance IDs receive deterministic Scene Mask colors.

The PNG bodies are not persisted in the PDS project or model profile. Their SHA-256 values and bundle hash participate in generation control provenance. Visible Stage asset IDs, source versions and transforms also participate in the bundle hash input, so moving a prop invalidates the old control state.

Before upload, the bridge validates exact Shot/frame, PNG signature, dimensions, payload size, and SHA-256. It then uploads each mapped pass and patches the corresponding LoadImage node.

If `PDS Control JSON` is mapped, it receives render-pass metadata and hashes, not the base64 image bodies.

See `docs/PDS_STAGE_RENDER_PASSES.md` and `docs/PDS_STAGE_ASSET_INSTANCES.md`.

## Current authoritative geometry scope

Since PDS 1.9 the render-pass scene contains the geometry represented authoritatively by the Shot:

- current skinned actors with sampled FK / IK and actor transforms
- visible environment instances
- visible prop instances
- visible vehicle instances
- Shot camera / lens / aspect
- Stage ground

Environment / prop / vehicle instances are backed by the existing project asset registry and IndexedDB binary cache. Their `AssetRef` metadata is snapshotted into the Shot instance so category, version, source format, SHA-256 and provenance remain traceable.

## Security

- The bridge binds to `127.0.0.1` by default.
- Binding the bridge to a non-loopback host requires `PDS_COMFYUI_BRIDGE_TOKEN`.
- Local/private-network ComfyUI targets are allowed by default.
- Remote ComfyUI targets require HTTPS plus `PDS_ALLOW_REMOTE_COMFYUI=1`.
- Runtime Bridge tokens are not persisted in the project.
- ComfyUI workflow JSON is persisted as part of the model profile and must not contain secrets.
- Full-scene pass images exist only for the active request and are validated before ComfyUI upload.

## Environment variables

```text
PDS_COMFYUI_BRIDGE_HOST=127.0.0.1
PDS_COMFYUI_BRIDGE_PORT=8790
PDS_COMFYUI_BRIDGE_TOKEN=
PDS_ALLOW_REMOTE_COMFYUI=0
```

## Failure behavior

ComfyUI upload errors, queue errors, invalid workflows, missing mapped nodes/passes, render-pass Shot/frame mismatches, bad PNG signatures, SHA-256 mismatches, empty image output, image-size policy violations, and timeouts flow through the existing PDS failed-generation provenance path. A failure never mutates the source Stage.
