import { describe, expect, it } from 'vitest';
import { createDefaultProject } from '../domain/defaultProject';
import { projectSchema } from '../domain/model';
import { lightingPresets } from '../domain/presets';
import { actorPresetList, createActorFromPreset } from '../domain/actorLibrary';
import { focalLengthToVerticalFovDeg, projectWorldToFrame } from '../utils/math';
import { validateAssetForPipeline } from '../utils/assetRules';

describe('industrial project contract',()=>{
 it('validates the default project and fixed coordinate convention',()=>{
  const p=projectSchema.parse(createDefaultProject());
  expect(p.coordinateConvention).toEqual({handedness:'right',upAxis:'Y',forwardAxis:'-Z',linearUnit:'meter'});
 });
 it('ships the complete standard directing cast',()=>{
  expect(actorPresetList).toHaveLength(8);
  const coverage=new Set(actorPresetList.map(p=>`${p.sex}:${p.ageGroup}`));
  for(const sex of ['male','female']) for(const age of ['child','teen','adult','elderly']) expect(coverage.has(`${sex}:${age}`)).toBe(true);
  for(const p of actorPresetList){const actor=createActorFromPreset(p.id,1);expect(()=>projectSchema.parse({...createDefaultProject(),sequences:[{...createDefaultProject().sequences[0],shots:[{...createDefaultProject().sequences[0].shots[0],actors:[actor]}]}]})).not.toThrow();expect(actor.eyeHeight).toBeLessThan(actor.demographics.heightM);}
  expect(createActorFromPreset('boy-child',1).demographics.heightM).toBeLessThan(createActorFromPreset('man-adult',1).demographics.heightM);
  expect(createActorFromPreset('woman-elderly',1).demographics.posture).toBe('elderly');
 });
 it('provides valid director lighting presets',()=>{
  for(const preset of Object.values(lightingPresets)){expect(preset.lights.length).toBeGreaterThan(0);for(const light of preset.lights){expect(light.intensity).toBeGreaterThanOrEqual(0);expect(light.colorTemperatureK).toBeGreaterThanOrEqual(1000)}}
 });
 it('converts lens math deterministically',()=>{
  expect(focalLengthToVerticalFovDeg(50,36,16/9)).toBeCloseTo(22.9,1);
 });
 it('projects the dialogue actors into frame',()=>{
  const shot=createDefaultProject().sequences[0].shots[0];
  for(const actor of shot.actors){const p=projectWorldToFrame({x:actor.transform.position.x,y:actor.eyeHeight,z:actor.transform.position.z},shot.camera);expect(p.visible).toBe(true);expect(p.x).toBeGreaterThan(0);expect(p.x).toBeLessThan(1)}
 });
 it('rejects non-normalized asset metadata',()=>{
  const errors=validateAssetForPipeline({id:'Bad Asset',name:'Bad',category:'prop',version:'v1',uri:'chair.glb',license:'MIT',owner:'test',unitScaleMeters:.01,diagnostics:[]});
  expect(errors.length).toBeGreaterThanOrEqual(3);
 });
});