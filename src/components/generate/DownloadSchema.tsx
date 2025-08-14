import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, FileText, Code, Eye, ArrowLeft, Loader2 } from 'lucide-react';
import { useAcquisitions } from '../../contexts/AcquisitionContext';
import { dicompareAPI } from '../../services/DicompareAPI';

const DownloadSchema: React.FC = () => {
  const navigate = useNavigate();
  const { acquisitions, templateMetadata } = useAcquisitions();
  const [template, setTemplate] = useState<any>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Generate template when component mounts
  useEffect(() => {
    const generateTemplate = async () => {
      if (!templateMetadata || acquisitions.length === 0) {
        setError('Missing template metadata or acquisitions. Please go back and complete the previous steps.');
        return;
      }

      setIsGenerating(true);
      try {
        console.log('Generating template with acquisitions:', acquisitions);
        console.log('Template metadata:', templateMetadata);
        
        const generatedTemplate = await dicompareAPI.generateTemplate(acquisitions, templateMetadata);
        setTemplate(generatedTemplate);
        setError(null);
      } catch (err) {
        console.error('Failed to generate template:', err);
        setError(`Failed to generate template: ${err instanceof Error ? err.message : 'Unknown error'}`);
      } finally {
        setIsGenerating(false);
      }
    };

    generateTemplate();
  }, [acquisitions, templateMetadata]);

  const handleDownloadJSON = () => {
    const jsonContent = JSON.stringify(template, null, 2);
    const blob = new Blob([jsonContent], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    
    // Use templateMetadata for filename, with fallback
    const templateName = templateMetadata?.name || 'validation_template';
    const version = templateMetadata?.version || '1.0';
    a.download = `${templateName.replace(/\s+/g, '_')}_v${version}.json`;
    
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

  // Show loading state
  if (isGenerating) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">Download Schema - Step 3</h2>
          <p className="text-gray-600">Generating your validation template...</p>
        </div>
        
        <div className="bg-white rounded-lg shadow-md p-12 text-center">
          <Loader2 className="h-12 w-12 animate-spin text-medical-600 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Generating Template</h3>
          <p className="text-gray-600">Using dicompare to create your validation schema...</p>
        </div>
      </div>
    );
  }

  // Show error state
  if (error) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">Download Schema - Step 3</h2>
          <p className="text-gray-600">There was an issue generating your template.</p>
        </div>
        
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-red-800 mb-2">Template Generation Failed</h3>
          <p className="text-red-700 mb-4">{error}</p>
          <div className="space-x-4">
            <button
              onClick={() => navigate('/generate-template/enter-metadata')}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
            >
              Back to Metadata
            </button>
            <button
              onClick={() => navigate('/generate-template/build-schema')}
              className="px-4 py-2 border border-red-300 text-red-700 rounded-lg hover:bg-red-50"
            >
              Start Over
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Show success state with template
  if (!template) {
    return null; // Still loading or no template
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-gray-900 mb-4">Download Schema - Step 3</h2>
        <p className="text-gray-600">
          Your template has been generated successfully! Download it in your preferred format or preview the content.
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
              <p className="text-gray-900">{templateMetadata?.name || 'Generated Template'}</p>
            </div>
            
            <div>
              <h4 className="font-medium text-gray-700">Version</h4>
              <p className="text-gray-900">{templateMetadata?.version || '1.0'}</p>
            </div>
            
            <div>
              <h4 className="font-medium text-gray-700">Authors</h4>
              <p className="text-gray-900">{templateMetadata?.authors?.join(', ') || 'Unknown'}</p>
            </div>
            
            {templateMetadata?.description && (
              <div>
                <h4 className="font-medium text-gray-700">Description</h4>
                <p className="text-gray-900">{templateMetadata.description}</p>
              </div>
            )}
            
            <div>
              <h4 className="font-medium text-gray-700">Acquisitions</h4>
              <div className="mt-2 space-y-2">
                {acquisitions.map((acquisition) => (
                  <div key={acquisition.id} className="p-3 bg-gray-50 rounded-lg">
                    <p className="font-medium text-gray-900">{acquisition.protocolName}</p>
                    <p className="text-sm text-gray-600">
                      {acquisition.acquisitionFields.length + acquisition.seriesFields.length} validation fields
                    </p>
                  </div>
                ))}
              </div>
            </div>
            
            {template.statistics && (
              <div>
                <h4 className="font-medium text-gray-700">Statistics</h4>
                <div className="mt-2 space-y-1 text-sm text-gray-600">
                  <p>Total acquisitions: {template.statistics.total_acquisitions}</p>
                  <p>Total validation fields: {template.statistics.total_validation_fields}</p>
                  <p>Estimated validation time: {template.statistics.estimated_validation_time}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Download Options */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center mb-4">
            <FileText className="h-6 w-6 mr-2 text-medical-600" />
            <h3 className="text-xl font-semibold text-gray-900">Download Template</h3>
          </div>
          
          <p className="text-gray-600 mb-6">
            Download your validation template as a JSON file for use with dicompare validation tools.
          </p>
          
          <button
            onClick={handleDownloadJSON}
            className="w-full flex items-center justify-center px-6 py-4 bg-medical-600 text-white rounded-lg hover:bg-medical-700 font-medium"
          >
            <Download className="h-5 w-5 mr-2" />
            Download JSON Template
          </button>
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