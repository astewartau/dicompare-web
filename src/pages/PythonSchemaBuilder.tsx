import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Code, Plus, Trash2, Settings, CheckCircle, AlertTriangle, Play, Edit3, X, Loader2 } from 'lucide-react';
import { pyodideManager } from '../services/PyodideManager';
import CodeMirror from '@uiw/react-codemirror';
import { python } from '@codemirror/lang-python';
import { linter, lintGutter } from '@codemirror/lint';

// Types for validation functions
interface TestCase {
  id: string;
  name: string;
  data: Record<string, any[]>; // field name -> array of values (each index is a row)
  expectedToPass: boolean;
  description?: string;
}

interface ValidationFunction {
  id: string;
  name: string;
  description: string;
  category: string;
  fields: string[];
  parameters?: Record<string, any>;
  implementation: string;
  testCases?: TestCase[];
  requiredSystemFields?: string[]; // System fields that should be auto-enabled
}

interface SelectedFunction extends ValidationFunction {
  configuredParams?: Record<string, any>;
  customImplementation?: string;
  customName?: string;
  customDescription?: string;
  customFields?: string[];
  customTestCases?: TestCase[];
  enabledSystemFields?: string[]; // System fields like 'Count' that are enabled
}

// Available system fields
const SYSTEM_FIELDS = {
  'Count': {
    name: 'Count',
    description: 'Number of slices/images per row (typically from DICOM metadata)'
  }
};

// Dynamic validation function loading
const loadValidationFunctions = async (): Promise<ValidationFunction[]> => {
  const functionFiles = [
    'validate_echo_count.json',
    'uniform_echo_spacing.json',
    'validate_first_echo.json',
    'validate_image_type.json',
    'validate_image_slices.json',
    'validate_mra_type.json',
    'validate_repetition_time.json',
    'validate_flip_angle.json',
    'validate_echo_times.json',
    'validate_voxel_shape.json',
    'validate_pixel_spacing.json',
    'validate_pixel_bandwidth.json'
  ];

  const functions: ValidationFunction[] = [];
  
  for (const fileName of functionFiles) {
    try {
      const response = await fetch(`/validation-functions/${fileName}`);
      if (response.ok) {
        const functionData = await response.json();
        functions.push(functionData);
      } else {
        console.warn(`Failed to load validation function: ${fileName}`);
      }
    } catch (error) {
      console.error(`Error loading validation function ${fileName}:`, error);
    }
  }
  
  return functions;
};

