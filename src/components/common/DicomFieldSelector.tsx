import React, { useState, useEffect, useRef, KeyboardEvent, FormEvent } from 'react';
import { searchDicomFields, isValidDicomTag, type DicomFieldDefinition } from '../../services/dicomFieldService';

interface DicomFieldSelectorProps {
  selectedFields: string[];
  onFieldsChange: (fields: string[]) => void;
  placeholder?: string;
  maxSelections?: number;
  showCategories?: boolean;
  showSuggestions?: boolean;
  className?: string;
}

const DicomFieldSelector = ({
  selectedFields,
  onFieldsChange,
  placeholder = "Search DICOM fields by name or tag...",
  maxSelections,
  showCategories = true,
  showSuggestions = true,
  className = ""
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [suggestions, setSuggestions] = useState<DicomFieldDefinition[]>([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
  const [isLoading, setIsLoading] = useState(false);
  const [manualEntry, setManualEntry] = useState('');
  const [showManualEntry, setShowManualEntry] = useState(false);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Debounced search effect
  useEffect(() => {
    const delayedSearch = setTimeout(async () => {
      if (searchTerm.trim().length > 0) {
        setIsLoading(true);
        try {
          // Use local DICOM field service for instant search
          const results = await searchDicomFields(searchTerm, 10);
          setSuggestions(results);
          setIsDropdownOpen(true);
        } catch (error) {
          console.error('Error searching DICOM fields:', error);
          setSuggestions([]);
        } finally {
          setIsLoading(false);
        }
      } else {
        setSuggestions([]);
        setIsDropdownOpen(false);
      }
    }, 300);

    return () => clearTimeout(delayedSearch);
  }, [searchTerm]);

  // Handle outside clicks to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
        setSelectedSuggestionIndex(-1);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleFieldSelect = (field: DicomFieldDefinition) => {
    // Convert field.tag format from "(0018,0081)" or "0018,0081" to "0018,0081"
    const normalizedTag = field.tag.replace(/[()]/g, '');
    if (!selectedFields.includes(normalizedTag) && (!maxSelections || selectedFields.length < maxSelections)) {
      onFieldsChange([...selectedFields, normalizedTag]);
    }
    setSearchTerm('');
    setSuggestions([]);
    setIsDropdownOpen(false);
    setSelectedSuggestionIndex(-1);
    inputRef.current?.focus();
  };

  const handleFieldRemove = (fieldTag: string) => {
    onFieldsChange(selectedFields.filter(tag => tag !== fieldTag));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!isDropdownOpen || suggestions.length === 0) {
      if (e.key === 'Enter' && searchTerm.trim()) {
        // Allow manual entry of field tags
        setManualEntry(searchTerm);
        setShowManualEntry(true);
        e.preventDefault();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedSuggestionIndex(prev => 
          prev < suggestions.length - 1 ? prev + 1 : 0
        );
        break;
      
      case 'ArrowUp':
        e.preventDefault();
        setSelectedSuggestionIndex(prev => 
          prev > 0 ? prev - 1 : suggestions.length - 1
        );
        break;
      
      case 'Enter':
        e.preventDefault();
        if (selectedSuggestionIndex >= 0) {
          handleFieldSelect(suggestions[selectedSuggestionIndex]);
        }
        break;
      
      case 'Escape':
        setIsDropdownOpen(false);
        setSelectedSuggestionIndex(-1);
        break;
    }
  };

  const handleManualEntrySubmit = (value: string) => {
    if (isValidDicomTag(value) && !selectedFields.includes(value)) {
      onFieldsChange([...selectedFields, value]);
    }
    setManualEntry('');
    setShowManualEntry(false);
    setSearchTerm('');
  };

  const getFieldDisplayName = async (tag: string): Promise<string> => {
    try {
      const results = await searchDicomFields(tag, 1);
      const field = results.find(f => f.tag.replace(/[()]/g, '') === tag);
      return field ? `${field.name} (${tag})` : tag;
    } catch {
      return tag;
    }
  };

  return (
    <div className={`relative ${className}`}>
      {/* Selected Fields Display */}
      {selectedFields.length > 0 && (
        <div className="mb-4">
          <div className="flex flex-wrap gap-2">
            {selectedFields.map((fieldTag) => (
              <SelectedFieldTag
                key={fieldTag}
                fieldTag={fieldTag}
                onRemove={() => handleFieldRemove(fieldTag)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Search Input */}
      <div className="relative" ref={dropdownRef}>
        <div className="relative">
          <input
            ref={inputRef}
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-10"
          />
          {isLoading && (
            <div className="absolute right-3 top-2.5">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
            </div>
          )}
        </div>

        {/* Suggestions Dropdown */}
        {isDropdownOpen && suggestions.length > 0 && (
          <div className="absolute z-20 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-64 overflow-y-auto">
            {suggestions.map((field, index) => {
              const normalizedTag = field.tag.replace(/[()]/g, '');
              
              return (
                <div
                  key={field.tag}
                  onClick={() => handleFieldSelect(field)}
                  className={`px-4 py-3 cursor-pointer border-b border-gray-100 last:border-b-0 ${
                    index === selectedSuggestionIndex 
                      ? 'bg-blue-50 border-blue-200' 
                      : 'hover:bg-gray-50'
                  } ${selectedFields.includes(normalizedTag) ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="font-medium text-gray-900">{field.name}</div>
                      <div className="flex items-center space-x-2 mt-1">
                        <div className="text-sm text-blue-600 font-mono">{normalizedTag}</div>
                        {field.keyword && (
                          <div className="text-xs text-gray-600 bg-gray-100 px-1.5 py-0.5 rounded">
                            {field.keyword}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center space-x-2 text-xs text-gray-500 mt-1">
                        <span>VR: {field.valueRepresentation || field.vr}</span>
                        {field.valueMultiplicity && (
                          <span>VM: {field.valueMultiplicity}</span>
                        )}
                      </div>
                      {field.description && (
                        <div className="text-xs text-gray-500 mt-1 line-clamp-2">
                          {field.description}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            
            {/* Manual Entry Option */}
            <div className="px-4 py-2 border-t border-gray-200 bg-gray-50">
              <button
                onClick={() => setShowManualEntry(true)}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                + Add custom field tag manually
              </button>
            </div>
          </div>
        )}

        {/* No Results */}
        {isDropdownOpen && !isLoading && searchTerm.length > 0 && suggestions.length === 0 && (
          <div className="absolute z-20 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg">
            <div className="px-4 py-3 text-gray-500 text-center">
              No fields found for "{searchTerm}"
              <button
                onClick={() => setShowManualEntry(true)}
                className="block w-full text-blue-600 hover:text-blue-800 mt-2"
              >
                Add as custom field tag
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Manual Entry Modal */}
      {showManualEntry && (
        <ManualEntryModal
          initialValue={manualEntry || searchTerm}
          onSubmit={handleManualEntrySubmit}
          onCancel={() => {
            setShowManualEntry(false);
            setManualEntry('');
          }}
        />
      )}

      {/* Field Count Display */}
      {maxSelections && (
        <div className="mt-2 text-sm text-gray-500">
          {selectedFields.length} of {maxSelections} fields selected
        </div>
      )}
    </div>
  );
};

// Component for displaying selected field tags
const SelectedFieldTag = ({ fieldTag, onRemove }: { fieldTag: string; onRemove: () => void }) => {
  const [displayName, setDisplayName] = useState(fieldTag);

  useEffect(() => {
    const loadFieldName = async () => {
      try {
        const results = await searchDicomFields(fieldTag, 1);
        const field = results.find(f => f.tag.replace(/[()]/g, '') === fieldTag);
        if (field) {
          setDisplayName(field.name);
        }
      } catch (error) {
        // Keep the tag as display name if lookup fails
      }
    };
    loadFieldName();
  }, [fieldTag]);

  return (
    <span className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm">
      <span className="font-medium">{displayName}</span>
      <span className="text-blue-600 font-mono text-xs">({fieldTag})</span>
      <button
        onClick={onRemove}
        className="ml-1 text-blue-600 hover:text-blue-800 focus:outline-none p-0.5 rounded-full hover:bg-blue-200"
        aria-label={`Remove ${displayName}`}
      >
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </span>
  );
};

// Modal for manual field tag entry
const ManualEntryModal = ({ 
  initialValue, 
  onSubmit, 
  onCancel 
}: {
  initialValue: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}) => {
  const [value, setValue] = useState(initialValue);
  const [isValid, setIsValid] = useState(false);

  useEffect(() => {
    setIsValid(isValidDicomTag(value));
  }, [value]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (isValid) {
      onSubmit(value);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-96">
        <h3 className="text-lg font-semibold mb-4">Add Custom DICOM Field Tag</h3>
        
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label htmlFor="fieldTag" className="block text-sm font-medium text-gray-700 mb-1">
              DICOM Tag (format: XXXX,XXXX)
            </label>
            <input
              id="fieldTag"
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value.toUpperCase())}
              placeholder="0018,0080"
              className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 font-mono ${
                value && !isValid ? 'border-red-300 focus:border-red-500' : 'border-gray-300 focus:border-blue-500'
              }`}
            />
            {value && !isValid && (
              <p className="mt-1 text-sm text-red-600">
                Please enter a valid DICOM tag in format XXXX,XXXX (e.g., 0018,0080)
              </p>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-gray-600 hover:text-gray-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!isValid}
              className={`px-4 py-2 rounded-md ${
                isValid
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
            >
              Add Field
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default DicomFieldSelector;