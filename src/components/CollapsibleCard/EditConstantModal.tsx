// components/CollapsibleCard/EditConstantModal.tsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    Modal,
    ModalOverlay,
    ModalContent,
    ModalHeader,
    ModalCloseButton,
    ModalBody,
    ModalFooter,
    Button,
    FormControl,
    FormLabel,
    FormErrorMessage,
    Select,
    HStack,
    Input as ChakraInput,
    Box,
} from '@chakra-ui/react';
import Tagify from '@yaireo/tagify';
import '@yaireo/tagify/dist/tagify.css';
import { ConstantField, ConstraintType, VariableRow, BaseDataType, ListSubType } from './types';
import AutocompleteInput from './AutocompleteInput';

export const allowedConstraints = (dataType: BaseDataType): ConstraintType[] => {
    switch (dataType) {
        case 'number':
            return ['value', 'range', 'value+tolerance'];
        case 'string':
        case 'list':
            return ['value', 'contains'];
        case 'raw_json':
            return ['value']; // Only exact value matching for JSON
        default:
            return ['value'];
    }
};

interface EditConstantModalProps {
    isOpen: boolean;
    onClose: () => void;
    mode?: 'constant' | 'series';
    // For constant mode:
    constantField?: ConstantField;
    // For series mode, pass the entire variable row:
    seriesRow?: VariableRow;
    // onSave returns the updated constant field (in constant mode)
    // or updated variable row (in series mode)
    onSave: (updated: ConstantField | VariableRow) => void;
    validFields?: string[]; // Add this
}

