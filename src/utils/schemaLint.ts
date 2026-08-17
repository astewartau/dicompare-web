import { ValidationRule } from '../types';

/**
 * Lightweight, high-signal "linting" for schema field constraints, surfaced in
 * the schema builder to catch constraints that look fine but will not match real
 * DICOM data (e.g. an exact match on a floating-point field, or a console
 * display string like "A >> P" where DICOM stores "COL").
 */
export interface FieldLintWarning {
  code: 'exact-float' | 'enum-mismatch' | 'display-string';
  message: string;
}

/** Field to lint — a subset of DicomField that is available while editing. */
export interface LintableField {
  keyword?: string;
  name?: string;
  value?: any;
  validationRule?: ValidationRule;
}

// Continuous physical parameters where an exact match is brittle even when the
// authored value happens to be an integer (e.g. EchoTime 66).
const CONTINUOUS_FIELDS = new Set<string>([
  'RepetitionTime', 'EchoTime', 'InversionTime', 'SliceThickness',
  'SpacingBetweenSlices', 'PixelBandwidth', 'FlipAngle', 'ImagingFrequency',
  'MagneticFieldStrength', 'PixelSpacing', 'EchoSpacing', 'SAR', 'dBdt',
  'PercentPhaseFieldOfView', 'PercentSampling',
]);

// A curated set of enumerated CS fields with their DICOM defined terms. A value
// outside the set will never match real data.
const ENUMERATED_CS_FIELDS: Record<string, string[]> = {
  InPlanePhaseEncodingDirection: ['ROW', 'COL'],
  MRAcquisitionType: ['1D', '2D', '3D'],
  ComplexImageComponent: ['MAGNITUDE', 'PHASE', 'REAL', 'IMAGINARY', 'MIXED'],
  PhotometricInterpretation: [
    'MONOCHROME1', 'MONOCHROME2', 'PALETTE COLOR', 'RGB',
    'YBR_FULL', 'YBR_FULL_422', 'YBR_PARTIAL_422', 'YBR_ICT', 'YBR_RCT',
  ],
  PatientPosition: [
    'HFS', 'HFP', 'FFS', 'FFP', 'HFDR', 'HFDL', 'FFDR', 'FFDL',
    'LFP', 'LFS', 'RFP', 'RFS', 'AFDR', 'AFDL', 'PFDR', 'PFDL',
  ],
};

const DISPLAY_STRING_PATTERN = /(>>|<<|→|←|->|<-)/;

function fieldKey(field: LintableField): string {
  return field.keyword || field.name || '';
}

function toArray(value: any): any[] {
  return Array.isArray(value) ? value : [value];
}

/**
 * Compute lint warnings for a single field constraint. Returns an empty array
 * when nothing looks wrong.
 */
export function lintField(field: LintableField): FieldLintWarning[] {
  const warnings: FieldLintWarning[] = [];
  const rule: ValidationRule = field.validationRule ?? { type: 'exact' };
  const key = fieldKey(field);

  // The value the constraint compares against (exact/tolerance store it on the
  // rule; otherwise fall back to the field value).
  const constraintValue = rule.value ?? field.value;

  // A) Exact match on a continuous / floating-point numeric field.
  if (rule.type === 'exact') {
    const nums = toArray(constraintValue);
    const allNumeric = nums.length > 0 && nums.every(v => typeof v === 'number' && !isNaN(v));
    const hasFloat = nums.some(v => typeof v === 'number' && !Number.isInteger(v));
    if (allNumeric && (hasFloat || CONTINUOUS_FIELDS.has(key))) {
      warnings.push({
        code: 'exact-float',
        message: `Exact match on ${key || 'this numeric field'} is brittle — real scans vary slightly. Consider a ± tolerance.`,
      });
    }
  }

  // B) Value outside a known enumerated set (only meaningful for exact match).
  const enumSet = ENUMERATED_CS_FIELDS[key];
  if (enumSet && rule.type === 'exact') {
    const strVals = toArray(constraintValue)
      .filter(v => typeof v === 'string' && v.trim() !== '');
    const offender = strVals.find(
      v => !enumSet.some(allowed => allowed.toLowerCase() === String(v).trim().toLowerCase())
    );
    if (offender !== undefined) {
      warnings.push({
        code: 'enum-mismatch',
        message: `"${offender}" is not a valid ${key} value (DICOM uses ${enumSet.join(', ')}), so this will never match real data.`,
      });
    }
  }

  // C) Looks like a scanner-console display value (e.g. "A >> P").
  const looksLikeDisplay = toArray(constraintValue)
    .some(v => typeof v === 'string' && DISPLAY_STRING_PATTERN.test(v));
  if (looksLikeDisplay) {
    warnings.push({
      code: 'display-string',
      message: 'This looks like a scanner-console display value, which usually differs from the stored DICOM value and may not match.',
    });
  }

  return warnings;
}
