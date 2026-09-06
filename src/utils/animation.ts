import type { Actor, ActorKeyframe, DirectorLight, Easing, LightKeyframe, ShotCamera, Transform, Vec3 } from '../domain/model';

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function ease(value: number, easing: Easing): number {
  const t = clamp01(value);
  if (easing === 'ease-in') return t * t;
  if (easing === 'ease-out') return 1 - (1 - t) * (1 - t);
  if (easing === 'ease-in-out') return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  return t;
}

function lerpVec3(a: Vec3, b: Vec3, t: number): Vec3 {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t) };
}

function lerpAngle(a: number, b: number, t: number): number {
  const tau = Math.PI * 2;
  let delta = (b - a) % tau;
  if (delta > Math.PI) delta -= tau;
  if (delta < -Math.PI) delta += tau;
  return a + delta * t;
}

function lerpRotation(a: Vec3, b: Vec3, t: number): Vec3 {
  return { x: lerpAngle(a.x, b.x, t), y: lerpAngle(a.y, b.y, t), z: lerpAngle(a.z, b.z, t) };
}

function actorFrameRotation(frame: ActorKeyframe, fallback: Vec3): Vec3 {
  return frame.rotation ?? fallback;
}

export function sampleActorTransform(actor: Actor, time: number): Transform {
  if (actor.path.length === 0) return structuredClone(actor.transform);
  const frames = [...actor.path].sort((a, b) => a.time - b.time);
  if (time <= frames[0].time) {
    return { ...structuredClone(actor.transform), position: { ...frames[0].position }, rotation: { ...actorFrameRotation(frames[0], actor.transform.rotation) } };
  }
  const last = frames[frames.length - 1];
  if (time >= last.time) {
    return { ...structuredClone(actor.transform), position: { ...last.position }, rotation: { ...actorFrameRotation(last, actor.transform.rotation) } };
  }
  for (let index = 0; index < frames.length - 1; index += 1) {
    const from = frames[index];
    const to = frames[index + 1];
    if (time < from.time || time > to.time) continue;
    const span = Math.max(1e-6, to.time - from.time);
    const t = ease((time - from.time) / span, from.easing);
    return {
      position: lerpVec3(from.position, to.position, t),
      rotation: lerpRotation(actorFrameRotation(from, actor.transform.rotation), actorFrameRotation(to, actor.transform.rotation), t),
      scale: { ...actor.transform.scale },
    };
  }
  return structuredClone(actor.transform);
}

export function sampleCamera(camera: ShotCamera, time: number): ShotCamera {
  if (camera.path.length === 0) return structuredClone(camera);
  const frames = [...camera.path].sort((a, b) => a.time - b.time);
  if (time <= frames[0].time) {
    return { ...structuredClone(camera), position: { ...frames[0].position }, target: { ...frames[0].target }, focalLengthMm: frames[0].focalLengthMm ?? camera.focalLengthMm };
  }
  const last = frames[frames.length - 1];
  if (time >= last.time) {
    return { ...structuredClone(camera), position: { ...last.position }, target: { ...last.target }, focalLengthMm: last.focalLengthMm ?? camera.focalLengthMm };
  }
  for (let index = 0; index < frames.length - 1; index += 1) {
    const from = frames[index];
    const to = frames[index + 1];
    if (time < from.time || time > to.time) continue;
    const span = Math.max(1e-6, to.time - from.time);
    const t = ease((time - from.time) / span, from.easing);
    return {
      ...structuredClone(camera),
      position: lerpVec3(from.position, to.position, t),
      target: lerpVec3(from.target, to.target, t),
      focalLengthMm: lerp(from.focalLengthMm ?? camera.focalLengthMm, to.focalLengthMm ?? camera.focalLengthMm, t),
    };
  }
  return structuredClone(camera);
}

function lightFrameTarget(frame: LightKeyframe, fallback?: Vec3): Vec3 | undefined {
  return frame.target ?? fallback;
}

export function sampleLight(light: DirectorLight, time: number): DirectorLight {
  if (light.path.length === 0) return structuredClone(light);
  const frames = [...light.path].sort((a, b) => a.time - b.time);
  const applyFrame = (frame: LightKeyframe): DirectorLight => ({
    ...structuredClone(light),
    position: { ...frame.position },
    target: lightFrameTarget(frame, light.target) ? { ...lightFrameTarget(frame, light.target)! } : undefined,
    intensity: frame.intensity ?? light.intensity,
    colorTemperatureK: frame.colorTemperatureK ?? light.colorTemperatureK,
  });
  if (time <= frames[0].time) return applyFrame(frames[0]);
  const last = frames[frames.length - 1];
  if (time >= last.time) return applyFrame(last);
  for (let index = 0; index < frames.length - 1; index += 1) {
    const from = frames[index];
    const to = frames[index + 1];
    if (time < from.time || time > to.time) continue;
    const span = Math.max(1e-6, to.time - from.time);
    const t = ease((time - from.time) / span, from.easing);
    const fromTarget = lightFrameTarget(from, light.target);
    const toTarget = lightFrameTarget(to, light.target);
    const target = fromTarget && toTarget ? lerpVec3(fromTarget, toTarget, t) : fromTarget ?? toTarget;
    return {
      ...structuredClone(light),
      position: lerpVec3(from.position, to.position, t),
      target: target ? { ...target } : undefined,
      intensity: lerp(from.intensity ?? light.intensity, to.intensity ?? light.intensity, t),
      colorTemperatureK: lerp(from.colorTemperatureK ?? light.colorTemperatureK, to.colorTemperatureK ?? light.colorTemperatureK, t),
    };
  }
  return structuredClone(light);
}
