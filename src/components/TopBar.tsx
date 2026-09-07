import { Box, Cable, Download, Film, LayoutDashboard, Map, Package, Redo2, Sparkles, Undo2, Upload, Users } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useDirectorStore } from '../store/directorStore';
import { uiZh, workspaceZh } from '../i18n/zhCN';

export function TopBar() {
  const mode = useDirectorStore((s) => s.mode); const setMode = useDirectorStore((s) => s.setMode); const exportProject = useDirectorStore((s) => s.exportProject); const importProject = useDirectorStore((s) => s.importProject); const undo = useDirectorStore((s) => s.undo); const redo = useDirectorStore((s) => s.redo); const canUndo = useDirectorStore((s) => s.undoStack.length > 0); const canRedo = useDirectorStore((s) => s.redoStack.length > 0); const approved = useDirectorStore((s) => s.getActiveShot().status === 'APPROVED'); const input = useRef<HTMLInputElement>(null);
  useEffect(() => { const onKeyDown = (event: KeyboardEvent) => { const target = event.target as HTMLElement | null; const editable = target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName ?? ''); if (editable || approved || !(event.ctrlKey || event.metaKey)) return; const key = event.key.toLowerCase(); if (key === 'z') { event.preventDefault(); if (event.shiftKey) redo(); else undo(); } else if (key === 'y') { event.preventDefault(); redo(); } }; window.addEventListener('keydown', onKeyDown); return () => window.removeEventListener('keydown', onKeyDown); }, [approved, redo, undo]);
  const download = () => { const blob = new Blob([exportProject()], { type: 'application/json' }); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'professional-director-station.pds.json'; anchor.click(); URL.revokeObjectURL(url); };
  const open = (file?: File) => { if (!file) return; const reader = new FileReader(); reader.onload = () => { try { importProject(String(reader.result)); } catch (error) { alert(`工程文件验证失败：${error instanceof Error ? error.message : '未知错误'}`); } }; reader.readAsText(file); };
  return <header className="topbar"><div className="brand"><div className="brand-mark">PDS</div><div><strong>{uiZh.projectTitle}</strong><small>数字化导演制作工作区</small></div></div><nav>
    <button className={mode === '3d' ? 'active' : ''} onClick={() => setMode('3d')}><Box size={16}/>{workspaceZh['3d']}</button>
    <button className={mode === 'floorplan' ? 'active' : ''} onClick={() => setMode('floorplan')}><Map size={16}/>{workspaceZh.floorplan}</button>
    <button className={mode === 'frame' ? 'active' : ''} onClick={() => setMode('frame')}><LayoutDashboard size={16}/>{workspaceZh.frame}</button>
    <button className={mode === 'timeline' ? 'active' : ''} onClick={() => setMode('timeline')}><Film size={16}/>{workspaceZh.timeline}</button>
    <button className={mode === 'assets' ? 'active' : ''} onClick={() => setMode('assets')}><Package size={16}/>{workspaceZh.assets}</button>
    <button className={mode === 'review' ? 'active' : ''} onClick={() => setMode('review')}><Users size={16}/>{workspaceZh.review}</button>
    <button className={mode === 'pipeline' ? 'active' : ''} onClick={() => setMode('pipeline')}><Cable size={16}/>{workspaceZh.pipeline}</button>
    <button className={mode === 'ai' ? 'active' : ''} onClick={() => setMode('ai')}><Sparkles size={16}/>{workspaceZh.ai}</button>
  </nav><div className="top-actions"><button onClick={undo} disabled={approved || !canUndo} title={approved ? '已批准镜头为只读' : '撤销 Ctrl/Cmd+Z'} aria-label="撤销"><Undo2 size={16}/></button><button onClick={redo} disabled={approved || !canRedo} title={approved ? '已批准镜头为只读' : '重做 Ctrl/Cmd+Shift+Z / Ctrl+Y'} aria-label="重做"><Redo2 size={16}/></button><input ref={input} type="file" accept="application/json,.json" hidden onChange={(e) => open(e.target.files?.[0])}/><button onClick={() => input.current?.click()} title={uiZh.loadProject}><Upload size={16}/></button><button onClick={download} title={uiZh.saveProject}><Download size={16}/></button></div></header>;
}
