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
  };

  const handleClose = () => {
    setEditedDescription(description);
    setIsEditMode(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[85vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center space-x-3">
            <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
            <span className="text-sm text-gray-500">Detailed Description</span>
          </div>
          <div className="flex items-center space-x-2">
            {!isReadOnly && (
              <>
                {isEditMode ? (
                  <>
                    <button
                      onClick={() => setIsEditMode(false)}
                      className="flex items-center px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded-md hover:bg-gray-50"
                    >
                      <Eye className="h-4 w-4 mr-1" />
                      Preview
                    </button>
                    <button
                      onClick={handleSave}
                      className="flex items-center px-3 py-1.5 text-sm text-white bg-medical-600 rounded-md hover:bg-medical-700"
                    >
                      <Save className="h-4 w-4 mr-1" />
                      Save
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setIsEditMode(true)}
                    className="flex items-center px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded-md hover:bg-gray-50"
                  >
                    <Edit2 className="h-4 w-4 mr-1" />
                    Edit
                  </button>
                )}
              </>
            )}
            <button
              onClick={handleClose}
              className="p-1.5 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {isEditMode ? (
            <div className="h-full flex flex-col">
              <div className="text-xs text-gray-500 mb-2">
                Supports GitHub-flavored Markdown (headings, lists, tables, code blocks, etc.)
              </div>
              <textarea
                value={editedDescription}
                onChange={(e) => setEditedDescription(e.target.value)}
                className="flex-1 w-full min-h-[400px] p-4 border border-gray-300 rounded-lg font-mono text-sm focus:outline-none focus:ring-2 focus:ring-medical-500 focus:border-medical-500 resize-none"
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
            <div className="prose prose-sm max-w-none">
              {editedDescription ? (
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    // Custom styling for markdown elements
                    h1: ({ children }) => <h1 className="text-2xl font-bold text-gray-900 mb-4 pb-2 border-b">{children}</h1>,
                    h2: ({ children }) => <h2 className="text-xl font-semibold text-gray-900 mt-6 mb-3">{children}</h2>,
                    h3: ({ children }) => <h3 className="text-lg font-semibold text-gray-800 mt-4 mb-2">{children}</h3>,
                    h4: ({ children }) => <h4 className="text-base font-semibold text-gray-800 mt-3 mb-2">{children}</h4>,
                    p: ({ children }) => <p className="text-gray-700 mb-3 leading-relaxed">{children}</p>,
                    ul: ({ children }) => <ul className="list-disc list-inside mb-3 space-y-1 text-gray-700">{children}</ul>,
                    ol: ({ children }) => <ol className="list-decimal list-inside mb-3 space-y-1 text-gray-700">{children}</ol>,
                    li: ({ children }) => <li className="ml-2">{children}</li>,
                    strong: ({ children }) => <strong className="font-semibold text-gray-900">{children}</strong>,
                    code: ({ className, children, ...props }) => {
                      const isInline = !className;
                      if (isInline) {
                        return <code className="bg-gray-100 text-medical-700 px-1.5 py-0.5 rounded text-sm font-mono">{children}</code>;
                      }
                      return (
                        <code className={`${className} block bg-gray-900 text-gray-100 p-4 rounded-lg text-sm font-mono overflow-x-auto`} {...props}>
                          {children}
                        </code>
                      );
                    },
                    pre: ({ children }) => <pre className="mb-4">{children}</pre>,
                    blockquote: ({ children }) => (
                      <blockquote className="border-l-4 border-medical-500 pl-4 py-1 my-3 text-gray-600 italic bg-gray-50 rounded-r">
                        {children}
                      </blockquote>
                    ),
                    table: ({ children }) => (
                      <div className="overflow-x-auto mb-4">
                        <table className="min-w-full divide-y divide-gray-200 border border-gray-200 rounded-lg">
                          {children}
                        </table>
                      </div>
                    ),
                    thead: ({ children }) => <thead className="bg-gray-50">{children}</thead>,
                    th: ({ children }) => <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">{children}</th>,
                    td: ({ children }) => <td className="px-4 py-2 text-sm text-gray-700 border-t border-gray-100">{children}</td>,
                    hr: () => <hr className="my-6 border-gray-200" />,
                    a: ({ href, children }) => (
                      <a href={href} className="text-medical-600 hover:text-medical-800 underline" target="_blank" rel="noopener noreferrer">
                        {children}
                      </a>
                    ),
                  }}
                >
                  {editedDescription}
                </ReactMarkdown>
              ) : (
                <div className="text-center py-12 text-gray-500">
                  <p className="mb-2">No detailed description available.</p>
                  {!isReadOnly && (
                    <button
                      onClick={() => setIsEditMode(true)}
                      className="text-medical-600 hover:text-medical-800 underline"
                    >
                      Click to add one
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-200 bg-gray-50 flex justify-end flex-shrink-0">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-sm text-gray-700 hover:text-gray-900 border border-gray-300 rounded-md hover:bg-gray-100"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default DetailedDescriptionModal;
