import { FloatingPanel } from './FloatingPanel';

export function EnvironmentLightPanel({ onPreset }: { onPreset?: (preset: string) => void }) {
  return <FloatingPanel title="环境光">
    <div className="environment-light-controls">
      {['棚拍', '正午', '阴天', '黄昏', '月夜', '恐怖'].map((preset) => (
        <button key={preset} onClick={() => onPreset?.(preset)}>{preset}</button>
      ))}
    </div>
  </FloatingPanel>;
}
