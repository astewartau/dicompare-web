import React, { useState } from 'react';
import { Plus, Trash2, Edit2, ArrowLeftRight, CheckCircle, XCircle, AlertTriangle, HelpCircle } from 'lucide-react';
import { DicomField, Series } from '../../types';
import { ComplianceFieldResult } from '../../types/schema';
import { formatSeriesFieldValue, formatFieldTypeInfo } from '../../utils/fieldFormatters';
import CustomTooltip from '../common/CustomTooltip';
import FieldEditModal from './FieldEditModal';

interface SeriesTableProps {
  seriesFields: DicomField[];
  series: Series[];
  isEditMode: boolean;
  incompleteFields?: Set<string>;
  acquisitionId?: string;
  mode?: 'edit' | 'view' | 'compliance';
  // Compliance-specific props
  complianceResults?: any[];
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
  mode = 'edit',
  complianceResults = [],
  onSeriesUpdate,
  onSeriesAdd,
  onSeriesDelete,
  onFieldConvert,
  onSeriesNameUpdate,
}) => {
  const [editingCell, setEditingCell] = useState<{ seriesIndex: number; fieldTag: string } | null>(null);
  const [hoveredRow, setHoveredRow] = useState<number | null>(null);
  const [hoveredHeader, setHoveredHeader] = useState<string | null>(null);

  const isComplianceMode = mode === 'compliance';

  // Helper function to get compliance result for a specific field and series
  const getSeriesFieldComplianceResult = (field: DicomField, seriesName: string): ComplianceFieldResult => {
    // For series validation, find any result that includes this field
    // Note: Series validation results may use generic series names (Series_001, Series_002)
    // while the UI uses actual SeriesDescription values
    const result = complianceResults.find(r => {
      // Check if this is a series-level validation result
      if (r.validationType !== 'series') return false;

      // Check if this field is part of the validation result
      // The fieldName might be a combined field like "SeriesDescription, ImageType"
      const fieldNameLower = r.fieldName.toLowerCase();
      const fieldLower = field.name.toLowerCase();

      // 1. Exact field name match
      if (fieldNameLower === fieldLower) return true;

      // 2. Field name is part of a combined field name (e.g., "SeriesDescription" in "SeriesDescription, ImageType")
      if (fieldNameLower.includes(fieldLower)) return true;

      // 3. Field path contains the field tag
      if (r.fieldPath && r.fieldPath.includes(field.tag)) return true;

      return false;
    });

    if (result) {
      console.log(`✅ Found series validation result for field ${field.name}:`, result);
    } else {
      console.log(`❌ No series validation result found for field ${field.name} in ${complianceResults.length} results:`, complianceResults);
    }

    return result || {
      fieldPath: field.tag,
      fieldName: field.name,
      status: 'unknown',
      message: 'No validation result available',
      actualValue: '',
      expectedValue: '',
      validationType: 'series',
      seriesName: seriesName,
      rule_name: undefined
    };
  };

  const getStatusIcon = (status: ComplianceFieldResult['status']) => {
    const iconProps = { className: "h-4 w-4" };

    switch (status) {
      case 'pass':
        return <CheckCircle {...iconProps} className="h-4 w-4 text-green-600" />;
      case 'fail':
        return <XCircle {...iconProps} className="h-4 w-4 text-red-600" />;
      case 'warning':
        return <AlertTriangle {...iconProps} className="h-4 w-4 text-yellow-600" />;
      case 'na':
        return <HelpCircle {...iconProps} className="h-4 w-4 text-gray-500" />;
      case 'unknown':
        return <HelpCircle {...iconProps} className="h-4 w-4 text-gray-400" />;
    }
  };

  if (seriesFields.length === 0) {
    return (
      <div className="border border-gray-200 rounded-md p-4 text-center">
        <p className="text-gray-500 text-xs">No series-level fields defined</p>
        <p className="text-xs text-gray-400 mt-1">
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
              <th className="px-2 py-1.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sticky left-0 bg-gray-50 z-10 min-w-[140px]">
                Series
              </th>
              {seriesFields.map((field) => (
                <th
                  key={field.tag}
                  className="px-2 py-1.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[120px]"
                  onMouseEnter={() => setHoveredHeader(field.tag)}
                  onMouseLeave={() => setHoveredHeader(null)}
                >
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{field.name}</p>
                      <p className="text-xs font-normal text-gray-400 font-mono">{field.tag}</p>
                    </div>
                    {isEditMode && (
                      <div className={`flex items-center ml-1 ${
                        hoveredHeader === field.tag ? 'opacity-100' : 'opacity-0'
                      } transition-opacity`}>
                        <button
                          onClick={() => onFieldConvert(field.tag)}
                          className="p-0.5 text-gray-400 hover:text-medical-600 transition-colors"
                          title="Convert to acquisition field"
                        >
                          <ArrowLeftRight className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                  </div>
                </th>
              ))}
              {isComplianceMode && (
                <th className="px-2 py-1.5 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-16">
                  Status
                </th>
              )}
              {isEditMode && (
                <th className="px-2 py-1.5 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-16">
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
                <td className="px-2 py-1.5 whitespace-nowrap font-medium text-gray-900 sticky left-0 bg-inherit min-w-[140px]">
                  {isEditMode && onSeriesNameUpdate ? (
                    <input
                      type="text"
                      value={ser.name}
                      onChange={(e) => onSeriesNameUpdate(seriesIndex, e.target.value)}
                      className="bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-medical-500 rounded px-1 py-0.5 -mx-1 -my-0.5 text-xs w-full"
                      onBlur={(e) => {
                        if (!e.target.value.trim()) {
                          onSeriesNameUpdate(seriesIndex, `Series ${seriesIndex + 1}`);
                        }
                      }}
                    />
                  ) : (
                    <span className="text-xs">{ser.name}</span>
                  )}
                </td>
                {seriesFields.map((field) => {
                  const seriesFieldKey = `${acquisitionId}-series-${seriesIndex}-${field.tag}`;
                  const isIncomplete = incompleteFields.has(seriesFieldKey);
                  const complianceResult = isComplianceMode ? getSeriesFieldComplianceResult(field, ser.name) : null;

                  return (
                    <td key={field.tag} className={`px-2 py-1.5 ${
                      isIncomplete ? 'ring-2 ring-red-500 ring-inset bg-red-50' : ''
                    }`}>
                      <div
                        className={`${isEditMode ? 'cursor-pointer hover:bg-blue-100 rounded px-1 -mx-1' : ''}`}
                        onClick={() => isEditMode && setEditingCell({ seriesIndex, fieldTag: field.tag })}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <p className="text-xs text-gray-900 break-words">
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
                          {!isEditMode && !isComplianceMode && (
                            <p className="text-xs mt-0.5 invisible">&nbsp;</p>
                          )}
                          </div>
                        </div>
                      </div>
                    </td>
                  );
                })}
                {isComplianceMode && (
                  <td className="px-2 py-1.5 text-center">
                    {(() => {
                      // Get the first validation result for this series (all fields share the same series validation result)
                      const seriesResult = seriesFields.length > 0 ? getSeriesFieldComplianceResult(seriesFields[0], ser.name) : null;

                      if (!seriesResult || seriesResult.status === 'unknown') {
                        return (
                          <CustomTooltip
                            content="No validation result available"
                            position="top"
                            delay={100}
                          >
                            <div className="inline-flex items-center justify-center cursor-help">
                              {getStatusIcon('unknown')}
                            </div>
                          </CustomTooltip>
                        );
                      }

                      return (
                        <CustomTooltip
                          content={seriesResult.message}
                          position="top"
                          delay={100}
                        >
                          <div className="inline-flex items-center justify-center cursor-help">
                            {getStatusIcon(seriesResult.status)}
                          </div>
                        </CustomTooltip>
                      );
                    })()}
                  </td>
                )}
                {isEditMode && (
                  <td className="px-2 py-1.5 text-right">
                    <div className={`${
                      hoveredRow === seriesIndex ? 'opacity-100' : 'opacity-0'
                    } transition-opacity`}>
                      <button
                        onClick={() => onSeriesDelete(seriesIndex)}
                        className="p-0.5 text-gray-600 hover:text-red-600 transition-colors"
                        title="Delete series"
                        disabled={displaySeries.length <= 2}
                      >
                        <Trash2 className="h-3 w-3" />
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
        <div className="bg-gray-50 px-2 py-1.5 border-t border-gray-200">
          <button
            onClick={onSeriesAdd}
            className="inline-flex items-center px-2 py-1 text-xs text-medical-600 hover:text-medical-700 hover:bg-medical-50 rounded transition-colors"
          >
            <Plus className="h-3 w-3 mr-1" />
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