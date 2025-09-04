import { roundDicomValue } from './valueRounding';
import { getSuggestedConstraintForVR, getSuggestedToleranceValue } from './vrMapping';

/**
 * Process a DICOM field by rounding values and setting appropriate validation rules
 */
export function processFieldForUI(field: any, source: 'dicom' | 'pro' = 'dicom'): any {
  if (!field) return field;

  // Debug logging for MagneticFieldStrength and problematic string fields
  if (field.name === 'Magnetic Field Strength' || field.tag === '0018,0087' ||
      field.name === 'Imaged Nucleus' || field.tag === '0018,0085' ||
      field.name === 'MR Acquisition Type' || field.tag === '0018,0023' ||
      field.name === 'Receive Coil Name' || field.tag === '0018,1250' ||
      field.name === 'Transmit Coil Name' || field.tag === '0018,1251') {
    console.log('🔍 Processing field:', {
      name: field.name,
      tag: field.tag,
      originalValue: field.value,
      originalValueType: typeof field.value,
      originalValues: field.values,
      vr: field.vr
    });
  }

  // Round all numeric values in the field
  const processedValue = field.value !== null && field.value !== undefined ? roundDicomValue(field.value) : field.value;
  const processedValues = field.values ? field.values.map(roundDicomValue) : field.values;
  
  const processedField = {
    ...field,
    value: processedValue,
    values: processedValues
  };

  // More debug logging for tracked fields
  if (field.name === 'Magnetic Field Strength' || field.tag === '0018,0087' ||
      field.name === 'Imaged Nucleus' || field.tag === '0018,0085' ||
      field.name === 'MR Acquisition Type' || field.tag === '0018,0023' ||
      field.name === 'Receive Coil Name' || field.tag === '0018,1250' ||
      field.name === 'Transmit Coil Name' || field.tag === '0018,1251') {
    console.log('🔍 After rounding:', {
      name: field.name,
      originalValue: field.value,
      processedValue,
      processedValueType: typeof processedValue,
      processedValues,
      wasValueChanged: processedValue !== field.value
    });
  }

  // Determine the appropriate validation rule based on field characteristics
  const constraintType = getSuggestedConstraintForVR(field.vr, field.name, field.tag, source);
  
  let validationRule: any = { type: constraintType };
  
  // Add tolerance value for fields that use tolerance validation
  if (constraintType === 'tolerance') {
    const toleranceValue = getSuggestedToleranceValue(field.name, field.tag);
    
    // Debug for MagneticFieldStrength tolerance
    if (field.name === 'Magnetic Field Strength' || field.tag === '0018,0087') {
      console.log('🔍 Setting tolerance for MagneticFieldStrength:', {
        constraintType,
        toleranceValue,
        fieldName: field.name,
        fieldTag: field.tag,
        fieldValue: processedField.value
      });
    }
    
    if (toleranceValue !== undefined) {
      validationRule.tolerance = toleranceValue;
      // For tolerance validation, the UI expects the value in validationRule.value
      validationRule.value = processedField.value;
    }
  }
  
  // Handle contains_any constraint for .pro files (especially ScanOptions)
  if (constraintType === 'contains_any') {
    // For ScanOptions from .pro files, split the value by common separators to create the contains_any array
    if ((field.name === 'Scan Options' || field.tag === '0018,0022') && source === 'pro') {
      const value = processedField.value;
      if (typeof value === 'string') {
        // Split by backslash, comma, or space and filter out empty values
        const options = value.split(/[\\,\s]+/).map(opt => opt.trim()).filter(opt => opt !== '');
        validationRule.contains_any = options.length > 0 ? options : [value];
        console.log('🔍 Setting contains_any for ScanOptions from .pro:', {
          originalValue: value,
          extractedOptions: validationRule.contains_any
        });
      } else {
        validationRule.contains_any = [value];
      }
    } else {
      // For other contains_any constraints, default to the field value as single option
      validationRule.contains_any = [processedField.value];
    }
  }
  
  processedField.validationRule = validationRule;

  // Final debug logging for tracked fields
  if (field.name === 'Magnetic Field Strength' || field.tag === '0018,0087' ||
      field.name === 'Imaged Nucleus' || field.tag === '0018,0085' ||
      field.name === 'MR Acquisition Type' || field.tag === '0018,0023' ||
      field.name === 'Receive Coil Name' || field.tag === '0018,1250' ||
      field.name === 'Transmit Coil Name' || field.tag === '0018,1251') {
    console.log('🔍 Final processed field:', {
      name: field.name,
      tag: field.tag,
      finalValue: processedField.value,
      finalValueType: typeof processedField.value,
      validationRule: processedField.validationRule,
      dataType: processedField.dataType
    });
  }
  
  return processedField;
}

/**
 * Process series field values (used for series-level field processing)
 */
export function processSeriesFieldValue(value: any, fieldName?: string, tag?: string, source: 'dicom' | 'pro' = 'dicom'): any {
  if (!value || typeof value !== 'object') {
    return value;
  }

  // Round the value if it exists
  const processedValue = {
    ...value,
    value: value.value !== null && value.value !== undefined ? roundDicomValue(value.value) : value.value
  };

  // Set appropriate validation rule
  const constraintType = getSuggestedConstraintForVR(value.vr || 'UN', fieldName, tag, source);
  
  let validationRule: any = { type: constraintType };
  
  if (constraintType === 'tolerance') {
    const toleranceValue = getSuggestedToleranceValue(fieldName, tag);
    if (toleranceValue !== undefined) {
      validationRule.tolerance = toleranceValue;
    }
  }
  
  // Handle contains_any constraint for series values
  if (constraintType === 'contains_any') {
    // For ScanOptions from .pro files, split the value by common separators to create the contains_any array
    if ((fieldName === 'Scan Options' || tag === '0018,0022') && source === 'pro') {
      const fieldValue = processedValue.value;
      if (typeof fieldValue === 'string') {
        // Split by backslash, comma, or space and filter out empty values
        const options = fieldValue.split(/[\\,\s]+/).map(opt => opt.trim()).filter(opt => opt !== '');
        validationRule.contains_any = options.length > 0 ? options : [fieldValue];
      } else {
        validationRule.contains_any = [fieldValue];
      }
    } else {
      // For other contains_any constraints, default to the field value as single option
      validationRule.contains_any = [processedValue.value];
    }
  }
  
  processedValue.validationRule = validationRule;
  
  return processedValue;
}