// components/CollapsibleCard/AutocompleteInput.tsx
import React, { useState, useRef, useEffect } from 'react';
import { Input, Box, List, ListItem, useOutsideClick } from '@chakra-ui/react';

interface AutocompleteInputProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    validFields: string[];
    size?: string;
}

const AutocompleteInput: React.FC<AutocompleteInputProps> = ({
    value,
    onChange,
    placeholder = 'Enter field name',
    validFields,
    size = 'sm',
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [isFocused, setIsFocused] = useState(false); // Add focus state
    const [filteredOptions, setFilteredOptions] = useState<string[]>([]);
    const [highlightedIndex, setHighlightedIndex] = useState(-1);
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useOutsideClick({
        ref: containerRef,
        handler: () => {
            setIsOpen(false);
            setIsFocused(false); // Reset focus state when clicking outside
        },
    });

    useEffect(() => {
        // Only show dropdown if input is focused AND has content
        if (!isFocused || value.trim() === '') {
            setFilteredOptions([]);
            setIsOpen(false);
            return;
        }

        const filtered = validFields.filter((field) => field.toLowerCase().includes(value.toLowerCase())).slice(0, 10); // Limit to 10 suggestions

        setFilteredOptions(filtered);
        setIsOpen(filtered.length > 0);
        setHighlightedIndex(-1);
    }, [value, validFields, isFocused]); // Add isFocused to dependencies

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        onChange(e.target.value);
    };

    const handleFocus = () => {
        setIsFocused(true);
        // If there's already content, show suggestions immediately
        if (value.trim()) {
            const filtered = validFields
                .filter((field) => field.toLowerCase().includes(value.toLowerCase()))
                .slice(0, 10);

            if (filtered.length > 0) {
                setFilteredOptions(filtered);
                setIsOpen(true);
            }
        }
    };

    const handleBlur = () => {
        // Small delay to allow for option clicks
        setTimeout(() => {
            setIsFocused(false);
            setIsOpen(false);
        }, 150);
    };

    const handleOptionClick = (option: string) => {
        onChange(option);
        setIsOpen(false);
        setIsFocused(false);
        inputRef.current?.blur(); // Remove focus after selection
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (!isOpen) return;

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setHighlightedIndex((prev) => (prev < filteredOptions.length - 1 ? prev + 1 : prev));
                break;
            case 'ArrowUp':
                e.preventDefault();
                setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : -1));
                break;
            case 'Enter':
                e.preventDefault();
                if (highlightedIndex >= 0 && highlightedIndex < filteredOptions.length) {
                    handleOptionClick(filteredOptions[highlightedIndex]);
                }
                break;
            case 'Escape':
                setIsOpen(false);
                setIsFocused(false);
                setHighlightedIndex(-1);
                inputRef.current?.blur();
                break;
            case 'Tab':
                // Allow tab to close dropdown and move to next field
                setIsOpen(false);
                setIsFocused(false);
                break;
        }
    };

    return (
        <Box position="relative" ref={containerRef}>
            <Input
                ref={inputRef}
                size={size}
                value={value}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                onFocus={handleFocus}
                onBlur={handleBlur}
                placeholder={placeholder}
                autoComplete="off"
            />
            {isOpen && isFocused && filteredOptions.length > 0 && (
                <Box
                    position="absolute"
                    top="100%"
                    left={0}
                    right={0}
                    zIndex={1000}
                    bg="white"
                    border="1px solid"
                    borderColor="gray.200"
                    borderRadius="md"
                    boxShadow="lg"
                    maxHeight="200px"
                    overflowY="auto"
                >
                    <List>
                        {filteredOptions.map((option, index) => (
                            <ListItem
                                key={option}
                                px={3}
                                py={2}
                                cursor="pointer"
                                bg={index === highlightedIndex ? 'gray.100' : 'white'}
                                _hover={{ bg: 'gray.100' }}
                                onMouseDown={(e) => {
                                    // Prevent blur from firing before click
                                    e.preventDefault();
                                }}
                                onClick={() => handleOptionClick(option)}
                                fontSize="sm"
                            >
                                {option}
                            </ListItem>
                        ))}
                    </List>
                </Box>
            )}
        </Box>
    );
};

export default AutocompleteInput;
