import { FloatingPanel } from './FloatingPanel';
import { useDirectorStore } from '../store/directorStore';

export function EnvironmentLightPanel() {
  const setEnvironment = useDirectorStore((state) => state.setEnvironmentPreset);
  return <FloatingPanel title="环境光">
    <div className="environment-light-controls">
      {['棚拍', '正午', '阴天', '黄昏', '月夜', '恐怖'].map((preset) => (
        <button key={preset} onClick={() => setEnvironment(preset)}>{preset}</button>
      ))}
    </div>
  </FloatingPanel>;
}
