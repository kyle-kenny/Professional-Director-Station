import { FloatingPanel } from './FloatingPanel';

export function EnvironmentLightPanel({
  onPreset,
  exposure = 1,
  hemisphere = 1,
  onExposureChange,
  onHemisphereChange,
}: {
  onPreset?: (preset: string) => void;
  exposure?: number;
  hemisphere?: number;
  onExposureChange?: (value: number) => void;
  onHemisphereChange?: (value: number) => void;
}) {
  return <FloatingPanel title="环境光">
    <div className="environment-light-controls">
      {['棚拍', '正午', '阴天', '黄昏', '月夜', '恐怖'].map((preset) => (
        <button key={preset} onClick={() => onPreset?.(preset)}>{preset}</button>
      ))}
      <label>
        曝光 {exposure.toFixed(2)}
        <input type="range" min="0" max="3" step="0.01" value={exposure} onChange={(event) => onExposureChange?.(Number(event.target.value))} />
      </label>
      <label>
        天空/地面光 {hemisphere.toFixed(2)}
        <input type="range" min="0" max="2" step="0.01" value={hemisphere} onChange={(event) => onHemisphereChange?.(Number(event.target.value))} />
      </label>
    </div>
  </FloatingPanel>;
}
