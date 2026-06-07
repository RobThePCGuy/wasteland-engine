import { db } from '../db.js';
import { CanonLevel } from './types.js';

/**
 * Canon promotion policy.
 * Controls when and how generated content becomes canonical world truth.
 * Persistence does NOT equal promotion - this layer makes that explicit.
 */

export enum CanonPromotionGate {
  /** Automatically promoted when validation passes */
  Automatic = 'automatic',
  /** Promoted only after validator approval */
  ValidatorApproved = 'validator_approved',
  /** Requires manual/human review before promotion */
  ManualReview = 'manual_review',
}

/** Default promotion gates by fact type. */
const DEFAULT_GATES: Record<string, CanonPromotionGate> = {
  landmark: CanonPromotionGate.Automatic,
  location_discovered: CanonPromotionGate.Automatic,
  faction_event: CanonPromotionGate.ValidatorApproved,
  world_event: CanonPromotionGate.ManualReview,
  lore: CanonPromotionGate.ManualReview,
};

/** Get the promotion gate for a given fact type. */
export function getPromotionGate(factType: string): CanonPromotionGate {
  return DEFAULT_GATES[factType] ?? CanonPromotionGate.ValidatorApproved;
}

/** Check whether a fact is eligible for promotion to a given level. */
export function canPromote(
  factType: string,
  targetLevel: CanonLevel,
  validationPassed: boolean,
): boolean {
  const gate = getPromotionGate(factType);

  // Runtime-only never needs gate approval
  if (targetLevel === CanonLevel.RuntimeOnly) return true;

  // Blocked if validation failed
  if (!validationPassed) return false;

  // Automatic gate: always allowed if validation passed
  if (gate === CanonPromotionGate.Automatic) return true;

  // ValidatorApproved: allowed for regional facts, blocked for global
  if (gate === CanonPromotionGate.ValidatorApproved) {
    return targetLevel === CanonLevel.RegionalFact;
  }

  // ManualReview: never auto-promoted
  return false;
}

/** Record a promotion with provenance. */
export function recordPromotion(
  factId: number,
  level: CanonLevel,
  source: string,
  reason: string,
): void {
  db.prepare(
    'UPDATE world_facts SET canon_level = ?, promoted_by = ?, promoted_reason = ? WHERE id = ?',
  ).run(level, source, reason, factId);
}
