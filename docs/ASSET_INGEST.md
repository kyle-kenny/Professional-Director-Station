# Asset Ingest Contract

Professional Director Station Gate 1 accepts self-contained `.glb` and `.fbx` source assets through the Inspector Asset Ingest panel.

## Pipeline target

All registered project assets are represented in PDS pipeline space:

- right-handed coordinates
- Y-up
- -Z forward convention
- meters
- normalized asset reference scale: `unitScaleMeters = 1`

The original source file is retained separately from the normalized project reference.

## GLB

- glTF 2.0 binary header and JSON chunk are validated before registration.
- glTF 2.0 linear units are treated as meters.
- node, mesh, skin, animation, and material counts are recorded as diagnostics when available.
- malformed headers or non-2.x glTF assets are blocked.
- Draco usage is surfaced as a warning because runtime decoding requires a Draco decoder.

## FBX

PDS never guesses FBX source units. The operator must explicitly confirm whether the source DCC exported in meters, centimeters, millimeters, inches, or feet.

When an ASCII FBX exposes `UnitScaleFactor`, PDS compares that declaration with the operator choice and warns on conflicts. The confirmed source scale is retained in `sourceUnitScaleMeters`; the registered PDS asset reference remains meter 1:1.

## Local binary storage

Original source binaries are stored in IndexedDB under a stable `assetId@version` key. Project JSON contains only portable asset references, source metadata, and diagnostics; it does not inline large binary files.

Removing an asset from the Project Asset Registry intentionally keeps its local binary cache so project Undo/Redo can restore the reference without immediate data loss. A project opened on another workstation can therefore show a `missing` local-cache state even while its asset reference remains valid.

## Safety limits

The browser workstation build rejects a single source asset larger than 512 MiB before reading it into memory. Larger production assets should be optimized or proxied before director-stage ingest.

## Versioning

Asset identity is `assetId@version`. IDs use lowercase kebab-case. Registering the same ID and version twice is blocked; a new revision should use a new version such as `v002`.
