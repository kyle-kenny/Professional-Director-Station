# PDS 1.8 · Full Stage Render Passes

PDS 1.8 adds browser-rendered scene control passes to the existing Visual ↔ Stage → ComfyUI path. The render passes are captured from the same current Shot/frame facts used by the director console, transported only for the active generation request, verified by the local bridge, and injected into mapped ComfyUI `LoadImage` nodes.

## Runtime path

```text
Current Shot / Frame
  -> sampled actor transforms + current FK / IK
  -> current Stage camera / lens / aspect
  -> browser offscreen Three.js render
       -> Scene Depth PNG
       -> Scene Normal PNG
       -> Scene Mask PNG
       -> Scene Edge PNG
  -> transient pds-ai-generation-1 request
  -> local PDS ComfyUI bridge
       -> validate Shot / Frame
       -> validate PNG signature
       -> validate SHA-256
  -> ComfyUI /upload/image
  -> mapped LoadImage / ControlNet / adapter graph
  -> /prompt -> /history -> /view
  -> existing PDS generated-media store / provenance
```

## Passes

### Scene Depth

Rendered with the authoritative Shot camera using a Three.js depth material. It captures geometry depth for objects currently represented in the render-pass scene.

### Scene Normal

Rendered with a Three.js normal material in the same camera and frame. It is suitable as a geometry-orientation condition for workflows that accept normal maps.

### Scene Mask

Rendered with deterministic object colors. Current actors receive stable colors derived from actor IDs; the Stage ground uses a separate neutral color. The pass is intended for region / identity / segmentation-style conditioning rather than beauty rendering.

### Scene Edge

Derived from discontinuities in the Scene Depth + Scene Normal passes. It is a geometry-aware edge map rather than a prompt-only or actor-line skeleton.

## ComfyUI node convention

PDS automatically detects ordinary `LoadImage` nodes whose titles are:

```text
PDS Scene Depth
PDS Scene Normal
PDS Scene Mask
PDS Scene Edge
```

Manual node-ID overrides remain available in Visual ↔ Stage.

These nodes can be connected to ControlNet, T2I Adapter, Flux control nodes, preprocessors, masks, or any custom ComfyUI graph. PDS injects the image; it does not force a particular model, strength, or ControlNet implementation.

PDS 1.7 structural controls remain independently available:

```text
PDS Pose
PDS Depth
PDS Lineart
```

A workflow can use any subset of the seven image controls.

## Transient transport and provenance

Full-scene PNGs are intentionally **not persisted in the PDS project JSON or model profile**. They are created immediately before generation and attached only to that request.

Each pass carries a SHA-256 digest. The bundle has its own SHA-256 identifier, and that bundle hash is folded into the normal PDS `controlHashSha256`. Generated-media provenance therefore changes when the Stage render passes change without storing multi-megabyte base64 images in the project.

The bridge rejects:

- missing mapped passes
- wrong Shot or frame
- non-PNG payloads
- pass dimensions that disagree with the bundle
- individual pass payloads above the bridge policy limit
- SHA-256 mismatches

## Current authoritative geometry scope

The current persisted `Shot` schema contains actors, camera, lights and editorial facts, but it does **not** yet contain a general collection of environment / prop / vehicle instances with authoritative transforms.

Therefore PDS 1.8 truthfully renders the geometry that can currently be reconstructed from authoritative Stage state:

- current CC0 skinned actor meshes
- sampled actor transforms
- sampled FK / IK posing
- current Shot camera / lens / aspect
- Stage ground

This is a full render-pass **infrastructure**, not a claim that arbitrary environment and prop placement is already persisted in the Shot model. Once environment / prop instances become authoritative Stage objects, they can be added to the same offscreen scene and will automatically participate in Depth / Normal / Mask / Edge without changing the ComfyUI provider contract.

## Browser validation

The CI browser audit loads the production build with an audit-only URL flag and invokes the actual WebGL capture path at 320×180. It verifies all four PNGs are produced, have PNG base64 signatures, have nontrivial sizes, and carry SHA-256 hashes. The audit hook is not exposed during normal application use.

## Compatibility

- project schema remains `pds-1`
- existing PDS 1.7 Pose / Depth / Lineart controls are unchanged
- existing ComfyUI workflows without Scene Pass mappings continue to generate without paying the offscreen render cost
- generated visuals remain additive and never automatically mutate actors, camera, lights, or approved Stage state
