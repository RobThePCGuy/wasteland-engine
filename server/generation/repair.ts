import type { LocationSpec } from './contracts.js';
import type { ValidationReport, ValidationResult } from '../validators/types.js';
import { ValidationSeverity } from '../validators/types.js';

export interface RepairResult {
  repaired: boolean;
  spec: LocationSpec;
  fixes_applied: string[];
}

/**
 * Attempt to auto-repair a LocationSpec based on repairable validation issues.
 * Pure function - no database access. Returns the original spec if nothing is repairable.
 */
export function repairLocationSpec(
  spec: LocationSpec,
  report: ValidationReport,
  regionContext: {
    biome_tags: string[];
    resource_tags: string[];
  },
): RepairResult {
  const repairable = report.results.filter(r => r.severity === ValidationSeverity.Repairable);

  if (repairable.length === 0) {
    return { repaired: false, spec, fixes_applied: [] };
  }

  // Deep clone so we don't mutate the original
  const fixed: LocationSpec = JSON.parse(JSON.stringify(spec));
  const fixes: string[] = [];

  for (const issue of repairable) {
    switch (issue.rule) {
      case 'biome_consistency':
        fixed.environment.biome = regionContext.biome_tags[0] ?? fixed.environment.biome;
        fixes.push(`biome changed to "${fixed.environment.biome}"`);
        break;

      case 'resource_plausibility':
        fixed.environment.resource_tags = fixed.environment.resource_tags.filter(
          tag => tag !== 'water_abundant' && tag !== 'water_plentiful',
        );
        fixes.push('removed conflicting water abundance tags');
        break;

      default:
        // Unknown repairable rule - skip, don't crash
        break;
    }
  }

  return {
    repaired: fixes.length > 0,
    spec: fixed,
    fixes_applied: fixes,
  };
}
