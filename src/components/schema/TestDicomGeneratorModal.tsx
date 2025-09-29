import React, { useState, useEffect } from 'react';
import { X, Download, Loader2, Play, FileDown, Table, Code, AlertTriangle } from 'lucide-react';
import { Acquisition, DicomField } from '../../types';
import { inferDataTypeFromValue } from '../../utils/datatypeInference';
import { dicompareAPI } from '../../services/DicompareAPI';

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
    skippedRules: number;
  } | null>(null);
  const [testData, setTestData] = useState<TestDataRow[]>([]);
  const [activeTab, setActiveTab] = useState<'table' | 'code'>('table');
  const [codeTemplate, setCodeTemplate] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

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

      const skippedRules = (acquisition.validationFunctions || []).length;

      setAnalysisResult({
        fields: allFields,
        seriesCount: (acquisition.series || []).length,
        generatableFields,
        skippedRules
      });

      // Generate initial test data based on schema constraints
      const initialTestData = generateInitialTestData(generatableFields, acquisition.series || []);
      console.log('📊 Generated initial test data:', {
        seriesCount: acquisition.series?.length || 0,
        testDataRows: initialTestData.length,
        sampleRow: initialTestData[0],
        allData: initialTestData
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

  const generateInitialTestData = (fields: DicomField[], series: any[]): TestDataRow[] => {
    // If we have series, generate one row per series
    if (series.length > 0) {
      return series.map((s, index) => {
        const row: TestDataRow = {};

        // Add fields - both acquisition and series
        fields.forEach(field => {
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
            // Acquisition fields are the same for all series
            row[field.name] = generateValueFromField(field);
          } else if (!row[field.name]) {
            row[field.name] = generateValueFromField(field);
          }
        });

        // Add a series identifier only if SeriesDescription isn't already set
        if (!row['SeriesDescription']) {
          row['SeriesDescription'] = s.name || `Series_${index + 1}`;
        }

        return row;
      });
    } else {
      // Generate single row for acquisition-only schema
      const row: TestDataRow = {};
      fields.forEach(field => {
        row[field.name] = generateValueFromField(field);
      });
      return [row];
    }
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

    // For each field, collect values across all test data rows
    const fieldEntries = fieldNames.map(fieldName => {
      const field = fields.find(f => f.name === fieldName);
      const values = testData.map(row => row[fieldName]).filter(v => v !== undefined);

      const valueStr = `[${values.map(v =>
        Array.isArray(v)
          ? `[${v.map(item => typeof item === 'string' ? `"${item}"` : item).join(', ')}]`
          : typeof v === 'string' ? `"${v}"` : String(v)
      ).join(', ')}]`;

      const tag = field?.tag || '';
      const comment = tag ? `  # ${tag}` : '';
      return `    '${fieldName}': ${valueStr},${comment}`;
    });

    return `import pandas as pd
import numpy as np

# Generate test data for schema fields
# Modify the values below to create your test DICOMs

test_data = {
${fieldEntries.join('\n')}
}

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

  const generateDicoms = async () => {
    if (!analysisResult || testData.length === 0) {
      setError('No test data to generate DICOMs from');
      return;
    }

    setIsGenerating(true);
    setStep('generating');
    setError(null);

    try {
      // Debug logging
      console.log('📊 TestDicomGeneratorModal: Sending to API:', {
        testDataRows: testData.length,
        sampleRow: testData[0],
        allTestData: testData,
        generatableFields: analysisResult.generatableFields.map(f => ({ name: f.name, tag: f.tag, level: f.level, vr: f.vr }))
      });

      // Call the DicompareAPI to generate DICOMs
      const zipBlob = await dicompareAPI.generateTestDicomsFromSchema(
        acquisition,
        testData,
        analysisResult.generatableFields
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

  const fieldNames = analysisResult?.generatableFields.map(f => f.name) || [];
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
              {/* Analysis Summary */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="font-medium text-blue-900 mb-2">Schema Analysis</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-blue-700">Total fields:</span> {analysisResult.fields.length}
                  </div>
                  <div>
                    <span className="text-blue-700">Generatable fields:</span> {analysisResult.generatableFields.length}
                  </div>
                  <div>
                    <span className="text-blue-700">Series count:</span> {analysisResult.seriesCount}
                  </div>
                  {analysisResult.skippedRules > 0 && (
                    <div className="flex items-center">
                      <AlertTriangle className="h-4 w-4 text-yellow-500 mr-1" />
                      <span className="text-yellow-700">Validation rules skipped:</span> {analysisResult.skippedRules}
                    </div>
                  )}
                </div>
                {analysisResult.skippedRules > 0 && (
                  <p className="text-xs text-yellow-600 mt-2">
                    Note: Validation rules contain custom Python code and cannot be automatically converted to DICOM values.
                  </p>
                )}
              </div>

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
                  {/* Header */}
                  <div className="bg-gray-50 border-b border-gray-300 flex">
                    <div className="w-12 px-2 py-2 text-sm font-medium text-gray-700 border-r border-gray-300">#</div>
                    {fieldNames.map(fieldName => (
                      <div key={fieldName} className="flex-1 px-2 py-2 text-sm font-medium text-gray-700 border-r border-gray-300 last:border-r-0">
                        {fieldName}
                      </div>
                    ))}
                    <div className="w-12"></div>
                  </div>

                  {/* Rows */}
                  <div className="max-h-80 overflow-y-auto">
                    {Array.from({ length: maxRows }, (_, rowIndex) => (
                      <div key={rowIndex} className="flex border-b border-gray-200 last:border-b-0">
                        <div className="w-12 px-2 py-2 text-sm text-gray-500 border-r border-gray-300 bg-gray-50 flex items-center">
                          {rowIndex}
                        </div>
                        {fieldNames.map(fieldName => (
                          <div key={fieldName} className="flex-1 border-r border-gray-300 last:border-r-0">
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
                        <div className="w-12 flex items-center justify-center">
                          {testData.length > 1 && (
                            <button
                              onClick={() => removeRow(rowIndex)}
                              className="p-1 text-red-500 hover:text-red-700 text-sm"
                              title="Delete row"
                            >
                              ×
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="px-2 py-1 text-xs text-gray-500 bg-gray-50 border-t">
                    Rows: {maxRows} | Each row will generate one DICOM file
                  </div>
                </div>
              )}

              {/* Code View */}
              {activeTab === 'code' && (
                <div className="space-y-2">
                  <div className="bg-gray-50 border border-gray-300 rounded-lg p-4">
                    <pre className="text-sm text-gray-800 whitespace-pre-wrap font-mono">
                      {codeTemplate}
                    </pre>
                  </div>
                  <div className="text-xs text-gray-500">
                    This shows how the test data would be structured as a pandas DataFrame
                  </div>
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