import { DicomField, SeriesField, ValidationRule } from '../types';
import { FieldValue, validateFieldValue, extractFieldValue } from '../types/fieldValues';

export interface FormatOptions {
  showConstraint?: boolean;
  showValue?: boolean;
}

export function formatFieldDisplay(
  value: any,
  validationRule?: ValidationRule,
  options: FormatOptions = { showConstraint: false, showValue: true }
): string {
  // If we're showing constraint and there's a non-exact constraint, show constraint format
  if (options.showConstraint && validationRule && validationRule.type !== 'exact') {
    return formatValidationRule(validationRule);
  }
  
  // Show the value if available
  if (options.showValue !== false) {
    const formattedValue = formatRawValue(value);
    // If value is empty/dash but we have a constraint-based validation rule, show the constraint instead
    if (formattedValue === '-' && validationRule && ['contains_any', 'contains_all', 'contains'].includes(validationRule.type)) {
      return formatValidationRule(validationRule);
    }
    return formattedValue;
  }
  
  return '-';
}

// Type-safe version that works with FieldValue
export function formatTypedFieldValue(
  fieldValue: FieldValue,
  validationRule?: ValidationRule,
  options: FormatOptions = { showConstraint: false, showValue: true }
): string {
  // If we're showing constraint and there's a non-exact constraint, show constraint format
  if (options.showConstraint && validationRule && validationRule.type !== 'exact') {
    return formatValidationRule(validationRule);
  }
  
  // Otherwise, show the typed value
  if (options.showValue !== false) {
    return formatTypedValue(fieldValue);
  }
  
  return '-';
}

function formatTypedValue(fieldValue: FieldValue): string {
  switch (fieldValue.type) {
    case 'string':
      return fieldValue.value || '-';
    case 'number':
      return String(fieldValue.value);
    case 'list_string':
      return fieldValue.value.length > 0 ? fieldValue.value.join(', ') : '-';
    case 'list_number':
      return fieldValue.value.length > 0 ? fieldValue.value.join(', ') : '-';
    case 'json':
      return JSON.stringify(fieldValue.value, null, 2);
    default:
      return '-';
  }
}

// Backward compatibility - formatFieldValue for DicomField
export function formatFieldValue(field: DicomField): string {
  return formatFieldDisplay(field.value, field.validationRule, { showValue: true, showConstraint: true });
}

// Backward compatibility - formatSeriesFieldValue
export function formatSeriesFieldValue(fieldValue: any): string {
  // Handle new SeriesFieldValue format
  if (typeof fieldValue === 'object' && fieldValue !== null && 'validationRule' in fieldValue) {
    const seriesValue = fieldValue as SeriesFieldValue;
    return formatFieldDisplay(seriesValue.value, seriesValue.validationRule, { showValue: true, showConstraint: true });
  }
  
  // Handle legacy simple values
  return formatRawValue(fieldValue);
}

export function formatConstraint(field: DicomField): string {
  return formatValidationRule(field.validationRule);
}

export function formatDataType(dataType: string): string {
  switch (dataType) {
    case 'string':
      return 'String';
    case 'number':
      return 'Number';
    case 'list_string':
      return 'List (string)';
    case 'list_number':
      return 'List (number)';
    case 'json':
      return 'Raw JSON';
    default:
      return dataType;
  }
}

export function formatValidationRule(rule?: ValidationRule): string {
  if (!rule) {
    return 'exact';
  }
  
  switch (rule.type) {
    case 'exact':
      return 'exact';
    case 'tolerance':
      return `${rule.value || 0} ±${rule.tolerance || 0}`;
    case 'range':
      return `${rule.min ?? '-∞'} to ${rule.max ?? '∞'}`;
    case 'contains':
      return `contains "${rule.contains || ''}"`;
    case 'contains_any':
      return `contains any [${(rule.contains_any || []).slice(0, 3).join(', ')}${(rule.contains_any || []).length > 3 ? '...' : ''}]`;
    case 'contains_all':
      return `contains all [${(rule.contains_all || []).slice(0, 3).join(', ')}${(rule.contains_all || []).length > 3 ? '...' : ''}]`;
    default:
      return rule.type;
  }
}

export function formatFieldTypeInfo(dataType: string, validationRule?: ValidationRule): string {
  const formattedType = formatDataType(dataType);
  const formattedConstraint = validationRule ? formatValidationRule(validationRule) : 'exact';
  return `${formattedType} • ${formattedConstraint}`;
}

function formatRawValue(value: any): string {
  if (value === null || value === undefined) {
    return '-';
  }
  
  if (Array.isArray(value)) {
    return value.join(', ');
  }
  
  if (typeof value === 'object') {
    return JSON.stringify(value, null, 2);
  }
  
  return String(value);
}