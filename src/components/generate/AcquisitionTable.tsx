import React, { useState } from 'react';
import { Edit2, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { Acquisition, DicomField } from '../../types';
import FieldTable from './FieldTable';
import SeriesTable from './SeriesTable';
import DicomFieldSelector from '../common/DicomFieldSelector';

interface AcquisitionTableProps {
  acquisition: Acquisition;
  isEditMode: boolean;
  incompleteFields?: Set<string>;
  onUpdate: (field: keyof Acquisition, value: any) => void;
  onDelete: () => void;
  onFieldUpdate: (fieldTag: string, updates: Partial<DicomField>) => void;
  onFieldConvert: (fieldTag: string, toLevel: 'acquisition' | 'series') => void;
  onFieldDelete: (fieldTag: string) => void;
  onFieldAdd: (fields: string[]) => void;
  onSeriesUpdate: (seriesIndex: number, fieldTag: string, value: any) => void;
  onSeriesAdd: () => void;
  onSeriesDelete: (seriesIndex: number) => void;
  onSeriesNameUpdate: (seriesIndex: number, name: string) => void;
}

const AcquisitionTable: React.FC<AcquisitionTableProps> = ({
  acquisition,
  isEditMode,
  incompleteFields = new Set(),
  onUpdate,
  onDelete,
  onFieldUpdate,
  onFieldConvert,
  onFieldDelete,
  onFieldAdd,
  onSeriesUpdate,
  onSeriesAdd,
  onSeriesDelete,
  onSeriesNameUpdate,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);

  const hasSeriesFields = acquisition.seriesFields && acquisition.seriesFields.length > 0;

  return (
    <div className="border border-gray-300 rounded-lg bg-white shadow-sm h-fit">
      {/* Compact Header Bar */}
      <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 rounded-t-lg">
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0">
            {isEditMode ? (
              <div className="space-y-1">
                <input
                  type="text"
                  value={acquisition.protocolName}
                  onChange={(e) => onUpdate('protocolName', e.target.value)}
                  className="text-sm font-semibold text-gray-900 bg-white border border-gray-300 rounded px-2 py-1 w-full focus:outline-none focus:ring-1 focus:ring-medical-500"
                  placeholder="Acquisition Name"
                />
                <input
                  type="text"
                  value={acquisition.seriesDescription}
                  onChange={(e) => onUpdate('seriesDescription', e.target.value)}
                  className="text-xs text-gray-600 bg-white border border-gray-300 rounded px-2 py-1 w-full focus:outline-none focus:ring-1 focus:ring-medical-500"
                  placeholder="Description"
                />
              </div>
            ) : (
              <div>
                <h3 className="text-sm font-semibold text-gray-900 truncate">{acquisition.protocolName}</h3>
                <p className="text-xs text-gray-600 truncate">{acquisition.seriesDescription}</p>
              </div>
            )}
          </div>
          
          <div className="flex items-center space-x-1 ml-2 flex-shrink-0">
            {isEditMode && (
              <button
                onClick={onDelete}
                className="p-1 text-gray-600 hover:text-red-600 transition-colors"
                title="Delete acquisition"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            )}
            
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-1 text-gray-600 hover:text-gray-800 transition-colors"
              title={isExpanded ? 'Collapse' : 'Expand'}
            >
              {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
          </div>
        </div>
        
        {/* Compact stats row */}
        {acquisition.totalFiles > 0 && (
          <div className="mt-1 text-xs text-gray-500">
            {acquisition.totalFiles} files • {acquisition.acquisitionFields.length} fields
            {hasSeriesFields && ` • ${acquisition.seriesFields.length} varying`}
          </div>
        )}
      </div>

      {/* Compact Body Content */}
      {isExpanded && (
        <div className="p-3 space-y-3">
          {/* Acquisition-Level Fields */}
          <div>
            {/* Compact field selector */}
            {isEditMode && (
              <div className="mb-2">
                <DicomFieldSelector
                  selectedFields={[]}
                  onFieldsChange={(fields) => onFieldAdd(fields)}
                  placeholder="Add DICOM fields..."
                  className="w-full text-sm"
                />
              </div>
            )}
            
            <FieldTable
              fields={acquisition.acquisitionFields}
              isEditMode={isEditMode}
              incompleteFields={incompleteFields}
              acquisitionId={acquisition.id}
              onFieldUpdate={onFieldUpdate}
              onFieldConvert={(fieldTag) => onFieldConvert(fieldTag, 'series')}
              onFieldDelete={onFieldDelete}
            />
          </div>

          {/* Series-Level Fields */}
          {hasSeriesFields && (
            <div>
              <SeriesTable
                seriesFields={acquisition.seriesFields}
                series={acquisition.series || []}
                isEditMode={isEditMode}
                incompleteFields={incompleteFields}
                acquisitionId={acquisition.id}
                onSeriesUpdate={onSeriesUpdate}
                onSeriesAdd={onSeriesAdd}
                onSeriesDelete={onSeriesDelete}
                onFieldConvert={(fieldTag) => onFieldConvert(fieldTag, 'acquisition')}
                onSeriesNameUpdate={onSeriesNameUpdate}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AcquisitionTable;