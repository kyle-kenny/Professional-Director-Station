# PDS HTTP AI Generation Protocol

A `pds-http` model Profile points to one HTTPS inference endpoint. PDS sends one JSON generation envelope with `Content-Type: application/json`. If the operator entered a runtime credential, PDS adds it as `Authorization: Bearer <token>`; the token is not part of the JSON payload and is never persisted.

## Request

The request schema identifier is `pds-ai-generation-1` and includes:

```json
{
  "schema": "pds-ai-generation-1",
  "task": "storyboard | video",
  "projectId": "project-id",
  "source": {
    "shotId": "shot-id",
    "shotVersion": 3,
    "shotHashSha256": "...",
    "frame": 48,
    "fps": 24
  },
  "profile": {
    "id": "studio-video",
    "label": "Studio Video",
    "provider": "pds-http",
    "modelId": "model-name",
    "revision": "model-revision",
    "parameters": {}
  },
  "prompt": "...",
  "negativePrompt": "...",
  "promptHashSha256": "...",
  "controls": { "schema": "pds-ai-controls-1" },
  "controlSequence": [],
  "controlHashSha256": "..."
}
```

`source.frame` is present for Storyboard requests. Video requests include `controlSequence`, a bounded sampling of the whole Shot with first and last frames retained. The `controls` object is the active-frame structural reference and contains camera, Pose, Depth, Lineart and light data.

The endpoint must treat source Shot and control metadata as immutable request context. It must not return patched PDS Project/Shot JSON for automatic application.

## Response

Return HTTP 2xx and JSON containing either inline media or a media URL:

```json
{
  "mediaBase64": "...",
  "mimeType": "image/png",
  "jobId": "provider-job-id",
  "seed": 12345
}
```

or

```json
{
  "mediaUrl": "https://media.example/result.mp4",
  "mimeType": "video/mp4",
  "jobId": "provider-job-id",
  "seed": 12345
}
```

For a failure, use a non-2xx HTTP status and/or:

```json
{ "error": "human-readable error" }
```

PDS bounds inline base64 media to 256 MiB. Larger outputs should use `mediaUrl`. PDS records failed attempts with the original Shot/Profile/Prompt/Control hashes.

## Security and production notes

- Non-local endpoints must use HTTPS.
- Plain HTTP is accepted only for localhost development.
- Runtime bearer tokens are memory-only UI state.
- The default client request timeout is 120 seconds.
- PDS does not persist provider secrets in Project files.
- Media returned by the provider is not director-approved automatically.
- Generated media must pass the PDS approval state before Asset Registry promotion.
- Provider-specific metadata needed for reproducibility should be represented as stable Profile parameters/model revision, not hidden server defaults where possible.
