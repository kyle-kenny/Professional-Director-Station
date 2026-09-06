# Gate 2 — Editorial & Sound

Gate 2 turns the blocking/previs station into a frame-deterministic editorial and sound workstation.

## Timebase

- Integer frame is authoritative.
- Seconds are derived as `frame / fps`.
- Scrubbing, stepping, keyframes, audio starts/durations, markers and notes snap to the Shot frame rate.
- Playback advances by elapsed monotonic time but resolves the visible playhead to an integer frame.
- Director Frame preview and MP4 reference export share the same `renderDirectorFrame()` implementation.

## Audio

- Real audio files can be imported into Dialogue / Music / SFX / Ambience lanes.
- Web Audio decodes source media and generates deterministic peak waveforms.
- Original media bytes and peaks are cached locally in IndexedDB; Project JSON stores metadata only.
- Playback schedules cached audio against the current frame with per-clip gain.
- Removing an audio clip from the Shot does not destroy its local cache, so project Undo can restore the reference.

## Markers & Notes

- Markers and director notes are stored at frame-snapped times.
- Click jumps to the exact frame; Shift+click removes the item.
- Marker color is preserved through PDS OTIO metadata.

## OTIO

- Export produces an OpenTimelineIO `Timeline.1` JSON document.
- Director reference is represented as a video track.
- Each audio clip uses an audio track with an exact placement gap plus PDS metadata for kind, gain and source identity.
- Markers and notes are represented as OTIO markers on the director reference clip.
- Import replaces only editorial data (audio/markers/notes); staging, camera, actors and lighting remain untouched.
- PDS export → import round-trip is regression tested at the frame level.

## MP4 reference export

- Uses Mediabunny with WebCodecs for H.264/AVC video in an MP4 container.
- Cached Shot audio is mixed in an `OfflineAudioContext` and encoded to AAC when present.
- Output frames are generated sequentially at the exact Shot FPS from the shared director-frame renderer.
- Missing cached audio is reported; it is never silently substituted.
- Browsers without WebCodecs H.264 support fail explicitly instead of producing a mislabeled WebM file.
- Browser in-memory reference export is limited to a 300-second Shot to protect memory.

## Gate 2 acceptance checklist

- [x] deterministic frame timeline engine
- [x] frame stepping and frame-quantized playback
- [x] waveform-backed real audio import for dialogue/music/SFX/ambience
- [x] Web Audio playback and offline mixdown
- [x] frame-accurate markers and notes
- [x] H.264/AAC MP4 reference export path
- [x] OTIO import/export and frame round-trip tests
- [x] old `pds-1` project compatibility
- [ ] PR head passes Ubuntu + Windows static audit, tests and production build
- [ ] merged `main` commit passes the same Ubuntu + Windows matrix

Gate 2 is complete only when both CI conditions above are satisfied.
