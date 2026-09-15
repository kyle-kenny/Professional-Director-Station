# PDS 1.7 · Stage Control Maps

PDS 1.7 turns frame-authoritative Stage structure into real raster control images that can be consumed by ComfyUI / ControlNet workflows.

## Runtime path

```text
Current PDS Shot / Frame
  -> sampled actor transform + humanoid FK / IK
  -> camera projection
  -> OpenPose-compatible 18 point pose2d
  -> local PDS ComfyUI bridge
       -> Pose PNG
       -> Depth PNG
       -> Lineart PNG
  -> ComfyUI /upload/image
  -> mapped LoadImage nodes
  -> existing ControlNet / adapter graph in the user's workflow
  -> ComfyUI /prompt
  -> /history/{prompt_id}
  -> /view
  -> PDS AI media store + provenance
```

Generated Visuals remain additive. PDS 1.7 does not automatically change actors, camera, lights, Shot facts, or approved Stage state.

## Pose map

`analyzeFrameControls` now emits `pose2d` for every actor. The map uses an OpenPose-style 18-keypoint layout:

- nose / neck
- left and right shoulder, elbow, wrist
- left and right hip, knee, ankle
- left and right eye / ear

The projection is derived from the current frame's:

- actor transform
- actor height / shoulder width / head radius
- sampled humanoid FK state
- sampled humanoid IK targets and poles
- Stage camera / focal length / frame aspect

The bridge rasterizes these keypoints as a colored OpenPose-style skeleton.

## Depth map

The existing Stage camera-depth controls are converted into a deterministic grayscale actor-depth map. Nearer actors are brighter and farther actors are darker. The body mask follows the projected Stage skeleton.

This is an **actor depth control map**, not a full scene Z-buffer. The current `Shot` schema does not yet expose full environment mesh geometry to the AI control bundle, so PDS 1.7 deliberately does not claim full-scene metric depth.

## Lineart map

The bridge rasterizes projected body structure, head contour and torso edges to a black-background / white-line image. Like the depth map, this is currently actor-structure lineart rather than a full environment edge render.

## ComfyUI workflow contract

Create ordinary ComfyUI `LoadImage` nodes and connect them to whichever ControlNet / adapter nodes your model requires.

For automatic detection, name the nodes:

```text
PDS Pose
PDS Depth
PDS Lineart
```

PDS will map them to:

```text
poseImageNodeId
depthImageNodeId
lineartImageNodeId
```

Manual node IDs are also supported in `Visual ↔ Stage`.

The bridge generates only maps that have a mapped LoadImage node, uploads them through:

```text
POST /upload/image
```

and writes the returned `pds-control/<file>.png` path into the corresponding node's `image` input before submitting `/prompt`.

## File naming

Control images use stable per-frame names similar to:

```text
shot-01__f000012__pose.png
shot-01__f000012__depth.png
shot-01__f000012__lineart.png
```

They are uploaded into the ComfyUI input subfolder:

```text
pds-control/
```

## Determinism and provenance

The generated control maps are derived only from the `pds-ai-controls-1` payload plus requested output dimensions. The existing `controlHashSha256` remains the provenance identity for the Stage controls that produced the generation request.

The ComfyUI bridge still returns the final generation through the existing PDS HTTP provider contract, so media storage, prompt hash, control hash, model revision and Shot/frame binding remain unchanged.

## Limits in 1.7

PDS 1.7 intentionally stops at deterministic Stage raster controls. It does not yet provide:

- full environment mesh depth / normal maps
- semantic segmentation maps
- per-prop masks
- automatic ControlNet model selection or weight tuning
- Visual -> Stage inverse estimation

Those can be layered on top without changing the Stage -> ComfyUI provider contract introduced in PDS 1.6 and extended here.