const PythonSchemaBuilder: React.FC = () => {
  const [schemaName, setSchemaName] = useState('');
  const [selectedFunctions, setSelectedFunctions] = useState<SelectedFunction[]>([]);
  const [showFunctionLibrary, setShowFunctionLibrary] = useState(false);
  const [editingFunction, setEditingFunction] = useState<string | null>(null);
  const [validationResults, setValidationResults] = useState<Record<string, string>>({});
  const [pyodideReady, setPyodideReady] = useState(false);
  const [showFunctionEditor, setShowFunctionEditor] = useState(false);
  const [editingFunctionIndex, setEditingFunctionIndex] = useState<number | null>(null);
  const [testResults, setTestResults] = useState<Record<string, Record<string, { passed: boolean; error?: string; stdout?: string; loading?: boolean }>>>({});
  const [pandasInstalled, setPandasInstalled] = useState(false);
  const [dicompareInstalled, setDicompareInstalled] = useState(false);
  const [validationFunctions, setValidationFunctions] = useState<ValidationFunction[]>([]);
  const [functionsLoading, setFunctionsLoading] = useState(true);

  const categories = [...new Set(validationFunctions.map(f => f.category))];

  // Helper function to get all effective fields for a function
  const getEffectiveFields = (func: SelectedFunction): string[] => {
    const baseFields = func.customFields || func.fields;
    const systemFields = func.enabledSystemFields || [];
    return [...baseFields, ...systemFields];
  };

  // Load validation functions when component mounts
  useEffect(() => {
    const loadFunctions = async () => {
      try {
        const functions = await loadValidationFunctions();
        setValidationFunctions(functions);
      } catch (error) {
        console.error('Failed to load validation functions:', error);
      } finally {
        setFunctionsLoading(false);
      }
    };
    loadFunctions();
  }, []);

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

  const addFunction = (func: ValidationFunction) => {
    const selectedFunction: SelectedFunction = {
      ...func,
      configuredParams: func.parameters ? 
        Object.fromEntries(Object.entries(func.parameters).map(([key, config]) => [key, config.default])) 
        : {},
      customImplementation: func.implementation,
      enabledSystemFields: func.requiredSystemFields ? [...func.requiredSystemFields] : []
    };
    setSelectedFunctions(prev => [...prev, selectedFunction]);
    setShowFunctionLibrary(false);
  };

  const removeFunction = (index: number) => {
    setSelectedFunctions(prev => prev.filter((_, i) => i !== index));
  };

  const updateFunctionParams = (index: number, params: Record<string, any>) => {
    setSelectedFunctions(prev => prev.map((func, i) => 
      i === index ? { ...func, configuredParams: params } : func
    ));
    setEditingFunction(null);
  };

  const updateFunctionImplementation = (index: number, implementation: string) => {
    setSelectedFunctions(prev => prev.map((func, i) => 
      i === index ? { ...func, customImplementation: implementation } : func
    ));
  };

  const validateFunction = async (index: number) => {
    const func = selectedFunctions[index];
    const implementation = func.customImplementation || func.implementation;
    
    try {
      // Basic checks first
      if (!implementation.trim()) {
        throw new Error('Implementation cannot be empty');
      }
      
      if (!implementation.includes('return value')) {
        throw new Error('Function must return value');
      }

      // Initialize Pyodide on-demand and use for Python syntax validation
      try {
        await initializePyodideIfNeeded();
        // Properly indent the implementation - only add base indentation if not present
        const indentedImplementation = implementation.split('\n').map(line => {
          // If line is empty or already has indentation, keep it as is
          if (line.trim() === '' || line.startsWith(' ') || line.startsWith('\t')) {
            return '    ' + line;
          }
          // Otherwise add 4 spaces for function body indentation
          return '    ' + line;
        }).join('\n');

        const fullFunction = `
import math
from dicompare.validation import ValidationError, BaseValidationModel, validator

def ${func.id}(cls, value):
${indentedImplementation}

# Test compilation
print("Function compiled successfully")
`;
        
        await pyodideManager.runPython(fullFunction);
        setValidationResults(prev => ({
          ...prev,
          [`${func.id}-${index}`]: 'Valid Python syntax (verified with Pyodide)'
        }));
      } catch (pyodideError) {
        throw new Error(`Python syntax error: ${pyodideError.message}`);
      }
    } catch (error) {
      setValidationResults(prev => ({
        ...prev,
        [`${func.id}-${index}`]: `Error: ${error.message}`
      }));
    }
  };

  const runTestCase = async (functionIndex: number, testCase: TestCase, liveImplementation?: string, liveFields?: string[], liveSystemFields?: string[]) => {
    const func = selectedFunctions[functionIndex];
    const implementation = liveImplementation || func.customImplementation || func.implementation;
    const baseFields = liveFields || func.customFields || func.fields;
    const systemFields = liveSystemFields || func.enabledSystemFields || [];
    const fields = [...baseFields, ...systemFields];
    
    // Set initial loading state
    setTestResults(prev => ({
      ...prev,
      [`${func.id}-${functionIndex}`]: {
        ...prev[`${func.id}-${functionIndex}`],
        [testCase.id]: { passed: false, loading: true }
      }
    }));

    try {
      // Initialize Pyodide on-demand
      await initializePyodideIfNeeded();
    } catch (error) {
      setTestResults(prev => ({
        ...prev,
        [`${func.id}-${functionIndex}`]: {
          ...prev[`${func.id}-${functionIndex}`],
          [testCase.id]: { passed: false, error: 'Failed to initialize Python runtime', loading: false }
        }
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
        // For now, we'll use the mock dicompare that's already set up in PyodideManager
        // The mock dicompare.validation module should already be available
      }
      
      if (packagesToInstall.length > 0) {
        setTestResults(prev => ({
          ...prev,
          [`${func.id}-${functionIndex}`]: {
            ...prev[`${func.id}-${functionIndex}`],
            [testCase.id]: { passed: false, loading: true, error: statusMessage + '...' }
          }
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
      const indentedImplementation = implementation.split('\n').map(line => {
        // If line is empty or already has indentation, keep it as is
        if (line.trim() === '' || line.startsWith(' ') || line.startsWith('\t')) {
          return '    ' + line;
        }
        // Otherwise add 4 spaces for function body indentation
        return '    ' + line;
      }).join('\n');
      
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
    if (typeof v === 'string') {
      return `"${v}"`;
    } else if (Array.isArray(v)) {
      // Handle nested arrays (like ImageType: [['M'], ['P']])
      return `[${v.map(item => typeof item === 'string' ? `"${item}"` : item).join(', ')}]`;
    } else {
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
function_code = '''def ${func.id}(cls, value):
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
    result = exec_namespace['${func.id}'](None, value)
    
    # Check if the function returned the DataFrame
    if result is None:
        test_passed = False
        error_message = "Function returned None instead of value"
    elif isinstance(result, bool):
        test_passed = False
        error_message = f"Function returned {result} instead of value"
    elif not isinstance(result, pd.DataFrame):
        test_passed = False
        error_message = f"Function returned {type(result).__name__} instead of DataFrame"
    else:
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
          [`${func.id}-${functionIndex}`]: {
            ...prev[`${func.id}-${functionIndex}`],
            [testCase.id]: { 
              passed: false, 
              error: errorMessage,
              stdout: undefined,
              loading: false
            }
          }
        }));
        return;
      }
      
      const testResult = JSON.parse(result);
      
      // Check if test result matches expectation
      const actuallyPassed = testResult.passed === testCase.expectedToPass;
      
      setTestResults(prev => ({
        ...prev,
        [`${func.id}-${functionIndex}`]: {
          ...prev[`${func.id}-${functionIndex}`],
          [testCase.id]: { 
            passed: actuallyPassed, 
            error: actuallyPassed ? undefined : `Expected ${testCase.expectedToPass ? 'pass' : 'fail'}, got ${testResult.passed ? 'pass' : 'fail'}. ${testResult.error || ''}`,
            stdout: testResult.stdout || undefined,
            loading: false
          }
        }
      }));

    } catch (error) {
      setTestResults(prev => ({
        ...prev,
        [`${func.id}-${functionIndex}`]: {
          ...prev[`${func.id}-${functionIndex}`],
          [testCase.id]: { passed: false, error: `Test execution failed: ${error.message}`, loading: false }
        }
      }));
    }
  };

  const runAllTestsForFunction = async (functionIndex: number) => {
    const func = selectedFunctions[functionIndex];
    const testCases = func.customTestCases || func.testCases || [];
    
    for (const testCase of testCases) {
      await runTestCase(functionIndex, testCase);
    }
  };

  const generatePythonCode = () => {
    const className = schemaName.replace(/\s+/g, '') || 'CustomSchema';
    
    let code = `import math
from dicompare.validation import ValidationError, BaseValidationModel, validator

class ${className}(BaseValidationModel):
`;

    selectedFunctions.forEach((func, index) => {
      const implementation = func.customImplementation || func.implementation;
      const indentedImplementation = implementation.split('\n').map(line => '        ' + line).join('\n');
      
      code += `
    @validator(${JSON.stringify(func.customFields || func.fields)}, rule_name="${func.customName || func.name}", rule_message="${func.customDescription || func.description}")
    def ${func.id}_${index}(cls, value):
${indentedImplementation}
`;
    });

    code += `

ACQUISITION_MODELS = {
    "${className}": ${className},
}`;

    return code;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center">
            <Link to="/" className="flex items-center text-gray-600 hover:text-gray-900 mr-6">
              <ArrowLeft className="h-5 w-5 mr-1" />
              Back to Home
            </Link>
            <Code className="h-8 w-8 text-medical-600 mr-3" />
            <h1 className="text-2xl font-bold text-gray-900">Python Schema Builder</h1>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Panel - Schema Builder */}
          <div className="space-y-6">
            {/* Schema Info */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Schema Information</h2>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Schema Name</label>
                <input
                  type="text"
                  value={schemaName}
                  onChange={(e) => setSchemaName(e.target.value)}
                  placeholder="e.g., QSM, DTI, BOLD"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-medical-500"
                />
              </div>
            </div>

            {/* Selected Functions */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Validation Functions</h2>
                <button
                  onClick={() => setShowFunctionLibrary(true)}
                  className="flex items-center px-3 py-2 bg-medical-600 text-white rounded-md hover:bg-medical-700"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Function
                </button>
              </div>

              {selectedFunctions.length === 0 ? (
                <p className="text-gray-500 text-center py-8">
                  No validation functions added yet. Click "Add Function" to get started.
                </p>
              ) : (
                <div className="space-y-3">
                  {selectedFunctions.map((func, index) => {
                    const isEditing = editingFunction === `edit-${func.id}-${index}`;
                    const validationResult = validationResults[`${func.id}-${index}`];
                    
                    return (
                      <div key={`${func.id}-${index}`} className="border border-gray-200 rounded-lg p-4">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1">
                            <div className="flex items-center space-x-2 mb-2">
                              <h3 className="font-medium text-gray-900">{func.customName || func.name}</h3>
                              <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full">
                                {func.category}
                              </span>
                            </div>
                            <p className="text-sm text-gray-600 mb-2">{func.customDescription || func.description}</p>
                            <div className="flex items-center space-x-2 text-xs text-gray-500">
                              <span>Fields:</span>
                              {(func.customFields || func.fields).map(field => (
                                <span key={field} className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">
                                  {field}
                                </span>
                              ))}
                              {(func.enabledSystemFields || []).map(field => (
                                <span key={field} className="px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded">
                                  {field}
                                </span>
                              ))}
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            <button
                              onClick={() => {
                                setEditingFunctionIndex(index);
                                setShowFunctionEditor(true);
                              }}
                              className="p-1 text-gray-400 hover:text-blue-600"
                              title="Edit implementation"
                            >
                              <Edit3 className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => validateFunction(index)}
                              className="p-1 text-gray-400 hover:text-green-600 transition-colors"
                              title="Validate Python syntax (loads Python runtime on first use)"
                            >
                              <Play className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => runAllTestsForFunction(index)}
                              className="p-1 text-gray-400 hover:text-purple-600 transition-colors"
                              title="Run all test cases (loads Python runtime on first use)"
                            >
                              <CheckCircle className="h-4 w-4" />
                            </button>
                            {func.parameters && (
                              <button
                                onClick={() => setEditingFunction(`params-${func.id}-${index}`)}
                                className="p-1 text-gray-400 hover:text-gray-600"
                                title="Configure parameters"
                              >
                                <Settings className="h-4 w-4" />
                              </button>
                            )}
                            <button
                              onClick={() => removeFunction(index)}
                              className="p-1 text-gray-400 hover:text-red-600"
                              title="Remove function"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                        
                        {/* Code Editor */}
                        {isEditing && (
                          <div className="mt-3">
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Python Implementation
                            </label>
                            <textarea
                              value={func.customImplementation || func.implementation}
                              onChange={(e) => updateFunctionImplementation(index, e.target.value)}
                              className="w-full h-32 px-3 py-2 font-mono text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-medical-500"
                              placeholder="Enter Python code..."
                            />
                            <div className="mt-2 flex items-center justify-between">
                              <span className="text-xs text-gray-500">
                                Remember to return the value at the end
                              </span>
                              <button
                                onClick={() => setEditingFunction(null)}
                                className="px-3 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                              >
                                Done
                              </button>
                            </div>
                          </div>
                        )}
                        
                        {/* Validation Result */}
                        {validationResult && (
                          <div className={`mt-3 p-2 text-xs rounded ${
                            validationResult.startsWith('Error') 
                              ? 'bg-red-100 text-red-700' 
                              : 'bg-green-100 text-green-700'
                          }`}>
                            {validationResult}
                          </div>
                        )}

                        {/* Test Results */}
                        {testResults[`${func.id}-${index}`] && (
                          <div className="mt-3">
                            <h4 className="text-xs font-medium text-gray-700 mb-2">Test Results:</h4>
                            <div className="space-y-1">
                              {Object.entries(testResults[`${func.id}-${index}`]).map(([testId, result]) => {
                                const testCase = (func.customTestCases || func.testCases || []).find(tc => tc.id === testId);
                                return (
                                  <div key={testId} className={`p-2 text-xs rounded ${
                                    result.loading ? 'bg-blue-50 text-blue-700' :
                                    result.passed ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                                  }`}>
                                    <div className="flex items-center justify-between">
                                      <span>{testCase?.name || testId}</span>
                                      <span className="flex items-center">
                                        {result.loading ? (
                                          <Loader2 className="h-3 w-3 animate-spin" />
                                        ) : (
                                          result.passed ? '✓' : '✗'
                                        )}
                                      </span>
                                    </div>
                                    {result.error && (
                                      <div className="mt-1 text-xs opacity-75">{result.error}</div>
                                    )}
                                    {result.stdout && result.stdout.trim() && (
                                      <div className="mt-1 p-1 bg-gray-900 text-gray-100 rounded text-xs font-mono overflow-x-auto">
                                        <div className="text-gray-400 mb-0.5">stdout:</div>
                                        <pre className="whitespace-pre-wrap">{result.stdout.trim()}</pre>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Right Panel - Generated Code */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Generated Python Code</h2>
            <div className="border border-gray-300 rounded-lg overflow-hidden">
              <CodeMirror
                value={generatePythonCode()}
                editable={false}
                extensions={[python()]}
                theme="dark"
                height="384px"
                basicSetup={{
                  lineNumbers: true,
                  foldGutter: true,
                  dropCursor: false,
                  allowMultipleSelections: false,
                  indentOnInput: false,
                  bracketMatching: true,
                  closeBrackets: false,
                  autocompletion: false,
                  highlightSelectionMatches: false,
                }}
              />
            </div>
            <div className="mt-4 flex items-center justify-between">
              <div className="flex items-center space-x-4 text-sm text-gray-500">
                <span className="flex items-center">
                  <CheckCircle className="h-4 w-4 text-green-500 mr-1" />
                  {selectedFunctions.length} functions
                </span>
                <span className="flex items-center">
                  <Code className="h-4 w-4 text-blue-500 mr-1" />
                  Real implementations
                </span>
                <span className="flex items-center">
                  <Play className="h-4 w-4 text-purple-500 mr-1" />
                  {pyodideReady ? (
                    pandasInstalled && dicompareInstalled ? 'Python runtime ready' :
                    pandasInstalled ? 'Python runtime + pandas ready' :
                    'Python runtime ready'
                  ) : 'Python runtime loads on-demand'}
                </span>
              </div>
              <div className="flex space-x-2">
                <button
                  className="px-4 py-2 bg-medical-600 text-white rounded-md hover:bg-medical-700 transition-colors"
                  onClick={() => {
                    selectedFunctions.forEach((_, index) => validateFunction(index));
                  }}
                  title="Validate all functions (loads Python runtime on first use)"
                >
                  Validate All
                </button>
                <button
                  className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
                  onClick={() => navigator.clipboard.writeText(generatePythonCode())}
                >
                  Copy Code
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Function Library Modal */}
      {showFunctionLibrary && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg max-w-4xl w-full mx-4 max-h-[80vh] overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">Validation Function Library</h3>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => {
                      // Create a new blank function
                      const newFunction: SelectedFunction = {
                        id: `custom_${Date.now()}`,
                        name: 'New Validation Function',
                        description: 'Custom validation function',
                        category: 'Custom',
                        fields: ['FieldName'],
                        implementation: `# Custom validation logic\n# Access field data with value["FieldName"]\n# Raise ValidationError for failures\n# Must return value at the end\n\nreturn value`,
                        testCases: [{
                          id: `test_${Date.now()}`,
                          name: 'Test Case 1',
                          data: { FieldName: [''] },
                          expectedToPass: true,
                          description: 'Add test description'
                        }],
                        enabledSystemFields: []
                      };
                      setSelectedFunctions(prev => [...prev, newFunction]);
                      setShowFunctionLibrary(false);
                      // Open the editor for the newly created function
                      setTimeout(() => {
                        setEditingFunctionIndex(selectedFunctions.length);
                        setShowFunctionEditor(true);
                      }, 100);
                    }}
                    className="flex items-center px-3 py-1.5 bg-medical-600 text-white text-sm rounded-md hover:bg-medical-700"
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Create New
                  </button>
                  <button
                    onClick={() => setShowFunctionLibrary(false)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>
            </div>
            <div className="p-6 overflow-y-auto max-h-[60vh]">
              {functionsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="text-gray-500">Loading validation functions...</div>
                </div>
              ) : categories.length === 0 ? (
                <div className="flex items-center justify-center py-8">
                  <div className="text-gray-500">No validation functions found</div>
                </div>
              ) : (
                categories.map(category => (
                  <div key={category} className="mb-6">
                    <h4 className="font-medium text-gray-900 mb-3">{category}</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {validationFunctions.filter(f => f.category === category).map(func => (
                        <div key={func.id} className="border border-gray-200 rounded-lg p-4 hover:border-medical-300 transition-colors">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <h5 className="font-medium text-gray-900 mb-1">{func.name}</h5>
                              <p className="text-sm text-gray-600 mb-2">{func.description}</p>
                              <div className="flex flex-wrap gap-1">
                                {func.fields.map(field => (
                                  <span key={field} className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-xs rounded">
                                    {field}
                                  </span>
                                ))}
                              </div>
                            </div>
                            <button
                              onClick={() => addFunction(func)}
                              className="ml-3 px-3 py-1 bg-medical-600 text-white text-sm rounded hover:bg-medical-700"
                            >
                              Add
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Function Editor Modal */}
      {showFunctionEditor && editingFunctionIndex !== null && (
        <FunctionEditorModal
          func={selectedFunctions[editingFunctionIndex]}
          index={editingFunctionIndex}
          onClose={() => {
            setShowFunctionEditor(false);
            setEditingFunctionIndex(null);
          }}
          onSave={(updatedFunc) => {
            setSelectedFunctions(prev => prev.map((f, i) => 
              i === editingFunctionIndex ? updatedFunc : f
            ));
            setShowFunctionEditor(false);
            setEditingFunctionIndex(null);
          }}
          pyodideReady={pyodideReady}
          onRunTest={(testCase, implementation, fields, systemFields) => runTestCase(editingFunctionIndex, testCase, implementation, fields, systemFields)}
          testResults={testResults[`${selectedFunctions[editingFunctionIndex].id}-${editingFunctionIndex}`] || {}}
        />
      )}
    </div>
  );
};

// Function Editor Modal Component
interface FunctionEditorModalProps {
  func: SelectedFunction;
  index: number;
  onClose: () => void;
  onSave: (func: SelectedFunction) => void;
  pyodideReady: boolean;
  onRunTest: (testCase: TestCase, implementation: string, fields: string[], systemFields: string[]) => void;
  testResults: Record<string, { passed: boolean; error?: string; stdout?: string; loading?: boolean }>;
}

const FunctionEditorModal: React.FC<FunctionEditorModalProps> = ({
  func,
  index,
  onClose,
  onSave,
  pyodideReady,
  onRunTest,
  testResults
}) => {
  const [editedFunc, setEditedFunc] = useState<SelectedFunction>({
    ...func,
    customName: func.customName || func.name,
    customDescription: func.customDescription || func.description,
    customFields: func.customFields || [...func.fields],
    customImplementation: func.customImplementation || func.implementation,
    customTestCases: func.customTestCases || func.testCases || [],
    enabledSystemFields: func.enabledSystemFields || []
  });

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
    
    // Check if function has return statement
    if (code.trim().length > 0 && !code.includes('return value')) {
      diagnostics.push({
        from: 0,
        to: view.state.doc.length,
        severity: 'warning',
        message: 'Function should return value'
      });
    }
    
    return diagnostics;
  });

  const addTestCase = () => {
    const allFields = [...(editedFunc.customFields || editedFunc.fields), ...(editedFunc.enabledSystemFields || [])];
    const newTestCase: TestCase = {
      id: `test_${Date.now()}`,
      name: 'New Test Case',
      data: Object.fromEntries(allFields.map(field => [field, ['']]) // Start with one empty row
      ),
      expectedToPass: true,
      description: ''
    };
    
    setEditedFunc(prev => ({
      ...prev,
      customTestCases: [...(prev.customTestCases || []), newTestCase]
    }));
  };

  const updateTestCase = (testIndex: number, updates: Partial<TestCase>) => {
    setEditedFunc(prev => ({
      ...prev,
      customTestCases: prev.customTestCases?.map((tc, i) => 
        i === testIndex ? { ...tc, ...updates } : tc
      ) || []
    }));
  };

  const deleteTestCase = (testIndex: number) => {
    setEditedFunc(prev => ({
      ...prev,
      customTestCases: prev.customTestCases?.filter((_, i) => i !== testIndex) || []
    }));
  };

  const addFieldToFunction = () => {
    const newField = `NewField${(editedFunc.customFields || editedFunc.fields).length + 1}`;
    setEditedFunc(prev => ({
      ...prev,
      customFields: [...(prev.customFields || prev.fields), newField]
    }));
  };

  const removeFieldFromFunction = (fieldIndex: number) => {
    setEditedFunc(prev => ({
      ...prev,
      customFields: (prev.customFields || prev.fields).filter((_, i) => i !== fieldIndex)
    }));
  };

  const updateFieldInFunction = (fieldIndex: number, newValue: string) => {
    setEditedFunc(prev => ({
      ...prev,
      customFields: (prev.customFields || prev.fields).map((field, i) => 
        i === fieldIndex ? newValue : field
      )
    }));
  };

  const toggleSystemField = (fieldName: string) => {
    setEditedFunc(prev => {
      const currentSystemFields = prev.enabledSystemFields || [];
      const isEnabled = currentSystemFields.includes(fieldName);
      
      if (isEnabled) {
        // Remove the field
        return {
          ...prev,
          enabledSystemFields: currentSystemFields.filter(f => f !== fieldName)
        };
      } else {
        // Add the field
        return {
          ...prev,
          enabledSystemFields: [...currentSystemFields, fieldName]
        };
      }
    });
  };

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
                  onChange={(e) => setEditedFunc(prev => ({ ...prev, customName: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-medical-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                <textarea
                  value={editedFunc.customDescription || ''}
                  onChange={(e) => setEditedFunc(prev => ({ ...prev, customDescription: e.target.value }))}
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
                <label className="block text-sm font-medium text-gray-700 mb-2">Implementation</label>
                <div className="border border-gray-300 rounded-md overflow-hidden">
                  <CodeMirror
                    value={editedFunc.customImplementation || ''}
                    onChange={(value) => setEditedFunc(prev => ({ ...prev, customImplementation: value }))}
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
                          onClick={() => onRunTest(testCase, editedFunc.customImplementation || editedFunc.implementation, editedFunc.customFields || editedFunc.fields, editedFunc.enabledSystemFields || [])}
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
                      <label className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={testCase.expectedToPass}
                          onChange={(e) => updateTestCase(testIndex, { expectedToPass: e.target.checked })}
                          className="rounded border-gray-300 text-medical-600 focus:ring-medical-500"
                        />
                        <span className="text-sm text-gray-700">Expected to pass</span>
                      </label>
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
                                    value={testCase.data[field]?.[rowIndex] || ''}
                                    onChange={(e) => {
                                      const newData = { ...testCase.data };
                                      if (!newData[field]) newData[field] = [];
                                      
                                      // Ensure array is long enough
                                      while (newData[field].length <= rowIndex) {
                                        newData[field].push('');
                                      }
                                      
                                      // Parse value as number if possible
                                      const trimmed = e.target.value.trim();
                                      const parsed = parseFloat(trimmed);
                                      newData[field][rowIndex] = trimmed === '' ? '' : (isNaN(parsed) ? trimmed : parsed);
                                      
                                      updateTestCase(testIndex, { data: newData });
                                    }}
                                    className={`w-full px-2 py-1 text-xs border-none focus:outline-none ${isSystemField ? 'focus:bg-purple-50' : 'focus:bg-blue-50'}`}
                                    placeholder={`${field} value`}
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
                              testResults[testCase.id].passed ? '✓ Passed' : '✗ Failed'
                            )}
                          </span>
                        </div>
                        {testResults[testCase.id].error && (
                          <div className="mt-1 opacity-75">{testResults[testCase.id].error}</div>
                        )}
                        {testResults[testCase.id].stdout && testResults[testCase.id].stdout.trim() && (
                          <div className="mt-1 p-1 bg-gray-900 text-gray-100 rounded text-xs font-mono overflow-x-auto">
                            <div className="text-gray-400 mb-0.5">stdout:</div>
                            <pre className="whitespace-pre-wrap">{testResults[testCase.id].stdout.trim()}</pre>
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
            onClick={() => onSave(editedFunc)}
            className="px-4 py-2 bg-medical-600 text-white rounded-md hover:bg-medical-700"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
};

export default PythonSchemaBuilder;