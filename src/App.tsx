import { DirectorViewport } from './engine/DirectorViewport';
import { DirectorFrameCanvas } from './components/DirectorFrameCanvas';
import { FloorPlanCanvas } from './components/FloorPlanCanvas';
import { Inspector } from './components/Inspector';
import { ProjectSidebar } from './components/ProjectSidebar';
import { TimelinePanel } from './components/TimelinePanel';
import { TopBar } from './components/TopBar';
import { useDirectorStore } from './store/directorStore';

export default function App(){const mode=useDirectorStore(s=>s.mode);return <div className="app"><TopBar/><div className="workspace"><ProjectSidebar/><main className="stage">{mode==='3d'&&<DirectorViewport/>}{mode==='floorplan'&&<FloorPlanCanvas/>}{mode==='frame'&&<DirectorFrameCanvas/>}{mode==='timeline'&&<TimelinePanel/>}</main><Inspector/></div></div>}
