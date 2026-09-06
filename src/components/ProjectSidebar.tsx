import { Box, Camera, Clapperboard, Film, Lightbulb, Music2, Users } from 'lucide-react';
import { useDirectorStore } from '../store/directorStore';

export function ProjectSidebar(){const p=useDirectorStore(s=>s.project);const shot=useDirectorStore(s=>s.getActiveShot());return <aside className="sidebar">
 <div className="project-label">PROJECT</div><h2>{p.name}</h2>
 <div className="tree"><div><Film size={15}/> {p.sequences[0].name}</div><div className="tree-child"><Clapperboard size={15}/> {shot.name}</div></div>
 <div className="project-label">SHOT CONTENTS</div>
 <div className="tree"><div><Users size={15}/> Characters <span>{shot.actors.length}</span></div><div><Camera size={15}/> Cameras <span>1</span></div><div><Lightbulb size={15}/> Lights <span>{shot.lights.length}</span></div><div><Music2 size={15}/> Audio <span>{shot.audio.length}</span></div><div><Box size={15}/> Assets <span>{p.assets.length}</span></div></div>
 <div className="coord-card"><b>PIPELINE SPACE</b><span>Right-handed · Y-up · -Z forward</span><span>Linear unit: meter</span><span>Schema: {p.schemaVersion}</span></div>
 </aside>}
