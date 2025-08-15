import React, { useState, useEffect } from 'react';
import { X, Plus } from 'lucide-react';

// Types for validation functions (extracted from PythonSchemaBuilder)
export interface TestCase {
  id: string;
  name: string;
  data: Record<string, any[]>; // field name -> array of values (each index is a row)
  expectedToPass: boolean;
  description?: string;
}

export interface ValidationFunction {
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

export interface SelectedFunction extends ValidationFunction {
  configuredParams?: Record<string, any>;
  customImplementation?: string;
  customName?: string;
  customDescription?: string;
  customFields?: string[];
  customTestCases?: TestCase[];
  enabledSystemFields?: string[]; // System fields like 'Count' that are enabled
}

interface ValidationFunctionLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectFunction: (func: ValidationFunction) => void;
  onCreateNewFunction: () => void;
}

// Dynamic validation function loading (extracted from PythonSchemaBuilder)
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

const ValidationFunctionLibraryModal: React.FC<ValidationFunctionLibraryModalProps> = ({
  isOpen,
  onClose,
  onSelectFunction,
  onCreateNewFunction
}) => {
  const [validationFunctions, setValidationFunctions] = useState<ValidationFunction[]>([]);
  const [functionsLoading, setFunctionsLoading] = useState(true);

  const categories = [...new Set(validationFunctions.map(f => f.category))];

  // Load validation functions when modal opens
  useEffect(() => {
    if (isOpen && validationFunctions.length === 0) {
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
    }
  }, [isOpen, validationFunctions.length]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg max-w-4xl w-full mx-4 max-h-[80vh] overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">Validation Function Library</h3>
            <div className="flex items-center space-x-2">
              <button
                onClick={onCreateNewFunction}
                className="flex items-center px-3 py-1.5 bg-medical-600 text-white text-sm rounded-md hover:bg-medical-700"
              >
                <Plus className="h-4 w-4 mr-1" />
                Create New
              </button>
              <button
                onClick={onClose}
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
                          onClick={() => onSelectFunction(func)}
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
  );
};

export default ValidationFunctionLibraryModal;