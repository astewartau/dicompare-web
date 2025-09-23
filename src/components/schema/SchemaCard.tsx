import React, { useState } from 'react';
import { ChevronDown, ChevronUp, X, Trash2, FileText } from 'lucide-react';
import { UnifiedSchema, SchemaAcquisition } from '../../hooks/useSchemaService';

interface SchemaCardProps {
  schema: UnifiedSchema;
  isSelected?: boolean;
  isCollapsed?: boolean;
  showDeleteButton?: boolean;
  title?: string;
  onSelect?: (schemaId: string, acquisitionId?: string) => void;
  onToggleCollapse?: () => void;
  onDelete?: (schemaId: string, event: React.MouseEvent) => void;
  onDeselect?: () => void;
}

const SchemaCard: React.FC<SchemaCardProps> = ({
  schema,
  isSelected = false,
  isCollapsed = false,
  showDeleteButton = false,
  title,
  onSelect,
  onToggleCollapse,
  onDelete,
  onDeselect
}) => {
  const handleMainClick = () => {
    if (schema.isMultiAcquisition) {
      onToggleCollapse?.();
    } else {
      onSelect?.(schema.id, schema.acquisitions[0]?.id);
    }
  };

  const handleAcquisitionSelect = (acquisition: SchemaAcquisition) => {
    onSelect?.(schema.id, acquisition.id);
  };

  return (
    <div className="border border-gray-200 rounded-lg bg-white shadow-sm">
      {/* Main clickable area */}
      <div
        className="cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={handleMainClick}
      >
        {/* Header */}
        <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 rounded-t-lg">
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center">
                <FileText className="h-4 w-4 text-gray-500 mr-2" />
                <h3 className="text-sm font-semibold text-gray-900 truncate">
                  {title || schema.name}
                </h3>
                {schema.isMultiAcquisition && (
                  <span className="ml-2 px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded-full">
                    {schema.acquisitions.length} acquisitions
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-600 truncate ml-6">
                {schema.description || 'No description available'}
              </p>
            </div>
            <div className="flex items-center space-x-1 ml-2 flex-shrink-0">
              {onDeselect && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeselect();
                  }}
                  className="p-1 text-gray-600 hover:text-red-600 transition-colors"
                  title="Deselect schema"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
              {showDeleteButton && onDelete && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(schema.id, e);
                  }}
                  className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                  title="Delete schema"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
              {schema.isMultiAcquisition && (
                <div className="p-1 text-gray-600">
                  {isCollapsed ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
                </div>
              )}
            </div>
          </div>
          <div className="mt-1 text-xs text-gray-500 ml-6">
            v{schema.version || '1.0.0'} • {schema.authors?.join(', ') || 'Example Schema'}
          </div>
        </div>
      </div>

      {/* Expanded content for multi-acquisition schemas */}
      {!isCollapsed && schema.isMultiAcquisition && (
        <div className="border-t border-gray-200 bg-gray-50">
          {schema.acquisitions.map((acquisition) => (
            <button
              key={acquisition.id}
              onClick={() => handleAcquisitionSelect(acquisition)}
              className="w-full p-3 text-left hover:bg-gray-100 transition-colors border-b border-gray-200 last:border-b-0"
            >
              <div className="ml-6">
                <div className="font-medium text-gray-800 text-sm">{acquisition.protocolName}</div>
                <div className="text-xs text-gray-600">{acquisition.seriesDescription}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default SchemaCard;