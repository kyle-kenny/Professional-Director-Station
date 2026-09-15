# PDS 1.6+ · ComfyUI Provider

PDS 1.6 introduced the real ComfyUI generation path. PDS 1.7 extends the same provider contract with Stage-derived Pose / Depth / Lineart raster control maps while keeping Stage authoritative and generated media additive.

## Runtime path

```text
PDS Visual ↔ Stage
  -> pds-ai-generation-1 request
  -> local PDS ComfyUI bridge (127.0.0.1:8790)
  -> optional Stage control-map raster + ComfyUI /upload/image
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

The PDS bridge defaults to:

```text
http://127.0.0.1:8790/v1/generate
```

Health check:

```text
http://127.0.0.1:8790/health
```

## Register a ComfyUI workflow in Visual ↔ Stage

1. In ComfyUI, export the workflow in **API format JSON**.
2. Open `Visual ↔ Stage`.
3. Expand `添加 ComfyUI Provider`.
4. Load the API workflow JSON.
5. PDS automatically attempts to identify common KSampler-linked Positive / Negative prompt nodes, the KSampler seed node, a numeric width/height latent node, SaveImage/PreviewImage output, and an optional node titled `PDS Control JSON`.
6. For raster controls, add ordinary `LoadImage` nodes and title them `PDS Pose`, `PDS Depth`, and/or `PDS Lineart`. PDS 1.7 will auto-detect those IDs as well.
7. Review or override any detected node IDs. Positive Prompt is the only required mapping; control maps are optional per workflow.
8. Connect those LoadImage nodes to the ControlNet / adapter nodes required by your model.
9. Register the provider and select it from the Provider dropdown.
10. Click `生成 Visual`.

For custom Flux graphs or custom nodes whose relationships cannot be inferred safely, leave automatic detection as a convenience only and enter the node IDs explicitly.

If Output is omitted, the bridge uses the first image output found in ComfyUI history.

## Node input conventions

By default PDS writes these input names:

- Prompt: `text`
- Negative prompt: `text`
- Seed: `seed`
- Width: `width`
- Height: `height`
- PDS control JSON: `text`
- PDS Pose LoadImage: `image`
- PDS Depth LoadImage: `image`
- PDS Lineart LoadImage: `image`

The bridge code supports alternate input-name parameters for provider integrations without changing the top-level PDS generation contract.

## Stage metadata and raster controls sent to ComfyUI

The normal positive prompt starts with the machine-readable Visual target and includes current Stage facts. The normal AI request also includes:

- Shot + exact frame
- Actor transform and sampled Humanoid FK / IK state
- OpenPose-compatible 18-point `pose2d` camera projection
- Camera-space actor depth values
- Line-art / screen-coordinate structure
- Camera reference / focal length
- Lighting structure
- `composition`, `lighting`, or `look` Visual target
- frame-derived width / height

If a PDS Control JSON node is configured, the bridge injects the structured `source`, `controls`, and `visualTarget` JSON into that node.

If Pose / Depth / Lineart image nodes are configured, PDS 1.7 also rasterizes deterministic PNG maps, uploads them to ComfyUI `input/pds-control`, and writes their returned paths into the corresponding LoadImage nodes before `/prompt` is submitted.

The raster behavior is documented in `docs/PDS_STAGE_CONTROL_MAPS.md`.

## Current raster scope

PDS 1.7 provides:

- frame-authoritative actor pose maps derived from sampled FK / IK
- actor-relative camera depth maps
- actor structural lineart maps

It does **not** yet claim full environment mesh Z-buffer depth or full scene edge rendering because the current Shot AI control contract does not expose environment mesh geometry.

## Security

- The bridge binds to `127.0.0.1` by default.
- Binding the bridge to a non-loopback host requires `PDS_COMFYUI_BRIDGE_TOKEN`.
- The bridge only targets localhost/private-network ComfyUI by default.
- Remote ComfyUI targets require HTTPS plus `PDS_ALLOW_REMOTE_COMFYUI=1`.
- Runtime Bridge tokens are supplied through the existing PDS runtime-token field and are not persisted in the project.
- ComfyUI workflow JSON **is** persisted as part of the model profile, so it must not contain secrets.

## Environment variables

```text
PDS_COMFYUI_BRIDGE_HOST=127.0.0.1
PDS_COMFYUI_BRIDGE_PORT=8790
PDS_COMFYUI_BRIDGE_TOKEN=
PDS_ALLOW_REMOTE_COMFYUI=0
```

## Failure behavior

ComfyUI upload errors, queue errors, invalid workflows, missing mapped nodes, empty image output, image responses over 64 MiB, and timeouts are returned through the existing PDS failed-generation provenance path. A failure never mutates the source Stage.
