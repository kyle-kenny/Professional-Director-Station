# Gate 3 — Collaboration & Review

Gate 3 turns PDS from a single-workstation project editor into an authenticated, revision-safe department collaboration and review workflow.

## Authenticated project scope

- `PDS_AUTH_SECRET` signs HS256 collaboration tokens on the studio server.
- Tokens carry user, project scope, role, department and expiry.
- Browser WebSocket clients present the signed token through the WebSocket subprotocol; the server verifies signature, expiry and project scope before upgrade.
- Project membership is stored in the project and can further constrain the effective role.
- Roles: owner, director, editor, reviewer, viewer.

## Concurrency safety

- Every authoritative project state has an integer collaboration revision.
- Every mutation carries `baseRevision`; stale revisions are rejected with the current authoritative snapshot.
- Editing requires an active owned Shot/Object lock token.
- Locks are leases with expiration, not permanent flags. The Review workspace renews the current Shot lease while connected.
- Client mutations are serialized. Fast local changes are queued until the prior revision is accepted.
- On conflict the rejected optimistic state is not silently merged: PDS restores the authoritative snapshot and clears stale local Undo/Redo history.
- Clients reconnect with bounded exponential backoff and reacquire current Shot locks.

## Presence and ownership

- Presence publishes authenticated user, department, role, active Shot, selected object and frame.
- Presence and lock tables are ephemeral server state and are never persisted into the project file.
- Disconnect releases locks owned by that connection identity.

## Review and approval

- Frame comments are stored with integer Shot frame numbers.
- Frame annotations use normalized image coordinates and support point/box/freehand domain forms; the Review UI exposes point and box markup directly on the deterministic Director Frame.
- Status transitions are permissioned: WIP → REVIEW requires submit permission; REVIEW → APPROVED requires director/owner approval; APPROVED → WIP creates a new editable version.
- The ordinary Inspector no longer writes Review/Approved directly.

## Immutable versions and rollback

- Review/Approved snapshots are canonical JSON with SHA-256 integrity hashes.
- Historical records are append-only through the Review workflow.
- Restore verifies the hash before parsing.
- Rollback never overwrites an approved snapshot; it restores content into a new WIP version and records an audit event.

## Asset provenance

- Newly ingested GLB/FBX binaries receive a SHA-256 content hash.
- Registry records retain version, license, owner and provenance fields while raw bytes remain in IndexedDB.
- Legacy assets without hashes continue to load but are visibly marked as legacy/unavailable provenance.

## Studio server

```bash
# 32+ character secret
set PDS_AUTH_SECRET=replace-with-studio-secret-on-Windows
npm run collab:server

# issue a project-scoped token
npm run collab:token -- editor-a project-demo editor "Editor A" editorial
```

Use TLS termination and `wss://` in deployed studio environments. The in-memory room store is a transport/reference server boundary; production persistence can replace room storage without changing the client revision/lock protocol.

## Gate 3 acceptance

- [x] signed project-scoped authentication boundary
- [x] owner/director/editor/reviewer/viewer permission matrix
- [x] Presence, Shot/Object lease locks and disconnect cleanup
- [x] revision-based stale write rejection and authoritative rollback
- [x] serialized client mutations and reconnect backoff
- [x] immutable SHA-256 Shot versions and rollback-to-new-WIP
- [x] frame comments and normalized frame annotations
- [x] WIP / REVIEW / APPROVED permissioned workflow
- [x] asset SHA-256 / license / provenance metadata
- [x] auth tamper/expiry smoke gate and conflict/lock/review regression tests
- [ ] PR head passes Windows + Ubuntu CI
- [ ] merged `main` passes the same matrix

Gate 3 is complete only after both CI conditions pass.
