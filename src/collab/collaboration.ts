import * as Y from 'yjs';
import type { DirectorProject } from '../domain/model';

/**
 * Collaboration boundary.
 * V1 uses BroadcastChannel for same-browser/multi-tab rehearsal.
 * A production deployment can replace transport with y-websocket, Liveblocks,
 * or an authenticated studio backend without changing the domain model.
 */
export class CollaborationSession {
  readonly doc = new Y.Doc();
  readonly projectMap = this.doc.getMap<string>('project');
  private channel?: BroadcastChannel;

  connectRoom(roomId: string, onRemoteProject: (project: DirectorProject) => void) {
    if (typeof BroadcastChannel === 'undefined') return;
    this.channel = new BroadcastChannel(`pds:${roomId}`);
    this.channel.onmessage = (event) => {
      if (event.data?.type === 'project') onRemoteProject(event.data.project as DirectorProject);
    };
  }

  publishProject(project: DirectorProject) {
    this.projectMap.set('json', JSON.stringify(project));
    this.channel?.postMessage({ type: 'project', project });
  }

  disconnect() {
    this.channel?.close();
    this.doc.destroy();
  }
}
