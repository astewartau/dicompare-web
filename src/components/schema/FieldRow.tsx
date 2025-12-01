import React from 'react';
import { Trash2, ArrowRightLeft } from 'lucide-react';
import { DicomField } from '../../types';
import { inferDataTypeFromValue } from '../../utils/datatypeInference';
import { formatConstraintValue, formatFieldTypeInfo } from '../../utils/fieldFormatters';

interface FieldRowProps {
  field: DicomField;
  index: number;
  isEditMode: boolean;
  isHovered: boolean;
  onEdit: (field: DicomField) => void;
  onConvert: (fieldTag: string) => void;
  onDelete: (fieldTag: string) => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

const FieldRow: React.FC<FieldRowProps> = ({ 
  field, 
  index, 
  isEditMode, 
  isHovered,
  onEdit,
  onConvert, 
  onDelete,
  onMouseEnter,
  onMouseLeave
}) => {

  return (
    <tr
      className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} ${
        isEditMode ? 'hover:bg-blue-50 transition-colors' : ''
      }`}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <td className="px-3 py-2 whitespace-nowrap">
        <div>
          <p className="text-sm font-medium text-gray-900">{field.keyword || field.name}</p>
          <p className="text-xs text-gray-500">{field.tag}</p>
        </div>
      </td>
      <td className="px-3 py-2">
        <div
          className={`${isEditMode ? 'cursor-pointer hover:bg-blue-100 rounded px-1 -mx-1' : ''}`}
          onClick={() => isEditMode && onEdit(field)}
        >
          <p className="text-sm text-gray-900">{formatConstraintValue(field.value, field.validationRule)}</p>
          {isEditMode && (
            <p className="text-xs text-gray-500 mt-0.5">
              {formatFieldTypeInfo(
                field.dataType || inferDataTypeFromValue(field.value),
                field.validationRule
              )}
            </p>
          )}
        </div>
      </td>
      {isEditMode && (
        <td className="px-3 py-2 text-right">
          <div className={`flex items-center justify-end space-x-1 ${
            isHovered ? 'opacity-100' : 'opacity-0'
          } transition-opacity`}>
            <button
              onClick={() => onConvert(field.tag)}
              className="p-1 text-gray-600 hover:text-medical-600 transition-colors"
              title="Convert to series field"
            >
              <ArrowRightLeft className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => onDelete(field.tag)}
              className="p-1 text-gray-600 hover:text-red-600 transition-colors"
              title="Delete field"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </td>
      )}
    </tr>
  );
};

export default FieldRow;
