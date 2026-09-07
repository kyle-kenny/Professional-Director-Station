import { DirectorViewport } from './engine/DirectorViewport';
import { DirectorFrameCanvas } from './components/DirectorFrameCanvas';
import { FloorPlanCanvas } from './components/FloorPlanCanvas';
import { Inspector } from './components/Inspector';
import { ProjectSidebar } from './components/ProjectSidebar';
import { TimelinePanel } from './components/TimelinePanel';
import { ReviewWorkspace } from './components/ReviewWorkspace';
import { PipelineWorkspace } from './components/PipelineWorkspace';
import { AIWorkspace } from './components/AIWorkspace';
import { AssetLibraryPanel } from './components/AssetLibraryPanel';
import { TopBar } from './components/TopBar';
import { useDirectorStore } from './store/directorStore';

export default function App() {
  const mode = useDirectorStore((state) => state.mode);
  const approved = useDirectorStore((state) => state.getActiveShot().status === 'APPROVED');
  const assetMode = mode === 'assets';
  return <div className="app"><TopBar/><div className={`workspace${assetMode ? ' assets-mode' : ''}${approved ? ' approved-readonly' : ''}`}><ProjectSidebar/><main className="stage">{mode === '3d' && <DirectorViewport/>}{mode === 'floorplan' && <FloorPlanCanvas/>}{mode === 'frame' && <DirectorFrameCanvas/>}{mode === 'timeline' && <TimelinePanel/>}{mode === 'assets' && <div className="asset-stage"><AssetLibraryPanel/></div>}{mode === 'review' && <ReviewWorkspace/>}{mode === 'pipeline' && <PipelineWorkspace/>}{mode === 'ai' && <AIWorkspace/>}</main>{!assetMode && <Inspector/>}</div></div>;
}
