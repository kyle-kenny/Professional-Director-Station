import { Box, Camera, Clapperboard, Film, Lightbulb, Music2, Users } from 'lucide-react';
import { useDirectorStore } from '../store/directorStore';

export function ProjectSidebar() {
  const project = useDirectorStore((state) => state.project);
  const shot = useDirectorStore((state) => state.getActiveShot());
  return <aside className="sidebar">
    <div className="project-label">工程</div><h2>{project.name}</h2>
    <div className="tree"><div><Film size={15}/> {project.sequences[0].name}</div><div className="tree-child"><Clapperboard size={15}/> {shot.name}</div></div>
    <div className="project-label">镜头内容</div>
    <div className="tree"><div><Users size={15}/> 人物 <span>{shot.actors.length}</span></div><div><Camera size={15}/> 摄影机 <span>1</span></div><div><Lightbulb size={15}/> 灯光 <span>{shot.lights.length}</span></div><div><Music2 size={15}/> 音频 <span>{shot.audio.length}</span></div><div><Box size={15}/> 资产 <span>{project.assets.length}</span></div></div>
    <div className="coord-card"><b>制作管线空间</b><span>右手坐标系 · Y 轴向上 · -Z 向前</span><span>线性单位：米</span><span>工程结构版本：{project.schemaVersion}</span></div>
  </aside>;
}
