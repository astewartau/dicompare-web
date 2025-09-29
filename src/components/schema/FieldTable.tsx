import React, { useState, useEffect } from 'react';
import { Trash2, ArrowRightLeft, CheckCircle, XCircle, AlertTriangle, HelpCircle, Loader } from 'lucide-react';
import { DicomField, Acquisition } from '../../types';
import { inferDataTypeFromValue } from '../../utils/datatypeInference';
import { formatFieldValue, formatFieldTypeInfo } from '../../utils/fieldFormatters';
import { ComplianceFieldResult } from '../../types/schema';
import CustomTooltip from '../common/CustomTooltip';
import FieldEditModal from './FieldEditModal';

interface FieldTableProps {
  fields: DicomField[];
  isEditMode: boolean;
  incompleteFields?: Set<string>;
  acquisitionId?: string;
  mode?: 'edit' | 'view' | 'compliance';
  // Compliance-specific props
  schemaId?: string;
  schemaAcquisitionId?: string;
  acquisition?: Acquisition;
  realAcquisition?: Acquisition; // The actual DICOM data for compliance validation
  getSchemaContent?: (id: string) => Promise<string | null>;
  isDataProcessing?: boolean; // Prevent validation during DICOM upload
  // Pass validation results from parent instead of computing them here
  complianceResultsProp?: ComplianceFieldResult[];
  // Edit mode props
  onFieldUpdate: (fieldTag: string, updates: Partial<DicomField>) => void;
  onFieldConvert: (fieldTag: string) => void;
  onFieldDelete: (fieldTag: string) => void;
}

const FieldTable: React.FC<FieldTableProps> = ({
  fields,
  isEditMode,
  incompleteFields = new Set(),
  acquisitionId = '',
  mode = 'edit',
  schemaId,
  schemaAcquisitionId,
  acquisition,
  realAcquisition,
  getSchemaContent,
  isDataProcessing = false,
  complianceResultsProp,
  onFieldUpdate,
  onFieldConvert,
  onFieldDelete,
}) => {
  const [editingField, setEditingField] = useState<DicomField | null>(null);
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const isComplianceMode = mode === 'compliance';

  // Use compliance results from props instead of computing them
  const complianceResults = complianceResultsProp || [];
  const isValidating = false; // Validation now happens at parent level
  const validationError = null;

  // Debug logging for validation results
  console.log(`FieldTable: received ${complianceResults.length} compliance results for ${fields.length} fields`);

  const getFieldComplianceResult = (field: DicomField): ComplianceFieldResult => {
    const result = complianceResults.find(r => {
      // Try exact tag match first (most reliable)
      if (r.fieldPath === field.tag) return true;

      // Try exact keyword match
      if (field.keyword && r.fieldName === field.keyword) return true;

      // Try exact name match
      if (r.fieldName === field.name) return true;

      // Try tag inclusion as fallback
      if (field.tag && r.fieldPath?.includes(field.tag)) return true;

      return false;
    });

    return result || {
      fieldPath: field.tag,
      fieldName: field.keyword || field.name,
      status: 'unknown',
      message: 'No validation result available',
      actualValue: '',
      expectedValue: '',
      validationType: 'field',
      seriesName: undefined,
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

  if (fields.length === 0) {
    if (isComplianceMode && isValidating) {
      return (
        <div className="border border-gray-200 rounded-md p-4 text-center">
          <Loader className="h-4 w-4 animate-spin mx-auto mb-2" />
          <p className="text-gray-500 text-xs">Validating compliance...</p>
        </div>
      );
    }
    return null;
  }

  if (isComplianceMode && validationError) {
    return (
      <div className="border border-red-200 rounded-md p-4 text-center">
        <p className="text-red-600 text-xs">{validationError}</p>
      </div>
    );
  }

  return (
    <>
      <div className="border border-gray-200 rounded-md overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-2 py-1.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Field
              </th>
              <th className="px-2 py-1.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                {isComplianceMode ? 'Expected Value' : 'Value'}
              </th>
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
            {fields.map((field, index) => {
              const fieldKey = `${acquisitionId}-${field.tag}`;
              const isIncomplete = incompleteFields.has(fieldKey);
              const complianceResult = isComplianceMode ? getFieldComplianceResult(field) : null;

              return (
                <tr
                  key={field.tag}
                  className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} ${
                    isEditMode ? 'hover:bg-blue-50 transition-colors' : ''
                  } ${isIncomplete ? 'ring-2 ring-red-500 ring-inset bg-red-50' : ''}`}
                  onMouseEnter={() => setHoveredRow(field.tag)}
                  onMouseLeave={() => setHoveredRow(null)}
                >
                <td className="px-2 py-1.5">
                  <div>
                    <p className="text-xs font-medium text-gray-900">{field.keyword || field.name}</p>
                    <p className="text-xs text-gray-500 font-mono">{field.tag}</p>
                  </div>
                </td>
                <td className="px-2 py-1.5">
                  <div
                    className={`${isEditMode ? 'cursor-pointer hover:bg-blue-100 rounded px-1 -mx-1' : ''}`}
                    onClick={() => isEditMode && setEditingField(field)}
                  >
                    <p className="text-xs text-gray-900 break-words">{formatFieldValue(field)}</p>
                    {(isEditMode || isComplianceMode) && (
                      <p className="text-xs text-gray-500 mt-0.5">
                        {(() => {
                          const explicitDataType = field.dataType;
                          const inferredDataType = inferDataTypeFromValue(field.value);
                          const finalDataType = explicitDataType || inferredDataType;
                          console.log('🎨 Field type display for', field.tag, ':', {
                            explicitDataType,
                            inferredDataType,
                            finalDataType,
                            value: field.value
                          });
                          return formatFieldTypeInfo(finalDataType, field.validationRule);
                        })()}
                      </p>
                    )}
                    {!isEditMode && !isComplianceMode && (
                      <p className="text-xs mt-0.5 invisible">&nbsp;</p>
                    )}
                  </div>
                </td>
                {isComplianceMode && complianceResult && (
                  <td className="px-2 py-1.5 text-center">
                    <CustomTooltip
                      content={complianceResult.message}
                      position="top"
                      delay={100}
                    >
                      <div className="inline-flex items-center justify-center cursor-help">
                        {getStatusIcon(complianceResult.status)}
                      </div>
                    </CustomTooltip>
                  </td>
                )}
                {isEditMode && (
                  <td className="px-2 py-1.5 text-right">
                    <div className={`flex items-center justify-end space-x-1 ${
                      hoveredRow === field.tag ? 'opacity-100' : 'opacity-0'
                    } transition-opacity`}>
                      <button
                        onClick={() => onFieldConvert(field.tag)}
                        className="p-0.5 text-gray-600 hover:text-medical-600 transition-colors"
                        title="Convert to series field"
                      >
                        <ArrowRightLeft className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => onFieldDelete(field.tag)}
                        className="p-0.5 text-gray-600 hover:text-red-600 transition-colors"
                        title="Delete field"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </td>
                )}
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Edit Modal */}
      {editingField && (
        <FieldEditModal
          field={editingField}
          onSave={(updates) => {
            onFieldUpdate(editingField.tag, updates);
            setEditingField(null);
          }}
          onClose={() => setEditingField(null)}
        />
      )}

    </>
  );
};

export default FieldTable;