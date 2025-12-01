import React, { useState } from 'react';
import { Plus, Trash2, Edit2, ArrowLeftRight } from 'lucide-react';
import { Series, SeriesField } from '../../types';
import { ComplianceFieldResult } from '../../types/schema';
import { inferDataTypeFromValue } from '../../utils/datatypeInference';
import { formatSeriesFieldValue, formatFieldTypeInfo } from '../../utils/fieldFormatters';
import CustomTooltip from '../common/CustomTooltip';
import StatusIcon from '../common/StatusIcon';
import FieldEditModal from './FieldEditModal';

interface SeriesTableProps {
  // seriesFields removed - now embedded in series[].fields[]
  series: Series[];
  isEditMode: boolean;
  incompleteFields?: Set<string>;
  acquisitionId?: string;
  mode?: 'edit' | 'view' | 'compliance';
  // Compliance-specific props
  complianceResults?: any[];
  onSeriesUpdate: (seriesIndex: number, fieldTag: string, updates: Partial<SeriesField>) => void;
  onSeriesAdd: () => void;
  onSeriesDelete: (seriesIndex: number) => void;
  onFieldConvert: (fieldTag: string) => void;
  onSeriesNameUpdate?: (seriesIndex: number, name: string) => void;
}

const SeriesTable: React.FC<SeriesTableProps> = ({
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
  const [editingCell, setEditingCell] = useState<{
    seriesIndex: number;
    fieldIndex: number;
    fieldTag?: string;
    fieldName?: string;
  } | null>(null);
  const [hoveredRow, setHoveredRow] = useState<number | null>(null);
  const [hoveredHeader, setHoveredHeader] = useState<string | null>(null);

  const isComplianceMode = mode === 'compliance';

  // Helper function to get compliance result for a specific field and series
  const getSeriesFieldComplianceResult = (field: SeriesField, seriesName: string): ComplianceFieldResult => {
    // For series validation, find any result that includes this field
    const result = complianceResults.find(r => {
      if (r.validationType !== 'series') return false;
      const fieldNameLower = r.fieldName.toLowerCase();
      const fieldLower = field.name.toLowerCase();
      return fieldNameLower === fieldLower || fieldNameLower.includes(fieldLower) ||
             (r.fieldPath && r.fieldPath.includes(field.tag));
    });

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


  // Helper function to get fields as array (handles both array and object formats)
  const getFieldsArray = (fields: any): SeriesField[] => {
    if (!fields) return [];
    if (Array.isArray(fields)) return fields;
    // Object format from .pro files: { "tag": { value, field, name, keyword, ... } }
    return Object.entries(fields).map(([tag, fieldData]: [string, any]) => ({
      tag,
      name: fieldData.name || fieldData.field || tag,
      keyword: fieldData.keyword,
      value: fieldData.value,
      validationRule: fieldData.validationRule
    }));
  };

  // Get all unique field tags from all series
  const allFieldTags = new Set<string>();
  series.forEach(s => {
    const fieldsArray = getFieldsArray(s.fields);
    fieldsArray.forEach(f => allFieldTags.add(f.tag));
  });

  if (allFieldTags.size === 0) {
    return (
      <div className="border border-gray-200 rounded-md p-4 text-center">
        <p className="text-gray-500 text-xs">No series-level fields defined</p>
        <p className="text-xs text-gray-400 mt-1">
          Convert acquisition-level fields to series-level to create varying values
        </p>
      </div>
    );
  }

  // Display all existing series (no minimum requirement)
  const displaySeries = [];
  for (let i = 0; i < series.length; i++) {
    if (series[i]) {
      displaySeries.push(series[i]);
    } else {
      displaySeries.push({ name: `Series ${String(i + 1).padStart(2, '0')}`, fields: [] });
    }
  }

  // Get all unique field definitions across series for table headers
  const allFields: SeriesField[] = [];
  const fieldMap = new Map<string, SeriesField>();

  series.forEach(s => {
    const fieldsArray = getFieldsArray(s.fields);
    fieldsArray.forEach(f => {
      if (!fieldMap.has(f.tag)) {
        fieldMap.set(f.tag, f);
        allFields.push(f);
      }
    });
  });

  return (
    <div className="border border-gray-200 rounded-md overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-2 py-1.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sticky left-0 bg-gray-50 z-10 min-w-[140px]">
                Series
              </th>
              {allFields.map((field) => (
                <th
                  key={field.tag}
                  className="px-2 py-1.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[120px]"
                  onMouseEnter={() => setHoveredHeader(field.tag)}
                  onMouseLeave={() => setHoveredHeader(null)}
                >
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{field.keyword || field.name}</p>
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
                          onSeriesNameUpdate(seriesIndex, `Series ${String(seriesIndex + 1).padStart(2, '0')}`);
                        }
                      }}
                    />
                  ) : (
                    <span className="text-xs">{ser.name}</span>
                  )}
                </td>
                {allFields.map((headerField) => {
                  // Find the specific field in this series
                  const fieldsArray = getFieldsArray(ser.fields);
                  const seriesFieldIndex = fieldsArray.findIndex(f => f.tag === headerField.tag);
                  const seriesField = seriesFieldIndex >= 0 ? fieldsArray[seriesFieldIndex] : null;

                  const seriesFieldKey = `${acquisitionId}-series-${seriesIndex}-${headerField.tag}`;
                  const isIncomplete = incompleteFields.has(seriesFieldKey);
                  const complianceResult = isComplianceMode && seriesField ? getSeriesFieldComplianceResult(seriesField, ser.name) : null;

                  return (
                    <td key={headerField.tag} className={`px-2 py-1.5 ${
                      isIncomplete ? 'ring-2 ring-red-500 ring-inset bg-red-50' : ''
                    }`}>
                      <div
                        className={`${isEditMode ? 'cursor-pointer hover:bg-blue-100 rounded px-1 -mx-1' : ''}`}
                        onClick={() => {
                          if (isEditMode) {
                            // If field doesn't exist in this series, we'll handle creating it
                            setEditingCell({
                              seriesIndex,
                              fieldIndex: seriesFieldIndex,
                              fieldTag: headerField.tag,
                              fieldName: headerField.name
                            });
                          }
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <p className="text-xs text-gray-900 break-words">
                              {seriesField ? formatSeriesFieldValue(seriesField.value, seriesField.validationRule) : '-'}
                            </p>
                            {isEditMode && seriesField && (
                              <p className="text-xs text-gray-500 mt-0.5">
                                {formatFieldTypeInfo(
                                  inferDataTypeFromValue(seriesField.value),
                                  seriesField.validationRule
                                )}
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
                      // Find series validation result by series name
                      const seriesResult = complianceResults.find(r =>
                        r.validationType === 'series' && r.seriesName === ser.name
                      );

                      if (!seriesResult || seriesResult.status === 'unknown') {
                        return (
                          <CustomTooltip
                            content="No validation result available"
                            position="top"
                            delay={100}
                          >
                            <div className="inline-flex items-center justify-center cursor-help">
                              <StatusIcon status="unknown" />
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
                            <StatusIcon status={seriesResult.status} />
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
                        disabled={false}
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
      {editingCell && displaySeries[editingCell.seriesIndex] && (
        <FieldEditModal
          field={(() => {
            // If field exists in series, use it
            if (editingCell.fieldIndex >= 0) {
              const fieldsArray = getFieldsArray(displaySeries[editingCell.seriesIndex].fields);
              const existingField = fieldsArray[editingCell.fieldIndex];
              return {
                tag: existingField.tag,
                name: existingField.name,
                value: existingField.value,
                vr: 'UN',
                level: 'series' as const,
                validationRule: existingField.validationRule
              };
            }
            // Otherwise create a new field with defaults
            return {
              tag: editingCell.fieldTag || '',
              name: editingCell.fieldName || editingCell.fieldTag || '',
              value: '',
              vr: 'UN',
              level: 'series' as const,
              validationRule: { type: 'exact' as const }
            };
          })()}
          value={editingCell.fieldIndex >= 0
            ? getFieldsArray(displaySeries[editingCell.seriesIndex].fields)[editingCell.fieldIndex].value
            : ''}
          onSave={(updates) => {
            const fieldTag = editingCell.fieldIndex >= 0
              ? getFieldsArray(displaySeries[editingCell.seriesIndex].fields)[editingCell.fieldIndex].tag
              : editingCell.fieldTag || '';

            const fieldUpdate: Partial<SeriesField> = {
              name: editingCell.fieldName || editingCell.fieldTag || '',
              tag: fieldTag
            };

            if ('value' in updates && updates.value !== undefined) {
              fieldUpdate.value = updates.value;
            }
            if ('validationRule' in updates && updates.validationRule !== undefined) {
              fieldUpdate.validationRule = updates.validationRule;
            }

            onSeriesUpdate(editingCell.seriesIndex, fieldTag, fieldUpdate);
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
