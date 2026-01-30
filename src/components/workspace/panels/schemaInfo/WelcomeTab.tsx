import React, { useState } from 'react';
import { Upload, FileText, ArrowRight, ChevronDown, CheckCircle, PlusCircle, FileSearch, Download, Play } from 'lucide-react';
import { useWorkspace } from '../../../../contexts/WorkspaceContext';
import { useTutorial, TutorialId } from '../../../../contexts/TutorialContext';
import { ADD_NEW_ID, ADD_FROM_DATA_ID } from '../../WorkspaceSidebar';

/**
 * Welcome tab content for SchemaInfoPanel.
 * Shows quick start options and expandable use case guides.
 */
const WelcomeTab: React.FC = () => {
  const workspace = useWorkspace();
  const { startTutorial } = useTutorial();

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

      {/* Use Cases */}
      <div>
        <h3 className="text-sm font-medium text-content-tertiary uppercase tracking-wider mb-4">Use Cases</h3>
        <div className="space-y-3">
          <UseCaseCard
            icon={<FileSearch className="h-5 w-5" />}
            iconColor="text-amber-600"
            iconBg="bg-amber-100 dark:bg-amber-900/30"
            title="Compare two acquisitions"
            description="Quick diff between two datasets"
            tutorialId="compare"
            onStartTutorial={startTutorial}
            steps={[
              'Go to "From data"',
              'Upload your first acquisition to the Reference (left) area',
              'Upload your second acquisition to the Test data (right) area',
              'View the comparison results'
            ]}
          />

          <UseCaseCard
            icon={<CheckCircle className="h-5 w-5" />}
            iconColor="text-green-600"
            iconBg="bg-green-100 dark:bg-green-900/30"
            title="Validate against a public schema"
            description="Check compliance with UK Biobank, ABCD, etc."
            tutorialId="validate"
            onStartTutorial={startTutorial}
            steps={[
              'Go to "From data" and upload your DICOMs to Test data (right)',
              'Click "Library" on each acquisition to search and attach a reference',
              'Alternatively: go to "From schema", drag references into the acquisitions list, then click "Assign data to references" to auto-match',
              'Review and print compliance reports'
            ]}
          />

          <UseCaseCard
            icon={<PlusCircle className="h-5 w-5" />}
            iconColor="text-brand-600"
            iconBg="bg-brand-100 dark:bg-brand-900/30"
            title="Create a new schema"
            description="Build from data, from scratch, or both"
            tutorialId="create"
            onStartTutorial={startTutorial}
            steps={[
              'Go to "From data" and upload files to Reference (left) to auto-extract fields',
              'Edit fields, add tolerances, and configure validation rules',
              'To add a blank reference: click "+ Blank" instead of uploading files',
              'Click the Save icon to add metadata, then save to your library or download as JSON'
            ]}
          />

          <UseCaseCard
            icon={<Download className="h-5 w-5" />}
            iconColor="text-cyan-600"
            iconBg="bg-cyan-100 dark:bg-cyan-900/30"
            title="Import a shared schema"
            description="Load a schema JSON file from a collaborator"
            tutorialId="import"
            onStartTutorial={startTutorial}
            steps={[
              'Go to "From schema"',
              'Click "Upload schema" or drag the JSON file into the schema browser',
              'The schema appears in your Uploaded Schemas section',
              'Drag acquisitions to your workspace or attach to test data'
            ]}
          />
        </div>
      </div>
    </div>
  );
};

// Expandable use case card component
interface UseCaseCardProps {
  icon: React.ReactNode;
  iconColor: string;
  iconBg: string;
  title: string;
  description: string;
  tutorialId: TutorialId;
  onStartTutorial: (id: TutorialId) => void;
  steps: string[];
}

const UseCaseCard: React.FC<UseCaseCardProps> = ({ icon, iconColor, iconBg, title, description, tutorialId, onStartTutorial, steps }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleStartTutorial = (e: React.MouseEvent) => {
    e.stopPropagation();
    onStartTutorial(tutorialId);
  };

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="flex items-center hover:bg-surface-secondary transition-colors group">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex-1 flex items-center gap-3 p-4 text-left"
        >
          <div className={`p-2 rounded-lg ${iconBg} ${iconColor}`}>
            {icon}
          </div>
          <div className="flex-1 min-w-0">
            <span className="font-medium text-content-primary block">{title}</span>
            <span className="text-xs text-content-tertiary">{description}</span>
          </div>
          <ChevronDown className={`h-5 w-5 text-content-tertiary transition-transform flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`} />
        </button>
        <button
          onClick={handleStartTutorial}
          className="flex items-center gap-1.5 px-4 py-2 mr-3 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition-colors"
        >
          <Play className="h-4 w-4" />
          Start
        </button>
      </div>
      {isExpanded && (
        <div className="px-4 pb-4 pt-2 border-t border-border bg-surface-secondary">
          <ol className="space-y-2 ml-1">
            {steps.map((step, index) => (
              <li key={index} className="flex items-start gap-3 text-sm text-content-secondary">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center text-brand-600 text-xs font-medium mt-0.5">
                  {index + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
};

export default WelcomeTab;
