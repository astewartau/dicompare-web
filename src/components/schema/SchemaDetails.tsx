import React from 'react';
import { X, ChevronDown, ChevronUp } from 'lucide-react';
import { UnifiedSchema } from '../../hooks/useSchemaService';
import { Acquisition } from '../../types';
import ComplianceFieldTable from '../compliance/ComplianceFieldTable';

interface SchemaDetailsProps {
  schema: UnifiedSchema;
  acquisitionId?: string;
  acquisition?: Acquisition;
  fields?: any[];
  isCollapsed?: boolean;
  getSchemaContent: (schemaId: string) => Promise<string | null>;
  onToggleCollapse?: () => void;
  onDeselect?: () => void;
  title?: string;
}

const SchemaDetails: React.FC<SchemaDetailsProps> = ({
  schema,
  acquisitionId,
  acquisition = {} as Acquisition,
  fields = [],
  isCollapsed = false,
  getSchemaContent,
  onToggleCollapse,
  onDeselect,
  title
}) => {
  return (
    <div className="border border-gray-300 rounded-lg bg-white shadow-sm h-fit">
      {/* Header */}
      <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 rounded-t-lg">
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-gray-900 truncate">
              {title || schema.name}
            </h3>
            <p className="text-xs text-gray-600 truncate">Schema Requirements</p>
          </div>
          <div className="flex items-center space-x-1 ml-2 flex-shrink-0">
            {onDeselect && (
              <button
                onClick={onDeselect}
                className="p-1 text-gray-600 hover:text-red-600 transition-colors"
                title="Deselect schema"
              >
                <X className="h-3 w-3" />
              </button>
            )}
            {onToggleCollapse && (
              <button
                onClick={onToggleCollapse}
                className="p-1 text-gray-600 hover:text-gray-800 transition-colors"
                title={isCollapsed ? 'Expand' : 'Collapse'}
              >
                {isCollapsed ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
              </button>
            )}
          </div>
        </div>
        <div className="mt-1 text-xs text-gray-500">
          v{schema.version || '1.0.0'} • {schema.authors?.join(', ') || 'Example Schema'}
          {acquisitionId && (
            <span className="ml-2 px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">
              Acquisition {acquisitionId}
            </span>
          )}
        </div>
      </div>

      {/* Content - Compliance Field Table */}
      {!isCollapsed && (
        <div className="p-3 space-y-3">
          <ComplianceFieldTable
            fields={fields}
            acquisition={acquisition}
            schemaFields={[]} // Not used anymore, Python API handles schema internally
            schemaId={schema.id}
            acquisitionId={acquisitionId}
            getSchemaContent={getSchemaContent}
          />
        </div>
      )}
    </div>
  );
};

export default SchemaDetails;