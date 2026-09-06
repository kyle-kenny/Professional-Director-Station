# Gate 1 Acceptance — Director Interaction

Gate 1 is complete when a director can stage and previs a shot without editing JSON and when all changes pass Windows and Ubuntu CI.

## Interaction

- actor selection and translate/rotate/scale gizmos
- numeric transforms with snapping
- project Undo/Redo
- actor and camera frame-snapped keyframes
- actor pose library and motion presets
- camera dolly/crane/orbit rigs
- standard lens presets
- selectable light gizmos, exposure, shadows, and light keyframes

## Character pipeline

- male/female standard cast across child, teen, adult, and elderly groups
- `pds-humanoid-1` retarget contract
- meter-based character scale

## Asset ingest

- `.glb` glTF 2.0 inspection
- `.fbx` inspection with explicit source-unit confirmation
- normalization metadata to PDS meter 1:1
- 512 MiB browser ingest guard
- IndexedDB source-binary cache keyed by `assetId@version`
- Project Asset Registry with duplicate protection and diagnostics
- Registry removal keeps binary cache so Undo can restore the reference

## Verification

The release gate is:

1. static quality audit
2. Windows compatibility audit
3. unit/regression test suite
4. production build
5. all checks green on both `windows-latest` and `ubuntu-latest`

Gate 2 may start only after the merge commit on `main` passes the same matrix.
