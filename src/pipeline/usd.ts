import * as THREE from 'three';
import type { DirectorProject, Shot, Vec3 } from '../domain/model';
import { canonicalJson } from '../utils/sha256';

const USD_METERS_PER_UNIT = 1;
const safeName = (value: string) => { const clean = value.normalize('NFKD').replace(/[^A-Za-z0-9_]/g, '_').replace(/^([0-9])/, '_$1'); return clean || 'Item'; };
const q = (value: string) => JSON.stringify(value);
const n = (value: number) => Number(value.toFixed(9));
const vec = (value: Vec3) => `(${n(value.x)}, ${n(value.y)}, ${n(value.z)})`;
const degVec = (value: Vec3) => `(${n(value.x * 180 / Math.PI)}, ${n(value.y * 180 / Math.PI)}, ${n(value.z * 180 / Math.PI)})`;

export function millimetersToUsdCameraUnits(mm: number, metersPerUnit = USD_METERS_PER_UNIT): number {
  if (!Number.isFinite(mm) || mm <= 0 || !Number.isFinite(metersPerUnit) || metersPerUnit <= 0) throw new Error('Invalid camera unit conversion input.');
  return mm / (100 * metersPerUnit);
}

export function cameraTransformToUsdMatrix(position: Vec3, target: Vec3): string {
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(position.x, position.y, position.z);
  camera.up.set(0, 1, 0);
  camera.lookAt(target.x, target.y, target.z);
  camera.updateMatrix();
  const e = camera.matrix.elements.map(n);
  return `((${e[0]}, ${e[1]}, ${e[2]}, ${e[3]}), (${e[4]}, ${e[5]}, ${e[6]}, ${e[7]}), (${e[8]}, ${e[9]}, ${e[10]}, ${e[11]}), (${e[12]}, ${e[13]}, ${e[14]}, ${e[15]}))`;
}

export function shotToUsda(project: DirectorProject, shot: Shot): string {
  const payload = btoaUtf8(canonicalJson({ projectId: project.id, shot }));
  const lines = ['#usda 1.0','(','    defaultPrim = "PDS"',`    metersPerUnit = ${USD_METERS_PER_UNIT}`,'    upAxis = "Y"',`    timeCodesPerSecond = ${shot.fps}`,`    framesPerSecond = ${shot.fps}`,')','','def Xform "PDS" (','    customData = {',`        string pds:projectId = ${q(project.id)}`,`        string pds:shotId = ${q(shot.id)}`,`        string pds:payloadBase64 = ${q(payload)}`,'        string pds:coordinateConvention = "right-handed,Y-up,-Z-forward,meter"','    }',')','{','    def Scope "Actors"','    {'];
  for (const actor of shot.actors) {
    const name = safeName(actor.id);
    lines.push(`        def Xform "${name}"`,'        {',`            custom string pds:name = ${q(actor.name)}`,`            double3 xformOp:translate = ${vec(actor.transform.position)}`,`            double3 xformOp:rotateXYZ = ${degVec(actor.transform.rotation)}`,`            double3 xformOp:scale = ${vec(actor.transform.scale)}`,'            uniform token[] xformOpOrder = ["xformOp:translate", "xformOp:rotateXYZ", "xformOp:scale"]');
    if (actor.asset) lines.push(`            custom asset pds:assetReference = @${actor.asset.uri}@`);
    if (actor.path.length) {
      lines.push('            double3 xformOp:translate.timeSamples = {');
      actor.path.forEach((key, index) => lines.push(`                ${Math.round(key.time * shot.fps)}: ${vec(key.position)}${index === actor.path.length - 1 ? '' : ','}`));
      lines.push('            }','            double3 xformOp:rotateXYZ.timeSamples = {');
      actor.path.forEach((key, index) => lines.push(`                ${Math.round(key.time * shot.fps)}: ${degVec(key.rotation ?? actor.transform.rotation)}${index === actor.path.length - 1 ? '' : ','}`));
      lines.push('            }');
    }
    lines.push('        }');
  }

  const focalUsd = millimetersToUsdCameraUnits(shot.camera.focalLengthMm);
  const horizontalApertureUsd = millimetersToUsdCameraUnits(shot.camera.sensorWidthMm);
  const verticalApertureUsd = millimetersToUsdCameraUnits(shot.camera.sensorWidthMm / shot.frameAspect);
  lines.push('    }','    def Camera "Camera"','    {','        token projection = "perspective"',`        matrix4d xformOp:transform = ${cameraTransformToUsdMatrix(shot.camera.position, shot.camera.target)}`,'        uniform token[] xformOpOrder = ["xformOp:transform"]',`        float focalLength = ${n(focalUsd)}`,`        float horizontalAperture = ${n(horizontalApertureUsd)}`,`        float verticalAperture = ${n(verticalApertureUsd)}`,`        float focusDistance = ${n(shot.camera.focusDistanceM / USD_METERS_PER_UNIT)}`,`        float fStop = ${n(shot.camera.aperture)}`,`        custom double3 pds:target = ${vec(shot.camera.target)}`,`        custom double pds:frameAspect = ${n(shot.frameAspect)}`);
  if (shot.camera.path.length) {
    lines.push('        matrix4d xformOp:transform.timeSamples = {');
    shot.camera.path.forEach((key, index) => lines.push(`            ${Math.round(key.time * shot.fps)}: ${cameraTransformToUsdMatrix(key.position, key.target)}${index === shot.camera.path.length - 1 ? '' : ','}`));
    lines.push('        }','        float focalLength.timeSamples = {');
    shot.camera.path.forEach((key, index) => lines.push(`            ${Math.round(key.time * shot.fps)}: ${n(millimetersToUsdCameraUnits(key.focalLengthMm ?? shot.camera.focalLengthMm))}${index === shot.camera.path.length - 1 ? '' : ','}`));
    lines.push('        }','        custom double3 pds:target.timeSamples = {');
    shot.camera.path.forEach((key, index) => lines.push(`            ${Math.round(key.time * shot.fps)}: ${vec(key.target)}${index === shot.camera.path.length - 1 ? '' : ','}`));
    lines.push('        }');
  }

  lines.push('    }','    def Scope "Lights"','    {');
  for (const light of shot.lights) {
    lines.push(`        def Xform "${safeName(light.id)}"`,'        {',`            custom string pds:type = ${q(light.type)}`,`            double3 xformOp:translate = ${vec(light.position)}`,'            uniform token[] xformOpOrder = ["xformOp:translate"]',`            custom float pds:intensity = ${n(light.intensity)}`,`            custom float pds:colorTemperatureK = ${n(light.colorTemperatureK)}`,`            custom bool pds:castShadow = ${light.castShadow ? 'true' : 'false'}`);
    if (light.target) lines.push(`            custom double3 pds:target = ${vec(light.target)}`);
    if (light.path.length) {
      lines.push('            double3 xformOp:translate.timeSamples = {');
      light.path.forEach((key, index) => lines.push(`                ${Math.round(key.time * shot.fps)}: ${vec(key.position)}${index === light.path.length - 1 ? '' : ','}`));
      lines.push('            }','            custom float pds:intensity.timeSamples = {');
      light.path.forEach((key, index) => lines.push(`                ${Math.round(key.time * shot.fps)}: ${n(key.intensity ?? light.intensity)}${index === light.path.length - 1 ? '' : ','}`));
      lines.push('            }','            custom float pds:colorTemperatureK.timeSamples = {');
      light.path.forEach((key, index) => lines.push(`                ${Math.round(key.time * shot.fps)}: ${n(key.colorTemperatureK ?? light.colorTemperatureK)}${index === light.path.length - 1 ? '' : ','}`));
      lines.push('            }');
      if (light.target || light.path.some((key) => key.target)) {
        lines.push('            custom double3 pds:target.timeSamples = {');
        light.path.forEach((key, index) => lines.push(`                ${Math.round(key.time * shot.fps)}: ${vec(key.target ?? light.target ?? { x: 0, y: 1.2, z: 0 })}${index === light.path.length - 1 ? '' : ','}`));
        lines.push('            }');
      }
    }
    lines.push('        }');
  }
  lines.push('    }','}',''); return lines.join('\n');
}

