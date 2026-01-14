import React, { useState, useEffect } from 'react';
import { X, Edit2, Eye, Save } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface DetailedDescriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description: string;
  onSave?: (description: string) => void;
  isReadOnly?: boolean;
}

const DetailedDescriptionModal: React.FC<DetailedDescriptionModalProps> = ({
  isOpen,
  onClose,
  title,
  description,
  onSave,
  isReadOnly = false,
}) => {
  const [isEditMode, setIsEditMode] = useState(false);
  const [editedDescription, setEditedDescription] = useState(description);

  useEffect(() => {
    setEditedDescription(description);
    // Start in edit mode if description is empty and not read-only
    setIsEditMode(!isReadOnly && !description);
  }, [description, isReadOnly]);

  if (!isOpen) return null;

  const handleSave = () => {
    if (onSave) {
      onSave(editedDescription);
    }
    setIsEditMode(false);
    onClose();
  };

  const handleClose = () => {
    setEditedDescription(description);
    setIsEditMode(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-surface-primary rounded-lg max-w-4xl w-full h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between flex-shrink-0">
          <div className="flex items-center space-x-3">
            <h3 className="text-lg font-semibold text-content-primary">{title}</h3>
            <span className="text-sm text-content-tertiary">Detailed Description</span>
          </div>
          <div className="flex items-center space-x-2">
            {!isReadOnly && (
              <>
                {/* Toggle between Edit and Preview */}
                <button
                  onClick={() => setIsEditMode(!isEditMode)}
                  className="flex items-center px-3 py-1.5 text-sm text-content-secondary hover:text-content-primary border border-border-secondary rounded-md hover:bg-surface-secondary"
                >
                  {isEditMode ? (
                    <>
                      <Eye className="h-4 w-4 mr-1" />
                      Preview
                    </>
                  ) : (
                    <>
                      <Edit2 className="h-4 w-4 mr-1" />
                      Edit
                    </>
                  )}
                </button>
                {/* Save button always visible */}
                <button
                  onClick={handleSave}
                  className="flex items-center px-3 py-1.5 text-sm text-white bg-brand-600 rounded-md hover:bg-brand-700"
                >
                  <Save className="h-4 w-4 mr-1" />
                  Save
                </button>
              </>
            )}
            <button
              onClick={handleClose}
              className="p-1.5 text-content-tertiary hover:text-content-secondary rounded-md hover:bg-surface-secondary"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {isEditMode ? (
            <div className="h-full flex flex-col">
              <div className="text-xs text-content-tertiary mb-2">
                Supports GitHub-flavored Markdown (headings, lists, tables, code blocks, etc.)
              </div>
              <textarea
                value={editedDescription}
                onChange={(e) => setEditedDescription(e.target.value)}
                className="flex-1 w-full min-h-[400px] p-4 border border-border-secondary rounded-lg font-mono text-sm bg-surface-primary text-content-primary focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 resize-none"
                placeholder="Enter a detailed description using Markdown...

## Overview
Describe the acquisition sequence here.

### Key Parameters
- Parameter 1: Description
- Parameter 2: Description

### Clinical Purpose
Explain the clinical use case.

### Technical Notes
Add any technical details or vendor-specific information."
              />
            </div>
          ) : (
            <div className="prose prose-sm max-w-none dark:prose-invert">
              {editedDescription ? (
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    // Custom styling for markdown elements
                    h1: ({ children }) => <h1 className="text-2xl font-bold text-content-primary mb-4 pb-2 border-b border-border">{children}</h1>,
                    h2: ({ children }) => <h2 className="text-xl font-semibold text-content-primary mt-6 mb-3">{children}</h2>,
                    h3: ({ children }) => <h3 className="text-lg font-semibold text-content-primary mt-4 mb-2">{children}</h3>,
                    h4: ({ children }) => <h4 className="text-base font-semibold text-content-primary mt-3 mb-2">{children}</h4>,
                    p: ({ children }) => <p className="text-content-secondary mb-3 leading-relaxed">{children}</p>,
                    ul: ({ children }) => <ul className="list-disc list-inside mb-3 space-y-1 text-content-secondary">{children}</ul>,
                    ol: ({ children }) => <ol className="list-decimal list-inside mb-3 space-y-1 text-content-secondary">{children}</ol>,
                    li: ({ children }) => <li className="ml-2">{children}</li>,
                    strong: ({ children }) => <strong className="font-semibold text-content-primary">{children}</strong>,
                    code: ({ className, children, ...props }) => {
                      const isInline = !className;
                      if (isInline) {
                        return <code className="bg-surface-secondary text-brand-600 dark:text-brand-400 px-1.5 py-0.5 rounded text-sm font-mono">{children}</code>;
                      }
                      return (
                        <code className={`${className} block bg-gray-900 text-gray-100 p-4 rounded-lg text-sm font-mono overflow-x-auto`} {...props}>
                          {children}
                        </code>
                      );
                    },
                    pre: ({ children }) => <pre className="mb-4">{children}</pre>,
                    blockquote: ({ children }) => (
                      <blockquote className="border-l-4 border-brand-500 pl-4 py-1 my-3 text-content-secondary italic bg-surface-secondary rounded-r">
                        {children}
                      </blockquote>
                    ),
                    table: ({ children }) => (
                      <div className="overflow-x-auto mb-4">
                        <table className="min-w-full divide-y divide-border border border-border rounded-lg">
                          {children}
                        </table>
                      </div>
                    ),
                    thead: ({ children }) => <thead className="bg-surface-secondary">{children}</thead>,
                    th: ({ children }) => <th className="px-4 py-2 text-left text-xs font-semibold text-content-secondary uppercase tracking-wider">{children}</th>,
                    td: ({ children }) => <td className="px-4 py-2 text-sm text-content-secondary border-t border-border">{children}</td>,
                    hr: () => <hr className="my-6 border-border" />,
                    a: ({ href, children }) => (
                      <a href={href} className="text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300 underline" target="_blank" rel="noopener noreferrer">
                        {children}
                      </a>
                    ),
                  }}
                >
                  {editedDescription}
                </ReactMarkdown>
              ) : (
                <div className="text-center py-12 text-content-tertiary">
                  <p className="mb-2">No detailed description available.</p>
                  {!isReadOnly && (
                    <button
                      onClick={() => setIsEditMode(true)}
                      className="text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300 underline"
                    >
                      Click to add one
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

export default DetailedDescriptionModal;
