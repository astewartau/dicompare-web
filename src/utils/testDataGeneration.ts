import { DicomField, Series, SelectedValidationFunction } from '../types';
import { inferDataTypeFromValue } from './datatypeInference';

export interface TestDataRow {
  [fieldName: string]: any;
}

export interface ValidationFieldValues {
  [fieldName: string]: any[];
}

export interface TestDataGenerationResult {
  testData: TestDataRow[];
  validationFieldValues: ValidationFieldValues;
  maxValidationRows: number;
  warnings: {
    conflicts: Array<{
      fieldName: string;
      existingValue: any;
      testValue: any;
      validationName: string;
    }>;
    noPassingTestWarnings: string[];
    fieldConflictWarnings: string[];
  };
}

/**
 * Extracts field values from validation function test cases
 * Returns validation field values, max rows needed, and any warnings
 */
export function extractValidationFieldValues(
  validationFunctions: SelectedValidationFunction[],
  allFields: DicomField[],
  series: Series[]
): {
  validationFieldValues: ValidationFieldValues;
  maxValidationRows: number;
  conflicts: Array<any>;
  noPassingTestWarnings: string[];
  fieldConflictWarnings: string[];
} {
  const validationFieldValues: ValidationFieldValues = {};
  let maxValidationRows = 0;
  const conflicts: Array<any> = [];
  const noPassingTestWarnings: string[] = [];
  const fieldConflictWarnings: string[] = [];
  const fieldToValidationFuncs: Record<string, Array<{ name: string; values: any[] }>> = {};

  let functionsWithTests = 0;
  let functionsWithoutTests = 0;

  validationFunctions.forEach(validationFunc => {
    const testCases = validationFunc.customTestCases || validationFunc.testCases || [];

    // Find passing test cases
    const passingTests = testCases.filter((testCase: any) => {
      return testCase.expectedResult === 'pass';
    });

    if (passingTests.length > 0) {
      functionsWithTests++;
      // Use the first passing test case
      const passingTest = passingTests[0];
      const fields = validationFunc.customFields || validationFunc.fields || [];
      const funcName = validationFunc.customName || validationFunc.name;

      // Extract field values from the passing test
      fields.forEach((fieldName: string) => {
        if (passingTest.data && passingTest.data[fieldName]) {
          const values = passingTest.data[fieldName];
          // Store the full array of values
          let testValues = Array.isArray(values) ? values : [values];

          // Check if this is grouped data with a Count column
          // If Count exists, expand values by repeating each value according to its count
          const countValues = passingTest.data['Count'];
          if (countValues && Array.isArray(countValues) && countValues.length === testValues.length) {
            // Expand values based on Count
            const expandedValues: any[] = [];
            for (let i = 0; i < testValues.length; i++) {
              const count = parseInt(countValues[i]) || 1;
              for (let j = 0; j < count; j++) {
                expandedValues.push(testValues[i]);
              }
            }
            testValues = expandedValues;
            console.log(`📊 Expanded ${fieldName} from ${values.length} grouped values to ${testValues.length} total values using Count column`);
          }

          // Track the maximum number of rows we need
          maxValidationRows = Math.max(maxValidationRows, testValues.length);

          // Check if this field already exists in acquisition/series fields
          const existingField = allFields.find(f => f.name === fieldName);
          if (existingField) {
            // Get the existing value(s)
            let existingValues: any[] = [];

            // If it's a series field, collect values from all series
            if (existingField.level === 'series') {
              series.forEach(s => {
                let seriesField = null;
                if (Array.isArray(s.fields)) {
                  seriesField = s.fields.find((f: any) => f.name === fieldName || f.tag === existingField.tag);
                } else if (s.fields && typeof s.fields === 'object') {
                  seriesField = (s.fields as any)[existingField.tag];
                }

                if (seriesField && seriesField.value !== undefined) {
                  let value = seriesField.value;
                  // Handle nested value structures
                  if (value && typeof value === 'object' && !Array.isArray(value)) {
                    if ((value as any).validationRule) {
                      const rule = (value as any).validationRule;
                      if (rule.type === 'exact' && rule.value !== undefined) {
                        value = rule.value;
                      } else if (rule.type === 'tolerance' && rule.value !== undefined) {
                        value = rule.value;
                      }
                    }
                  }
                  if (value !== undefined && value !== null && value !== '') {
                    existingValues.push(value);
                  }
                }
              });
            } else {
              // Acquisition field - single value
              let existingValue = existingField.value;
              // Handle nested value structures
              if (existingValue && typeof existingValue === 'object' && !Array.isArray(existingValue)) {
                if ((existingValue as any).validationRule) {
                  const rule = (existingValue as any).validationRule;
                  if (rule.type === 'exact' && rule.value !== undefined) {
                    existingValue = rule.value;
                  } else if (rule.type === 'tolerance' && rule.value !== undefined) {
                    existingValue = rule.value;
                  }
                }
              }
              if (existingValue !== undefined && existingValue !== null && existingValue !== '') {
                existingValues.push(existingValue);
              }
            }

            // Compare values for conflict detection
            if (existingValues.length > 0) {
              const firstTestValue = testValues[0];
              const firstExistingValue = existingValues[0];

              // Check if there's a conflict
              if (JSON.stringify(firstExistingValue) !== JSON.stringify(firstTestValue)) {
                conflicts.push({
                  fieldName,
                  existingValue: existingValues.length > 1 ? existingValues : firstExistingValue,
                  testValue: testValues.length > 1 ? testValues : firstTestValue,
                  validationName: funcName
                });
              }
            }
          }

          validationFieldValues[fieldName] = testValues;

          // Track which validation function is setting this field
          if (!fieldToValidationFuncs[fieldName]) {
            fieldToValidationFuncs[fieldName] = [];
          }
          fieldToValidationFuncs[fieldName].push({ name: funcName, values: testValues });
        }
      });
    } else {
      functionsWithoutTests++;
      const funcName = validationFunc.customName || validationFunc.name;
      noPassingTestWarnings.push(`"${funcName}" has no passing test cases`);
    }
  });

  // Check for fields set by multiple validation functions with conflicting values
  Object.entries(fieldToValidationFuncs).forEach(([fieldName, validationFuncs]) => {
    if (validationFuncs.length > 1) {
      // Multiple validation functions use this field - check if values differ
      const firstValues = JSON.stringify(validationFuncs[0].values);
      const hasConflict = validationFuncs.some(vf => JSON.stringify(vf.values) !== firstValues);

      if (hasConflict) {
        const funcNames = validationFuncs.map(vf => `"${vf.name}"`).join(', ');
        fieldConflictWarnings.push(
          `Multiple validation functions use field "${fieldName}" with different test values: ${funcNames}. ` +
          `The generated test data uses values from the last function and may not pass all validations.`
        );
      }
    }
  });

  return {
    validationFieldValues,
    maxValidationRows,
    conflicts,
    noPassingTestWarnings,
    fieldConflictWarnings
  };
}

