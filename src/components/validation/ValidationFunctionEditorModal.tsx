import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, Play, Loader2 } from 'lucide-react';
import CodeMirror from '@uiw/react-codemirror';
import { python } from '@codemirror/lang-python';
import { linter, lintGutter } from '@codemirror/lint';
import { SelectedFunction, TestCase } from './ValidationFunctionLibraryModal';
import { pyodideManager } from '../../services/PyodideManager';

interface ValidationFunctionEditorModalProps {
  isOpen: boolean;
  func: SelectedFunction | null;
  onClose: () => void;
  onSave: (func: SelectedFunction) => void;
}

// Available system fields
const SYSTEM_FIELDS = {
  'Count': {
    name: 'Count',
    description: 'Number of slices/images per row (typically from DICOM metadata)'
  }
};

const ValidationFunctionEditorModal: React.FC<ValidationFunctionEditorModalProps> = ({
  isOpen,
  func,
  onClose,
  onSave
}) => {
  const [editedFunc, setEditedFunc] = useState<SelectedFunction | null>(null);
  const [pyodideReady, setPyodideReady] = useState(false);
  const [pandasInstalled, setPandasInstalled] = useState(false);
  const [dicompareInstalled, setDicompareInstalled] = useState(false);
  const [testResults, setTestResults] = useState<Record<string, { passed: boolean; error?: string; stdout?: string; loading?: boolean }>>({});

  // Initialize edited function when modal opens or func changes
  useEffect(() => {
    if (func) {
      setEditedFunc({
        ...func,
        customName: func.customName || func.name,
        customDescription: func.customDescription || func.description,
        customFields: func.customFields || [...func.fields],
        customImplementation: func.customImplementation || func.implementation,
        customTestCases: func.customTestCases || func.testCases || [],
        enabledSystemFields: func.enabledSystemFields || []
      });
    }
  }, [func]);

  // Lazy initialize Pyodide only when needed
  const initializePyodideIfNeeded = async () => {
    if (!pyodideReady) {
      try {
        await pyodideManager.initialize();
        setPyodideReady(true);
      } catch (error) {
        console.error('Failed to initialize Pyodide:', error);
        throw error;
      }
    }
  };

  // Simple Python linter for basic syntax checking
  const pythonLinter = linter((view) => {
    const diagnostics = [];
    const code = view.state.doc.toString();
    
    // Basic Python syntax checks
    const lines = code.split('\n');
    
    lines.forEach((line, lineIndex) => {
      const trimmedLine = line.trim();
      
      // Check for unmatched parentheses in the line
      const openParens = (line.match(/\(/g) || []).length;
      const closeParens = (line.match(/\)/g) || []).length;
      if (openParens !== closeParens && trimmedLine.length > 0) {
        diagnostics.push({
          from: view.state.doc.line(lineIndex + 1).from,
          to: view.state.doc.line(lineIndex + 1).to,
          severity: 'warning',
          message: 'Unmatched parentheses'
        });
      }
      
      // Check for missing colons after if/for/while/def
      if (/^\s*(if|for|while|def|class|try|except|finally|with)\s+.+[^:]$/.test(line) && trimmedLine.length > 0) {
        diagnostics.push({
          from: view.state.doc.line(lineIndex + 1).from,
          to: view.state.doc.line(lineIndex + 1).to,
          severity: 'error',
          message: 'Missing colon after statement'
        });
      }
    });
    
    // Check if function has return statement (should NOT return anything)
    if (code.trim().length > 0 && code.includes('return')) {
      const lines = code.split('\n');
      lines.forEach((line, lineIndex) => {
        if (line.trim().startsWith('return')) {
          diagnostics.push({
            from: view.state.doc.line(lineIndex + 1).from,
            to: view.state.doc.line(lineIndex + 1).to,
            severity: 'warning',
            message: 'Validation functions should not return anything - raise ValidationError for failures'
          });
        }
      });
    }
    
    return diagnostics;
  });

  const addTestCase = () => {
    if (!editedFunc) return;
    
    const allFields = [...(editedFunc.customFields || editedFunc.fields), ...(editedFunc.enabledSystemFields || [])];
    const newTestCase: TestCase = {
      id: `test_${Date.now()}`,
      name: 'New Test Case',
      data: Object.fromEntries(allFields.map(field => [field, ['']]) // Start with one empty row
      ),
      expectedToPass: true,
      description: ''
    };
    
    setEditedFunc(prev => prev ? ({
      ...prev,
      customTestCases: [...(prev.customTestCases || []), newTestCase]
    }) : null);
  };

  const updateTestCase = (testIndex: number, updates: Partial<TestCase>) => {
    setEditedFunc(prev => prev ? ({
      ...prev,
      customTestCases: prev.customTestCases?.map((tc, i) => 
        i === testIndex ? { ...tc, ...updates } : tc
      ) || []
    }) : null);
    
    // Clear test results when test case is updated
    const testCase = editedFunc?.customTestCases?.[testIndex];
    if (testCase) {
      setTestResults(prev => {
        const newResults = { ...prev };
        delete newResults[testCase.id];
        return newResults;
      });
    }
  };

  const deleteTestCase = (testIndex: number) => {
    setEditedFunc(prev => prev ? ({
      ...prev,
      customTestCases: prev.customTestCases?.filter((_, i) => i !== testIndex) || []
    }) : null);
  };

  const addFieldToFunction = () => {
    if (!editedFunc) return;
    
    const newField = `NewField${(editedFunc.customFields || editedFunc.fields).length + 1}`;
    setEditedFunc(prev => {
      if (!prev) return null;
      
      // Add the new field to customFields
      const updatedFields = [...(prev.customFields || prev.fields), newField];
      
      // Also add this field to all existing test cases with empty value
      const updatedTestCases = (prev.customTestCases || []).map(testCase => ({
        ...testCase,
        data: {
          ...testCase.data,
          [newField]: [''] // Initialize with one empty row
        }
      }));
      
      return {
        ...prev,
        customFields: updatedFields,
        customTestCases: updatedTestCases
      };
    });
  };

  const removeFieldFromFunction = (fieldIndex: number) => {
    setEditedFunc(prev => {
      if (!prev) return null;
      
      const fields = prev.customFields || prev.fields;
      const fieldToRemove = fields[fieldIndex];
      
      // Remove field from customFields
      const updatedFields = fields.filter((_, i) => i !== fieldIndex);
      
      // Also remove this field from all test cases' data
      const updatedTestCases = (prev.customTestCases || []).map(testCase => ({
        ...testCase,
        data: Object.fromEntries(
          Object.entries(testCase.data).filter(([fieldName]) => fieldName !== fieldToRemove)
        )
      }));
      
      return {
        ...prev,
        customFields: updatedFields,
        customTestCases: updatedTestCases
      };
    });
  };

  const updateFieldInFunction = (fieldIndex: number, newValue: string) => {
    setEditedFunc(prev => {
      if (!prev) return null;
      
      const fields = prev.customFields || prev.fields;
      const oldFieldName = fields[fieldIndex];
      
      // Update the field name
      const updatedFields = fields.map((field, i) => 
        i === fieldIndex ? newValue : field
      );
      
      // If the field name changed, update it in all test cases' data
      const updatedTestCases = oldFieldName !== newValue
        ? (prev.customTestCases || []).map(testCase => {
            const newData = { ...testCase.data };
            if (oldFieldName in newData) {
              newData[newValue] = newData[oldFieldName];
              delete newData[oldFieldName];
            }
            return { ...testCase, data: newData };
          })
        : prev.customTestCases;
      
      return {
        ...prev,
        customFields: updatedFields,
        customTestCases: updatedTestCases
      };
    });
  };

  const toggleSystemField = (fieldName: string) => {
    setEditedFunc(prev => {
      if (!prev) return null;
      
      const currentSystemFields = prev.enabledSystemFields || [];
      const isEnabled = currentSystemFields.includes(fieldName);
      
      if (isEnabled) {
        // Remove the system field and update test cases
        const updatedTestCases = (prev.customTestCases || []).map(testCase => ({
          ...testCase,
          data: Object.fromEntries(
            Object.entries(testCase.data).filter(([field]) => field !== fieldName)
          )
        }));
        
        return {
          ...prev,
          enabledSystemFields: currentSystemFields.filter(f => f !== fieldName),
          customTestCases: updatedTestCases
        };
      } else {
        // Add the system field and update test cases
        const updatedTestCases = (prev.customTestCases || []).map(testCase => ({
          ...testCase,
          data: {
            ...testCase.data,
            [fieldName]: [''] // Initialize with empty value
          }
        }));
        
        return {
          ...prev,
          enabledSystemFields: [...currentSystemFields, fieldName],
          customTestCases: updatedTestCases
        };
      }
    });
  };

  const runTestCase = async (testCase: TestCase, liveImplementation?: string, liveFields?: string[], liveSystemFields?: string[]) => {
    if (!editedFunc) return;
    
    const implementation = liveImplementation || editedFunc.customImplementation || editedFunc.implementation;
    const baseFields = liveFields || editedFunc.customFields || editedFunc.fields;
    const systemFields = liveSystemFields || editedFunc.enabledSystemFields || [];
    const fields = [...baseFields, ...systemFields];
    
    // Set initial loading state
    setTestResults(prev => ({
      ...prev,
      [testCase.id]: { passed: false, loading: true }
    }));

    try {
      // Initialize Pyodide on-demand
      await initializePyodideIfNeeded();
    } catch (error) {
      setTestResults(prev => ({
        ...prev,
        [testCase.id]: { passed: false, error: 'Failed to initialize Python runtime', loading: false }
      }));
      return;
    }

    try {
      // Install required packages if not already installed
      const packagesToInstall = [];
      let statusMessage = 'Installing ';
      
      if (!pandasInstalled) {
        packagesToInstall.push('pandas');
        statusMessage += 'pandas';
      }
      
      if (!dicompareInstalled) {
        if (packagesToInstall.length > 0) statusMessage += ' + ';
        statusMessage += 'dicompare';
        // The dicompare package should be available after PyodideManager initialization
      }
      
      if (packagesToInstall.length > 0) {
        setTestResults(prev => ({
          ...prev,
          [testCase.id]: { passed: false, loading: true, error: statusMessage + '...' }
        }));
        
        // Install packages
        if (!pandasInstalled) {
          await pyodideManager.loadPackage('pandas');
          setPandasInstalled(true);
        }
        
        if (!dicompareInstalled) {
          // Load micropip first, then install dicompare
          await pyodideManager.loadPackage('micropip');
          await pyodideManager.runPython(`
import micropip
micropip.install("dicompare", keep_going=True)
          `);
          setDicompareInstalled(true);
        }
      }
      
      // Properly indent the implementation - only add base indentation if not present
      let indentedImplementation = implementation.split('\n').map(line => {
        // If line is empty or already has indentation, keep it as is
        if (line.trim() === '' || line.startsWith(' ') || line.startsWith('\t')) {
          return '    ' + line;
        }
        // Otherwise add 4 spaces for function body indentation
        return '    ' + line;
      }).join('\n');
      
      // Check if the implementation is effectively empty (only comments/whitespace)
      const hasNonCommentCode = implementation.split('\n').some(line => {
        const trimmed = line.trim();
        return trimmed.length > 0 && !trimmed.startsWith('#');
      });
      
      // If there's no actual code, add a pass statement to avoid syntax errors
      if (!hasNonCommentCode) {
        indentedImplementation += '\n    pass';
      }
      
      // Create DataFrame-like structure for the test
      const testData = `
import pandas as pd
import math
import sys
from io import StringIO
from dicompare.validation import ValidationError, BaseValidationModel, validator

# Capture stdout
captured_output = StringIO()
sys.stdout = captured_output

# Create test data
test_data = {${Object.entries(testCase.data).map(([field, values]) => 
  `"${field}": [${values.filter(v => v !== '' && v != null).map(v => {
    if (Array.isArray(v)) {
      // Handle arrays - automatically detected from comma-separated input
      return `[${v.map(item => typeof item === 'string' ? `"${item}"` : item).join(', ')}]`;
    } else if (typeof v === 'string') {
      return `"${v}"`;
    } else {
      // Numbers are already parsed
      return v;
    }
  }).join(', ')}]`
).join(', ')}}

# Try to create DataFrame with better error handling
try:
    value = pd.DataFrame(test_data)
except ValueError as e:
    if "All arrays must be of the same length" in str(e):
        # Provide more helpful error message
        field_lengths = {${Object.entries(testCase.data).map(([field, values]) => 
          `"${field}": ${values.filter(v => v !== '' && v != null).length}`
        ).join(', ')}}
        error_msg = f"Test data error: All fields must have the same number of values. Found: {field_lengths}"
        raise ValueError(error_msg)
    else:
        raise

# Initialize test results
test_passed = False
error_message = None

# Try to compile the function first to catch syntax errors
function_code = '''def ${editedFunc.id}(cls, value):
${indentedImplementation}
'''

try:
    # First compile the function
    compiled_code = compile(function_code, '<string>', 'exec')
    
    # Create a namespace for execution
    exec_namespace = {
        'pd': pd,
        'math': math,
        'ValidationError': ValidationError,
        'value': value
    }
    
    # Execute the function definition
    exec(compiled_code, exec_namespace)
    
    # Now try to call the function
    exec_namespace['${editedFunc.id}'](None, value)
    
    # If we reach here without exception, the function passed
    test_passed = True
    error_message = None
        
except SyntaxError as e:
    test_passed = False
    error_message = f"Syntax error in function: {str(e)}"
except ValidationError as e:
    test_passed = False
    error_message = str(e)
except Exception as e:
    test_passed = False
    error_message = f"Unexpected error: {str(e)}"

# Get captured output
stdout_content = captured_output.getvalue()

# Restore stdout
sys.stdout = sys.__stdout__

# Return result
import json

# Return result as JSON
json.dumps({
    "passed": test_passed, 
    "error": error_message,
    "expected_to_pass": ${testCase.expectedToPass ? 'True' : 'False'},
    "stdout": stdout_content
})
`;

      let result;
      try {
        result = await pyodideManager.runPython(testData);
      } catch (pythonError) {
        // Clean up error messages for common test setup issues
        let errorMessage = pythonError.message;
        
        // Check for test data setup errors and provide cleaner messages
        if (errorMessage.includes('Test data error:')) {
          // Extract just our custom error message after "Test data error: "
          const match = errorMessage.match(/Test data error: (.+?)(?:\n|$)/);
          errorMessage = match ? match[1] : 'Test data setup error';
        } else if (errorMessage.includes('All arrays must be of the same length')) {
          errorMessage = 'Test data error: All fields must have the same number of values';
        } else if (errorMessage.includes('SyntaxError') || errorMessage.includes('IndentationError')) {
          errorMessage = 'Python syntax error in test implementation';
        } else {
          // For other errors, just show the basic message without full traceback
          errorMessage = `Test execution error: ${errorMessage.split('\\n')[0]}`;
        }
        
        setTestResults(prev => ({
          ...prev,
          [testCase.id]: { 
            passed: false, 
            error: errorMessage,
            stdout: undefined,
            loading: false
          }
        }));
        return;
      }
      
      const testResult = JSON.parse(result);
      
      // Check if test result matches expectation
      // If expectedToPass is true and test passed, or expectedToPass is false and test failed, then the test was successful
      const testSuccessful = testResult.passed === testCase.expectedToPass;
      
      setTestResults(prev => ({
        ...prev,
        [testCase.id]: { 
          passed: testSuccessful, 
          error: testResult.error || undefined,
          stdout: testResult.stdout || undefined,
          loading: false
        }
      }));

    } catch (error) {
      setTestResults(prev => ({
        ...prev,
        [testCase.id]: { passed: false, error: `Test execution failed: ${error.message}`, loading: false }
      }));
    }
  };

  const handleSave = () => {
    if (editedFunc) {
      onSave(editedFunc);
    }
  };

  if (!isOpen || !editedFunc) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">Edit Validation Function</h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
        
        <div className="flex-1 p-6 overflow-hidden min-h-0">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full">
            {/* Left Panel - Function Details */}
            <div className="space-y-4 overflow-y-auto pr-2">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Function Name</label>
                <input
                  type="text"
                  value={editedFunc.customName || ''}
                  onChange={(e) => setEditedFunc(prev => prev ? ({ ...prev, customName: e.target.value }) : null)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-medical-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                <textarea
                  value={editedFunc.customDescription || ''}
                  onChange={(e) => setEditedFunc(prev => prev ? ({ ...prev, customDescription: e.target.value }) : null)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-medical-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Fields</label>
                <div className="space-y-2">
                  {(editedFunc.customFields || editedFunc.fields).map((field, fieldIndex) => (
                    <div key={fieldIndex} className="flex items-center space-x-2">
                      <input
                        type="text"
                        value={field}
                        onChange={(e) => updateFieldInFunction(fieldIndex, e.target.value)}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-medical-500"
                        placeholder="Field name"
                      />
                      <button
                        onClick={() => removeFieldFromFunction(fieldIndex)}
                        className="p-2 text-red-500 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={addFieldToFunction}
                    className="flex items-center px-3 py-2 text-sm text-medical-600 border border-medical-300 rounded-md hover:bg-medical-50"
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add Field
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">System Fields</label>
                <div className="space-y-2">
                  {Object.entries(SYSTEM_FIELDS).map(([fieldName, fieldInfo]) => {
                    const isEnabled = (editedFunc.enabledSystemFields || []).includes(fieldName);
                    return (
                      <div key={fieldName} className="flex items-center space-x-3">
                        <input
                          type="checkbox"
                          id={`system-field-${fieldName}`}
                          checked={isEnabled}
                          onChange={() => toggleSystemField(fieldName)}
                          className="rounded border-gray-300 text-medical-600 focus:ring-medical-500"
                        />
                        <label htmlFor={`system-field-${fieldName}`} className="flex-1 cursor-pointer">
                          <div className="text-sm font-medium text-gray-900">{fieldInfo.name}</div>
                          <div className="text-xs text-gray-500">{fieldInfo.description}</div>
                        </label>
                        <span className={`px-2 py-1 text-xs rounded ${
                          isEnabled 
                            ? 'bg-purple-100 text-purple-700' 
                            : 'bg-gray-100 text-gray-500'
                        }`}>
                          {isEnabled ? 'Enabled' : 'Disabled'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Validation Code</label>
                <div className="border border-gray-300 rounded-md overflow-hidden">
                  <CodeMirror
                    value={editedFunc.customImplementation || ''}
                    onChange={(value) => {
                      setEditedFunc(prev => prev ? ({ ...prev, customImplementation: value }) : null);
                      // Clear all test results when implementation changes
                      setTestResults({});
                    }}
                    extensions={[python(), pythonLinter, lintGutter()]}
                    theme="light"
                    height="200px"
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
                    placeholder="Enter Python code..."
                  />
                </div>
                <div className="mt-1 text-xs text-gray-500">
                  Python syntax highlighting, auto-indentation, and basic linting enabled
                </div>
              </div>
            </div>

            {/* Right Panel - Test Cases */}
            <div className="flex flex-col h-full min-h-0">
              <div className="flex items-center justify-between mb-4 flex-shrink-0">
                <h4 className="text-lg font-medium text-gray-900">Test Cases</h4>
                <button
                  onClick={addTestCase}
                  className="flex items-center px-3 py-2 bg-medical-600 text-white rounded-md hover:bg-medical-700"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Test
                </button>
              </div>

              <div className="space-y-4 flex-1 overflow-y-auto min-h-0 pr-2" style={{ maxHeight: 'calc(100vh - 400px)' }}>
                {(editedFunc.customTestCases || []).map((testCase, testIndex) => (
                  <div key={testCase.id} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <input
                        type="text"
                        value={testCase.name}
                        onChange={(e) => updateTestCase(testIndex, { name: e.target.value })}
                        className="font-medium text-gray-900 bg-transparent border-none focus:outline-none"
                      />
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => runTestCase(testCase, editedFunc.customImplementation || editedFunc.implementation, editedFunc.customFields || editedFunc.fields, editedFunc.enabledSystemFields || [])}
                          className="p-1 text-purple-500 hover:text-purple-700"
                          title="Run this test (loads Python runtime on first use)"
                        >
                          <Play className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => deleteTestCase(testIndex)}
                          className="p-1 text-red-500 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    <div className="mb-3">
                      <div className="flex items-center space-x-3">
                        <button
                          type="button"
                          onClick={() => updateTestCase(testIndex, { expectedToPass: !testCase.expectedToPass })}
                          className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-medical-500 focus:ring-offset-2 ${
                            testCase.expectedToPass ? 'bg-medical-600' : 'bg-red-600'
                          }`}
                          aria-pressed={testCase.expectedToPass}
                        >
                          <span
                            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                              testCase.expectedToPass ? 'translate-x-5' : 'translate-x-0'
                            }`}
                          />
                        </button>
                        <span className="text-sm text-gray-700">
                          {testCase.expectedToPass ? 'Expected to pass' : 'Expected to fail'}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="block text-xs font-medium text-gray-700">Test Data (DataFrame)</label>
                        <button
                          onClick={() => {
                            // Add a new row to all fields
                            const newData = { ...testCase.data };
                            const allFields = [...(editedFunc.customFields || editedFunc.fields), ...(editedFunc.enabledSystemFields || [])];
                            allFields.forEach(field => {
                              if (!newData[field]) newData[field] = [];
                              newData[field].push(''); // Add empty value for new row
                            });
                            updateTestCase(testIndex, { data: newData });
                          }}
                          className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                        >
                          + Add Row
                        </button>
                      </div>
                      
                      {/* DataFrame-like table */}
                      <div className="border border-gray-300 rounded-md overflow-hidden">
                        {/* Header */}
                        <div className="bg-gray-50 border-b border-gray-300 flex">
                          <div className="w-8 px-2 py-1 text-xs font-medium text-gray-700 border-r border-gray-300">#</div>
                          {(editedFunc.customFields || editedFunc.fields).map(field => (
                            <div key={field} className="flex-1 px-2 py-1 text-xs font-medium text-gray-700 border-r border-gray-300 last:border-r-0">
                              {field}
                            </div>
                          ))}
                          {(editedFunc.enabledSystemFields || []).map(field => (
                            <div key={field} className="flex-1 px-2 py-1 text-xs font-medium text-purple-700 border-r border-gray-300 last:border-r-0 bg-purple-50">
                              {field}
                            </div>
                          ))}
                          <div className="w-8"></div>
                        </div>
                        
                        {/* Rows */}
                        {(() => {
                          const regularFields = editedFunc.customFields || editedFunc.fields;
                          const systemFields = editedFunc.enabledSystemFields || [];
                          const allFields = [...regularFields, ...systemFields];
                          const maxRows = Math.max(1, ...allFields.map(field => (testCase.data[field] || []).length));
                          
                          return Array.from({ length: maxRows }, (_, rowIndex) => (
                            <div key={rowIndex} className="flex border-b border-gray-200 last:border-b-0">
                              <div className="w-8 px-2 py-1 text-xs text-gray-500 border-r border-gray-300 bg-gray-50">
                                {rowIndex}
                              </div>
                              {allFields.map(field => {
                                const isSystemField = systemFields.includes(field);
                                return (
                                <div key={field} className={`flex-1 border-r border-gray-300 last:border-r-0 ${isSystemField ? 'bg-purple-25' : ''}`}>
                                  <input
                                    type="text"
                                    value={(() => {
                                      const value = testCase.data[field]?.[rowIndex];
                                      if (Array.isArray(value)) {
                                        // Convert array back to comma-separated string for editing
                                        return value.join(',');
                                      }
                                      // Convert all values to strings for editing
                                      return value != null ? String(value) : '';
                                    })()}
                                    onChange={(e) => {
                                      const newData = { ...testCase.data };
                                      if (!newData[field]) newData[field] = [];
                                      
                                      // Ensure array is long enough
                                      while (newData[field].length <= rowIndex) {
                                        newData[field].push('');
                                      }
                                      
                                      const inputValue = e.target.value;
                                      console.log(`Input for ${field}: "${inputValue}"`);
                                      
                                      // Smart value parsing - automatically detect type
                                      let parsedValue;
                                      if (inputValue.trim() === '') {
                                        parsedValue = '';
                                      } else if (inputValue.includes(',')) {
                                        // Comma-separated values - parse as array
                                        const arrayValues = inputValue.split(',').map(v => {
                                          // Only trim for number parsing, preserve original value
                                          const trimmed = v.trim();
                                          if (trimmed === '') return ''; // Keep empty strings for incomplete arrays
                                          const num = parseFloat(trimmed);
                                          // Return number if it's a valid number, otherwise return original (with spaces)
                                          return isNaN(num) ? v : num;
                                        });
                                        parsedValue = arrayValues;
                                      } else {
                                        // Single value - try to parse as number
                                        const trimmed = inputValue.trim();
                                        const num = parseFloat(trimmed);
                                        // Return number if it's a valid number, otherwise return original (with spaces)
                                        parsedValue = isNaN(num) ? inputValue : num;
                                      }
                                      
                                      console.log(`Parsed value for ${field}:`, parsedValue);
                                      newData[field][rowIndex] = parsedValue;
                                      updateTestCase(testIndex, { data: newData });
                                    }}
                                    className={`w-full px-2 py-1 text-xs border-none focus:outline-none ${isSystemField ? 'focus:bg-purple-50' : 'focus:bg-blue-50'}`}
                                    placeholder={`${field} value (e.g., "1,1" for lists)`}
                                  />
                                </div>
                                );
                              })}
                              <div className="w-8 flex items-center justify-center">
                                <button
                                  onClick={() => {
                                    // Remove this row from all fields
                                    const newData = { ...testCase.data };
                                    allFields.forEach(field => {
                                      if (newData[field] && newData[field].length > rowIndex) {
                                        newData[field].splice(rowIndex, 1);
                                      }
                                    });
                                    updateTestCase(testIndex, { data: newData });
                                  }}
                                  className="p-0.5 text-red-500 hover:text-red-700 text-xs"
                                  title="Delete row"
                                >
                                  ×
                                </button>
                              </div>
                            </div>
                          ));
                        })()}
                      </div>
                      
                      <div className="text-xs text-gray-500">
                        Rows: {Math.max(1, ...[...(editedFunc.customFields || editedFunc.fields), ...(editedFunc.enabledSystemFields || [])].map(field => (testCase.data[field] || []).length))} | 
                        Each row represents one record in the DataFrame
                      </div>
                    </div>

                    {/* Test Result */}
                    {testResults[testCase.id] && (
                      <div className={`mt-2 p-2 text-xs rounded ${
                        testResults[testCase.id].loading ? 'bg-blue-50 text-blue-700' :
                        testResults[testCase.id].passed ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`}>
                        <div className="flex items-center justify-between">
                          <span className="flex items-center">
                            {testResults[testCase.id].loading ? (
                              <>
                                <Loader2 className="h-3 w-3 animate-spin mr-1" />
                                Running...
                              </>
                            ) : (
                              testResults[testCase.id].passed ? (
                                testCase.expectedToPass ? '✓ Passed' : '✓ Failed as expected'
                              ) : (
                                testCase.expectedToPass ? '✗ Failed' : '✗ Did not fail as expected'
                              )
                            )}
                          </span>
                        </div>
                        {testResults[testCase.id].error && (
                          <div className="mt-1 opacity-75">{testResults[testCase.id].error}</div>
                        )}
                        {testResults[testCase.id].stdout && testResults[testCase.id].stdout!.trim() && (
                          <div className="mt-1 p-1 bg-gray-900 text-gray-100 rounded text-xs font-mono overflow-x-auto">
                            <div className="text-gray-400 mb-0.5">stdout:</div>
                            <pre className="whitespace-pre-wrap">{testResults[testCase.id].stdout!.trim()}</pre>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-medical-600 text-white rounded-md hover:bg-medical-700"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
};

export default ValidationFunctionEditorModal;