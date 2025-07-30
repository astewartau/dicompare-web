import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, FileText, Database, Eye, Loader, CheckCircle } from 'lucide-react';
import { Acquisition, ProcessingProgress } from '../../types';
import { mockAcquisitions } from '../../data/mockData';

const DataLoading: React.FC = () => {
  const navigate = useNavigate();
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<ProcessingProgress | null>(null);
  const [loadedData, setLoadedData] = useState<Acquisition[]>([]);
  const [showExampleData, setShowExampleData] = useState(false);

  const handleFileUpload = useCallback(async (files: FileList | null) => {
    if (!files) return;

    setIsProcessing(true);
    setProgress({
      currentFile: 0,
      totalFiles: files.length,
      currentOperation: 'Initializing...',
      percentage: 0
    });

    const operations = [
      'Reading DICOM headers...',
      'Extracting metadata...',
      'Identifying acquisitions...',
      'Organizing series...',
      'Finalizing data structure...'
    ];

    for (let i = 0; i < operations.length; i++) {
      setProgress(prev => prev ? {
        ...prev,
        currentOperation: operations[i],
        percentage: (i + 1) / operations.length * 100
      } : null);
      
      await new Promise(resolve => setTimeout(resolve, 800));
    }

    // Simulate loading acquisitions
    setLoadedData(mockAcquisitions);
    setIsProcessing(false);
    setProgress(null);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    handleFileUpload(e.dataTransfer.files);
  }, [handleFileUpload]);

  const loadExampleData = () => {
    setShowExampleData(true);
    setLoadedData(mockAcquisitions);
  };

  const clearData = () => {
    setLoadedData([]);
    setShowExampleData(false);
  };

  const handleContinue = () => {
    navigate('/check-compliance/schema-selection');
  };

  const visualizeData = (acquisition: Acquisition) => {
    // This would open a modal or navigate to a data visualization view
    console.log('Visualizing data for:', acquisition.protocolName);
  };

  if (isProcessing) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">Loading DICOM Data</h2>
          <p className="text-gray-600">
            Processing your DICOM files and extracting metadata...
          </p>
        </div>

        <div className="bg-white rounded-lg shadow-md p-8">
          <div className="text-center">
            <Loader className="h-16 w-16 text-medical-600 mx-auto mb-6 animate-spin" />
            
            {progress && (
              <div className="space-y-4">
                <h3 className="text-lg font-medium text-gray-900">
                  {progress.currentOperation}
                </h3>
                
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div 
                    className="bg-medical-600 h-3 rounded-full transition-all duration-500"
                    style={{ width: `${progress.percentage}%` }}
                  />
                </div>
                
                <p className="text-sm text-gray-600">
                  {Math.round(progress.percentage)}% complete
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (loadedData.length === 0) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">Load DICOM Data - Step 1</h2>
          <p className="text-gray-600">
            Upload DICOM files for compliance validation or load example data to explore the features.
          </p>
        </div>

        {/* Upload Area */}
        <div
          className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center hover:border-medical-400 transition-colors mb-8"
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
        </div>

        {/* Example Data Option */}
        <div className="bg-white rounded-lg shadow-md p-8">
          <div className="text-center">
            <Database className="h-12 w-12 text-medical-600 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">Try Example Data</h3>
            <p className="text-gray-600 mb-6">
              Load pre-configured example DICOM datasets to explore the compliance checking features
            </p>
            
            <button
              onClick={loadExampleData}
              className="inline-flex items-center px-6 py-3 border border-medical-600 text-medical-600 rounded-lg hover:bg-medical-50"
            >
              <Database className="h-5 w-5 mr-2" />
              Load Example Data
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold text-gray-900 mb-4">DICOM Data Loaded</h2>
            <p className="text-gray-600">
              {loadedData.length} acquisitions detected and ready for compliance checking.
              {showExampleData && (
                <span className="ml-2 inline-flex items-center px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-800">
                  Example Data
                </span>
              )}
            </p>
          </div>
          
          <div className="flex space-x-3">
            <button
              onClick={clearData}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              Clear Data
            </button>
          </div>
        </div>
      </div>

      {/* Data Summary */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-8">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <CheckCircle className="h-6 w-6 mr-2 text-green-600" />
          Data Processing Summary
        </h3>
        
        <div className="grid md:grid-cols-3 gap-6">
          <div className="text-center p-4 bg-medical-50 rounded-lg">
            <div className="text-2xl font-bold text-medical-600 mb-1">
              {loadedData.length}
            </div>
            <div className="text-sm text-gray-600">Acquisitions</div>
          </div>
          
          <div className="text-center p-4 bg-medical-50 rounded-lg">
            <div className="text-2xl font-bold text-medical-600 mb-1">
              {loadedData.reduce((sum, acq) => sum + acq.totalFiles, 0)}
            </div>
            <div className="text-sm text-gray-600">Total Files</div>
          </div>
          
          <div className="text-center p-4 bg-medical-50 rounded-lg">
            <div className="text-2xl font-bold text-medical-600 mb-1">
              {new Set(loadedData.map(acq => acq.metadata.manufacturer)).size}
            </div>
            <div className="text-sm text-gray-600">Manufacturers</div>
          </div>
        </div>
      </div>

      {/* Acquisitions List */}
      <div className="space-y-4 mb-8">
        <h3 className="text-lg font-semibold text-gray-900">Detected Acquisitions</h3>
        
        {loadedData.map((acquisition) => (
          <div
            key={acquisition.id}
            className="bg-white rounded-lg shadow-md p-6 border border-gray-200"
          >
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <h4 className="text-lg font-medium text-gray-900 mb-1">
                  {acquisition.protocolName}
                </h4>
                <p className="text-gray-600 mb-2">{acquisition.seriesDescription}</p>
                
                <div className="flex items-center space-x-4 text-sm text-gray-500">
                  <span>{acquisition.totalFiles} files</span>
                  {acquisition.metadata.manufacturer && (
                    <span>• {acquisition.metadata.manufacturer}</span>
                  )}
                  {acquisition.metadata.magneticFieldStrength && (
                    <span>• {acquisition.metadata.magneticFieldStrength}T</span>
                  )}
                </div>
              </div>
              
              <div className="flex items-center space-x-3">
                <div className="text-right text-sm">
                  <div className="text-gray-900 font-medium">
                    {acquisition.acquisitionFields.length + acquisition.seriesFields.length} fields
                  </div>
                  <div className="text-gray-500">extracted</div>
                </div>
                
                <button
                  onClick={() => visualizeData(acquisition)}
                  className="p-2 text-gray-400 hover:text-medical-600 hover:bg-medical-50 rounded-lg"
                  title="Visualize data"
                >
                  <Eye className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Continue Button */}
      <div className="flex justify-end">
        <button
          onClick={handleContinue}
          className="px-6 py-3 bg-medical-600 text-white rounded-lg hover:bg-medical-700"
        >
          Continue to Schema Selection
        </button>
      </div>
    </div>
  );
};

export default DataLoading;