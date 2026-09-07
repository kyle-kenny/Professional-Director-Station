import type { Actor } from '../domain/model';

export type OpenCharacterVariant = 'teen-male' | 'teen-female' | 'regular-male' | 'regular-female' | 'superhero-male' | 'superhero-female';

export type OpenCharacterDescriptor = {
  id: OpenCharacterVariant;
  label: string;
  modelFile: string;
  sourcePack: 'Quaternius Universal Base Characters';
  license: 'CC0-1.0';
  author: 'Quaternius';
};

const ROOT = '/assets/vendor/quaternius/universal-base-characters';

export const openCharacterCatalog: Record<OpenCharacterVariant, OpenCharacterDescriptor> = {
  'teen-male': { id: 'teen-male', label: '少年男性', modelFile: 'Teen_Male_FullBody.gltf', sourcePack: 'Quaternius Universal Base Characters', license: 'CC0-1.0', author: 'Quaternius' },
  'teen-female': { id: 'teen-female', label: '少年女性', modelFile: 'Teen_Female_FullBody.gltf', sourcePack: 'Quaternius Universal Base Characters', license: 'CC0-1.0', author: 'Quaternius' },
  'regular-male': { id: 'regular-male', label: '成年男性', modelFile: 'Regular_Male_FullBody.gltf', sourcePack: 'Quaternius Universal Base Characters', license: 'CC0-1.0', author: 'Quaternius' },
  'regular-female': { id: 'regular-female', label: '成年女性', modelFile: 'Regular_Female_FullBody.gltf', sourcePack: 'Quaternius Universal Base Characters', license: 'CC0-1.0', author: 'Quaternius' },
  'superhero-male': { id: 'superhero-male', label: '强壮男性', modelFile: 'Superhero_Male_FullBody.gltf', sourcePack: 'Quaternius Universal Base Characters', license: 'CC0-1.0', author: 'Quaternius' },
  'superhero-female': { id: 'superhero-female', label: '强壮女性', modelFile: 'Superhero_Female_FullBody.gltf', sourcePack: 'Quaternius Universal Base Characters', license: 'CC0-1.0', author: 'Quaternius' },
};

export function resolveOpenCharacter(actor: Actor): OpenCharacterDescriptor {
  const female = actor.demographics.sex === 'female';
  if (actor.demographics.ageGroup === 'child' || actor.demographics.ageGroup === 'teen') {
    return openCharacterCatalog[female ? 'teen-female' : 'teen-male'];
  }
  return openCharacterCatalog[female ? 'regular-female' : 'regular-male'];
}

export const characterModelUrl = (descriptor: OpenCharacterDescriptor) => `${ROOT}/${descriptor.modelFile}`;

export function characterAgeTreatment(actor: Actor) {
  if (actor.demographics.ageGroup === 'child') return { label: '儿童比例', sourceBase: 'Teen', posturePitchRad: 0 };
  if (actor.demographics.ageGroup === 'elderly') return { label: '老年姿态', sourceBase: 'Regular', posturePitchRad: -0.09 };
  return { label: actor.demographics.ageGroup === 'teen' ? '青少年比例' : '成年比例', sourceBase: actor.demographics.ageGroup === 'teen' ? 'Teen' : 'Regular', posturePitchRad: actor.demographics.posture === 'relaxed' ? -0.025 : 0 };
}
