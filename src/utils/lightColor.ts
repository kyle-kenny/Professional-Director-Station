export type SrgbTriplet = { r: number; g: number; b: number };

const clamp255 = (value: number) => Math.min(255, Math.max(0, value));

/**
 * Continuous black-body/CCT approximation for previs lighting.
 * Returns display-referred sRGB components in the 0..1 range.
 * The approximation is intended for 1000K..40000K and is clamped outside it.
 */
export function correlatedColorTemperatureToSrgb(kelvin: number): SrgbTriplet {
  const temperature = Math.min(40_000, Math.max(1_000, kelvin)) / 100;
  const red = temperature <= 66
    ? 255
    : 329.698727446 * Math.pow(temperature - 60, -0.1332047592);
  const green = temperature <= 66
    ? 99.4708025861 * Math.log(temperature) - 161.1195681661
    : 288.1221695283 * Math.pow(temperature - 60, -0.0755148492);
  const blue = temperature >= 66
    ? 255
    : temperature <= 19
      ? 0
      : 138.5177312231 * Math.log(temperature - 10) - 305.044792731;
  return { r: clamp255(red) / 255, g: clamp255(green) / 255, b: clamp255(blue) / 255 };
}
