import { FieldDataType } from '../types';

/**
 * Infer the datatype from a JSON value - no explicit dataType field needed!
 * This follows JSON's natural typing system.
 */
export function inferDataTypeFromValue(value: any): FieldDataType {
  if (value === null || value === undefined) {
    return 'string'; // Default fallback
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return 'list_string'; // Default for empty arrays
    }

    // Check the first element to determine array type
    const firstElement = value[0];
    if (typeof firstElement === 'number' || !isNaN(Number(firstElement))) {
      return 'list_number';
    } else {
      return 'list_string';
    }
  }

  if (typeof value === 'number') {
    return 'number';
  }

  if (typeof value === 'object') {
    return 'json';
  }

  if (typeof value === 'string') {
    // Check if it's a numeric string that should be treated as number
    if (!isNaN(Number(value)) && value.trim() !== '') {
      return 'number';
    }
    return 'string';
  }

  if (typeof value === 'boolean') {
    return 'string'; // DICOM typically represents booleans as strings
  }

  return 'string'; // Default fallback
}

/**
 * Convert schema field format to UI field format while preserving validation rules
 * This should be used instead of processFieldForUI for schema data
 */
export function processSchemaFieldForUI(schemaField: any): any {
  // Infer datatype from the value
  const dataType = inferDataTypeFromValue(schemaField.value);

  // Build validation rule from schema properties
  let validationRule: any = { type: 'exact' };

  // Check for tolerance validation
  if (schemaField.tolerance !== undefined) {
    validationRule = {
      type: 'tolerance',
      value: schemaField.value,
      tolerance: schemaField.tolerance
    };
  }
  // Check for range validation
  else if (schemaField.min !== undefined && schemaField.max !== undefined) {
    validationRule = {
      type: 'range',
      min: schemaField.min,
      max: schemaField.max
    };
  }
  // Check for contains validation
  else if (schemaField.contains !== undefined) {
    validationRule = {
      type: 'contains',
      contains: schemaField.contains
    };
  }
  // Check for contains_any validation
  else if (schemaField.contains_any !== undefined) {
    validationRule = {
      type: 'contains_any',
      contains_any: schemaField.contains_any
    };
  }
  // Check for contains_all validation
  else if (schemaField.contains_all !== undefined) {
    validationRule = {
      type: 'contains_all',
      contains_all: schemaField.contains_all
    };
  }
  // Default to exact match with the value
  else {
    validationRule = {
      type: 'exact',
      value: schemaField.value
    };
  }

  return {
    tag: schemaField.tag,
    name: schemaField.field || schemaField.name || schemaField.tag,
    keyword: schemaField.keyword,
    value: schemaField.value,
    vr: schemaField.vr || 'UN',
    level: schemaField.level || 'acquisition',
    dataType,
    validationRule
  };
}

/**
 * Process series field value for schema data
 */
export function processSchemaSeriesFieldValue(schemaField: any, fieldName?: string, tag?: string): any {
  const dataType = inferDataTypeFromValue(schemaField.value);

  // Build validation rule from schema properties
  let validationRule: any = { type: 'exact' };

  if (schemaField.tolerance !== undefined) {
    validationRule = {
      type: 'tolerance',
      value: schemaField.value,
      tolerance: schemaField.tolerance
    };
  } else if (schemaField.min !== undefined && schemaField.max !== undefined) {
    validationRule = {
      type: 'range',
      min: schemaField.min,
      max: schemaField.max
    };
  } else if (schemaField.contains !== undefined) {
    validationRule = {
      type: 'contains',
      contains: schemaField.contains
    };
  } else if (schemaField.contains_any !== undefined) {
    validationRule = {
      type: 'contains_any',
      contains_any: schemaField.contains_any
    };
  } else if (schemaField.contains_all !== undefined) {
    validationRule = {
      type: 'contains_all',
      contains_all: schemaField.contains_all
    };
  } else {
    validationRule = {
      type: 'exact',
      value: schemaField.value
    };
  }

  return {
    value: schemaField.value,
    field: fieldName || schemaField.field || schemaField.name,
    dataType,
    validationRule
  };
}