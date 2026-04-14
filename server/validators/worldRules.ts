import { ValidationSeverity, type ValidationResult } from './types.js';

/**
 * First-pass world validation rules.
 * All functions are pure - no database access - for easy testing.
 */

/** Check that a spec's biome is compatible with its region. */
export function validateBiomeConsistency(
  specBiome: string,
  regionBiomeTags: string[],
): ValidationResult[] {
  if (regionBiomeTags.length === 0) return [];

  if (!regionBiomeTags.includes(specBiome)) {
    return [{
      severity: ValidationSeverity.Repairable,
      rule: 'biome_consistency',
      message: `Biome "${specBiome}" does not match region biome tags [${regionBiomeTags.join(', ')}].`,
      field: 'biome',
      suggestion: `Use one of: ${regionBiomeTags.join(', ')}`,
    }];
  }

  return [];
}

/** Check that resource tags don't contradict the region's resource profile. */
export function validateResourcePlausibility(
  specResourceTags: string[],
  regionResourceTags: string[],
): ValidationResult[] {
  const results: ValidationResult[] = [];

  // Check for water abundance in a water-scarce region
  const waterScarce = regionResourceTags.includes('water_scarce');
  const hasWaterAbundance = specResourceTags.includes('water_abundant') || specResourceTags.includes('water_plentiful');

  if (waterScarce && hasWaterAbundance) {
    results.push({
      severity: ValidationSeverity.Repairable,
      rule: 'resource_plausibility',
      message: 'Water abundance conflicts with water-scarce region.',
      field: 'resource_tags',
      suggestion: 'Remove water abundance or justify with a special landmark.',
    });
  }

  return results;
}

/** Check that a proposed name doesn't duplicate an existing one. */
export function validateNameUniqueness(
  proposedName: string,
  existingNames: string[],
): ValidationResult[] {
  const normalized = proposedName.trim().toLowerCase();
  const conflict = existingNames.find(n => n.trim().toLowerCase() === normalized);

  if (conflict) {
    return [{
      severity: ValidationSeverity.Block,
      rule: 'name_uniqueness',
      message: `Name "${proposedName}" conflicts with existing name "${conflict}".`,
      field: 'name',
      suggestion: 'Choose a different name.',
    }];
  }

  return [];
}

/** Check that a spec's motifs don't include banned world motifs. */
export function validateMotifBans(
  specTags: string[],
  bannedMotifs: string[],
): ValidationResult[] {
  const results: ValidationResult[] = [];

  for (const tag of specTags) {
    if (bannedMotifs.includes(tag)) {
      results.push({
        severity: ValidationSeverity.Block,
        rule: 'motif_ban',
        message: `Tag "${tag}" is banned by the world profile.`,
        field: 'tags',
        suggestion: `Remove "${tag}" and choose a setting-appropriate alternative.`,
      });
    }
  }

  return results;
}