/**
 * Generates a value for a field based on its constraints and validation rules
 */
export function generateValueFromField(field: DicomField): any {
  // Check if value is an object with validationRule (nested structure from loaded schemas)
  if (field.value && typeof field.value === 'object' && !Array.isArray(field.value)) {
    if ((field.value as any).validationRule) {
      const rule = (field.value as any).validationRule;
      const dataType = (field.value as any).dataType || 'string';

      // Generate value based on validation rule
      if (rule.type === 'exact' && rule.value !== undefined) {
        return rule.value;
      } else if (rule.type === 'tolerance' && rule.value !== undefined) {
        return rule.value; // Use the expected value
      } else if (rule.type === 'range') {
        if (rule.min !== undefined) return rule.min;
        if (rule.max !== undefined) return rule.max;
      } else if (rule.type === 'contains') {
        return rule.contains || 'test_value';
      } else if (rule.type === 'contains_any' && rule.contains_any) {
        // For ImageType with contains_any: ["M"] or ["P"], generate appropriate list
        if (dataType === 'list_string') {
          return ['ORIGINAL', 'PRIMARY', ...rule.contains_any];
        }
        return rule.contains_any[0] || 'test_value';
      } else if (rule.type === 'contains_all' && rule.contains_all) {
        if (dataType === 'list_string') {
          return ['ORIGINAL', 'PRIMARY', ...rule.contains_all];
        }
        return rule.contains_all.join('_');
      }
    }
  }

  // Check if field has validationRule at field level
  if (field.validationRule) {
    const rule = field.validationRule;
    if (rule.type === 'exact' && field.value !== undefined) {
      return field.value;
    } else if (rule.type === 'tolerance' && rule.value !== undefined) {
      return rule.value;
    } else if (rule.type === 'range') {
      if (rule.min !== undefined) return rule.min;
      if (rule.max !== undefined) return rule.max;
    } else if (rule.type === 'contains') {
      return rule.contains || 'test_value';
    } else if (rule.type === 'contains_any' && rule.contains_any) {
      return rule.contains_any[0] || 'test_value';
    } else if (rule.type === 'contains_all' && rule.contains_all) {
      return rule.contains_all.join('_');
    }
  }

  // Use the field's existing value if available
  if (field.value !== undefined && field.value !== null && field.value !== '') {
    return field.value;
  }

  // Generate reasonable defaults based on field type and name
  const dataType = inferDataTypeFromValue(field.value);
  switch (dataType) {
    case 'number':
      if (field.name.toLowerCase().includes('time')) return 2000;
      if (field.name.toLowerCase().includes('angle')) return 90;
      if (field.name.toLowerCase().includes('field')) return 3.0;
      return 1.0;

    case 'list_number':
      return [1.0, 1.0];

    case 'list_string':
      return ['value1', 'value2'];

    default:
      if (field.name === 'Modality') return 'MR';
      if (field.name === 'Manufacturer') return 'TEST_MANUFACTURER';
      if (field.name.toLowerCase().includes('name')) return 'TEST_VALUE';
      return 'test_value';
  }
}

