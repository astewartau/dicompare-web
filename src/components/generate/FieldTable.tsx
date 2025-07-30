import React, { useState } from 'react';
import { Trash2, ArrowRightLeft } from 'lucide-react';
import { DicomField } from '../../types';
import { formatFieldValue, formatFieldTypeInfo } from '../../utils/fieldFormatters';
import FieldEditModal from './FieldEditModal';

interface FieldTableProps {
  fields: DicomField[];
  isEditMode: boolean;
  incompleteFields?: Set<string>;
  acquisitionId?: string;
  onFieldUpdate: (fieldTag: string, updates: Partial<DicomField>) => void;
  onFieldConvert: (fieldTag: string) => void;
  onFieldDelete: (fieldTag: string) => void;
}

const FieldTable: React.FC<FieldTableProps> = ({
  fields,
  isEditMode,
  incompleteFields = new Set(),
  acquisitionId = '',
  onFieldUpdate,
  onFieldConvert,
  onFieldDelete,
}) => {
  const [editingField, setEditingField] = useState<DicomField | null>(null);
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);

  if (fields.length === 0) {
    return (
      <div className="border border-gray-200 rounded-md p-4 text-center">
        <p className="text-gray-500 text-xs">No acquisition-level fields defined</p>
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
                Value
              </th>
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
              
              return (
                <tr
                  key={field.tag}
                  className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} ${
                    isEditMode ? 'hover:bg-blue-50 transition-colors' : ''
                  } ${isIncomplete ? 'ring-2 ring-red-500 ring-inset bg-red-50' : ''}`}
                  onMouseEnter={() => setHoveredRow(field.tag)}
                  onMouseLeave={() => setHoveredRow(null)}
                >
                <td className="px-2 py-1.5 whitespace-nowrap">
                  <div className="max-w-32">
                    <p className="text-xs font-medium text-gray-900 truncate">{field.name}</p>
                    <p className="text-xs text-gray-500 font-mono">{field.tag}</p>
                  </div>
                </td>
                <td className="px-2 py-1.5">
                  <div
                    className={`${isEditMode ? 'cursor-pointer hover:bg-blue-100 rounded px-1 -mx-1' : ''}`}
                    onClick={() => isEditMode && setEditingField(field)}
                  >
                    <p className="text-xs text-gray-900 break-words">{formatFieldValue(field)}</p>
                    {isEditMode && field.dataType && (
                      <p className="text-xs text-gray-500 mt-0.5">
                        {formatFieldTypeInfo(field.dataType, field.validationRule)}
                      </p>
                    )}
                  </div>
                </td>
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