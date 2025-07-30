import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, FileText, Plus, Settings, ChevronDown, ChevronUp, Tag } from 'lucide-react';
import { Acquisition, DicomField } from '../../types';
import { mockAcquisitions, mockDicomFields } from '../../data/mockData';

const BuildSchema: React.FC = () => {
  const navigate = useNavigate();
  const [acquisitions, setAcquisitions] = useState<Acquisition[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());

  const handleFileUpload = useCallback(async (files: FileList | null) => {
    if (!files) return;

    setIsUploading(true);
    setUploadProgress(0);

    // Simulate file processing
    for (let i = 0; i < files.length; i++) {
      setUploadProgress((i + 1) / files.length * 100);
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Use mock data to simulate processed acquisitions
    setAcquisitions(mockAcquisitions);
    setIsUploading(false);
    setUploadProgress(0);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    handleFileUpload(e.dataTransfer.files);
  }, [handleFileUpload]);

  const toggleCardExpansion = (acquisitionId: string) => {
    const newExpanded = new Set(expandedCards);
    if (newExpanded.has(acquisitionId)) {
      newExpanded.delete(acquisitionId);
    } else {
      newExpanded.add(acquisitionId);
    }
    setExpandedCards(newExpanded);
  };

  const addNewAcquisition = () => {
    const newAcquisition: Acquisition = {
      id: `acq_${Date.now()}`,
      protocolName: 'New Protocol',
      seriesDescription: 'New Series',
      totalFiles: 0,
      acquisitionFields: [],
      seriesFields: [],
      metadata: {}
    };
    setAcquisitions([...acquisitions, newAcquisition]);
  };

  const updateAcquisitionField = (acquisitionId: string, field: keyof Acquisition, value: any) => {
    setAcquisitions(prev => prev.map(acq => 
      acq.id === acquisitionId ? { ...acq, [field]: value } : acq
    ));
  };

  const toggleFieldSelection = (acquisitionId: string, field: DicomField, level: 'acquisition' | 'series') => {
    setAcquisitions(prev => prev.map(acq => {
      if (acq.id !== acquisitionId) return acq;
      
      const targetFields = level === 'acquisition' ? acq.acquisitionFields : acq.seriesFields;
      const otherFields = level === 'acquisition' ? acq.seriesFields : acq.acquisitionFields;
      
      const isAlreadySelected = targetFields.some(f => f.tag === field.tag);
      
      if (isAlreadySelected) {
        // Remove from current level
        const updatedFields = targetFields.filter(f => f.tag !== field.tag);
        return {
          ...acq,
          [level === 'acquisition' ? 'acquisitionFields' : 'seriesFields']: updatedFields
        };
      } else {
        // Add to current level and remove from other level if present
        const filteredOtherFields = otherFields.filter(f => f.tag !== field.tag);
        const updatedFields = [...targetFields, { ...field, level }];
        
        return {
          ...acq,
          [level === 'acquisition' ? 'acquisitionFields' : 'seriesFields']: updatedFields,
          [level === 'acquisition' ? 'seriesFields' : 'acquisitionFields']: filteredOtherFields
        };
      }
    }));
  };

  const handleContinue = () => {
    navigate('/generate-template/enter-metadata');
  };

  if (acquisitions.length === 0) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">Build Schema - Step 1</h2>
          <p className="text-gray-600">
            Upload DICOM files to automatically extract metadata and create acquisition templates. 
            You can also manually add acquisitions if needed.
          </p>
        </div>

        {/* Upload Area */}
        <div
          className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center hover:border-medical-400 transition-colors"
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          <Upload className="h-16 w-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">Upload DICOM Files</h3>
          <p className="text-gray-600 mb-6">
            Drag and drop DICOM files or folders here, or click to browse
          </p>
          
          <input
            type="file"
            multiple
            webkitdirectory=""
            className="hidden"
            id="file-upload"
            onChange={(e) => handleFileUpload(e.target.files)}
          />
          <label
            htmlFor="file-upload"
            className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-medical-600 hover:bg-medical-700 cursor-pointer"
          >
            <Upload className="h-5 w-5 mr-2" />
            Browse Files
          </label>

          {isUploading && (
            <div className="mt-6">
              <div className="bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-medical-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              <p className="text-sm text-gray-600 mt-2">Processing files... {Math.round(uploadProgress)}%</p>
            </div>
          )}
        </div>

        {/* Manual Add Option */}
        <div className="mt-8 text-center">
          <p className="text-gray-600 mb-4">Or create an acquisition manually</p>
          <button
            onClick={addNewAcquisition}
            className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add New Acquisition
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-gray-900 mb-4">Build Schema - Step 1</h2>
        <p className="text-gray-600">
          Review detected acquisitions and configure which DICOM fields to include in your validation template.
        </p>
      </div>

      {/* Acquisitions List */}
      <div className="space-y-6">
        {acquisitions.map((acquisition) => {
          const isExpanded = expandedCards.has(acquisition.id);
          const totalSelectedFields = acquisition.acquisitionFields.length + acquisition.seriesFields.length;
          
          return (
            <div key={acquisition.id} className="bg-white rounded-lg shadow-md border border-gray-200">
              {/* Card Header */}
              <div className="px-6 py-4 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-4">
                      <input
                        type="text"
                        value={acquisition.protocolName}
                        onChange={(e) => updateAcquisitionField(acquisition.id, 'protocolName', e.target.value)}
                        className="text-lg font-semibold text-gray-900 bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-medical-500 rounded px-2 py-1"
                      />
                      <span className="text-sm text-gray-500">
                        {acquisition.totalFiles} files
                      </span>
                    </div>
                    <input
                      type="text"
                      value={acquisition.seriesDescription}
                      onChange={(e) => updateAcquisitionField(acquisition.id, 'seriesDescription', e.target.value)}
                      className="text-sm text-gray-600 bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-medical-500 rounded px-2 py-1 mt-1"
                    />
                  </div>
                  
                  <div className="flex items-center space-x-4">
                    <span className="text-sm text-medical-600 font-medium">
                      {totalSelectedFields} fields selected
                    </span>
                    <button
                      onClick={() => toggleCardExpansion(acquisition.id)}
                      className="p-2 text-gray-400 hover:text-gray-600"
                    >
                      {isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Expanded Content */}
              {isExpanded && (
                <div className="px-6 py-4">
                  <div className="grid md:grid-cols-2 gap-6">
                    {/* Acquisition-Level Fields */}
                    <div>
                      <h4 className="text-lg font-medium text-gray-900 mb-3 flex items-center">
                        <Settings className="h-5 w-5 mr-2 text-medical-600" />
                        Acquisition-Level Fields
                      </h4>
                      <p className="text-sm text-gray-600 mb-4">
                        Fields that have the same value across all series in this acquisition
                      </p>
                      
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {mockDicomFields.map((field) => {
                          const isSelected = acquisition.acquisitionFields.some(f => f.tag === field.tag);
                          
                          return (
                            <div
                              key={`acq-${field.tag}`}
                              className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                                isSelected 
                                  ? 'border-medical-200 bg-medical-50' 
                                  : 'border-gray-200 hover:border-gray-300'
                              }`}
                              onClick={() => toggleFieldSelection(acquisition.id, field, 'acquisition')}
                            >
                              <div className="flex items-center justify-between">
                                <div>
                                  <div className="flex items-center space-x-2">
                                    <Tag className="h-4 w-4 text-gray-400" />
                                    <span className="text-sm font-medium text-gray-900">
                                      {field.name}
                                    </span>
                                  </div>
                                  <p className="text-xs text-gray-500 mt-1">
                                    {field.tag} • {field.vr}
                                  </p>
                                </div>
                                <div className="text-sm text-gray-600">
                                  {Array.isArray(field.value) ? field.value.join(', ') : field.value}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Series-Level Fields */}
                    <div>
                      <h4 className="text-lg font-medium text-gray-900 mb-3 flex items-center">
                        <FileText className="h-5 w-5 mr-2 text-medical-600" />
                        Series-Level Fields
                      </h4>
                      <p className="text-sm text-gray-600 mb-4">
                        Fields that may vary between different series in this acquisition
                      </p>
                      
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {mockDicomFields.map((field) => {
                          const isSelected = acquisition.seriesFields.some(f => f.tag === field.tag);
                          
                          return (
                            <div
                              key={`series-${field.tag}`}
                              className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                                isSelected 
                                  ? 'border-medical-200 bg-medical-50' 
                                  : 'border-gray-200 hover:border-gray-300'
                              }`}
                              onClick={() => toggleFieldSelection(acquisition.id, field, 'series')}
                            >
                              <div className="flex items-center justify-between">
                                <div>
                                  <div className="flex items-center space-x-2">
                                    <Tag className="h-4 w-4 text-gray-400" />
                                    <span className="text-sm font-medium text-gray-900">
                                      {field.name}
                                    </span>
                                  </div>
                                  <p className="text-xs text-gray-500 mt-1">
                                    {field.tag} • {field.vr}
                                  </p>
                                </div>
                                <div className="text-sm text-gray-600">
                                  {Array.isArray(field.value) ? field.value.join(', ') : field.value}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Add New Acquisition Button */}
      <div className="mt-6">
        <button
          onClick={addNewAcquisition}
          className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add New Acquisition
        </button>
      </div>

      {/* Continue Button */}
      <div className="mt-8 flex justify-end">
        <button
          onClick={handleContinue}
          disabled={acquisitions.length === 0}
          className="px-6 py-3 bg-medical-600 text-white rounded-lg hover:bg-medical-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          Continue to Metadata
        </button>
      </div>
    </div>
  );
};

export default BuildSchema;