const EditConstantModal: React.FC<EditConstantModalProps> = ({
    isOpen,
    onClose,
    onSave,
    mode = 'constant',
    constantField,
    seriesRow,
    validFields = [], // Add this with default
}) => {
    const isSeries = mode === 'series';

    // For constant mode.
    const [localField, setLocalField] = useState<ConstantField>(
        constantField || {
            id: '',
            name: '',
            data: { constraintType: 'value', value: '', dataType: 'string', listSubType: undefined },
        }
    );
    // For series mode.
    const [localRow, setLocalRow] = useState<VariableRow>(
        seriesRow || { Series: { value: '', constraintType: 'value', dataType: 'string', listSubType: undefined } }
    );

    // Error state for constant mode.
    const [errors, setErrors] = useState<{
        fieldName?: string;
        value?: string;
        minValue?: string;
        maxValue?: string;
        tolerance?: string;
    }>({});
    // Error state for series mode (per field).
    const [errorsRow, setErrorsRow] = useState<{
        [key: string]: { value?: string; minValue?: string; maxValue?: string; tolerance?: string };
    }>({});

    const tagifyInstanceRef = useRef<Tagify | null>(null);
    const inputElementRef = useRef<HTMLInputElement | null>(null);
    // For series mode, maintain a ref map for Tagify instances per field.
    const tagifySeriesRefs = useRef<{ [key: string]: Tagify | null }>({});

    // Shared numeric input handlers.
    const handleNumericKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        const allowedKeys = ['Backspace', 'Tab', 'ArrowLeft', 'ArrowRight', 'Delete', 'Home', 'End'];
        if (allowedKeys.includes(e.key)) return;
        if (e.key === '.' && !e.currentTarget.value.includes('.')) return;
        if (e.key === '-' && e.currentTarget.selectionStart === 0 && !e.currentTarget.value.includes('-')) return;
        if (!/^\d$/.test(e.key)) e.preventDefault();
    };

    const handleNumericPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
        const pasteData = e.clipboardData.getData('text');
        if (/[^0-9.-]/.test(pasteData)) e.preventDefault();
    };

    // For constant mode, set up Tagify.
    const setTagifyRefConstant = useCallback(
        (el: HTMLInputElement | null) => {
            inputElementRef.current = el;
            if (el && isOpen && localField.data.dataType === 'list' && !tagifyInstanceRef.current) {
                tagifyInstanceRef.current = new Tagify(el, { duplicates: true });
                if (tagifyInstanceRef.current.DOM.scope) {
                    tagifyInstanceRef.current.DOM.scope.style.width = '100%';
                }
                const initialTags = localField.data.value
                    ? localField.data.value
                          .split(',')
                          .map((t) => t.trim())
                          .filter(Boolean)
                    : [];
                tagifyInstanceRef.current.addTags(initialTags);
                tagifyInstanceRef.current.on('change', () => {
                    const tags = tagifyInstanceRef.current?.value.map((tag) => tag.value) || [];
                    setLocalField((prev) => ({
                        ...prev,
                        data: { ...prev.data, value: tags.join(', ') },
                    }));
                });
            }
        },
        [isOpen, localField.data.dataType]
    );

    useEffect(() => {
        if (!isSeries && constantField) {
            setLocalField(constantField);
        }
    }, [constantField, isSeries]);

    useEffect(() => {
        if (!isSeries && tagifyInstanceRef.current && localField.data.dataType === 'list') {
            const currentTags = tagifyInstanceRef.current.value.map((tag) => tag.value);
            const newTags = localField.data.value
                ? localField.data.value
                      .split(',')
                      .map((t) => t.trim())
                      .filter(Boolean)
                : [];
            if (JSON.stringify(currentTags) !== JSON.stringify(newTags)) {
                tagifyInstanceRef.current.removeAllTags();
                tagifyInstanceRef.current.addTags(newTags);
            }
        }
    }, [localField.data.value, localField.data.dataType, isSeries]);

    useEffect(() => {
        if (isSeries && seriesRow) {
            setLocalRow(seriesRow);
        }
    }, [seriesRow, isSeries]);

    // --- Constant mode handlers ---

    const handleDataTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const dt = e.target.value as BaseDataType;
        const newConstraint = allowedConstraints(dt)[0];
        setLocalField((prev) => ({
            ...prev,
            data: { 
                ...prev.data, 
                dataType: dt, 
                constraintType: newConstraint, 
                value: '',
                listSubType: dt === 'list' ? 'string' : undefined
            },
        }));
        if (dt !== 'list' && tagifyInstanceRef.current) {
            tagifyInstanceRef.current.destroy();
            tagifyInstanceRef.current = null;
        }
    };

    const handleListSubTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const subType = e.target.value as ListSubType;
        setLocalField((prev) => ({
            ...prev,
            data: { ...prev.data, listSubType: subType, value: '' },
        }));
    };

    const handleConstraintChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        setLocalField((prev) => ({
            ...prev,
            data: { ...prev.data, constraintType: e.target.value as ConstraintType },
        }));
    };

    const handleMinChange = (newVal: string) => {
        setLocalField((prev) => ({
            ...prev,
            data: { ...prev.data, minValue: newVal },
        }));
        if (newVal.trim()) {
            setErrors((prev) => ({ ...prev, minValue: undefined }));
        }
    };

    const handleMaxChange = (newVal: string) => {
        setLocalField((prev) => ({
            ...prev,
            data: { ...prev.data, maxValue: newVal },
        }));
        if (newVal.trim()) {
            setErrors((prev) => ({ ...prev, maxValue: undefined }));
        }
    };

    const handleToleranceChange = (newVal: string) => {
        setLocalField((prev) => ({
            ...prev,
            data: { ...prev.data, tolerance: newVal },
        }));
        if (newVal.trim()) {
            setErrors((prev) => ({ ...prev, tolerance: undefined }));
        }
    };

    const validateRawJSON = (value: string): boolean => {
        if (!value.trim()) return false;
        try {
            JSON.parse(value);
            return true;
        } catch {
            return false;
        }
    };

    const validateConstantInputs = (): boolean => {
        const newErrors: {
            fieldName?: string;
            value?: string;
            minValue?: string;
            maxValue?: string;
            tolerance?: string;
        } = {};
        if (!localField.name || !localField.name.trim()) {
            newErrors.fieldName = 'Field name is required.';
        }
        const { constraintType, value, minValue, maxValue, tolerance, dataType, listSubType } = localField.data;
        
        // Special validation for Raw JSON
        if (dataType === 'raw_json') {
            if (!validateRawJSON(value)) {
                newErrors.value = 'Invalid JSON format';
            }
        } else if (dataType === 'list' && listSubType === 'number' && value) {
            // Validate number lists
            const items = value.split(',').map(s => s.trim());
            const hasInvalidNumbers = items.some(item => item !== '' && isNaN(parseFloat(item)));
            if (hasInvalidNumbers) {
                newErrors.value = 'All list items must be valid numbers';
            }
        }
        
        // Standard validation
        if (constraintType === 'value' || constraintType === 'contains') {
            if (!value || !value.trim()) {
                newErrors.value = 'This field is required.';
            }
        } else if (constraintType === 'range') {
            if (!minValue || !minValue.trim()) {
                newErrors.minValue = 'Min value is required.';
            }
            if (!maxValue || !maxValue.trim()) {
                newErrors.maxValue = 'Max value is required.';
            }
        } else if (constraintType === 'value+tolerance') {
            if (!value || !value.trim()) {
                newErrors.value = 'Value is required.';
            }
            if (!tolerance || !tolerance.trim()) {
                newErrors.tolerance = 'Tolerance is required.';
            }
        }
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    // Add this useEffect to cleanup Tagify instances when the modal closes
    useEffect(() => {
        return () => {
            // Cleanup all Tagify instances when component unmounts
            Object.values(tagifySeriesRefs.current).forEach((tagify) => {
                tagify?.destroy();
            });
            tagifySeriesRefs.current = {};
        };
    }, []);

    // Also cleanup when modal closes
    useEffect(() => {
        if (!isOpen) {
            Object.values(tagifySeriesRefs.current).forEach((tagify) => {
                tagify?.destroy();
            });
            tagifySeriesRefs.current = {};
        }
    }, [isOpen]);

    // Helper: validate all series fields except "Series".
    const validateSeries = (): boolean => {
        let valid = true;
        const newErrors: typeof errorsRow = {};
        const fieldKeys = Object.keys(localRow).filter((key) => key !== 'Series');
        
        for (const key of fieldKeys) {
            const field = localRow[key];
            const currentData = field || { constraintType: 'value', value: '', dataType: 'string' };
            
            // Special validation for Raw JSON
            if (currentData.dataType === 'raw_json') {
                if (!validateRawJSON(currentData.value || '')) {
                    valid = false;
                    newErrors[key] = { ...newErrors[key], value: 'Invalid JSON format' };
                }
            } else if (currentData.dataType === 'list' && currentData.listSubType === 'number' && currentData.value) {
                // Validate number lists
                const items = currentData.value.split(',').map(s => s.trim());
                const hasInvalidNumbers = items.some(item => item !== '' && isNaN(parseFloat(item)));
                if (hasInvalidNumbers) {
                    valid = false;
                    newErrors[key] = { ...newErrors[key], value: 'All list items must be valid numbers' };
                }
            }
            
            // Standard validation based on constraint type
            if (
                currentData.constraintType === 'value' ||
                currentData.constraintType === 'contains' ||
                currentData.constraintType === 'value+tolerance'
            ) {
                if (!currentData.value || !currentData.value.trim()) {
                    valid = false;
                    newErrors[key] = { ...newErrors[key], value: 'This field is required.' };
                }
            } else if (currentData.constraintType === 'range') {
                if (!currentData.minValue || !currentData.minValue.trim()) {
                    valid = false;
                    newErrors[key] = { ...newErrors[key], minValue: 'Min value is required.' };
                }
                if (!currentData.maxValue || !currentData.maxValue.trim()) {
                    valid = false;
                    newErrors[key] = { ...newErrors[key], maxValue: 'Max value is required.' };
                }
            }
        }
        setErrorsRow(newErrors);
        return valid;
    };

    // Single handleSave declaration.
    const handleSave = () => {
        if (isSeries) {
            const seriesName = localRow['Series']?.value || '';
            if (!seriesName.trim()) {
                setErrorsRow((prev) => ({
                    ...prev,
                    Series: { value: 'Series name is required.' },
                }));
                return;
            }
            if (!validateSeries()) return;
            onSave(localRow);
            onClose();
        } else {
            if (!validateConstantInputs()) return;
            onSave(localField);
            onClose();
        }
    };

    // Render constant mode form.
    const renderConstantForm = () => {
        const renderValueInput = () => {
            const { data } = localField;
            const isNumber = data.dataType === 'number';
            
            // Handle Raw JSON type
            if (data.dataType === 'raw_json') {
                return (
                    <FormControl isInvalid={!!errors.value}>
                        <ChakraInput
                            as="textarea"
                            rows={4}
                            size="sm"
                            value={data.value}
                            placeholder='Enter JSON: 1, "hello", [1, "hello"], {"key": "value"}'
                            onChange={(e) =>
                                setLocalField((prev) => ({
                                    ...prev,
                                    data: { ...prev.data, value: e.target.value },
                                }))
                            }
                            fontFamily="mono"
                        />
                        {errors.value && <FormErrorMessage>{errors.value}</FormErrorMessage>}
                    </FormControl>
                );
            }
            
            switch (data.constraintType) {
                case 'value':
                    if (data.dataType === 'list') {
                        return (
                            <FormControl isInvalid={!!errors.value}>
                                <input
                                    ref={setTagifyRefConstant}
                                    placeholder={`Enter comma separated ${data.listSubType || 'string'} values`}
                                    style={{
                                        width: '100%',
                                        padding: '0.5rem',
                                        fontSize: '0.875rem',
                                        borderRadius: '0.375rem',
                                        border: '1px solid #E2E8F0',
                                    }}
                                />
                                {errors.value && <FormErrorMessage>{errors.value}</FormErrorMessage>}
                            </FormControl>
                        );
                    }
                    return (
                        <FormControl isInvalid={!!errors.value}>
                            <ChakraInput
                                size="sm"
                                type={isNumber ? 'number' : 'text'}
                                value={data.value}
                                placeholder="Enter value"
                                onChange={(e) =>
                                    setLocalField((prev) => ({
                                        ...prev,
                                        data: { ...prev.data, value: e.target.value },
                                    }))
                                }
                                onKeyDown={isNumber ? handleNumericKeyDown : undefined}
                                onPaste={isNumber ? handleNumericPaste : undefined}
                            />
                            {errors.value && <FormErrorMessage>{errors.value}</FormErrorMessage>}
                        </FormControl>
                    );
                case 'range':
                    return (
                        <HStack spacing={2}>
                            <FormControl isInvalid={!!errors.minValue}>
                                <ChakraInput
                                    size="sm"
                                    type={isNumber ? 'number' : 'text'}
                                    value={localField.data.minValue || ''}
                                    placeholder="Min"
                                    onChange={(e) => handleMinChange(e.target.value)}
                                    onKeyDown={isNumber ? handleNumericKeyDown : undefined}
                                    onPaste={isNumber ? handleNumericPaste : undefined}
                                />
                                {errors.minValue && <FormErrorMessage>{errors.minValue}</FormErrorMessage>}
                            </FormControl>
                            <FormControl isInvalid={!!errors.maxValue}>
                                <ChakraInput
                                    size="sm"
                                    type={isNumber ? 'number' : 'text'}
                                    value={localField.data.maxValue || ''}
                                    placeholder="Max"
                                    onChange={(e) => handleMaxChange(e.target.value)}
                                    onKeyDown={isNumber ? handleNumericKeyDown : undefined}
                                    onPaste={isNumber ? handleNumericPaste : undefined}
                                />
                                {errors.maxValue && <FormErrorMessage>{errors.maxValue}</FormErrorMessage>}
                            </FormControl>
                        </HStack>
                    );
                case 'value+tolerance':
                    return (
                        <HStack spacing={2}>
                            <FormControl isInvalid={!!errors.value}>
                                <ChakraInput
                                    size="sm"
                                    type={isNumber ? 'number' : 'text'}
                                    value={localField.data.value}
                                    placeholder="Enter value"
                                    onChange={(e) =>
                                        setLocalField((prev) => ({
                                            ...prev,
                                            data: { ...prev.data, value: e.target.value },
                                        }))
                                    }
                                    onKeyDown={isNumber ? handleNumericKeyDown : undefined}
                                    onPaste={isNumber ? handleNumericPaste : undefined}
                                />
                                {errors.value && <FormErrorMessage>{errors.value}</FormErrorMessage>}
                            </FormControl>
                            <FormControl isInvalid={!!errors.tolerance}>
                                <ChakraInput
                                    size="sm"
                                    type={isNumber ? 'number' : 'text'}
                                    value={localField.data.tolerance || ''}
                                    placeholder="Tolerance"
                                    onChange={(e) => handleToleranceChange(e.target.value)}
                                    onKeyDown={isNumber ? handleNumericKeyDown : undefined}
                                    onPaste={isNumber ? handleNumericPaste : undefined}
                                />
                                {errors.tolerance && <FormErrorMessage>{errors.tolerance}</FormErrorMessage>}
                            </FormControl>
                        </HStack>
                    );
                case 'contains':
                    return (
                        <FormControl isInvalid={!!errors.value}>
                            <ChakraInput
                                size="sm"
                                value={localField.data.value}
                                placeholder="Enter substring"
                                onChange={(e) =>
                                    setLocalField((prev) => ({
                                        ...prev,
                                        data: { ...prev.data, value: e.target.value },
                                    }))
                                }
                            />
                            {errors.value && <FormErrorMessage>{errors.value}</FormErrorMessage>}
                        </FormControl>
                    );
                default:
                    return null;
            }
        };

        return (
            <>
                <FormControl isInvalid={!!errors.fieldName}>
                    <FormLabel>Field Name</FormLabel>
                    <AutocompleteInput
                        value={localField.name}
                        onChange={(value) => {
                            setLocalField((prev) => ({ ...prev, name: value }));
                            if (value.trim()) {
                                setErrors((prev) => ({ ...prev, fieldName: undefined }));
                            }
                        }}
                        placeholder="Enter field name"
                        validFields={validFields}
                        size="sm"
                    />
                    {errors.fieldName && <FormErrorMessage>{errors.fieldName}</FormErrorMessage>}
                </FormControl>
                <HStack spacing={4} mt={4}>
                    <FormControl>
                        <FormLabel>Data Type</FormLabel>
                        <Select size="sm" value={localField.data.dataType} onChange={handleDataTypeChange}>
                            {(['number', 'string', 'list', 'raw_json'] as BaseDataType[]).map((dt) => (
                                <option key={dt} value={dt}>
                                    {dt === 'raw_json' ? 'Raw JSON' : dt.charAt(0).toUpperCase() + dt.slice(1)}
                                </option>
                            ))}
                        </Select>
                    </FormControl>
                    {localField.data.dataType === 'list' && (
                        <FormControl>
                            <FormLabel>List Type</FormLabel>
                            <Select size="sm" value={localField.data.listSubType || 'string'} onChange={handleListSubTypeChange}>
                                <option value="string">String List</option>
                                <option value="number">Number List</option>
                            </Select>
                        </FormControl>
                    )}
                    <FormControl>
                        <FormLabel>Constraint</FormLabel>
                        <Select size="sm" value={localField.data.constraintType} onChange={handleConstraintChange}>
                            {allowedConstraints(localField.data.dataType).map((ct) => (
                                <option key={ct} value={ct}>
                                    {ct}
                                </option>
                            ))}
                        </Select>
                    </FormControl>
                </HStack>
                <FormControl mt={4}>
                    <FormLabel>Value</FormLabel>
                    {renderValueInput()}
                </FormControl>
            </>
        );
    };

    // Render series mode form.
    // The Series Name appears above the tabs.
    // Replace the entire renderSeriesForm function with this simpler version:
    const renderSeriesForm = () => {
        const seriesName = localRow['Series']?.value || '';
        const fieldKeys = Object.keys(localRow).filter((key) => key !== 'Series');

        return (
            <>
                <FormControl mb={4} isInvalid={!!errorsRow['Series']?.value}>
                    <FormLabel>Series Name</FormLabel>
                    <ChakraInput
                        size="sm"
                        value={seriesName}
                        placeholder="Enter series name"
                        onChange={(e) =>
                            setLocalRow((prev) => ({
                                ...prev,
                                Series: { ...prev['Series'], value: e.target.value },
                            }))
                        }
                    />
                    {errorsRow['Series']?.value && <FormErrorMessage>{errorsRow['Series'].value}</FormErrorMessage>}
                </FormControl>

                {fieldKeys.map((fieldKey) => {
                    const field = localRow[fieldKey];
                    const currentData = field || { constraintType: 'value', value: '', dataType: 'string' };
                    const isNumber = currentData.dataType === 'number';
                    const fieldErrors = errorsRow[fieldKey];

                    return (
                        <Box key={fieldKey} mb={6} p={4} borderWidth="1px" borderRadius="md">
                            <FormLabel fontWeight="bold" mb={3}>
                                {fieldKey}
                            </FormLabel>

                            {/* Data Type and List Subtype Selection for Series Mode */}
                            <HStack spacing={4} mb={4}>
                                <FormControl>
                                    <FormLabel>Data Type</FormLabel>
                                    <Select 
                                        size="sm" 
                                        value={currentData.dataType || 'string'} 
                                        onChange={(e) => {
                                            const dt = e.target.value as BaseDataType;
                                            const newConstraint = allowedConstraints(dt)[0];
                                            setLocalRow((prev) => ({
                                                ...prev,
                                                [fieldKey]: {
                                                    ...prev[fieldKey],
                                                    dataType: dt,
                                                    constraintType: newConstraint,
                                                    value: '',
                                                    listSubType: dt === 'list' ? 'string' : undefined,
                                                },
                                            }));
                                        }}
                                    >
                                        {(['number', 'string', 'list', 'raw_json'] as BaseDataType[]).map((dt) => (
                                            <option key={dt} value={dt}>
                                                {dt === 'raw_json' ? 'Raw JSON' : dt.charAt(0).toUpperCase() + dt.slice(1)}
                                            </option>
                                        ))}
                                    </Select>
                                </FormControl>
                                {currentData.dataType === 'list' && (
                                    <FormControl>
                                        <FormLabel>List Type</FormLabel>
                                        <Select 
                                            size="sm" 
                                            value={currentData.listSubType || 'string'} 
                                            onChange={(e) => {
                                                const subType = e.target.value as ListSubType;
                                                setLocalRow((prev) => ({
                                                    ...prev,
                                                    [fieldKey]: {
                                                        ...prev[fieldKey],
                                                        listSubType: subType,
                                                        value: '',
                                                    },
                                                }));
                                            }}
                                        >
                                            <option value="string">String List</option>
                                            <option value="number">Number List</option>
                                        </Select>
                                    </FormControl>
                                )}
                            </HStack>

                            <FormControl mb={4}>
                                <FormLabel>Constraint</FormLabel>
                                <Select
                                    size="sm"
                                    value={currentData.constraintType}
                                    onChange={(e) => {
                                        const newConstraint = e.target.value as ConstraintType;
                                        setLocalRow((prev) => ({
                                            ...prev,
                                            [fieldKey]: {
                                                ...prev[fieldKey],
                                                constraintType: newConstraint,
                                            },
                                        }));
                                    }}
                                >
                                    {allowedConstraints(currentData.dataType || 'string').map((ct) => (
                                        <option key={ct} value={ct}>
                                            {ct}
                                        </option>
                                    ))}
                                </Select>
                            </FormControl>

                            {/* Value inputs based on constraint type */}
                            {currentData.constraintType === 'value' && (
                                <FormControl isInvalid={!!fieldErrors?.value}>
                                    <FormLabel>Value</FormLabel>
                                    {/* Handle Raw JSON type */}
                                    {currentData.dataType === 'raw_json' ? (
                                        <ChakraInput
                                            as="textarea"
                                            rows={4}
                                            size="sm"
                                            value={currentData.value || ''}
                                            placeholder='Enter JSON: 1, "hello", [1, "hello"], {"key": "value"}'
                                            onChange={(e) => {
                                                setLocalRow((prev) => ({
                                                    ...prev,
                                                    [fieldKey]: {
                                                        ...prev[fieldKey],
                                                        value: e.target.value,
                                                    },
                                                }));
                                            }}
                                            fontFamily="mono"
                                        />
                                    ) : currentData.dataType === 'list' ? (
                                        /* Handle List type with Tagify */
                                        <input
                                            ref={(el) => {
                                                if (el && !tagifySeriesRefs.current[fieldKey]) {
                                                    const tagify = new Tagify(el, { duplicates: true });
                                                    tagifySeriesRefs.current[fieldKey] = tagify;
                                                    
                                                    // Set initial tags
                                                    const initialTags = currentData.value
                                                        ? currentData.value
                                                              .split(',')
                                                              .map((t) => t.trim())
                                                              .filter(Boolean)
                                                        : [];
                                                    tagify.addTags(initialTags);
                                                    
                                                    // Listen for changes
                                                    tagify.on('change', () => {
                                                        const tags = tagify.value.map((tag) => tag.value) || [];
                                                        setLocalRow((prev) => ({
                                                            ...prev,
                                                            [fieldKey]: {
                                                                ...prev[fieldKey],
                                                                value: tags.join(', '),
                                                            },
                                                        }));
                                                    });
                                                }
                                            }}
                                            placeholder={`Enter comma separated ${currentData.listSubType || 'string'} values`}
                                            style={{
                                                width: '100%',
                                                padding: '0.5rem',
                                                fontSize: '0.875rem',
                                                borderRadius: '0.375rem',
                                                border: '1px solid #E2E8F0',
                                            }}
                                        />
                                    ) : (
                                        /* Handle regular string/number types */
                                        <ChakraInput
                                            size="sm"
                                            type={isNumber ? 'number' : 'text'}
                                            value={currentData.value || ''}
                                            placeholder="Enter value"
                                            onChange={(e) => {
                                                setLocalRow((prev) => ({
                                                    ...prev,
                                                    [fieldKey]: {
                                                        ...prev[fieldKey],
                                                        value: e.target.value,
                                                    },
                                                }));
                                            }}
                                            onKeyDown={isNumber ? handleNumericKeyDown : undefined}
                                            onPaste={isNumber ? handleNumericPaste : undefined}
                                        />
                                    )}
                                    {fieldErrors?.value && <FormErrorMessage>{fieldErrors.value}</FormErrorMessage>}
                                </FormControl>
                            )}

                            {currentData.constraintType === 'range' && (
                                <HStack spacing={2}>
                                    <FormControl isInvalid={!!fieldErrors?.minValue}>
                                        <FormLabel>Min Value</FormLabel>
                                        <ChakraInput
                                            size="sm"
                                            type={isNumber ? 'number' : 'text'}
                                            value={currentData.minValue || ''}
                                            placeholder="Min"
                                            onChange={(e) => {
                                                setLocalRow((prev) => ({
                                                    ...prev,
                                                    [fieldKey]: {
                                                        ...prev[fieldKey],
                                                        minValue: e.target.value,
                                                    },
                                                }));
                                            }}
                                        />
                                        {fieldErrors?.minValue && (
                                            <FormErrorMessage>{fieldErrors.minValue}</FormErrorMessage>
                                        )}
                                    </FormControl>
                                    <FormControl isInvalid={!!fieldErrors?.maxValue}>
                                        <FormLabel>Max Value</FormLabel>
                                        <ChakraInput
                                            size="sm"
                                            type={isNumber ? 'number' : 'text'}
                                            value={currentData.maxValue || ''}
                                            placeholder="Max"
                                            onChange={(e) => {
                                                setLocalRow((prev) => ({
                                                    ...prev,
                                                    [fieldKey]: {
                                                        ...prev[fieldKey],
                                                        maxValue: e.target.value,
                                                    },
                                                }));
                                            }}
                                        />
                                        {fieldErrors?.maxValue && (
                                            <FormErrorMessage>{fieldErrors.maxValue}</FormErrorMessage>
                                        )}
                                    </FormControl>
                                </HStack>
                            )}

                            {currentData.constraintType === 'value+tolerance' && (
                                <HStack spacing={2}>
                                    <FormControl isInvalid={!!fieldErrors?.value}>
                                        <FormLabel>Value</FormLabel>
                                        <ChakraInput
                                            size="sm"
                                            type={isNumber ? 'number' : 'text'}
                                            value={currentData.value || ''}
                                            placeholder="Enter value"
                                            onChange={(e) => {
                                                setLocalRow((prev) => ({
                                                    ...prev,
                                                    [fieldKey]: {
                                                        ...prev[fieldKey],
                                                        value: e.target.value,
                                                    },
                                                }));
                                            }}
                                        />
                                        {fieldErrors?.value && <FormErrorMessage>{fieldErrors.value}</FormErrorMessage>}
                                    </FormControl>
                                    <FormControl isInvalid={!!fieldErrors?.tolerance}>
                                        <FormLabel>Tolerance</FormLabel>
                                        <ChakraInput
                                            size="sm"
                                            type={isNumber ? 'number' : 'text'}
                                            value={currentData.tolerance || ''}
                                            placeholder="Tolerance"
                                            onChange={(e) => {
                                                setLocalRow((prev) => ({
                                                    ...prev,
                                                    [fieldKey]: {
                                                        ...prev[fieldKey],
                                                        tolerance: e.target.value,
                                                    },
                                                }));
                                            }}
                                        />
                                        {fieldErrors?.tolerance && (
                                            <FormErrorMessage>{fieldErrors.tolerance}</FormErrorMessage>
                                        )}
                                    </FormControl>
                                </HStack>
                            )}

                            {currentData.constraintType === 'contains' && (
                                <FormControl isInvalid={!!fieldErrors?.value}>
                                    <FormLabel>Contains</FormLabel>
                                    <ChakraInput
                                        size="sm"
                                        value={currentData.value || ''}
                                        placeholder="Enter substring"
                                        onChange={(e) => {
                                            setLocalRow((prev) => ({
                                                ...prev,
                                                [fieldKey]: {
                                                    ...prev[fieldKey],
                                                    value: e.target.value,
                                                },
                                            }));
                                        }}
                                    />
                                    {fieldErrors?.value && <FormErrorMessage>{fieldErrors.value}</FormErrorMessage>}
                                </FormControl>
                            )}
                        </Box>
                    );
                })}
            </>
        );
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} size="md">
            <ModalOverlay />
            <ModalContent>
                <ModalHeader>{isSeries ? 'Edit Series Row' : 'Edit Constant Field'}</ModalHeader>
                <ModalCloseButton />
                <ModalBody>{isSeries ? renderSeriesForm() : renderConstantForm()}</ModalBody>
                <ModalFooter>
                    <Button size="sm" onClick={handleSave} colorScheme="blue">
                        Save
                    </Button>
                </ModalFooter>
            </ModalContent>
        </Modal>
    );
};

export default EditConstantModal;
