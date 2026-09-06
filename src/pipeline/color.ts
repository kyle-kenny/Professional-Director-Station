import type { DirectorProject } from '../domain/model';
import { sha256Text } from '../utils/sha256';

export type ColorPipelineManifest = {
  schema: 'pds-color-1';
  ocioVersion: '2.5';
  configUri: string;
  configHashSha256?: string;
  acesVersion: '2.0';
  workingSpace: string;
  interchangeSpace: string;
  display: string;
  view: string;
};

export function createColorPipelineManifest(project: DirectorProject): ColorPipelineManifest {
  const color = project.pipeline.color;
  return {
    schema: 'pds-color-1', ocioVersion: color.ocioVersion, configUri: color.ocioConfigUri, configHashSha256: color.ocioConfigHashSha256,
    acesVersion: color.acesVersion, workingSpace: color.workingSpace, interchangeSpace: color.interchangeSpace, display: color.display, view: color.view,
  };
}

export function serializeColorPipelineManifest(project: DirectorProject): string {
  return JSON.stringify(createColorPipelineManifest(project), null, 2);
}

export function colorPipelineFingerprint(project: DirectorProject): string {
  return sha256Text(JSON.stringify(createColorPipelineManifest(project)));
}

export function validateColorPipeline(project: DirectorProject): string[] {
  const color = project.pipeline.color;
  const errors: string[] = [];
  if (color.ocioVersion !== '2.5') errors.push('unsupported-ocio-version');
  if (color.acesVersion !== '2.0') errors.push('unsupported-aces-version');
  if (color.workingSpace !== 'ACEScg') errors.push('working-space-not-ACEScg');
  if (color.interchangeSpace !== 'ACES2065-1') errors.push('interchange-space-not-ACES2065-1');
  if (!color.ocioConfigUri) errors.push('missing-ocio-config-uri');
  return errors;
}

export function createAcesMetadataSidecar(project: DirectorProject): string {
  const color = project.pipeline.color;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<acesMetadataFile version="2.0">\n  <amfInfo>\n    <description>PDS project ${xml(project.id)}</description>\n  </amfInfo>\n  <pipeline>\n    <inputTransform applied="false"><description>${xml(color.interchangeSpace)}</description></inputTransform>\n    <lookTransform applied="false"><description>${xml(color.workingSpace)}</description></lookTransform>\n    <outputTransform applied="false"><description>${xml(`${color.display} / ${color.view}`)}</description></outputTransform>\n  </pipeline>\n</acesMetadataFile>\n`;
}

const xml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
