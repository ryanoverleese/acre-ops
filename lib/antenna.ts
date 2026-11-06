/**
 * Shared antenna choices and flag-stake math for desktop Install and the
 * installer app — keep one list so crew and office cannot drift.
 */

export const ANTENNA_OPTIONS = [
  'Sentek Stub',
  'CropX Stub',
  'CropX Stub + White Flag',
  'CropX Stub + No Flag',
  "Sentek 10'",
  "CropX 10'",
  "CropX 6'",
  'ASK',
] as const;

export type AntennaOption = (typeof ANTENNA_OPTIONS)[number];

/** Flag stakes needed for an install given antenna + side-dress context. */
export function calcFlags(antennaType: string, sideDress: string) {
  const antenna = antennaType.toLowerCase();
  const sd = sideDress.toLowerCase();
  const hasCoulter = antenna.includes('coulter') || sd.includes('cultivat') || sd.includes('coulter');
  const hasStub = antenna.includes('stub');
  const white = hasStub && !hasCoulter ? 2 : 1;
  return { pink: 1, blue: 5, white };
}
