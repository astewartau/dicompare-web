import React, { useState } from 'react';
import { Trash2, ArrowRightLeft } from 'lucide-react';
import { DicomField } from '../../types';
import { formatFieldValue, formatFieldTypeInfo } from '../../utils/fieldFormatters';
import FieldEditModal from './FieldEditModal';

interface FieldTableProps {
  fields: DicomField[];
  isEditMode: boolean;
  onFieldUpdate: (fieldTag: string, updates: Partial<DicomField>) => void;
  onFieldConvert: (fieldTag: string) => void;
  onFieldDelete: (fieldTag: string) => void;
}

const FieldTable: React.FC<FieldTableProps> = ({
  fields,
  isEditMode,
  onFieldUpdate,
  onFieldConvert,
  onFieldDelete,
}) => {
  const [editingField, setEditingField] = useState<DicomField | null>(null);
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);

  if (fields.length === 0) {
    return (
      <div className="border border-gray-200 rounded-md p-8 text-center">
        <p className="text-gray-500 text-sm">No acquisition-level fields defined</p>
      </div>
    );
  }

  return (
    <>
      <div className="border border-gray-200 rounded-md overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Field
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Value
              </th>
              {isEditMode && (
                <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {fields.map((field, index) => (
              <tr
                key={field.tag}
                className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} ${
                  isEditMode ? 'hover:bg-blue-50 transition-colors' : ''
                }`}
                onMouseEnter={() => setHoveredRow(field.tag)}
                onMouseLeave={() => setHoveredRow(null)}
              >
                <td className="px-3 py-2 whitespace-nowrap">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{field.name}</p>
                    <p className="text-xs text-gray-500">{field.tag}</p>
                  </div>
                </td>
                <td className="px-3 py-2">
                  <div
                    className={`${isEditMode ? 'cursor-pointer hover:bg-blue-100 rounded px-1 -mx-1' : ''}`}
                    onClick={() => isEditMode && setEditingField(field)}
                  >
                    <p className="text-sm text-gray-900">{formatFieldValue(field)}</p>
                    {isEditMode && field.dataType && (
                      <p className="text-xs text-gray-500 mt-0.5">
                        {formatFieldTypeInfo(field.dataType, field.validationRule)}
                      </p>
                    )}
                  </div>
                </td>
                {isEditMode && (
                  <td className="px-3 py-2 text-right">
                    <div className={`flex items-center justify-end space-x-1 ${
                      hoveredRow === field.tag ? 'opacity-100' : 'opacity-0'
                    } transition-opacity`}>
                      <button
                        onClick={() => onFieldConvert(field.tag)}
                        className="p-1 text-gray-600 hover:text-medical-600 transition-colors"
                        title="Convert to series field"
                      >
                        <ArrowRightLeft className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => onFieldDelete(field.tag)}
                        className="p-1 text-gray-600 hover:text-red-600 transition-colors"
                        title="Delete field"
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