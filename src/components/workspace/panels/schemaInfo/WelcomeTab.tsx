import React from 'react';
import { Upload, FileText, ArrowRight } from 'lucide-react';
import { useWorkspace } from '../../../../contexts/WorkspaceContext';
import { ADD_NEW_ID, ADD_FROM_DATA_ID } from '../../WorkspaceSidebar';

/**
 * Welcome tab content for SchemaInfoPanel.
 * Shows quick start options and how-it-works guide.
 */
const WelcomeTab: React.FC = () => {
  const workspace = useWorkspace();

  return (
    <div className="flex-1 overflow-y-auto p-6">
      {/* Quick Start */}
      <div className="mb-8">
        <h3 className="text-sm font-medium text-content-tertiary uppercase tracking-wider mb-4">Get Started</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* From Data */}
          <button
            onClick={() => workspace.selectItem(ADD_FROM_DATA_ID)}
            className="flex items-start gap-4 p-5 rounded-xl border-2 border-border hover:border-brand-400 hover:bg-brand-50 dark:hover:bg-brand-900/10 transition-all text-left group"
          >
            <div className="p-3 bg-amber-100 dark:bg-amber-900/30 rounded-lg group-hover:scale-105 transition-transform">
              <Upload className="h-6 w-6 text-amber-600" />
            </div>
            <div className="flex-1">
              <h4 className="font-semibold text-content-primary mb-1 flex items-center">
                From Data
                <ArrowRight className="h-4 w-4 ml-2 opacity-0 group-hover:opacity-100 transition-opacity" />
              </h4>
              <p className="text-sm text-content-secondary">
                Load DICOM files or protocol files to automatically extract and compare acquisitions
              </p>
            </div>
          </button>

          {/* From Schema */}
          <button
            onClick={() => workspace.selectItem(ADD_NEW_ID)}
            className="flex items-start gap-4 p-5 rounded-xl border-2 border-border hover:border-brand-400 hover:bg-brand-50 dark:hover:bg-brand-900/10 transition-all text-left group"
          >
            <div className="p-3 bg-brand-100 dark:bg-brand-900/30 rounded-lg group-hover:scale-105 transition-transform">
              <FileText className="h-6 w-6 text-brand-600" />
            </div>
            <div className="flex-1">
              <h4 className="font-semibold text-content-primary mb-1 flex items-center">
                From Schema
                <ArrowRight className="h-4 w-4 ml-2 opacity-0 group-hover:opacity-100 transition-opacity" />
              </h4>
              <p className="text-sm text-content-secondary">
                Browse the schema library and add existing acquisitions to your workspace
              </p>
            </div>
          </button>
        </div>
      </div>

      {/* How it works */}
      <div>
        <h3 className="text-sm font-medium text-content-tertiary uppercase tracking-wider mb-4">How It Works</h3>
        <div className="space-y-4">
          <Step number={1} title="Add acquisitions">
            Load data to extract parameters, or select from existing schemas in the library
          </Step>
          <Step number={2} title="Edit and refine">
            Customize field requirements, add validation rules, and document your schema
          </Step>
          <Step number={3} title="Validate data">
            Attach test data to verify compliance before exporting your schema
          </Step>
          <Step number={4} title="Save and share">
            Download as JSON or save to your library for reuse
          </Step>
        </div>
      </div>
    </div>
  );
};

// Helper component for step items
const Step: React.FC<{ number: number; title: string; children: React.ReactNode }> = ({ number, title, children }) => (
  <div className="flex items-start gap-3">
    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center text-brand-600 text-sm font-medium">
      {number}
    </div>
    <div>
      <p className="text-content-primary font-medium">{title}</p>
      <p className="text-sm text-content-secondary">{children}</p>
    </div>
  </div>
);

export default WelcomeTab;
