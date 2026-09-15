# PDS 1.9 · Environment & Prop Stage Instances

PDS 1.9 turns imported environment, prop and vehicle assets into authoritative Shot-level Stage objects. A registered GLB / FBX asset can now be placed in the active Shot, selected in the 3D director console, moved / rotated / scaled, persisted with the project, and consumed by the PDS 1.8 Scene Depth / Normal / Mask / Edge pipeline.

## Data model

Each Shot now has a backwards-compatible collection:

```text
Shot.stageAssets[]
  id
  name
  kind = environment | prop | vehicle
  asset = AssetRef snapshot
  transform = position / rotation / scale
  visible
  castShadow
  receiveShadow
```

`stageAssets` defaults to `[]`, so existing `pds-1` projects remain readable without a schema-version migration.

The instance stores an `AssetRef` snapshot rather than only an asset ID. This preserves category, version, SHA-256, source format, license and provenance even if the registry entry is later removed. The heavy source binary remains in IndexedDB and is never embedded into project JSON.

## Placement workflow

```text
Assets workspace
  -> import GLB / FBX
  -> validate format / units / size
  -> SHA-256 + IndexedDB binary cache
  -> Project Asset Registry
  -> 放入当前镜头
  -> Shot.stageAssets[]
  -> 3D Director Viewport
```

Only `environment`, `prop`, and `vehicle` assets with a GLB / FBX source can be placed as Stage instances.

## Runtime loading

The Stage asset loader:

- reads the original binary from IndexedDB by `asset.id@version`
- checks the recorded byte length when available
- recalculates and verifies SHA-256 when available
- parses GLB with Three.js `GLTFLoader`
- parses FBX with `FBXLoader`
- applies the explicitly confirmed FBX source-unit conversion to meters
- caches parsed templates and clones per-instance scene trees / materials
- applies Shot-authoritative transform, visibility and shadow flags

A missing or corrupted cached binary fails only that instance; it does not silently substitute another model.

## 3D interaction

Stage assets use the same Three.js `TransformControls` as the rest of the director console:

- click imported geometry to select its Shot instance
- `W` — translate in world space
- `E` — rotate in local space
- `R` — scale in local space
- `Delete` — remove the instance from the current Shot

Transform changes commit on gizmo release, producing one normal undo/history operation rather than continuously writing project storage while dragging.

The Selection Inspector also exposes exact position / rotation / scale values, visibility, cast-shadow / receive-shadow flags, duplicate and delete.

## AI render-pass integration

PDS 1.9 closes the geometry gap left intentionally open in PDS 1.8. Visible Stage asset geometry is reconstructed in the same browser offscreen render scene as actors and therefore participates in:

- Scene Depth
- Scene Normal
- Scene Mask
- Scene Edge

Scene Mask assigns deterministic colors to both actor IDs and Stage asset instance IDs. The render-pass bundle provenance includes visible Stage asset IDs, asset versions and transforms. Moving a prop therefore changes both the rendered control maps and their bundle hash before ComfyUI generation.

No ComfyUI provider-contract change is required; existing `PDS Scene Depth / Normal / Mask / Edge` mappings automatically receive the richer scene geometry.

## Compatibility and authority

- project schema version remains `pds-1`
- legacy Shots normalize `stageAssets` to `[]`
- binary assets stay in IndexedDB, metadata stays in project JSON
- removing an asset from the Project Asset Registry does not destroy existing Shot instance metadata or the cached binary
- APPROVED Shots remain read-only
- source Stage state is never changed by AI generation

## Browser audit

The Chromium audit creates a minimal valid GLB in-browser, stores it in IndexedDB, registers it as a prop and places it in the current Shot. CI then verifies that:

1. the 3D viewport reports the Stage asset as loaded;
2. the Selection Inspector identifies it as `stage-asset`;
3. Scene Mask changes when the asset is introduced;
4. changing its X position through the Inspector changes Scene Mask again.

This verifies the real `asset binary -> Stage instance -> viewport -> edit -> render pass` path rather than only testing schema objects.
