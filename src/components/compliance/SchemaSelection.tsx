import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, FileText, Code, Link2, Plus, ArrowLeft, CheckCircle, AlertCircle } from 'lucide-react';
import { Template, Acquisition } from '../../types';
import { mockTemplates, mockAcquisitions } from '../../data/mockData';

const SchemaSelection: React.FC = () => {
  const navigate = useNavigate();
  const [templates] = useState<Template[]>(mockTemplates);
  const [acquisitions] = useState<Acquisition[]>(mockAcquisitions);
  const [pairings, setPairings] = useState<Record<string, string>>({});
  const [showUploadModal, setShowUploadModal] = useState(false);

  const handleTemplatePairing = (acquisitionId: string, templateId: string) => {
    setPairings(prev => ({
      ...prev,
      [acquisitionId]: templateId
    }));
  };

  const unpairAcquisition = (acquisitionId: string) => {
    setPairings(prev => {
      const newPairings = { ...prev };
      delete newPairings[acquisitionId];
      return newPairings;
    });
  };

  const handleUploadTemplate = (files: FileList | null) => {
    if (!files) return;
    
    // Simulate template upload
    console.log('Uploading templates:', files);
    setShowUploadModal(false);
  };

  const handleBack = () => {
    navigate('/check-compliance/data-loading');
  };

  const handleContinue = () => {
    navigate('/check-compliance/analysis');
  };

  const getPairedTemplate = (acquisitionId: string): Template | null => {
    const templateId = pairings[acquisitionId];
    return templateId ? templates.find(t => t.id === templateId) || null : null;
  };

  const getUnpairedAcquisitions = () => {
    return acquisitions.filter(acq => !pairings[acq.id]);
  };

  const getPairedAcquisitions = () => {
    return acquisitions.filter(acq => pairings[acq.id]);
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-gray-900 mb-4">Schema Selection - Step 2</h2>
        <p className="text-gray-600">
          Select validation templates for each DICOM acquisition. Each acquisition needs to be paired with a compatible schema.
        </p>
      </div>

      {/* Template Library */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-8">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-semibold text-gray-900 flex items-center">
            <FileText className="h-6 w-6 mr-2 text-medical-600" />
            Template Library
          </h3>
          
          <button
            onClick={() => setShowUploadModal(true)}
            className="flex items-center px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
          >
            <Plus className="h-4 w-4 mr-2" />
            Upload Template
          </button>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          {templates.map((template) => (
            <div
              key={template.id}
              className="border border-gray-200 rounded-lg p-4 hover:border-medical-200 transition-colors"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <h4 className="font-medium text-gray-900 mb-1">{template.name}</h4>
                  <p className="text-sm text-gray-600 mb-2">
                    {template.description || 'No description available'}
                  </p>
                  <div className="flex items-center space-x-4 text-xs text-gray-500">
                    <span>v{template.version}</span>
                    <span>• {template.authors.join(', ')}</span>
                    <span className={`px-2 py-1 rounded-full ${
                      template.format === 'json' 
                        ? 'bg-blue-100 text-blue-800' 
                        : 'bg-green-100 text-green-800'
                    }`}>
                      {template.format.toUpperCase()}
                    </span>
                  </div>
                </div>
                
                <div className="text-right">
                  {template.format === 'json' ? (
                    <FileText className="h-5 w-5 text-blue-600" />
                  ) : (
                    <Code className="h-5 w-5 text-green-600" />
                  )}
                </div>
              </div>
              
              <div className="text-sm text-gray-600">
                {Object.keys(template.acquisitions).length} acquisition type(s)
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Acquisition Pairing */}
      <div className="space-y-6">
        {/* Paired Acquisitions */}
        {getPairedAcquisitions().length > 0 && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <CheckCircle className="h-6 w-6 mr-2 text-green-600" />
              Paired Acquisitions ({getPairedAcquisitions().length})
            </h3>
            
            <div className="space-y-4">
              {getPairedAcquisitions().map((acquisition) => {
                const pairedTemplate = getPairedTemplate(acquisition.id);
                
                return (
                  <div
                    key={acquisition.id}
                    className="flex items-center justify-between p-4 border border-green-200 bg-green-50 rounded-lg"
                  >
                    <div className="flex-1">
                      <div className="flex items-center space-x-3">
                        <div>
                          <h4 className="font-medium text-gray-900">{acquisition.protocolName}</h4>
                          <p className="text-sm text-gray-600">{acquisition.seriesDescription}</p>
                        </div>
                        
                        <Link2 className="h-5 w-5 text-green-600" />
                        
                        <div>
                          <h4 className="font-medium text-gray-900">{pairedTemplate?.name}</h4>
                          <p className="text-sm text-gray-600">v{pairedTemplate?.version}</p>
                        </div>
                      </div>
                    </div>
                    
                    <button
                      onClick={() => unpairAcquisition(acquisition.id)}
                      className="px-3 py-1 text-sm text-red-600 hover:bg-red-50 rounded"
                    >
                      Unpair
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Unpaired Acquisitions */}
        {getUnpairedAcquisitions().length > 0 && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <AlertCircle className="h-6 w-6 mr-2 text-yellow-600" />
              Unpaired Acquisitions ({getUnpairedAcquisitions().length})
            </h3>
            
            <div className="space-y-4">
              {getUnpairedAcquisitions().map((acquisition) => (
                <div
                  key={acquisition.id}
                  className="border border-yellow-200 bg-yellow-50 rounded-lg p-4"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h4 className="font-medium text-gray-900 mb-1">{acquisition.protocolName}</h4>
                      <p className="text-sm text-gray-600 mb-2">{acquisition.seriesDescription}</p>
                      <div className="flex items-center space-x-4 text-xs text-gray-500">
                        <span>{acquisition.totalFiles} files</span>
                        {acquisition.metadata.manufacturer && (
                          <span>• {acquisition.metadata.manufacturer}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div>
                    <p className="text-sm text-gray-700 mb-3">Select a compatible template:</p>
                    <div className="grid md:grid-cols-2 gap-2">
                      {templates.map((template) => (
                        <button
                          key={template.id}
                          onClick={() => handleTemplatePairing(acquisition.id, template.id)}
                          className="p-3 text-left border border-gray-200 rounded-lg hover:border-medical-300 hover:bg-medical-50 transition-colors"
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="font-medium text-gray-900 text-sm">{template.name}</div>
                              <div className="text-xs text-gray-500">v{template.version}</div>
                            </div>
                            <div className={`text-xs px-2 py-1 rounded-full ${
                              template.format === 'json' 
                                ? 'bg-blue-100 text-blue-800' 
                                : 'bg-green-100 text-green-800'
                            }`}>
                              {template.format.toUpperCase()}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Upload Template Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Upload Template</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select template files (JSON or Python)
                </label>
                <input
                  type="file"
                  multiple
                  accept=".json,.py"
                  onChange={(e) => handleUploadTemplate(e.target.files)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-medical-500 focus:border-medical-500"
                />
              </div>
              
              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => setShowUploadModal(false)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => setShowUploadModal(false)}
                  className="px-4 py-2 bg-medical-600 text-white rounded-lg hover:bg-medical-700"
                >
                  Upload
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Navigation Buttons */}
      <div className="mt-8 flex justify-between">
        <button
          onClick={handleBack}
          className="flex items-center px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
        >
          <ArrowLeft className="h-5 w-5 mr-2" />
          Back to Data Loading
        </button>
        
        <button
          onClick={handleContinue}
          disabled={getPairedAcquisitions().length === 0}
          className="px-6 py-3 bg-medical-600 text-white rounded-lg hover:bg-medical-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          Start Compliance Analysis
          {getPairedAcquisitions().length > 0 && (
            <span className="ml-2 bg-white bg-opacity-20 px-2 py-1 rounded-full text-xs">
              {getPairedAcquisitions().length}
            </span>
          )}
        </button>
      </div>
    </div>
  );
};

export default SchemaSelection;