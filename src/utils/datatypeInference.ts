import { FieldDataType } from '../types';
import { getDataTypeFromVR } from './vrMapping';
import { searchDicomFields, suggestDataType } from '../services/dicomFieldService';

/**
 * Infers the data type from a given value
 * Used consistently across the application for both acquisition and series fields
 */
export function inferDataTypeFromValue(value: any): FieldDataType {
  if (value === null || value === undefined || value === '') {
    return 'string'; // Default to string for empty values
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return 'list_string'; // Default to string list for empty arrays
    }

    // Check if all elements are numbers
    const allNumbers = value.every(item =>
      typeof item === 'number' && !isNaN(item)
    );

    return allNumbers ? 'list_number' : 'list_string';
  }

  if (typeof value === 'number' && !isNaN(value)) {
    return 'number';
  }

  if (typeof value === 'object') {
    return 'json';
  }

  return 'string';
}

/**
 * Converts a value to match the specified data type
 * Used when changing data types in the UI
 */
export function convertValueToDataType(value: any, dataType: FieldDataType): any {
  switch (dataType) {
    case 'string':
      if (Array.isArray(value)) {
        return value.join(', ');
      }
      return String(value || '');

    case 'number':
      if (Array.isArray(value)) {
        return value.length > 0 ? Number(value[0]) || 0 : 0;
      }
      return Number(value) || 0;

    case 'list_string':
      if (Array.isArray(value)) {
        return value.map(v => String(v));
      }
      if (typeof value === 'string' && value.includes(',')) {
        return value.split(',').map(v => v.trim()).filter(v => v.length > 0);
      }
      return value ? [String(value)] : [];

    case 'list_number':
      if (Array.isArray(value)) {
        return value.map(v => Number(v) || 0);
      }
      if (typeof value === 'string' && value.includes(',')) {
        return value.split(',')
          .map(v => v.trim())
          .filter(v => v.length > 0)
          .map(v => Number(v) || 0);
      }
      return value !== '' && !isNaN(Number(value)) ? [Number(value)] : [];

    case 'json':
      if (typeof value === 'string') {
        try {
          return JSON.parse(value);
        } catch {
          return value;
        }
      }
      return value;

    default:
      return value;
  }
}

/**
 * Convert schema field format to UI field format while preserving validation rules
 * This should be used instead of processFieldForUI for schema data
 */
export function processSchemaFieldForUI(schemaField: any): any {
  // Try to get proper data type from VR and VM if available, otherwise check for known field patterns
  let dataType;
  if (schemaField.vr && schemaField.valueMultiplicity) {
    console.log('🏗️ Schema field processing with VR/VM:', {
      tag: schemaField.tag,
      vr: schemaField.vr,
      vm: schemaField.valueMultiplicity
    });
    dataType = getDataTypeFromVR(schemaField.vr, schemaField.valueMultiplicity, schemaField.value);
    console.log('🎯 Schema field dataType determined:', dataType);
  } else if (schemaField.tag) {
    // Check for known multi-value fields by tag
    console.log('🔍 Schema field missing VR/VM, checking known patterns for tag:', schemaField.tag);

    // Known multi-value numeric fields
    const knownListNumberFields = [
      '0018,1149', // Field of View Dimensions
      '0028,0030', // Pixel Spacing
      '0018,1310', // Acquisition Matrix
      '0020,0032', // Image Position Patient
      '0020,0037', // Image Orientation Patient
    ];

    // Known multi-value string fields
    const knownListStringFields = [
      '0008,0008', // Image Type
      '0018,0021', // Sequence Variant
      '0018,0022', // Scan Options
    ];

    const normalizedTag = schemaField.tag.replace(/[()]/g, '');

    if (knownListNumberFields.includes(normalizedTag)) {
      console.log('📊 Recognized as known list_number field');
      dataType = 'list_number';
    } else if (knownListStringFields.includes(normalizedTag)) {
      console.log('📝 Recognized as known list_string field');
      dataType = 'list_string';
    } else {
      // Fallback to value-based inference
      dataType = inferDataTypeFromValue(schemaField.value);
      console.log('📋 Schema field fallback dataType:', dataType, 'from value:', schemaField.value);
    }
  } else {
    // Fallback to value-based inference
    dataType = inferDataTypeFromValue(schemaField.value);
    console.log('📋 Schema field fallback dataType:', dataType, 'from value:', schemaField.value);
  }

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