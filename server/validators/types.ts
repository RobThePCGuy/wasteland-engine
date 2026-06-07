/**
 * Validation result types for the AI world generation pipeline.
 * Validators classify issues so the admission layer can decide
 * whether to block, repair, or warn.
 */

export enum ValidationSeverity {
  /** Output must be rejected entirely */
  Block = 'block',
  /** Output has fixable issues - attempt repair before rejection */
  Repairable = 'repairable',
  /** Output is acceptable but has minor concerns */
  WarnOnly = 'warn_only',
}

export interface ValidationResult {
  severity: ValidationSeverity;
  rule: string;
  message: string;
  field?: string;
  suggestion?: string;
}

export interface ValidationReport {
  results: ValidationResult[];
  passed: boolean;
  blocked: number;
  repairable_count: number;
  warn_count: number;
}

/** Build a report from a flat list of validation results. */
export function buildValidationReport(results: ValidationResult[]): ValidationReport {
  const blocked = results.filter(r => r.severity === ValidationSeverity.Block).length;
  const repairable_count = results.filter(r => r.severity === ValidationSeverity.Repairable).length;
  const warn_count = results.filter(r => r.severity === ValidationSeverity.WarnOnly).length;

  return {
    results,
    passed: blocked === 0,
    blocked,
    repairable_count,
    warn_count,
  };
}
