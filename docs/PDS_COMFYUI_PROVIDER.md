# PDS 1.6 · ComfyUI Provider

PDS 1.6 turns the PDS 1.5 Stage → Visual request into a real ComfyUI generation path while keeping Stage authoritative and generated media additive.

## Runtime path

```text
PDS Visual ↔ Stage
  -> pds-ai-generation-1 request
  -> local PDS ComfyUI bridge (127.0.0.1:8790)
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
6. Review or override any detected node IDs. Positive Prompt is the only required mapping.
7. Register the provider and select it from the Provider dropdown.
8. Click `生成 Visual`.

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

The bridge code also supports alternate input-name parameters, so later UI versions can expose custom node input names without changing the provider protocol.

## Stage metadata sent to ComfyUI

The normal positive prompt starts with the machine-readable Visual target and includes current Stage facts. The normal AI request also includes the existing PDS frame controls:

- Shot + exact frame
- Actor pose / Humanoid Rig-derived structure
- Camera-space depth values
- Line-art / screen-coordinate structure
- Camera reference / focal length
- Lighting structure
- `composition`, `lighting`, or `look` Visual target
- frame-derived width / height

If a PDS Control JSON node is configured, the bridge injects the structured `source`, `controls`, and `visualTarget` JSON into that node as well.

## What PDS 1.6 does not claim

PDS 1.6 does **not** yet rasterize PDS pose/depth data into ControlNet-ready PNG maps. A normal ComfyUI workflow therefore receives the Stage structure through prompt metadata and the optional Control JSON node. Raster Pose / Depth / Lineart control-map generation is the next layer and should be added without changing this provider contract.

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

ComfyUI queue errors, invalid workflows, missing mapped nodes, empty image output, image responses over 64 MiB, and timeouts are returned through the existing PDS failed-generation provenance path. A failure never mutates the source Stage.
