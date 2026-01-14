import React from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, Github, Layers } from 'lucide-react';
import { WorkspaceProvider } from '../contexts/WorkspaceContext';
import { SchemaProvider } from '../contexts/SchemaContext';
import ThemeToggle from '../components/common/ThemeToggle';
import UnifiedWorkspace from '../components/workspace/UnifiedWorkspace';

const UnifiedWorkspacePage: React.FC = () => {
  return (
    <SchemaProvider>
      <WorkspaceProvider>
        <div className="min-h-screen bg-surface">
          {/* Header */}
          <header className="bg-surface-primary shadow-sm">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex items-center justify-between">
              <div className="flex items-center">
                <Link to="/" className="flex items-center hover:opacity-80 transition-opacity">
                  <ShieldCheck className="h-8 w-8 text-brand-600 mr-2" />
                  <span className="text-xl font-bold text-content-primary">dicompare</span>
                </Link>
                <span className="mx-4 text-content-muted">/</span>
                <Layers className="h-6 w-6 text-brand-600 mr-2" />
                <h1 className="text-xl font-semibold text-content-secondary">Workspace</h1>
              </div>
              <div className="flex items-center gap-2">
                <ThemeToggle />
                <a
                  href="https://github.com/astewartau/dicompare"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-content-secondary hover:text-content-primary transition-colors"
                >
                  <Github className="h-6 w-6" />
                </a>
              </div>
            </div>
          </header>

          {/* Content */}
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <UnifiedWorkspace />
          </div>
        </div>
      </WorkspaceProvider>
    </SchemaProvider>
  );
};

export default UnifiedWorkspacePage;
