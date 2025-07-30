import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, FileText, Code, Eye, ArrowLeft } from 'lucide-react';
import { mockTemplates } from '../../data/mockData';

const DownloadSchema: React.FC = () => {
  const navigate = useNavigate();
  const template = mockTemplates[0]; // Using mock template

  const handleDownloadJSON = () => {
    const jsonContent = JSON.stringify(template, null, 2);
    const blob = new Blob([jsonContent], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${template.name.replace(/\s+/g, '_')}_v${template.version}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadPython = () => {
    const pythonContent = `"""
${template.name} - Version ${template.version}
${template.description || ''}

Authors: ${template.authors.join(', ')}
Created: ${new Date().toISOString()}
"""

import json
from typing import Dict, Any, List

class DicomValidator:
    def __init__(self):
        self.template = ${JSON.stringify(template, null, 8)}
    
    def validate_acquisition(self, dicom_data: Dict[str, Any], acquisition_type: str) -> Dict[str, Any]:
        """
        Validate a DICOM acquisition against the template
        
        Args:
            dicom_data: Dictionary containing DICOM metadata
            acquisition_type: Type of acquisition to validate against
            
        Returns:
            Dictionary containing validation results
        """
        results = {
            'acquisition_type': acquisition_type,
            'status': 'pass',
            'field_results': [],
            'errors': []
        }
        
        if acquisition_type not in self.template['acquisitions']:
            results['status'] = 'fail'
            results['errors'].append(f"Unknown acquisition type: {acquisition_type}")
            return results
        
        acquisition_config = self.template['acquisitions'][acquisition_type]
        
        for field_config in acquisition_config['fields']:
            field_result = self._validate_field(dicom_data, field_config)
            results['field_results'].append(field_result)
            
            if field_result['status'] == 'fail':
                results['status'] = 'fail'
        
        return results
    
    def _validate_field(self, dicom_data: Dict[str, Any], field_config: Dict[str, Any]) -> Dict[str, Any]:
        """Validate a single DICOM field"""
        tag = field_config['tag']
        field_name = field_config['name']
        validation_rule = field_config['validation_rule']
        
        result = {
            'tag': tag,
            'name': field_name,
            'status': 'pass',
            'message': 'Field validation passed'
        }
        
        if tag not in dicom_data:
            if field_config['required']:
                result['status'] = 'fail'
                result['message'] = f"Required field {field_name} is missing"
            return result
        
        actual_value = dicom_data[tag]
        
        # Implement validation logic based on rule type
        if validation_rule['type'] == 'exact':
            if actual_value != validation_rule['value']:
                result['status'] = 'fail'
                result['message'] = f"Expected {validation_rule['value']}, got {actual_value}"
        
        elif validation_rule['type'] == 'range':
            try:
                val = float(actual_value)
                if val < validation_rule['min'] or val > validation_rule['max']:
                    result['status'] = 'fail'
                    result['message'] = f"Value {val} outside range [{validation_rule['min']}, {validation_rule['max']}]"
            except ValueError:
                result['status'] = 'fail'
                result['message'] = f"Cannot convert {actual_value} to numeric value"
        
        elif validation_rule['type'] == 'pattern':
            import re
            if not re.match(validation_rule['pattern'], str(actual_value)):
                result['status'] = 'fail'
                result['message'] = f"Value {actual_value} does not match pattern {validation_rule['pattern']}"
        
        return result

# Example usage:
if __name__ == "__main__":
    validator = DicomValidator()
    
    # Example DICOM data
    sample_data = {
        '0008,0060': 'MR',
        '0018,0087': '3.0',
        '0018,0080': '2000'
    }
    
    result = validator.validate_acquisition(sample_data, 't1_mprage')
    print(json.dumps(result, indent=2))
`;

    const blob = new Blob([pythonContent], { type: 'text/python' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${template.name.replace(/\s+/g, '_')}_v${template.version}.py`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleBack = () => {
    navigate('/generate-template/enter-metadata');
  };

  const handleStartOver = () => {
    navigate('/generate-template/build-schema');
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-gray-900 mb-4">Download Schema - Step 3</h2>
        <p className="text-gray-600">
          Your template has been generated successfully. Download it in your preferred format or preview the content.
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-8">
        {/* Template Summary */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-xl font-semibold text-gray-900 mb-4 flex items-center">
            <Eye className="h-6 w-6 mr-2 text-medical-600" />
            Template Summary
          </h3>
          
          <div className="space-y-4">
            <div>
              <h4 className="font-medium text-gray-700">Template Name</h4>
              <p className="text-gray-900">{template.name}</p>
            </div>
            
            <div>
              <h4 className="font-medium text-gray-700">Version</h4>
              <p className="text-gray-900">{template.version}</p>
            </div>
            
            <div>
              <h4 className="font-medium text-gray-700">Authors</h4>
              <p className="text-gray-900">{template.authors.join(', ')}</p>
            </div>
            
            {template.description && (
              <div>
                <h4 className="font-medium text-gray-700">Description</h4>
                <p className="text-gray-900">{template.description}</p>
              </div>
            )}
            
            <div>
              <h4 className="font-medium text-gray-700">Acquisitions</h4>
              <div className="mt-2 space-y-2">
                {Object.entries(template.acquisitions).map(([key, acquisition]) => (
                  <div key={key} className="p-3 bg-gray-50 rounded-lg">
                    <p className="font-medium text-gray-900">{acquisition.name}</p>
                    <p className="text-sm text-gray-600">{acquisition.fields.length} validation fields</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Download Options */}
        <div className="space-y-6">
          {/* JSON Format */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex items-center mb-4">
              <FileText className="h-6 w-6 mr-2 text-medical-600" />
              <h3 className="text-xl font-semibold text-gray-900">JSON Format</h3>
            </div>
            
            <p className="text-gray-600 mb-4">
              Human-readable structured format ideal for standard validation rules and straightforward field checking.
            </p>
            
            <div className="space-y-3">
              <button
                onClick={handleDownloadJSON}
                className="w-full flex items-center justify-center px-4 py-3 bg-medical-600 text-white rounded-lg hover:bg-medical-700"
              >
                <Download className="h-5 w-5 mr-2" />
                Download JSON Template
              </button>
              
              <button className="w-full flex items-center justify-center px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50">
                <Eye className="h-5 w-5 mr-2" />
                Preview JSON
              </button>
            </div>
          </div>

          {/* Python Format */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex items-center mb-4">
              <Code className="h-6 w-6 mr-2 text-medical-600" />
              <h3 className="text-xl font-semibold text-gray-900">Python Format</h3>
            </div>
            
            <p className="text-gray-600 mb-4">
              Programmable format that enables complex validation logic, custom calculations, and advanced rule definitions.
            </p>
            
            <div className="space-y-3">
              <button
                onClick={handleDownloadPython}
                className="w-full flex items-center justify-center px-4 py-3 bg-medical-600 text-white rounded-lg hover:bg-medical-700"
              >
                <Download className="h-5 w-5 mr-2" />
                Download Python Template
              </button>
              
              <button className="w-full flex items-center justify-center px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50">
                <Eye className="h-5 w-5 mr-2" />
                Preview Python Code
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Template Preview */}
      <div className="mt-8 bg-white rounded-lg shadow-md p-6">
        <h3 className="text-xl font-semibold text-gray-900 mb-4 flex items-center">
          <FileText className="h-6 w-6 mr-2 text-medical-600" />
          Template Content Preview
        </h3>
        
        <div className="bg-gray-50 rounded-lg p-4 overflow-x-auto">
          <pre className="text-sm text-gray-700 whitespace-pre-wrap">
            {JSON.stringify(template, null, 2)}
          </pre>
        </div>
      </div>

      {/* Navigation Buttons */}
      <div className="mt-8 flex justify-between">
        <button
          onClick={handleBack}
          className="flex items-center px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
        >
          <ArrowLeft className="h-5 w-5 mr-2" />
          Back to Metadata
        </button>
        
        <div className="space-x-4">
          <button
            onClick={handleStartOver}
            className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
          >
            Create Another Template
          </button>
          
          <button
            onClick={() => navigate('/')}
            className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            Return to Home
          </button>
        </div>
      </div>
    </div>
  );
};

export default DownloadSchema;