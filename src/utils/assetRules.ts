import type { AssetRef } from '../domain/model';

export const ASSET_NAMING = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function validateAssetForPipeline(asset: AssetRef): string[] {
  const errors: string[] = [];
  if (!ASSET_NAMING.test(asset.id)) errors.push('Asset ID 必须使用小写 kebab-case。');
  if (Math.abs(asset.unitScaleMeters - 1) > 1e-6) errors.push('进入导演台的标准资产必须换算为米制 1:1。');
  if (!asset.uri.includes('/')) errors.push('Asset URI 应使用规范化项目路径，而不是裸文件名。');
  if (!asset.version) errors.push('Asset 必须带版本。');
  return errors;
}
