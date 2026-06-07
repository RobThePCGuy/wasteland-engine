import { createSeededRng } from '../utils/seededRng.js';

export interface LegacyTravelPreview {
  name: string;
  description: string;
  region_id: number | null;
}

export interface LegacyTravelPreviewContext {
  request_id: string;
  current_location_name: string;
  region_id?: number | null;
  region_name?: string | null;
  biome_tags?: string[];
  hazard_tags?: string[];
  resource_tags?: string[];
}

const BIOME_NAME_PARTS: Record<string, string[]> = {
  desert: ['Dust', 'Salt', 'Sunscorch', 'Ash'],
  scrubland: ['Bristle', 'Windcut', 'Drybrush'],
  ruins: ['Shatter', 'Rusted', 'Broken'],
  urban: ['Concrete', 'Neon', 'Overpass'],
  underground: ['Vaulted', 'Buried', 'Sublevel'],
};

const HAZARD_NAME_PARTS: Record<string, string[]> = {
  radiation: ['Glow', 'Hotzone', 'Irradiated'],
  bandits: ['Raider', 'Ambush', 'Gunmetal'],
  storms: ['Stormblown', 'Sandcut'],
  mutants: ['Feral', 'Tainted'],
};

const RESOURCE_SITE_TYPES: Record<string, string[]> = {
  scrap: ['Yard', 'Depot', 'Heap'],
  salvage: ['Depot', 'Breaker Yard'],
  water: ['Pump Station', 'Reservoir'],
  water_scarce: ['Cistern', 'Dry Well'],
  tech: ['Relay', 'Substation', 'Switchyard'],
  medical: ['Clinic', 'Aid Station'],
  fuel: ['Tank Farm', 'Refinery Annex'],
};

const FALLBACK_NAME_PARTS = ['Rusted', 'Bleak', 'Hollow', 'Lastlight'];
const FALLBACK_SITE_TYPES = ['Outpost', 'Crossing', 'Camp', 'Station'];

const HAZARD_DESCRIPTION_PARTS: Record<string, string[]> = {
  radiation: ['old radiation still crackles through the air'],
  bandits: ['fresh boot prints suggest raiders still work the area'],
  storms: ['sand-scored walls show what the last storms left behind'],
  mutants: ['the ground is marked by clawed tracks and hurried retreats'],
};

const RESOURCE_DESCRIPTION_PARTS: Record<string, string[]> = {
  scrap: ['broken machinery and salvageable metal are piled everywhere'],
  salvage: ['the wreckage still looks worth tearing apart'],
  water: ['cracked pipes hint that clean water once moved through here'],
  water_scarce: ['every dry pipe and empty tank feels worth killing over'],
  tech: ['dead consoles and relay housings still promise useful parts'],
  medical: ['shattered cabinets hint at forgotten medical stock'],
  fuel: ['stale fuel stink still clings to the concrete'],
};

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function pickOne<T>(values: T[], rng: () => number): T {
  return values[Math.floor(rng() * values.length)];
}

function collectMappedParts(tags: string[] | undefined, map: Record<string, string[]>): string[] {
  if (!tags?.length) {
    return [];
  }

  return tags.flatMap(tag => map[tag.toLowerCase()] ?? []);
}

/**
 * Build a deterministic, server-authored legacy travel preview.
 *
 * This is intentionally simple and fully deterministic for a given request id,
 * so the server can remain authoritative even when structured generation is
 * disabled.
 */
export function buildLegacyTravelPreview(context: LegacyTravelPreviewContext): LegacyTravelPreview {
  const rng = createSeededRng(context.request_id);

  const nameParts = unique([
    ...collectMappedParts(context.hazard_tags, HAZARD_NAME_PARTS),
    ...collectMappedParts(context.biome_tags, BIOME_NAME_PARTS),
    ...FALLBACK_NAME_PARTS,
  ]);
  const siteTypes = unique([
    ...collectMappedParts(context.resource_tags, RESOURCE_SITE_TYPES),
    ...FALLBACK_SITE_TYPES,
  ]);

  const descriptor = pickOne(nameParts, rng);
  const siteType = pickOne(siteTypes, rng);
  const regionName = context.region_name?.trim() || 'the surrounding wastes';
  const currentLocationName = context.current_location_name.trim() || 'your last camp';

  const hazardSentence = pickOne(
    unique([
      ...collectMappedParts(context.hazard_tags, HAZARD_DESCRIPTION_PARTS),
      'something ugly clearly passed through before you did',
    ]),
    rng,
  );
  const resourceSentence = pickOne(
    unique([
      ...collectMappedParts(context.resource_tags, RESOURCE_DESCRIPTION_PARTS),
      'there might still be enough left here to make the trip worthwhile',
    ]),
    rng,
  );

  return {
    name: `${descriptor} ${siteType}`,
    description: `A weather-beaten ${siteType.toLowerCase()} beyond ${currentLocationName} in ${regionName}. ${hazardSentence}, and ${resourceSentence}.`,
    region_id: context.region_id ?? null,
  };
}