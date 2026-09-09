import { lazy, Suspense } from 'react';
import { Inspector } from './components/Inspector';
import { ProjectSidebar } from './components/ProjectSidebar';
import { TopBar } from './components/TopBar';
import { useDirectorStore } from './store/directorStore';

const DirectorConsole3D = lazy(() => import('./components/DirectorConsole3D').then((module) => ({ default: module.DirectorConsole3D })));
const DirectorFrameCanvas = lazy(() => import('./components/DirectorFrameCanvas').then((module) => ({ default: module.DirectorFrameCanvas })));
const FloorPlanCanvas = lazy(() => import('./components/FloorPlanCanvas').then((module) => ({ default: module.FloorPlanCanvas })));
const TimelinePanel = lazy(() => import('./components/TimelinePanel').then((module) => ({ default: module.TimelinePanel })));
const ReviewWorkspace = lazy(() => import('./components/ReviewWorkspace').then((module) => ({ default: module.ReviewWorkspace })));
const PipelineWorkspace = lazy(() => import('./components/PipelineWorkspace').then((module) => ({ default: module.PipelineWorkspace })));
const AIWorkspace = lazy(() => import('./components/AIWorkspace').then((module) => ({ default: module.AIWorkspace })));
const AssetLibraryPanel = lazy(() => import('./components/AssetLibraryPanel').then((module) => ({ default: module.AssetLibraryPanel })));

export default function App() {
  const mode = useDirectorStore((state) => state.mode);
  const approved = useDirectorStore((state) => state.getActiveShot().status === 'APPROVED');
  const assetMode = mode === 'assets';
  return <div className="app"><TopBar/><div className={`workspace${assetMode ? ' assets-mode' : ''}${approved ? ' approved-readonly' : ''}`}><ProjectSidebar/><main className="stage"><Suspense fallback={<div className="stage-loading"><div className="brand-mark">PDS</div><span>正在加载工作区…</span></div>}>{mode === '3d' && <DirectorConsole3D/>}{mode === 'floorplan' && <FloorPlanCanvas/>}{mode === 'frame' && <DirectorFrameCanvas/>}{mode === 'timeline' && <TimelinePanel/>}{mode === 'assets' && <div className="asset-stage"><AssetLibraryPanel/></div>}{mode === 'review' && <ReviewWorkspace/>}{mode === 'pipeline' && <PipelineWorkspace/>}{mode === 'ai' && <AIWorkspace/>}</Suspense></main>{!assetMode && <Inspector/>}</div></div>;
}
