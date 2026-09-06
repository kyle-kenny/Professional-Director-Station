import { Box, Download, Film, LayoutDashboard, Map, Upload } from 'lucide-react';
import { useRef } from 'react';
import { useDirectorStore } from '../store/directorStore';

export function TopBar(){const mode=useDirectorStore(s=>s.mode);const set=useDirectorStore(s=>s.setMode);const exportProject=useDirectorStore(s=>s.exportProject);const importProject=useDirectorStore(s=>s.importProject);const input=useRef<HTMLInputElement>(null);
 const download=()=>{const blob=new Blob([exportProject()],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='professional-director-station.pds.json';a.click();URL.revokeObjectURL(url)};
 const open=(f?:File)=>{if(!f)return;const r=new FileReader();r.onload=()=>{try{importProject(String(r.result))}catch(e){alert(`工程文件验证失败：${e instanceof Error?e.message:'unknown'}`)}};r.readAsText(f)};
 return <header className="topbar"><div className="brand"><div className="brand-mark">PDS</div><div><strong>Professional Director Station</strong><small>Digital Director Workspace</small></div></div><nav>
  <button className={mode==='3d'?'active':''} onClick={()=>set('3d')}><Box size={16}/>3D 导演台</button>
  <button className={mode==='floorplan'?'active':''} onClick={()=>set('floorplan')}><Map size={16}/>2D 站位</button>
  <button className={mode==='frame'?'active':''} onClick={()=>set('frame')}><LayoutDashboard size={16}/>2D 构图</button>
  <button className={mode==='timeline'?'active':''} onClick={()=>set('timeline')}><Film size={16}/>时间线/声音</button>
 </nav><div className="top-actions"><input ref={input} type="file" accept="application/json,.json" hidden onChange={e=>open(e.target.files?.[0])}/><button onClick={()=>input.current?.click()} title="导入工程"><Upload size={16}/></button><button onClick={download} title="导出工程"><Download size={16}/></button></div></header>}
