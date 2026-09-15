import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { captureStageRenderPasses, stageRenderPassKinds } from './rendering/stageRenderPasses';
import { useDirectorStore } from './store/directorStore';
import './styles.css';
import './editorial.css';
import './review.css';
import './pipeline.css';
import './ai.css';
import './assets-workspace.css';
import './visual-stage.css';
import './integrity.css';
import './pose.css';
import './director-console.css';

declare global {
  interface Window {
    __pdsAuditCaptureStageRenderPasses?: () => Promise<{
      schema: string;
      shotId: string;
      frame: number;
      bundleHashSha256: string;
      passes: Record<string, { prefix: string; base64Length: number; contentHashSha256: string }>;
    }>;
  }
}

if (new URLSearchParams(window.location.search).get('pds-audit') === '1') {
  window.__pdsAuditCaptureStageRenderPasses = async () => {
    const state = useDirectorStore.getState();
    const shot = state.getActiveShot();
    const frame = Math.max(0, Math.round(state.playhead * shot.fps));
    const bundle = await captureStageRenderPasses(shot, frame, 320, 180);
    return {
      schema: bundle.schema,
      shotId: bundle.shotId,
      frame: bundle.frame,
      bundleHashSha256: bundle.bundleHashSha256,
      passes: Object.fromEntries(stageRenderPassKinds.map((kind) => [kind, {
        prefix: bundle.passes[kind].dataBase64.slice(0, 12),
        base64Length: bundle.passes[kind].dataBase64.length,
        contentHashSha256: bundle.passes[kind].contentHashSha256,
      }])),
    };
  };
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary><App /></AppErrorBoundary>
  </StrictMode>,
);
