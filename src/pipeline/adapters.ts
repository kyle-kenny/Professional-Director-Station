import type { DirectorProject } from '../domain/model';
import { colorPipelineFingerprint } from './color';

export type DccTarget = 'blender' | 'maya' | 'houdini' | 'unreal' | 'nuke' | 'resolve';
export type DccAdapterManifest = {
  schema: 'pds-dcc-package-1';
  target: DccTarget;
  projectId: string;
  sceneUri: string;
  editorialUri: string;
  materialUri: string;
  colorManifestUri: string;
  acesMetadataUri: string;
  coordinateConvention: 'right-handed,Y-up,-Z-forward,meter';
  colorFingerprintSha256: string;
  notes: string[];
};

const notes: Record<DccTarget, string[]> = {
  blender: ['Import USDA with meters enabled.', 'Configure OCIO from the package color manifest before look review.'],
  maya: ['Use USD Stage or MayaUSD proxy shape.', 'Preserve PDS metersPerUnit and Y-up stage metadata.'],
  houdini: ['Reference USDA in Solaris/LOPs.', 'Resolve MaterialX documents through the package material URI.'],
  unreal: ['Import USD at meter scale; PDS stage metadata is authoritative.', 'Use generated proxies for editorial review media.'],
  nuke: ['Use OTIO for editorial timing and OCIO/ACES manifest for color.', 'USD scene is reference geometry, not a Nuke scene replacement.'],
  resolve: ['Use OTIO for timeline exchange.', 'Apply project OCIO/ACES settings before reference comparison.'],
};

export function createDccAdapterManifest(project: DirectorProject, target: DccTarget): DccAdapterManifest {
  return {
    schema: 'pds-dcc-package-1', target, projectId: project.id,
    sceneUri: `${project.pipeline.storageRootUri}/interchange/${project.id}.usda`,
    editorialUri: `${project.pipeline.storageRootUri}/interchange/${project.id}.otio`,
    materialUri: `${project.pipeline.storageRootUri}/interchange/${project.id}.mtlx`,
    colorManifestUri: `${project.pipeline.storageRootUri}/color/pds-color.json`,
    acesMetadataUri: `${project.pipeline.storageRootUri}/color/${project.id}.amf.xml`,
    coordinateConvention: 'right-handed,Y-up,-Z-forward,meter',
    colorFingerprintSha256: colorPipelineFingerprint(project),
    notes: notes[target],
  };
}

export function createPipelinePackageManifest(project: DirectorProject) {
  return {
    schema: 'pds-pipeline-package-1' as const,
    projectId: project.id,
    standards: { usd: project.pipeline.usdTarget, ocio: `OpenColorIO-${project.pipeline.color.ocioVersion}`, aces: `ACES-${project.pipeline.color.acesVersion}`, materialX: `MaterialX-${project.pipeline.materialXVersion}` },
    adapters: project.pipeline.dccTargets.map((target) => createDccAdapterManifest(project, target)),
    proxy: project.pipeline.proxy,
  };
}
