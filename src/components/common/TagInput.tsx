import React, { useState, useRef, useEffect } from 'react';
import { Tag, X, Plus } from 'lucide-react';

interface TagInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  suggestions?: string[];
  placeholder?: string;
  label?: string;
  helperText?: string;
  disabled?: boolean;
}

const TagInput: React.FC<TagInputProps> = ({
  tags,
  onChange,
  suggestions = [],
  placeholder = 'Add a tag...',
  label,
  helperText,
  disabled = false
}) => {
  const [inputValue, setInputValue] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Filter suggestions based on input and exclude already selected tags
  const filteredSuggestions = suggestions
    .filter(s => !tags.includes(s))
    .filter(s => s.toLowerCase().includes(inputValue.toLowerCase()))
    .slice(0, 10);

  const addTag = (tag: string) => {
    const trimmedTag = tag.trim();
    if (trimmedTag && !tags.includes(trimmedTag)) {
      onChange([...tags, trimmedTag]);
    }
    setInputValue('');
    setShowSuggestions(false);
    setHighlightedIndex(-1);
  };

  const removeTag = (tagToRemove: string) => {
    onChange(tags.filter(tag => tag !== tagToRemove));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0 && filteredSuggestions[highlightedIndex]) {
        addTag(filteredSuggestions[highlightedIndex]);
      } else if (inputValue.trim()) {
        addTag(inputValue);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(prev =>
        prev < filteredSuggestions.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(prev => prev > 0 ? prev - 1 : -1);
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
      setHighlightedIndex(-1);
    } else if (e.key === 'Backspace' && !inputValue && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    }
  };

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-medium text-content-secondary mb-2">
          {label}
        </label>
      )}

      {/* Input and Add Button */}
      <div className="flex space-x-2 mb-3">
        <div className="flex-1 relative">
          <Tag className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-content-tertiary" />
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value);
              setShowSuggestions(true);
              setHighlightedIndex(-1);
            }}
            onFocus={() => setShowSuggestions(true)}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            className={`w-full pl-10 pr-4 py-3 border border-border-secondary rounded-lg text-content-primary focus:ring-2 focus:ring-brand-500 focus:border-brand-500 ${
              disabled ? 'bg-surface-secondary cursor-not-allowed' : 'bg-surface-primary'
            }`}
            placeholder={placeholder}
          />

          {/* Autocomplete Dropdown */}
          {showSuggestions && filteredSuggestions.length > 0 && inputValue && (
            <div
              ref={suggestionsRef}
              className="absolute z-10 w-full mt-1 bg-surface-primary border border-border-secondary rounded-lg shadow-lg max-h-48 overflow-y-auto"
            >
              {filteredSuggestions.map((suggestion, index) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => addTag(suggestion)}
                  className={`w-full text-left px-4 py-2 text-sm hover:bg-surface-secondary ${
                    index === highlightedIndex ? 'bg-surface-secondary' : ''
                  }`}
                >
                  <span className="text-content-primary">{suggestion}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => inputValue.trim() && addTag(inputValue)}
          disabled={disabled || !inputValue.trim()}
          className="px-4 py-3 bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:bg-gray-400 dark:disabled:bg-gray-600 disabled:cursor-not-allowed"
        >
          <Plus className="h-5 w-5" />
        </button>
      </div>

      {/* Tags Display */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {tags.map((tag, index) => (
            <span
              key={index}
              className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-brand-500/10 text-brand-700 dark:text-brand-300"
            >
              <Tag className="h-3 w-3 mr-1" />
              {tag}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => removeTag(tag)}
                  className="ml-2 text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {helperText && (
        <p className="text-sm text-content-tertiary">
          {helperText}
        </p>
      )}
    </div>
  );
};

export default TagInput;
