/**
 * Feature flag scaffolding for structured generation rollout.
 * All flags default to off (false) for safety.
 * Future phases will add persistent/remote config.
 */

export interface FeatureFlags {
  /** Enable structured location spec generation instead of loose prose */
  structured_generation: boolean;
  /** Run structured generation alongside legacy outputs for comparison-only rollouts */
  shadow_generation: boolean;
  /** Enable automatic canon promotion for validated content */
  canon_promotion: boolean;
  /** Enable world inspection debug endpoints */
  world_inspection: boolean;
  /** Enable runtime consumption of approved generated assets */
  asset_activation: boolean;
  /** Enforce server-issued request_id for all travel confirmations */
  strict_travel_authority: boolean;
}

const DEFAULT_FLAGS: FeatureFlags = {
  structured_generation: false,
  shadow_generation: false,
  canon_promotion: false,
  world_inspection: false,
  strict_travel_authority: false,
  asset_activation: false,
};

let currentFlags: FeatureFlags = { ...DEFAULT_FLAGS };

/** Get all current feature flags. */
export function getFeatureFlags(): FeatureFlags {
  return { ...currentFlags };
}

/** Check if a specific flag is enabled. */
export function isEnabled(flag: keyof FeatureFlags): boolean {
  return currentFlags[flag] ?? false;
}

/** Override flags (for testing or runtime config). */
export function setFlags(overrides: Partial<FeatureFlags>): void {
  currentFlags = { ...currentFlags, ...overrides };
}

/** Reset all flags to defaults. */
export function resetFlags(): void {
  currentFlags = { ...DEFAULT_FLAGS };
}