export function projectToUsda(project: DirectorProject): string { const first = project.sequences[0]?.shots[0]; if (!first) throw new Error('USD export requires at least one Shot.'); return shotToUsda(project, first); }
export function parsePdsUsda(usda: string): { projectId: string; shot: Shot } {
  if (!usda.startsWith('#usda 1.0')) throw new Error('Not a USDA 1.0 document.');
  if (!/metersPerUnit\s*=\s*1(?:\D|$)/.test(usda)) throw new Error('USD stage must declare metersPerUnit = 1.');
  if (!/upAxis\s*=\s*"Y"/.test(usda)) throw new Error('USD stage must declare Y upAxis.');
  const match = usda.match(/string pds:payloadBase64\s*=\s*"([^"]+)"/); if (!match) throw new Error('PDS USD payload metadata is missing.');
  return JSON.parse(atobUtf8(match[1]));
}
export function validatePdsUsda(usda: string): string[] {
  const errors: string[] = [];
  if (!usda.startsWith('#usda 1.0')) errors.push('missing-usda-header');
  if (!usda.includes('metersPerUnit = 1')) errors.push('meters-per-unit');
  if (!usda.includes('upAxis = "Y"')) errors.push('up-axis');
  if (!usda.includes('timeCodesPerSecond')) errors.push('timecode-rate');
  if (!usda.includes('pds:payloadBase64')) errors.push('pds-roundtrip-payload');
  if (!usda.includes('matrix4d xformOp:transform')) errors.push('camera-orientation-transform');
  if (!usda.includes('float verticalAperture')) errors.push('camera-vertical-aperture');
  if (!usda.includes('float focusDistance')) errors.push('camera-focus-distance');
  if (!usda.includes('float fStop')) errors.push('camera-f-stop');
  return errors;
}
function btoaUtf8(value: string): string { const bytes = new TextEncoder().encode(value); let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte); return btoa(binary); }
function atobUtf8(value: string): string { const binary = atob(value); return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0))); }
