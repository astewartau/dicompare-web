import { DicomField, SchemaField } from '../types';

export interface ComplianceStatus {
  status: 'pass' | 'fail' | 'warning' | 'unknown';
  message: string;
  details?: string;
}

/**
 * Mock compliance checking service
 * 
 * This service provides fake compliance validation for demo purposes.
 * In a real implementation, this would:
 * 1. Compare actual DICOM field values against schema requirements
 * 2. Use the ValidationRule from SchemaField to perform real validation
 * 3. Connect to actual DICOM validation libraries
 * 4. Return real compliance results
 */
export class MockComplianceService {
  /**
   * Mock compliance checking logic with realistic errors and warnings
   * 
   * @param field - The DICOM field from the acquisition data
   * @param schemaField - The schema field definition (currently not used in mock)
   * @returns ComplianceStatus with mock validation result
   */
  static checkFieldCompliance(field: DicomField, schemaField?: SchemaField): ComplianceStatus {
    // In real implementation: if (!schemaField) return { status: 'unknown', ... }
    if (!schemaField) {
      return {
        status: 'unknown',
        message: 'Field not found in schema',
        details: 'This field is not defined in the selected validation template'
      };
    }

    // In real implementation: check if field is required but missing value
    if (schemaField.required && (!field.value || field.value === '')) {
      return {
        status: 'fail',
        message: 'Required field missing',
        details: 'This field is required by the schema but has no value'
      };
    }

    // MOCK VALIDATION SCENARIOS - Replace with real validation logic
    const fieldName = field.name.toLowerCase();
    const fieldTag = field.tag;
    const fieldValue = String(field.value);

    // Mock RepetitionTime validation
    if (fieldTag === '0018,0080' || fieldName.includes('repetition')) {
      return this.mockRepetitionTimeValidation(fieldValue);
    }

    // Mock EchoTime validation
    if (fieldTag === '0018,0081' || fieldName.includes('echo')) {
      return this.mockEchoTimeValidation(fieldValue);
    }

    // Mock ImageType validation
    if (fieldTag === '0008,0008' || fieldName.includes('image type')) {
      return this.mockImageTypeValidation(fieldValue);
    }

    // Mock FlipAngle validation
    if (fieldTag === '0018,1314' || fieldName.includes('flip angle')) {
      return this.mockFlipAngleValidation(fieldValue);
    }

    // Mock MagneticFieldStrength validation
    if (fieldTag === '0018,0087' || fieldName.includes('magnetic field')) {
      return this.mockMagneticFieldValidation(fieldValue);
    }

    // Mock PatientSex validation
    if (fieldTag === '0010,0040' || fieldName.includes('sex') || fieldName.includes('gender')) {
      return this.mockPatientSexValidation(fieldValue);
    }

    // Mock Modality validation
    if (fieldTag === '0008,0060' || fieldName.includes('modality')) {
      return this.mockModalityValidation(fieldValue);
    }

    // In real implementation: use schemaField.validationRule for actual validation
    return this.mockGenericValidation(field, schemaField);
  }

  private static mockRepetitionTimeValidation(fieldValue: string): ComplianceStatus {
    const numValue = Number(fieldValue);
    if (isNaN(numValue)) {
      return {
        status: 'fail',
        message: 'Invalid numeric value',
        details: 'RepetitionTime must be a numeric value in milliseconds'
      };
    }
    if (numValue < 100 || numValue > 10000) {
      return {
        status: 'fail',
        message: `Out of range (100-10000ms)`,
        details: `RepetitionTime ${numValue}ms is outside typical range of 100-10000ms`
      };
    }
    return {
      status: 'pass',
      message: 'Within valid range',
      details: `RepetitionTime ${numValue}ms is within acceptable range`
    };
  }

  private static mockEchoTimeValidation(fieldValue: string): ComplianceStatus {
    const numValue = Number(fieldValue);
    if (isNaN(numValue)) {
      return {
        status: 'fail',
        message: 'Invalid numeric value',
        details: 'EchoTime must be a numeric value in milliseconds'
      };
    }
    if (numValue > 200) {
      return {
        status: 'warning',
        message: 'Unusually high EchoTime',
        details: `EchoTime ${numValue}ms is higher than typical values (5-100ms). Please verify.`
      };
    }
    return {
      status: 'pass',
      message: 'Within expected range',
      details: `EchoTime ${numValue}ms is within normal range`
    };
  }

  private static mockImageTypeValidation(fieldValue: string): ComplianceStatus {
    if (!fieldValue.includes('ORIGINAL')) {
      return {
        status: 'fail',
        message: 'Missing required value',
        details: 'ImageType must contain "ORIGINAL" for this protocol'
      };
    }
    if (!fieldValue.includes('PRIMARY')) {
      return {
        status: 'warning',
        message: 'Should contain PRIMARY',
        details: 'ImageType typically contains "PRIMARY" - please verify this is intentional'
      };
    }
    return {
      status: 'pass',
      message: 'Contains required values',
      details: 'ImageType contains all required values'
    };
  }