/**
 * Generates test data rows from schema fields, series, and validation values
 */
export function generateTestDataFromSchema(
  fields: DicomField[],
  series: Series[],
  validationFieldValues: ValidationFieldValues = {},
  maxValidationRows: number = 0
): TestDataRow[] {
  // Determine how many rows we need to generate
  const numRows = Math.max(series.length, maxValidationRows, 1);

  // Generate rows
  const rows: TestDataRow[] = [];
  for (let rowIndex = 0; rowIndex < numRows; rowIndex++) {
    const row: TestDataRow = {};

    // First, add all validation field values (these take priority)
    Object.keys(validationFieldValues).forEach(fieldName => {
      const valuesArray = validationFieldValues[fieldName];
      // Cycle through validation values if we have more rows than values
      row[fieldName] = valuesArray[rowIndex % valuesArray.length];
    });

    // Then add fields from acquisition/series (won't override validation values)
    fields.forEach(field => {
      // Skip if already set by validation values
      if (row[field.name] !== undefined) {
        return;
      }

      // For series-based schemas, try to get value from the series
      if (series.length > 0 && rowIndex < series.length) {
        const s = series[rowIndex];

        if (field.level === 'series') {
          // Find this field in the current series
          let seriesField = null;

          // Handle both array format (from loaded schemas) and object format (from processed data)
          if (Array.isArray(s.fields)) {
            seriesField = s.fields.find((f: any) => f.tag === field.tag);
          } else if (s.fields && typeof s.fields === 'object') {
            seriesField = (s.fields as any)[field.tag];
          }

          if (seriesField) {
            // Extract the actual value from the series field
            if (seriesField.value !== undefined) {
              // Check if value has nested validation rule structure
              if (typeof seriesField.value === 'object' && !Array.isArray(seriesField.value) &&
                  (seriesField.value as any).validationRule) {
                row[field.name] = generateValueFromField({
                  ...field,
                  value: seriesField.value,
                  validationRule: seriesField.validationRule
                });
              } else {
                row[field.name] = seriesField.value;
              }
            } else if (seriesField.validationRule) {
              row[field.name] = generateValueFromField({
                ...field,
                validationRule: seriesField.validationRule
              });
            } else {
              row[field.name] = generateValueFromField(field);
            }
          } else {
            row[field.name] = generateValueFromField(field);
          }
        } else if (field.level === 'acquisition') {
          // Acquisition fields are the same for all rows
          // Use the field value if it's explicitly set, otherwise generate
          if (field.value !== undefined) {
            row[field.name] = field.value;
          } else {
            row[field.name] = generateValueFromField(field);
          }
        } else if (!row[field.name]) {
          row[field.name] = generateValueFromField(field);
        }
      } else {
        // No series or we're beyond the series count
        if (field.level === 'acquisition') {
          // Acquisition field
          if (field.value !== undefined) {
            row[field.name] = field.value;
          } else {
            row[field.name] = generateValueFromField(field);
          }
        } else {
          // Series field but no corresponding series - generate value
          row[field.name] = generateValueFromField(field);
        }
      }
    });

    rows.push(row);
  }

  return rows;
}
