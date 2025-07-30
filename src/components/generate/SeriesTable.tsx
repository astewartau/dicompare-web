import React, { useState } from 'react';
import { Plus, Trash2, Edit2, ArrowLeftRight } from 'lucide-react';
import { DicomField, Series } from '../../types';
import { formatSeriesFieldValue, formatFieldTypeInfo } from '../../utils/fieldFormatters';
import FieldEditModal from './FieldEditModal';

interface SeriesTableProps {
  seriesFields: DicomField[];
  series: Series[];
  isEditMode: boolean;
  incompleteFields?: Set<string>;
  acquisitionId?: string;
  onSeriesUpdate: (seriesIndex: number, fieldTag: string, value: any) => void;
  onSeriesAdd: () => void;
  onSeriesDelete: (seriesIndex: number) => void;
  onFieldConvert: (fieldTag: string) => void;
  onSeriesNameUpdate?: (seriesIndex: number, name: string) => void;
}

const SeriesTable: React.FC<SeriesTableProps> = ({
  seriesFields,
  series,
  isEditMode,
  incompleteFields = new Set(),
  acquisitionId = '',
  onSeriesUpdate,
  onSeriesAdd,
  onSeriesDelete,
  onFieldConvert,
  onSeriesNameUpdate,
}) => {
  const [editingCell, setEditingCell] = useState<{ seriesIndex: number; fieldTag: string } | null>(null);
  const [hoveredRow, setHoveredRow] = useState<number | null>(null);
  const [hoveredHeader, setHoveredHeader] = useState<string | null>(null);

  if (seriesFields.length === 0) {
    return (
      <div className="border border-gray-200 rounded-md p-8 text-center">
        <p className="text-gray-500 text-sm">No series-level fields defined</p>
        <p className="text-xs text-gray-400 mt-2">
          Convert acquisition-level fields to series-level to create varying values
        </p>
      </div>
    );
  }

  // Ensure at least 2 series exist, but preserve any existing data
  const displaySeries = [];
  for (let i = 0; i < Math.max(2, series.length); i++) {
    if (series[i]) {
      displaySeries.push(series[i]);
    } else {
      displaySeries.push({ name: `Series ${i + 1}`, fields: {} });
    }
  }

  return (
    <div className="border border-gray-200 rounded-md overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sticky left-0 bg-gray-50 z-10">
                Series
              </th>
              {seriesFields.map((field) => (
                <th 
                  key={field.tag} 
                  className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  onMouseEnter={() => setHoveredHeader(field.tag)}
                  onMouseLeave={() => setHoveredHeader(null)}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{field.name}</p>
                      <p className="text-xs font-normal text-gray-400">{field.tag}</p>
                    </div>
                    {isEditMode && (
                      <div className={`flex items-center space-x-1 ${
                        hoveredHeader === field.tag ? 'opacity-100' : 'opacity-0'
                      } transition-opacity`}>
                        <button
                          onClick={() => onFieldConvert(field.tag)}
                          className="p-1 text-gray-400 hover:text-medical-600 transition-colors"
                          title="Convert to acquisition field"
                        >
                          <ArrowLeftRight className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </th>
              ))}
              {isEditMode && (
                <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {displaySeries.map((ser, seriesIndex) => (
              <tr
                key={seriesIndex}
                className={`${seriesIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50'} ${
                  isEditMode ? 'hover:bg-blue-50 transition-colors' : ''
                }`}
                onMouseEnter={() => setHoveredRow(seriesIndex)}
                onMouseLeave={() => setHoveredRow(null)}
              >
                <td className="px-3 py-2 whitespace-nowrap font-medium text-gray-900 sticky left-0 bg-inherit">
                  {isEditMode && onSeriesNameUpdate ? (
                    <input
                      type="text"
                      value={ser.name}
                      onChange={(e) => onSeriesNameUpdate(seriesIndex, e.target.value)}
                      className="bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-medical-500 rounded px-1 py-0.5 -mx-1 -my-0.5"
                      onBlur={(e) => {
                        if (!e.target.value.trim()) {
                          onSeriesNameUpdate(seriesIndex, `Series ${seriesIndex + 1}`);
                        }
                      }}
                    />
                  ) : (
                    ser.name
                  )}
                </td>
                {seriesFields.map((field) => {
                  const seriesFieldKey = `${acquisitionId}-series-${seriesIndex}-${field.tag}`;
                  const isIncomplete = incompleteFields.has(seriesFieldKey);
                  
                  return (
                    <td key={field.tag} className={`px-3 py-2 whitespace-nowrap ${
                      isIncomplete ? 'ring-2 ring-red-500 ring-inset bg-red-50' : ''
                    }`}>
                      <div
                        className={`${isEditMode ? 'cursor-pointer hover:bg-blue-100 rounded px-1 -mx-1' : ''}`}
                        onClick={() => isEditMode && setEditingCell({ seriesIndex, fieldTag: field.tag })}
                      >
                      <div>
                        <p className="text-sm text-gray-900">
                          {ser.fields[field.tag] ? formatSeriesFieldValue(ser.fields[field.tag]) : '-'}
                        </p>
                        {isEditMode && ser.fields[field.tag] && (
                          <p className="text-xs text-gray-500 mt-0.5">
                            {(() => {
                              const fieldValue = ser.fields[field.tag];
                              if (typeof fieldValue === 'object' && fieldValue !== null && 'dataType' in fieldValue) {
                                // Use individual series value's dataType and constraint
                                return formatFieldTypeInfo(
                                  fieldValue.dataType || field.dataType || 'string',
                                  fieldValue.validationRule
                                );
                              } else {
                                // Fallback to field-level info for legacy values
                                return formatFieldTypeInfo(field.dataType || 'string');
                              }
                            })()}
                          </p>
                        )}
                      </div>
                    </div>
                  </td>
                  );
                })}
                {isEditMode && (
                  <td className="px-3 py-2 text-right">
                    <div className={`${
                      hoveredRow === seriesIndex ? 'opacity-100' : 'opacity-0'
                    } transition-opacity`}>
                      <button
                        onClick={() => onSeriesDelete(seriesIndex)}
                        className="p-1 text-gray-600 hover:text-red-600 transition-colors"
                        title="Delete series"
                        disabled={displaySeries.length <= 2}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      {/* Add Series Button */}
      {isEditMode && (
        <div className="bg-gray-50 px-3 py-2 border-t border-gray-200">
          <button
            onClick={onSeriesAdd}
            className="inline-flex items-center px-3 py-1.5 text-sm text-medical-600 hover:text-medical-700 hover:bg-medical-50 rounded transition-colors"
          >
            <Plus className="h-4 w-4 mr-1" />
            Add Series
          </button>
        </div>
      )}

      {/* Edit Modal for Series Values */}
      {editingCell && (
        <FieldEditModal
          field={seriesFields.find(f => f.tag === editingCell.fieldTag)!}
          value={displaySeries[editingCell.seriesIndex]?.fields[editingCell.fieldTag]}
          onSave={(updates) => {
            if ('value' in updates && updates.value !== undefined) {
              onSeriesUpdate(editingCell.seriesIndex, editingCell.fieldTag, updates.value);
            }
            setEditingCell(null);
          }}
          onClose={() => setEditingCell(null)}
          isSeriesValue={true}
        />
      )}

    </div>
  );
};

export default SeriesTable;