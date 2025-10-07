import React, { useState, useEffect } from 'react';
import { X, Download, Loader2, Play, FileDown, Table, Code, AlertTriangle, CheckCircle } from 'lucide-react';
import CodeMirror from '@uiw/react-codemirror';
import { python } from '@codemirror/lang-python';
import { Acquisition, DicomField } from '../../types';
import { inferDataTypeFromValue } from '../../utils/datatypeInference';
import { dicompareAPI } from '../../services/DicompareAPI';
import { pyodideManager } from '../../services/PyodideManager';
import { getFieldByKeyword } from '../../services/dicomFieldService';

interface TestDicomGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  acquisition: Acquisition;
  schemaId?: string;
  getSchemaContent?: (id: string) => Promise<string | null>;
}

interface TestDataRow {
  [fieldName: string]: any;
}

const TestDicomGeneratorModal: React.FC<TestDicomGeneratorModalProps> = ({
  isOpen,
  onClose,
  acquisition,
  schemaId,
  getSchemaContent
}) => {
  const [step, setStep] = useState<'analyzing' | 'editing' | 'generating'>('analyzing');
  const [analysisResult, setAnalysisResult] = useState<{
    fields: DicomField[];
    seriesCount: number;
    generatableFields: DicomField[];
    validationFunctionsWithTests: number;
    validationFunctionsWithoutTests: number;
    validationFunctionWarnings: string[];
    validationFieldConflictWarnings: string[];
    fieldConflicts: Array<{ fieldName: string; existingValue: any; testValue: any; validationName: string }>;
    fieldCategorization?: {
      standardFields: number;
      handledFields: number;
      unhandledFields: number;
      unhandledFieldWarnings: string[];
    };
  } | null>(null);
  const [testData, setTestData] = useState<TestDataRow[]>([]);
  const [activeTab, setActiveTab] = useState<'table' | 'code'>('table');
  const [codeTemplate, setCodeTemplate] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [codeExecutionResult, setCodeExecutionResult] = useState<{ loading?: boolean; error?: string; success?: boolean } | null>(null);
  const [pyodideReady, setPyodideReady] = useState(false);
  const [dismissedWarnings, setDismissedWarnings] = useState<Set<string>>(new Set());

  // Update code template when test data changes
  useEffect(() => {
    if (analysisResult && testData.length > 0) {
      const code = generateCodeTemplate(analysisResult.generatableFields, testData);
      setCodeTemplate(code);
    }
  }, [testData, analysisResult]);

  // Initialize when modal opens
  useEffect(() => {
    if (isOpen && acquisition) {
      analyzeSchemaForGeneration();
    }
  }, [isOpen, acquisition]);

  const analyzeSchemaForGeneration = async () => {
    setStep('analyzing');
    setError(null);
    setDismissedWarnings(new Set()); // Reset dismissed warnings on new analysis

    try {
      // Analyze the acquisition fields and series to determine what we can generate
      const allFields = [
        ...(acquisition.acquisitionFields || [])
      ];

      // Add all unique series fields from the new structure
      const seriesFieldMap = new Map<string, any>();
      (acquisition.series || []).forEach(series => {
        // Handle both array format (from loaded schemas) and object format (from processed data)
        if (Array.isArray(series.fields)) {
          series.fields.forEach(field => {
            if (!seriesFieldMap.has(field.tag)) {
              seriesFieldMap.set(field.tag, {
                ...field,
                level: 'series'
              });
            }
          });
        } else if (series.fields && typeof series.fields === 'object') {
          // Handle object format where fields is an object keyed by tag
          Object.entries(series.fields).forEach(([tag, fieldData]: [string, any]) => {
            if (!seriesFieldMap.has(tag)) {
              seriesFieldMap.set(tag, {
                tag: tag,
                name: fieldData.name || fieldData.field || tag,
                value: fieldData.value,
                level: 'series',
                ...fieldData
              });
            }
          });
        }
      });
      allFields.push(...Array.from(seriesFieldMap.values()));

      // Filter to only fields with values or validation rules (constraints we can generate from)
      const generatableFields = allFields.filter(field => {
        // Include field if it has a direct value
        if (field.value !== undefined && field.value !== null && field.value !== '') {
          // Check if value is an object with validationRule (nested structure)
          if (typeof field.value === 'object' && !Array.isArray(field.value) &&
              field.value.validationRule) {
            return true; // Has validation rule
          }
          return true; // Has direct value
        }
        // Also include if it has a validationRule at the field level
        if (field.validationRule) {
          return true;
        }
        return false;
      });

      // Analyze validation functions for passing test cases
      const validationFunctions = acquisition.validationFunctions || [];
      const validationFieldValues: Record<string, any[]> = {}; // Now stores arrays
      const fieldToValidationFuncs: Record<string, Array<{ name: string; values: any[] }>> = {}; // Track which validation functions set each field
      const noPassingTestWarnings: string[] = [];
      const fieldConflictWarnings: string[] = [];
      const conflicts: Array<{ fieldName: string; existingValue: any; testValue: any; validationName: string }> = [];
      let functionsWithTests = 0;
      let functionsWithoutTests = 0;
      let maxValidationRows = 0;

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
                  (acquisition.series || []).forEach(s => {
                    let seriesField = null;
                    if (Array.isArray(s.fields)) {
                      seriesField = s.fields.find((f: any) => f.name === fieldName || f.tag === existingField.tag);
                    } else if (s.fields && typeof s.fields === 'object') {
                      seriesField = s.fields[existingField.tag];
                    }

                    if (seriesField && seriesField.value !== undefined) {
                      let value = seriesField.value;
                      // Handle nested value structures
                      if (value && typeof value === 'object' && !Array.isArray(value)) {
                        if (value.validationRule) {
                          const rule = value.validationRule;
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
                    if (existingValue.validationRule) {
                      const rule = existingValue.validationRule;
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

      // Ensure ProtocolName field exists if not in schema
      // Use acquisition name (from UI) as fallback for ProtocolName DICOM field
      const hasProtocolName = generatableFields.some(f => f.name === 'ProtocolName');
      let fieldsForGeneration = generatableFields;
      if (!hasProtocolName) {
        const protocolNameFieldDef = await getFieldByKeyword('ProtocolName');
        if (protocolNameFieldDef && acquisition.protocolName) {
          // Clean acquisition name for use as ProtocolName (lowercase, underscores, no special chars)
          const cleanedName = acquisition.protocolName
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_+|_+$/g, '');

          fieldsForGeneration = [...generatableFields, {
            name: protocolNameFieldDef.keyword,
            tag: protocolNameFieldDef.tag,
            vr: protocolNameFieldDef.vr,
            level: 'acquisition' as const,
            value: cleanedName,
            dataType: 'String' as const
          }];
        }
      }

      // Generate initial test data based on schema constraints and validation test cases
      const initialTestData = generateInitialTestData(
        fieldsForGeneration,
        acquisition.series || [],
        validationFieldValues,
        maxValidationRows,
        acquisition.protocolName
      );

      // Categorize fields to identify unhandled fields
      const fieldCategorization = await dicompareAPI.categorizeFields(fieldsForGeneration, initialTestData);

      setAnalysisResult({
        fields: allFields,
        seriesCount: (acquisition.series || []).length,
        generatableFields: fieldsForGeneration,
        validationFunctionsWithTests: functionsWithTests,
        validationFunctionsWithoutTests: functionsWithoutTests,
        validationFunctionWarnings: noPassingTestWarnings,
        validationFieldConflictWarnings: fieldConflictWarnings,
        fieldConflicts: conflicts,
        fieldCategorization
      });
      console.log('📊 Generated initial test data:', {
        seriesCount: acquisition.series?.length || 0,
        testDataRows: initialTestData.length,
        sampleRow: initialTestData[0],
        allData: initialTestData,
        validationFieldValues,
        maxValidationRows
      });
      setTestData(initialTestData);

      // Generate code template
      const code = generateCodeTemplate(generatableFields, initialTestData);
      setCodeTemplate(code);

      setStep('editing');
    } catch (err) {
      console.error('Failed to analyze schema:', err);
      setError(`Failed to analyze schema: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const cleanAcquisitionName = (name: string): string => {
    // Convert to lowercase, replace spaces and special characters with underscores
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, ''); // Remove leading/trailing underscores
  };

  const generateInitialTestData = (
    fields: DicomField[],
    series: any[],
    validationFieldValues: Record<string, any[]> = {},
    maxValidationRows: number = 0,
    acquisitionName?: string
  ): TestDataRow[] => {
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
              seriesField = s.fields[field.tag];
            }

            if (seriesField) {
              // Extract the actual value from the series field
              if (seriesField.value !== undefined) {
                // Check if value has nested validation rule structure
                if (typeof seriesField.value === 'object' && !Array.isArray(seriesField.value) &&
                    seriesField.value.validationRule) {
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
          // No series data for this row (extra rows from validation tests)
          if (field.level === 'acquisition' || !row[field.name]) {
            // Use the field value if it's explicitly set, otherwise generate
            if (field.value !== undefined) {
              row[field.name] = field.value;
            } else {
              row[field.name] = generateValueFromField(field);
            }
          }
        }
      });

      // Add fallback identifiers only if not already set by schema fields
      // This runs AFTER all fields have been processed to avoid overriding schema-defined values
      if (series.length > 0 && rowIndex < series.length) {
        const s = series[rowIndex];
        if (!row['SeriesDescription']) {
          row['SeriesDescription'] = s.name || `Series_${rowIndex + 1}`;
        }
      }

      // Add ProtocolName fallback using acquisition name if not set by schema
      if (!row['ProtocolName'] && acquisitionName) {
        row['ProtocolName'] = acquisitionName;
      }

      rows.push(row);
    }

    return rows;
  };

  const generateValueFromField = (field: DicomField): any => {
    // Check if value is an object with validationRule (nested structure from loaded schemas)
    if (field.value && typeof field.value === 'object' && !Array.isArray(field.value)) {
      if (field.value.validationRule) {
        const rule = field.value.validationRule;
        const dataType = field.value.dataType || 'string';

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
  };

  const generateCodeTemplate = (fields: DicomField[], testData: TestDataRow[]): string => {
    // Get unique field names from test data
    const fieldNames = [...new Set(testData.flatMap(row => Object.keys(row)))];

    // Separate fields into constants (same across all DICOMs) and varying (different values)
    const constants: Record<string, any> = {};
    const varying: Record<string, any[]> = {};

    fieldNames.forEach(fieldName => {
      const field = fields.find(f => f.name === fieldName);
      const values = testData.map(row => row[fieldName]).filter(v => v !== undefined);

      // Check if all values are the same
      const allSame = values.every((v, i) =>
        i === 0 || JSON.stringify(v) === JSON.stringify(values[0])
      );

      const tag = field?.tag || '';
      const comment = tag ? `  # ${tag}` : '';

      if (allSame && values.length > 0) {
        // Constant field - just store single value
        const value = values[0];
        constants[fieldName] = { value, comment };
      } else {
        // Varying field - store all values
        varying[fieldName] = { values, comment };
      }
    });

    // Generate constants section
    const constantEntries = Object.entries(constants).map(([fieldName, { value, comment }]) => {
      const valueStr = Array.isArray(value)
        ? `[${value.map(item => typeof item === 'string' ? `"${item}"` : item).join(', ')}]`
        : typeof value === 'string' ? `"${value}"` : String(value);

      return `    '${fieldName}': ${valueStr},${comment}`;
    });

    // Generate varying section
    const varyingEntries = Object.entries(varying).map(([fieldName, { values, comment }]) => {
      const valuesStr = `[${values.map(v =>
        Array.isArray(v)
          ? `[${v.map(item => typeof item === 'string' ? `"${item}"` : item).join(', ')}]`
          : typeof v === 'string' ? `"${v}"` : String(v)
      ).join(', ')}]`;

      return `    '${fieldName}': ${valuesStr},${comment}`;
    });

    return `import pandas as pd
import numpy as np

# Fields that are the same across all DICOMs
constants = {
${constantEntries.join('\n')}
}

# Fields that vary across DICOMs (number of DICOMs = length of lists)
varying = {
${varyingEntries.join('\n')}
}

# Generate test_data by merging constants and varying
num_dicoms = max([len(v) for v in varying.values()]) if varying else 1
test_data = {}

# Add constant fields (replicate across all DICOMs)
for field, value in constants.items():
    test_data[field] = [value] * num_dicoms

# Add varying fields
for field, values in varying.items():
    test_data[field] = values

return test_data`;
  };

  const updateTestDataValue = (rowIndex: number, fieldName: string, value: string) => {
    const newTestData = [...testData];

    // Ensure row exists
    while (newTestData.length <= rowIndex) {
      newTestData.push({});
    }

    // Smart value parsing (similar to ValidationFunctionEditorModal)
    let parsedValue;
    if (value.trim() === '') {
      parsedValue = '';
    } else if (value.includes(',')) {
      // Comma-separated values - parse as array
      const arrayValues = value.split(',').map(v => {
        const trimmed = v.trim();
        if (trimmed === '') return '';
        const num = parseFloat(trimmed);
        return isNaN(num) ? v : num;
      });
      parsedValue = arrayValues;
    } else {
      // Single value - try to parse as number
      const trimmed = value.trim();
      const num = parseFloat(trimmed);
      parsedValue = isNaN(num) ? value : num;
    }

    newTestData[rowIndex][fieldName] = parsedValue;
    setTestData(newTestData);
  };

  const addRow = () => {
    const newRow: TestDataRow = {};
    if (analysisResult) {
      analysisResult.generatableFields.forEach(field => {
        newRow[field.name] = generateValueFromField(field);
      });
    }
    setTestData([...testData, newRow]);
  };

  const removeRow = (rowIndex: number) => {
    const newTestData = testData.filter((_, index) => index !== rowIndex);
    setTestData(newTestData);
  };

  const executeCodeTemplate = async () => {
    setCodeExecutionResult({ loading: true });

    try {
      // Initialize Pyodide if needed
      if (!pyodideReady) {
        await pyodideManager.initialize();
        setPyodideReady(true);
      }

      const wrappedCode = `
import pandas as pd
import numpy as np
import json

def generate_test_data():
${codeTemplate.split('\n').map(line => '    ' + line).join('\n')}

output = None
try:
    result = generate_test_data()
    if not isinstance(result, dict):
        raise ValueError("Code must return a dictionary")

    # Convert numpy arrays and other non-serializable types to lists
    cleaned_result = {}
    for key, value in result.items():
        if hasattr(value, 'tolist'):  # numpy array
            cleaned_result[key] = value.tolist()
        elif isinstance(value, list):
            # Handle lists that might contain numpy types
            cleaned_list = []
            for item in value:
                if hasattr(item, 'tolist'):
                    cleaned_list.append(item.tolist())
                elif hasattr(item, 'item'):  # numpy scalar
                    cleaned_list.append(item.item())
                else:
                    cleaned_list.append(item)
            cleaned_result[key] = cleaned_list
        elif hasattr(value, 'item'):  # numpy scalar
            cleaned_result[key] = [value.item()]
        else:
            cleaned_result[key] = [value] if not isinstance(value, list) else value

    # Validate all arrays have same length
    if cleaned_result:
        lengths = [len(v) for v in cleaned_result.values()]
        if len(set(lengths)) > 1:
            field_lengths = {k: len(v) for k, v in cleaned_result.items()}
            raise ValueError(f"All fields must have the same number of values. Found: {field_lengths}")

    output = json.dumps({"success": True, "data": cleaned_result})
except Exception as e:
    output = json.dumps({"success": False, "error": str(e)})

# Return the JSON output
output
`;

      const result = await pyodideManager.runPython(wrappedCode);

      if (result === undefined || result === null) {
        throw new Error('No output from Python code execution');
      }

      let parsed;
      try {
        parsed = JSON.parse(result as string);
      } catch (parseErr) {
        throw new Error(`Invalid JSON output from Python: ${result}`);
      }

      if (parsed.success) {
        // Convert the data to the format expected by testData
        const numRows = Object.values(parsed.data)[0]?.length || 0;
        const newTestData: TestDataRow[] = [];

        for (let i = 0; i < numRows; i++) {
          const row: TestDataRow = {};
          for (const [field, values] of Object.entries(parsed.data)) {
            row[field] = (values as any[])[i];
          }
          newTestData.push(row);
        }

        setTestData(newTestData);
        setCodeExecutionResult({ success: true });
      } else {
        setCodeExecutionResult({ error: parsed.error });
      }
    } catch (error: any) {
      setCodeExecutionResult({ error: `Execution failed: ${error.message}` });
    }
  };

  const generateDicoms = async () => {
    if (!analysisResult || testData.length === 0) {
      setError('No test data to generate DICOMs from');
      return;
    }

    setIsGenerating(true);
    setStep('generating');
    setError(null);

    try {
      // Build field list from both generatableFields and testData
      // For validation-only schemas, we need to infer field info from testData
      const fieldsForGeneration = [...analysisResult.generatableFields];

      // Add fields from testData that aren't in generatableFields
      const existingFieldNames = new Set(fieldsForGeneration.map(f => f.name));
      const testDataFieldNames = [...new Set(testData.flatMap(row => Object.keys(row)))];

      // Look up DICOM tags for fields from validation tests
      console.log('🔍 Looking up DICOM tags for fields from validation tests:', testDataFieldNames);
      for (const fieldName of testDataFieldNames) {
        if (!existingFieldNames.has(fieldName)) {
          // This field came from validation tests - look up its tag by keyword
          console.log(`  Looking up field: ${fieldName}`);
          const fieldDef = await getFieldByKeyword(fieldName);
          console.log(`  Result:`, fieldDef);

          if (fieldDef) {
            // Remove parentheses from tag if present (e.g., "(0018,0081)" -> "0018,0081")
            const tag = fieldDef.tag.replace(/[()]/g, '');

            console.log(`  ✅ Added field: ${fieldName} -> ${tag} (VR: ${fieldDef.vr})`);
            fieldsForGeneration.push({
              name: fieldName,
              tag,
              vr: fieldDef.vr || '',
              level: 'acquisition' as const,
              dataType: inferDataTypeFromValue(testData[0][fieldName]),
              value: testData[0][fieldName]
            } as any);
          } else {
            console.warn(`⚠️ Unknown DICOM field: ${fieldName} - field will be skipped in DICOM generation`);
          }
        }
      }

      // Debug logging
      console.log('📊 TestDicomGeneratorModal: Sending to API:', {
        testDataRows: testData.length,
        sampleRow: testData[0],
        allTestData: testData,
        generatableFields: analysisResult.generatableFields.map(f => ({ name: f.name, tag: f.tag, level: f.level, vr: f.vr })),
        fieldsForGeneration: fieldsForGeneration.map(f => ({ name: f.name, tag: f.tag, level: f.level, vr: f.vr, dataType: f.dataType }))
      });

      // Call the DicompareAPI to generate DICOMs
      const zipBlob = await dicompareAPI.generateTestDicomsFromSchema(
        acquisition,
        testData,
        fieldsForGeneration
      );

      // Trigger download
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `test_dicoms_${acquisition.protocolName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Close modal on success
      onClose();
    } catch (err) {
      console.error('Failed to generate DICOMs:', err);
      setError(`Failed to generate DICOMs: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setStep('editing'); // Go back to editing step
    } finally {
      setIsGenerating(false);
    }
  };

  if (!isOpen) return null;

  // Get field names from actual test data (supports validation-only schemas)
  const fieldNames = [...new Set(testData.flatMap(row => Object.keys(row)))];
  const maxRows = Math.max(1, testData.length);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Generate Test DICOMs</h2>
            <p className="text-sm text-gray-600 mt-1">
              Create compliant DICOM files from schema: {acquisition.protocolName}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {step === 'analyzing' && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-medical-600" />
                <p className="text-gray-600">Analyzing schema for DICOM generation...</p>
              </div>
            </div>
          )}

          {step === 'editing' && analysisResult && (
            <div className="p-6 space-y-6 overflow-y-auto h-full">
              {/* Validation Function Success Message */}
              {analysisResult.validationFunctionsWithTests > 0 && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                  <div className="flex items-center">
                    <CheckCircle className="h-5 w-5 text-green-600 mr-2 flex-shrink-0" />
                    <p className="text-sm text-green-800">
                      <strong>{analysisResult.validationFunctionsWithTests}</strong> validation function{analysisResult.validationFunctionsWithTests !== 1 ? 's have' : ' has'} passing test cases. Field values extracted and applied.
                    </p>
                  </div>
                </div>
              )}

              {/* Field Conflict Warnings */}
              {analysisResult.fieldConflicts.length > 0 && !dismissedWarnings.has('schemaConflicts') && (
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                  <div className="flex items-start">
                    <AlertTriangle className="h-5 w-5 text-orange-600 mr-2 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <h3 className="font-medium text-orange-900 mb-2">
                        Field Value Conflicts Detected
                      </h3>
                      <p className="text-sm text-orange-800 mb-3">
                        The following fields have different values in the schema vs. validation test cases. <strong>Using validation test values</strong> to ensure generated DICOMs pass validation:
                      </p>
                      <div className="space-y-2">
                        {analysisResult.fieldConflicts.map((conflict, idx) => (
                          <div key={idx} className="bg-white border border-orange-200 rounded p-3 text-sm">
                            <div className="font-medium text-orange-900 mb-1">
                              {conflict.fieldName} (from "{conflict.validationName}")
                            </div>
                            <div className="text-orange-800 space-y-1">
                              <div>Schema value: <code className="bg-orange-100 px-1 rounded">{JSON.stringify(conflict.existingValue)}</code></div>
                              <div>Test value: <code className="bg-green-100 px-1 rounded">{JSON.stringify(conflict.testValue)}</code> ✓</div>
                            </div>
                          </div>
                        ))}
                      </div>
                      <p className="text-xs text-orange-700 mt-3">
                        <strong>Recommendation:</strong> Consider removing these fields from the acquisition/series tables since they're controlled by validation functions.
                      </p>
                    </div>
                    <button
                      onClick={() => setDismissedWarnings(new Set(dismissedWarnings).add('schemaConflicts'))}
                      className="ml-2 text-orange-600 hover:text-orange-800"
                      title="Dismiss warning"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* Validation Field Conflict Warnings */}
              {analysisResult.validationFieldConflictWarnings.length > 0 && !dismissedWarnings.has('fieldConflicts') && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <div className="flex items-start">
                    <AlertTriangle className="h-5 w-5 text-yellow-600 mr-2 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <h3 className="font-medium text-yellow-900 mb-2">
                        Conflicting Validation Test Values
                      </h3>
                      <p className="text-sm text-yellow-800 mb-2">
                        Multiple validation functions use the same fields with different test values. The generated test data may not pass all validations:
                      </p>
                      <ul className="text-sm text-yellow-800 list-disc list-inside space-y-1">
                        {analysisResult.validationFieldConflictWarnings.map((warning, idx) => (
                          <li key={idx}>{warning}</li>
                        ))}
                      </ul>
                      <p className="text-xs text-yellow-700 mt-2">
                        <strong>Note:</strong> Automatically combining conflicting validation constraints is non-trivial. You may need to manually adjust the test data to satisfy all validations.
                      </p>
                    </div>
                    <button
                      onClick={() => setDismissedWarnings(new Set(dismissedWarnings).add('fieldConflicts'))}
                      className="ml-2 text-yellow-600 hover:text-yellow-800"
                      title="Dismiss warning"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* Validation Function Warnings */}
              {analysisResult.validationFunctionWarnings.length > 0 && !dismissedWarnings.has('noPassingTests') && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <div className="flex items-start">
                    <AlertTriangle className="h-5 w-5 text-yellow-600 mr-2 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <h3 className="font-medium text-yellow-900 mb-2">
                        Validation Functions Without Passing Tests
                      </h3>
                      <p className="text-sm text-yellow-800 mb-2">
                        The following validation functions don't have passing test cases, so their field requirements cannot be auto-generated:
                      </p>
                      <ul className="text-sm text-yellow-800 list-disc list-inside space-y-1">
                        {analysisResult.validationFunctionWarnings.map((warning, idx) => (
                          <li key={idx}>{warning}</li>
                        ))}
                      </ul>
                      <p className="text-xs text-yellow-700 mt-2">
                        Add passing test cases to these validation functions to automatically populate their field values.
                      </p>
                    </div>
                    <button
                      onClick={() => setDismissedWarnings(new Set(dismissedWarnings).add('noPassingTests'))}
                      className="ml-2 text-yellow-600 hover:text-yellow-800"
                      title="Dismiss warning"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* Unhandled Fields Warning */}
              {analysisResult.fieldCategorization && analysisResult.fieldCategorization.unhandledFieldWarnings.length > 0 && !dismissedWarnings.has('unhandledFields') && (
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                  <div className="flex items-start">
                    <AlertTriangle className="h-5 w-5 text-orange-600 mr-2 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <h3 className="font-medium text-orange-900 mb-2">
                        Fields Cannot Be Encoded in DICOMs
                      </h3>
                      <p className="text-sm text-orange-800 mb-2">
                        The following fields have no standard DICOM tag or special encoding method. Generated DICOMs will NOT include these fields and may fail validation:
                      </p>
                      <ul className="list-disc list-inside text-sm text-orange-700 space-y-1">
                        {analysisResult.fieldCategorization.unhandledFieldWarnings.map((warning, idx) => (
                          <li key={idx}>{warning}</li>
                        ))}
                      </ul>
                      <div className="mt-3 text-xs text-orange-700 bg-orange-100 p-2 rounded">
                        <strong>Summary:</strong> {analysisResult.fieldCategorization.standardFields} standard DICOM fields, {analysisResult.fieldCategorization.handledFields} handled special fields (e.g., MultibandFactor), {analysisResult.fieldCategorization.unhandledFields} unhandled fields
                      </div>
                    </div>
                    <button
                      onClick={() => setDismissedWarnings(new Set(dismissedWarnings).add('unhandledFields'))}
                      className="ml-2 text-orange-600 hover:text-orange-800"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* Tab Navigation */}
              <div className="flex items-center justify-between">
                <div className="flex space-x-1">
                  <button
                    onClick={() => setActiveTab('table')}
                    className={`px-3 py-1 text-sm font-medium rounded-t-md border-b-2 flex items-center space-x-1 ${
                      activeTab === 'table'
                        ? 'text-blue-600 border-blue-600 bg-blue-50'
                        : 'text-gray-500 border-transparent hover:text-gray-700'
                    }`}
                  >
                    <Table className="h-4 w-4" />
                    <span>Table Editor</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('code')}
                    className={`px-3 py-1 text-sm font-medium rounded-t-md border-b-2 flex items-center space-x-1 ${
                      activeTab === 'code'
                        ? 'text-green-600 border-green-600 bg-green-50'
                        : 'text-gray-500 border-transparent hover:text-gray-700'
                    }`}
                  >
                    <Code className="h-4 w-4" />
                    <span>Code View</span>
                  </button>
                </div>

                {activeTab === 'table' && (
                  <button
                    onClick={addRow}
                    className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                  >
                    + Add Row
                  </button>
                )}
              </div>

              {/* Table Editor */}
              {activeTab === 'table' && (
                <div className="border border-gray-300 rounded-lg overflow-hidden">
                  <div className="overflow-x-auto max-h-96 overflow-y-auto">
                    <div className="min-w-max">
                      {/* Header - Row numbers as columns */}
                      <div className="bg-gray-50 border-b border-gray-300 flex sticky top-0 z-20">
                        <div className="w-48 px-2 py-2 text-sm font-medium text-gray-700 border-r border-gray-300 sticky left-0 bg-gray-50 z-30">Field Name</div>
                        {Array.from({ length: maxRows }, (_, rowIndex) => (
                          <div key={rowIndex} className="w-40 flex-shrink-0 px-2 py-2 text-sm font-medium text-gray-700 border-r border-gray-300 last:border-r-0 flex items-center justify-between">
                            <span>DICOM {rowIndex + 1}</span>
                            {testData.length > 1 && (
                              <button
                                onClick={() => removeRow(rowIndex)}
                                className="p-1 text-red-500 hover:text-red-700 text-xs"
                                title="Delete row"
                              >
                                ×
                              </button>
                            )}
                          </div>
                        ))}
                      </div>

                      {/* Rows - Each field becomes a row */}
                      {fieldNames.map((fieldName) => (
                        <div key={fieldName} className="flex border-b border-gray-200 last:border-b-0">
                          <div className="w-48 px-2 py-2 text-sm font-medium text-gray-700 border-r border-gray-300 bg-gray-50 flex items-center sticky left-0 z-10">
                            {fieldName}
                          </div>
                          {Array.from({ length: maxRows }, (_, rowIndex) => (
                            <div key={rowIndex} className="w-40 flex-shrink-0 border-r border-gray-300 last:border-r-0 bg-white">
                              <input
                                type="text"
                                value={(() => {
                                  const value = testData[rowIndex]?.[fieldName];
                                  if (value === undefined || value === null) return '';
                                  if (Array.isArray(value)) return value.join(', ');
                                  return String(value);
                                })()}
                                onChange={(e) => updateTestDataValue(rowIndex, fieldName, e.target.value)}
                                className="w-full px-2 py-2 text-sm border-none focus:outline-none focus:bg-blue-50"
                                placeholder={`${fieldName} value`}
                              />
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="px-2 py-1 text-xs text-gray-500 bg-gray-50 border-t flex items-center justify-between">
                    <span>Rows: {maxRows} | Each row will generate one DICOM file</span>
                    <span className="text-xs text-gray-400">(Table transposed: fields as rows, data as columns)</span>
                  </div>
                </div>
              )}

              {/* Code View */}
              {activeTab === 'code' && (
                <div className="space-y-3">
                  <div className="border border-gray-300 rounded-lg overflow-hidden">
                    <CodeMirror
                      value={codeTemplate}
                      onChange={(value) => {
                        setCodeTemplate(value);
                        setCodeExecutionResult(null); // Clear results when code changes
                      }}
                      extensions={[python()]}
                      theme="light"
                      height="300px"
                      basicSetup={{
                        lineNumbers: true,
                        foldGutter: true,
                        dropCursor: false,
                        allowMultipleSelections: false,
                        indentOnInput: true,
                        bracketMatching: true,
                        closeBrackets: true,
                        autocompletion: true,
                        highlightSelectionMatches: false,
                      }}
                      className="text-sm"
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <button
                      onClick={executeCodeTemplate}
                      disabled={codeExecutionResult?.loading}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                    >
                      {codeExecutionResult?.loading ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>Running...</span>
                        </>
                      ) : (
                        <>
                          <Play className="h-4 w-4" />
                          <span>Run Code</span>
                        </>
                      )}
                    </button>
                    <div className="text-xs text-gray-500">
                      Returns a dictionary with test data. Click run to update the table.
                    </div>
                  </div>

                  {/* Code Execution Results */}
                  {codeExecutionResult?.error && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                      <strong>Error:</strong> {codeExecutionResult.error}
                    </div>
                  )}

                  {codeExecutionResult?.success && (
                    <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
                      <strong>Success!</strong> Generated {testData.length} DICOM{testData.length !== 1 ? 's' : ''} with {Object.keys(testData[0] || {}).length} fields. Switch to Table Editor to view.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {step === 'generating' && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-medical-600" />
                <p className="text-gray-600">Generating DICOM files...</p>
                <p className="text-sm text-gray-500 mt-2">This may take a moment...</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {step === 'editing' && (
          <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
            <div>
              {error && (
                <div className="text-sm text-red-600">
                  {error}
                </div>
              )}
            </div>
            <div className="flex space-x-3">
              <button
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={generateDicoms}
                disabled={isGenerating || testData.length === 0}
                className="px-4 py-2 bg-medical-600 text-white rounded-lg hover:bg-medical-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center space-x-2"
              >
                <Download className="h-4 w-4" />
                <span>Generate & Download DICOMs</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TestDicomGeneratorModal;