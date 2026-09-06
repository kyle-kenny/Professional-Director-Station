import type { AssetRef, DirectorProject } from '../domain/model';

export type MaterialAssignment = { name: string; assetId: string; materialName: string; sourceUri?: string; colorSpace?: string };

const escapeXml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const attr = (name: string, value: string) => `${name}="${escapeXml(value)}"`;

export function collectMaterialAssignments(project: DirectorProject): MaterialAssignment[] {
  return project.assets.filter((asset) => ['character', 'environment', 'prop', 'vehicle'].includes(asset.category)).map((asset) => ({
    name: `${asset.id}_material`, assetId: asset.id, materialName: 'standard_surface', sourceUri: asset.uri, colorSpace: project.pipeline.color.workingSpace,
  }));
}

export function materialAssignmentsToMtlx(project: DirectorProject, assignments = collectMaterialAssignments(project)): string {
  const lines = [`<?xml version="1.0"?>`, `<materialx version="${project.pipeline.materialXVersion}">`, `  <comment text="PDS MaterialX ${project.pipeline.materialXLibraryRelease}; working space ${escapeXml(project.pipeline.color.workingSpace)}" />`];
  for (const item of assignments) {
    const graph = `NG_${item.name}`;
    const surface = `SR_${item.name}`;
    const material = `MAT_${item.name}`;
    lines.push(`  <nodegraph ${attr('name', graph)}>`, `    <standard_surface ${attr('name', surface)} type="surfaceshader">`, `      <input name="base" type="float" value="1" />`, `      <input name="base_color" type="color3" value="0.5, 0.5, 0.5" ${attr('colorspace', item.colorSpace ?? project.pipeline.color.workingSpace)} />`, '    </standard_surface>', '  </nodegraph>', `  <surfacematerial ${attr('name', material)} type="material">`, `    <input name="surfaceshader" type="surfaceshader" ${attr('nodegraph', graph)} ${attr('output', surface)} />`, '  </surfacematerial>', `  <look ${attr('name', `LOOK_${item.name}`)}>`, `    <materialassign ${attr('name', `MA_${item.name}`)} ${attr('material', material)} ${attr('geom', `/PDS/**/${item.assetId}`)} />`, '  </look>');
  }
  lines.push('</materialx>', '');
  return lines.join('\n');
}

export function parsePdsMaterialX(xml: string): MaterialAssignment[] {
  if (!/<materialx\s+version="1\.39"/.test(xml)) throw new Error('MaterialX 1.39 document required.');
  const assignments: MaterialAssignment[] = [];
  const regex = /<materialassign\s+name="([^"]+)"\s+material="([^"]+)"\s+geom="\/PDS\/\*\*\/([^"]+)"\s*\/>/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(xml))) assignments.push({ name: match[1].replace(/^MA_/, ''), assetId: match[3], materialName: match[2] });
  return assignments;
}

export function materialAssetReference(asset: AssetRef): string {
  return `${asset.id}@${asset.version}:${asset.uri}`;
}