  private static mockFlipAngleValidation(fieldValue: string): ComplianceStatus {
    const numValue = Number(fieldValue);
    if (isNaN(numValue)) {
      return {
        status: 'fail',
        message: 'Invalid numeric value',
        details: 'FlipAngle must be a numeric value in degrees'
      };
    }
    if (numValue < 1 || numValue > 180) {
      return {
        status: 'fail',
        message: 'Out of valid range (1-180°)',
        details: `FlipAngle ${numValue}° is outside valid range of 1-180 degrees`
      };
    }
    if (numValue > 90) {
      return {
        status: 'warning',
        message: 'High flip angle',
        details: `FlipAngle ${numValue}° is quite high. Verify this is correct for your protocol.`
      };
    }
    return {
      status: 'pass',
      message: 'Within normal range',
      details: `FlipAngle ${numValue}° is within acceptable range`
    };
  }

  private static mockMagneticFieldValidation(fieldValue: string): ComplianceStatus {
    const numValue = Number(fieldValue);
    if (numValue !== 3.0 && numValue !== 1.5 && numValue !== 7.0) {
      return {
        status: 'warning',
        message: 'Unusual field strength',
        details: `${numValue}T is not a standard clinical field strength (1.5T, 3T, 7T)`
      };
    }
    return {
      status: 'pass',
      message: 'Standard field strength',
      details: `${numValue}T is a standard clinical field strength`
    };
  }

  private static mockPatientSexValidation(fieldValue: string): ComplianceStatus {
    if (!['M', 'F', 'O'].includes(fieldValue.toUpperCase())) {
      return {
        status: 'fail',
        message: 'Invalid value',
        details: 'PatientSex must be M (Male), F (Female), or O (Other)'
      };
    }
    return {
      status: 'pass',
      message: 'Valid value',
      details: 'PatientSex has a valid DICOM value'
    };
  }

  private static mockModalityValidation(fieldValue: string): ComplianceStatus {
    if (fieldValue !== 'MR') {
      return {
        status: 'fail',
        message: `Expected MR, found ${fieldValue}`,
        details: 'This template requires MR (Magnetic Resonance) modality'
      };
    }
    return {
      status: 'pass',
      message: 'Correct modality',
      details: 'Modality matches template requirements'
    };
  }

  private static mockGenericValidation(field: DicomField, schemaField: SchemaField): ComplianceStatus {
    const fieldValue = String(field.value);
    const rule = schemaField.validationRule;
    
    // In real implementation: use actual validation rule logic
    if (rule.exact !== undefined) {
      const matches = fieldValue === String(rule.exact);
      return {
        status: matches ? 'pass' : 'fail',
        message: matches ? 'Exact match' : `Expected: ${rule.exact}, Found: ${fieldValue}`,
        details: matches 
          ? 'Field value matches the required exact value'
          : `Field value "${fieldValue}" does not match required value "${rule.exact}"`
      };
    }

    if (rule.range) {
      const numValue = Number(fieldValue);
      if (isNaN(numValue)) {
        return {
          status: 'fail',
          message: 'Invalid numeric value',
          details: `Expected numeric value between ${rule.range.min} and ${rule.range.max}`
        };
      }
      
      const inRange = numValue >= rule.range.min && numValue <= rule.range.max;
      return {
        status: inRange ? 'pass' : 'fail',
        message: inRange 
          ? 'Within valid range' 
          : `Out of range (${rule.range.min}-${rule.range.max})`,
        details: inRange
          ? `Value ${numValue} is within acceptable range ${rule.range.min}-${rule.range.max}`
          : `Value ${numValue} is outside acceptable range ${rule.range.min}-${rule.range.max}`
      };
    }

    if (rule.contains) {
      const contains = fieldValue.toLowerCase().includes(rule.contains.toLowerCase());
      return {
        status: contains ? 'pass' : 'warning',
        message: contains ? 'Contains required text' : `Should contain: ${rule.contains}`,
        details: contains
          ? `Field contains the required text "${rule.contains}"`
          : `Field should contain "${rule.contains}" but currently has "${fieldValue}"`
      };
    }

    // Mock random warnings for demo
    const rand = Math.random();
    if (rand < 0.1) {
      return {
        status: 'warning',
        message: 'Verify field value',
        details: 'This field value should be manually verified for accuracy'
      };
    }

    return {
      status: 'pass',
      message: 'Field valid',
      details: 'Field meets basic validation requirements'
    };
  }

  /**
   * Get overall compliance statistics for a set of fields
   */
  static getComplianceStats(fields: DicomField[], schemaFields: SchemaField[]) {
    const results = fields.map(field => {
      const schemaField = schemaFields.find(sf => sf.tag === field.tag);
      return this.checkFieldCompliance(field, schemaField);
    });

    const passes = results.filter(r => r.status === 'pass').length;
    const fails = results.filter(r => r.status === 'fail').length;
    const warnings = results.filter(r => r.status === 'warning').length;
    const unknown = results.filter(r => r.status === 'unknown').length;
    
    return { 
      passes, 
      fails, 
      warnings, 
      unknown, 
      total: results.length,
      percentage: results.length > 0 ? Math.round((passes / results.length) * 100) : 0
    };
  }
}