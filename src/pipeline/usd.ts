import type { DirectorProject, Shot } from '../domain/model';
import { canonicalJson } from '../utils/sha256';

const safeName = (value: string) => { const clean = value.normalize('NFKD').replace(/[^A-Za-z0-9_]/g, '_').replace(/^([0-9])/, '_$1'); return clean || 'Item'; };
const q = (value: string) => JSON.stringify(value);
const vec = (value: { x: number; y: number; z: number }) => `(${value.x}, ${value.y}, ${value.z})`;

export function shotToUsda(project: DirectorProject, shot: Shot): string {
  const payload = btoaUtf8(canonicalJson({ projectId: project.id, shot }));
  const lines = ['#usda 1.0','(','    defaultPrim = "PDS"','    metersPerUnit = 1','    upAxis = "Y"',`    timeCodesPerSecond = ${shot.fps}`,`    framesPerSecond = ${shot.fps}`,')','','def Xform "PDS" (','    customData = {',`        string pds:projectId = ${q(project.id)}`,`        string pds:shotId = ${q(shot.id)}`,`        string pds:payloadBase64 = ${q(payload)}`,'        string pds:coordinateConvention = "right-handed,Y-up,-Z-forward,meter"','    }',')','{','    def Scope "Actors"','    {'];
  for (const actor of shot.actors) {
    const name = safeName(actor.id);
    lines.push(`        def Xform "${name}"`,'        {',`            custom string pds:name = ${q(actor.name)}`,`            double3 xformOp:translate = ${vec(actor.transform.position)}`,`            double3 xformOp:rotateXYZ = (${actor.transform.rotation.x * 180 / Math.PI}, ${actor.transform.rotation.y * 180 / Math.PI}, ${actor.transform.rotation.z * 180 / Math.PI})`,`            double3 xformOp:scale = ${vec(actor.transform.scale)}`,'            uniform token[] xformOpOrder = ["xformOp:translate", "xformOp:rotateXYZ", "xformOp:scale"]');
    if (actor.asset) lines.push(`            custom asset pds:assetReference = @${actor.asset.uri}@`);
    if (actor.path.length) { lines.push('            double3 xformOp:translate.timeSamples = {'); actor.path.forEach((key, index) => lines.push(`                ${Math.round(key.time * shot.fps)}: ${vec(key.position)}${index === actor.path.length - 1 ? '' : ','}`)); lines.push('            }'); }
    lines.push('        }');
  }
  lines.push('    }','    def Camera "Camera"','    {',`        double3 xformOp:translate = ${vec(shot.camera.position)}`,'        uniform token[] xformOpOrder = ["xformOp:translate"]',`        float focalLength = ${shot.camera.focalLengthMm}`,`        float horizontalAperture = ${shot.camera.sensorWidthMm}`,`        custom double3 pds:target = ${vec(shot.camera.target)}`,`        custom float pds:fStop = ${shot.camera.aperture}`,'    }','    def Scope "Lights"','    {');
  for (const light of shot.lights) lines.push(`        def Xform "${safeName(light.id)}"`,'        {',`            custom string pds:type = ${q(light.type)}`,`            double3 xformOp:translate = ${vec(light.position)}`,'            uniform token[] xformOpOrder = ["xformOp:translate"]',`            custom float pds:intensity = ${light.intensity}`,`            custom float pds:colorTemperatureK = ${light.colorTemperatureK}`,'        }');
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
export function validatePdsUsda(usda: string): string[] { const errors: string[] = []; if (!usda.startsWith('#usda 1.0')) errors.push('missing-usda-header'); if (!usda.includes('metersPerUnit = 1')) errors.push('meters-per-unit'); if (!usda.includes('upAxis = "Y"')) errors.push('up-axis'); if (!usda.includes('timeCodesPerSecond')) errors.push('timecode-rate'); if (!usda.includes('pds:payloadBase64')) errors.push('pds-roundtrip-payload'); return errors; }
function btoaUtf8(value: string): string { const bytes = new TextEncoder().encode(value); let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte); return btoa(binary); }
function atobUtf8(value: string): string { const binary = atob(value); return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0))); }
