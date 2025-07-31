import React from 'react';
import { Trash2 } from 'lucide-react';
import { SchemaTemplate } from '../../types/schema';

interface SchemaSelectionCardProps {
  schemas: SchemaTemplate[];
  selectedSchemaId?: string | null;
  onSchemaSelect: (schemaId: string) => void;
  onSchemaDelete: (schemaId: string, event: React.MouseEvent) => void;
  title?: string;
  emptyMessage?: string;
}

const SchemaSelectionCard: React.FC<SchemaSelectionCardProps> = ({
  schemas,
  selectedSchemaId,
  onSchemaSelect,
  onSchemaDelete,
  title = "Select Validation Schema",
  emptyMessage = "No templates available. Upload a template to get started."
}) => {
  return (
    <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200 h-fit">
      <div className="mb-4">
        <h4 className="font-medium text-gray-900 text-base mb-2">
          {title}
        </h4>
      </div>

      <div className="space-y-2 max-h-96 overflow-y-auto">
        {schemas.map((template) => {
          const isSelected = selectedSchemaId === template.id;
          return (
            <div key={template.id} className="relative group">
              <button
                onClick={() => onSchemaSelect(template.id)}
                className={`w-full p-3 text-left border rounded-lg transition-all ${
                  isSelected
                    ? 'border-medical-300 bg-medical-50'
                    : 'border-gray-200 hover:border-medical-300 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h5 className="font-medium text-gray-900 text-sm mb-1">{template.name}</h5>
                    <p className="text-xs text-gray-600 mb-1 line-clamp-2">
                      {template.description || 'No description available'}
                    </p>
                    <div className="flex items-center space-x-2 text-xs text-gray-500">
                      <span className="px-1.5 py-0.5 bg-gray-100 text-gray-700 rounded-full">
                        {template.category}
                      </span>
                      <span className={`px-1.5 py-0.5 rounded-full ${
                        template.format === 'json' 
                          ? 'bg-blue-100 text-blue-700' 
                          : 'bg-green-100 text-green-700'
                      }`}>
                        {template.format.toUpperCase()}
                      </span>
                    </div>
                  </div>
                </div>
              </button>
              <button
                onClick={(e) => onSchemaDelete(template.id, e)}
                className="absolute top-2 right-2 p-1 text-gray-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-all bg-white rounded shadow-sm hover:shadow-md"
                title="Delete schema"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          );
        })}
      </div>

      {schemas.length === 0 && (
        <p className="text-sm text-gray-500 text-center py-4">
          {emptyMessage}
        </p>
      )}
    </div>
  );
};

export default SchemaSelectionCard;