import { DicomField, SeriesFieldValue, ValidationRule } from '../types';

export function formatFieldValue(field: DicomField): string {
  // For DicomField, check if we should show constraint-based value
  if (field.validationRule && field.validationRule.type !== 'exact') {
    // For non-exact constraints, show the constraint value
    switch (field.validationRule.type) {
      case 'tolerance':
        return String(field.validationRule.value || 0);
      case 'range':
        return `${field.validationRule.min ?? '-∞'} to ${field.validationRule.max ?? '∞'}`;
      case 'contains':
        return `contains "${field.validationRule.contains || ''}"`;
      case 'custom':
        return 'custom logic';
    }
  }
  
  // For exact constraints or when no validation rule, use the main value
  const value = field.value;
  
  if (value === null || value === undefined) {
    return '-';
  }
  
  if (Array.isArray(value)) {
    // Format arrays as comma-separated values
    return value.join(', ');
  }
  
  if (typeof value === 'object') {
    // Format objects as JSON
    return JSON.stringify(value, null, 2);
  }
  
  return String(value);
}

export function formatConstraint(field: DicomField): string {
  if (!field.validationRule) {
    return 'exact';
  }
  
  const rule = field.validationRule;
  
  switch (rule.type) {
    case 'exact':
      return 'exact';
    case 'tolerance':
      return `${rule.value || 0} ±${rule.tolerance || 0}`;
    case 'range':
      return `range: [${rule.min}, ${rule.max}]`;
    case 'contains':
      return `contains: "${rule.contains}"`;
    case 'custom':
      return 'custom';
    default:
      return rule.type;
  }
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

export function formatSeriesFieldValue(fieldValue: any): string {
  // Handle new SeriesFieldValue format
  if (typeof fieldValue === 'object' && fieldValue !== null && 'validationRule' in fieldValue) {
    const seriesValue = fieldValue as SeriesFieldValue;
    
    if (seriesValue.validationRule && seriesValue.validationRule.type !== 'exact') {
      // For non-exact constraints, only show the constraint info
      return formatValidationRule(seriesValue.validationRule);
    }
    
    // For exact constraints, show the actual value
    if (seriesValue.value !== undefined) {
      return formatRawValue(seriesValue.value);
    }
  }
  
  // Handle legacy simple values
  return formatRawValue(fieldValue);
}

export function formatValidationRule(rule: ValidationRule): string {
  switch (rule.type) {
    case 'exact':
      return 'exact';
    case 'tolerance':
      return `${rule.value || 0} ±${rule.tolerance || 0}`;
    case 'range':
      return `${rule.min ?? '-∞'} to ${rule.max ?? '∞'}`;
    case 'contains':
      return `contains "${rule.contains || ''}"`;
    case 'custom':
      return 'custom logic';
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