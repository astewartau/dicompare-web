// components/CollapsibleCard/EditConstantModal.tsx
import React, { useState, useEffect, useRef } from 'react';
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
    Select,
    VStack,
    HStack,
    Input as ChakraInput,
} from '@chakra-ui/react';
import Tagify from '@yaireo/tagify';
import '@yaireo/tagify/dist/tagify.css';
import { ConstantField, DataType, ConstraintType } from './types';

export const allowedConstraints = (dataType: DataType): ConstraintType[] => {
    return dataType === 'number' ? ['value', 'range', 'value+tolerance'] : ['value', 'contains'];
};

interface EditConstantModalProps {
    isOpen: boolean;
    onClose: () => void;
    constantField: ConstantField;
    onSave: (updatedField: ConstantField) => void;
}

const EditConstantModal: React.FC<EditConstantModalProps> = ({ isOpen, onClose, constantField, onSave }) => {
    const [localField, setLocalField] = useState<ConstantField>(constantField);
    const tagifyInputRef = useRef<HTMLInputElement>(null);
    const tagifyInstanceRef = useRef<Tagify | null>(null);

    useEffect(() => {
        setLocalField(constantField);
    }, [constantField]);

    // Initialize Tagify only when dataType is "list"
    useEffect(() => {
        if (localField.data.dataType === 'list' && tagifyInputRef.current) {
            // Destroy any previous instance to avoid duplicates
            if (tagifyInstanceRef.current) {
                tagifyInstanceRef.current.destroy();
            }
            tagifyInstanceRef.current = new Tagify(tagifyInputRef.current, {
                // Specify any Tagify options here if needed.
            });
            const initialTags = localField.data.value
                ? localField.data.value
                      .split(',')
                      .map((t) => t.trim())
                      .filter(Boolean)
                : [];
            tagifyInstanceRef.current.removeAllTags();
            tagifyInstanceRef.current.addTags(initialTags);

            tagifyInstanceRef.current.on('change', () => {
                const tags = tagifyInstanceRef.current?.value.map((tag) => tag.value) || [];
                // Update the underlying value as a comma-separated list
                handleValueChange(tags.join(', '));
            });
        }
        // Cleanup on unmount or when data type changes
        return () => {
            if (tagifyInstanceRef.current) {
                tagifyInstanceRef.current.destroy();
                tagifyInstanceRef.current = null;
            }
        };
        // Run this effect when data type or the value changes
    }, [localField.data.dataType, localField.data.value]);

    const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setLocalField((prev) => ({ ...prev, name: e.target.value }));
    };

    const handleDataTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const dt = e.target.value as DataType;
        const newConstraint = allowedConstraints(dt)[0];
        setLocalField((prev) => ({
            ...prev,
            data: { ...prev.data, dataType: dt, constraintType: newConstraint, value: '' },
        }));
    };

    const handleConstraintChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        setLocalField((prev) => ({
            ...prev,
            data: { ...prev.data, constraintType: e.target.value as ConstraintType },
        }));
    };

    const handleValueChange = (newVal: string) => {
        setLocalField((prev) => ({
            ...prev,
            data: { ...prev.data, value: newVal },
        }));
    };

    const handleMinChange = (newVal: string) => {
        setLocalField((prev) => ({
            ...prev,
            data: { ...prev.data, minValue: newVal },
        }));
    };

    const handleMaxChange = (newVal: string) => {
        setLocalField((prev) => ({
            ...prev,
            data: { ...prev.data, maxValue: newVal },
        }));
    };

    const handleToleranceChange = (newVal: string) => {
        setLocalField((prev) => ({
            ...prev,
            data: { ...prev.data, tolerance: newVal },
        }));
    };

    const renderValueInput = () => {
        const { data } = localField;
        switch (data.constraintType) {
            case 'value':
                if (data.dataType === 'list') {
                    // Use a plain HTML input for Tagify (styled similar to Chakra's Input)
                    return (
                        <input
                            ref={tagifyInputRef}
                            placeholder="Enter comma separated values"
                            style={{
                                width: '100%',
                                padding: '0.5rem',
                                fontSize: '0.875rem',
                                borderRadius: '0.375rem',
                                border: '1px solid #E2E8F0',
                            }}
                        />
                    );
                } else {
                    return (
                        <ChakraInput
                            size="sm"
                            value={data.value}
                            placeholder="Enter value"
                            onChange={(e) => handleValueChange(e.target.value)}
                        />
                    );
                }
            case 'range':
                return (
                    <HStack spacing={2}>
                        <ChakraInput
                            size="sm"
                            value={data.minValue || ''}
                            placeholder="Min"
                            onChange={(e) => handleMinChange(e.target.value)}
                        />
                        <ChakraInput
                            size="sm"
                            value={data.maxValue || ''}
                            placeholder="Max"
                            onChange={(e) => handleMaxChange(e.target.value)}
                        />
                    </HStack>
                );
            case 'value+tolerance':
                return (
                    <HStack spacing={2}>
                        <ChakraInput
                            size="sm"
                            value={data.value}
                            placeholder="Enter value"
                            onChange={(e) => handleValueChange(e.target.value)}
                        />
                        <ChakraInput
                            size="sm"
                            value={data.tolerance || ''}
                            placeholder="Tolerance"
                            onChange={(e) => handleToleranceChange(e.target.value)}
                        />
                    </HStack>
                );
            case 'contains':
                return (
                    <ChakraInput
                        size="sm"
                        value={data.value}
                        placeholder="Enter substring"
                        onChange={(e) => handleValueChange(e.target.value)}
                    />
                );
            default:
                return null;
        }
    };

    const handleSave = () => {
        onSave(localField);
        onClose();
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} size="md">
            <ModalOverlay />
            <ModalContent>
                <ModalHeader>Edit Constant Field</ModalHeader>
                <ModalCloseButton />
                <ModalBody>
                    <VStack spacing={4} align="stretch">
                        <FormControl>
                            <FormLabel>Field Name</FormLabel>
                            <ChakraInput
                                size="sm"
                                value={localField.name}
                                onChange={handleNameChange}
                                placeholder="Field name"
                            />
                        </FormControl>
                        <HStack spacing={4}>
                            <FormControl>
                                <FormLabel>Data Type</FormLabel>
                                <Select size="sm" value={localField.data.dataType} onChange={handleDataTypeChange}>
                                    {(['number', 'string', 'list'] as DataType[]).map((dt) => (
                                        <option key={dt} value={dt}>
                                            {dt}
                                        </option>
                                    ))}
                                </Select>
                            </FormControl>
                            <FormControl>
                                <FormLabel>Constraint</FormLabel>
                                <Select
                                    size="sm"
                                    value={localField.data.constraintType}
                                    onChange={handleConstraintChange}
                                >
                                    {allowedConstraints(localField.data.dataType).map((ct) => (
                                        <option key={ct} value={ct}>
                                            {ct}
                                        </option>
                                    ))}
                                </Select>
                            </FormControl>
                        </HStack>
                        <FormControl>
                            <FormLabel>Value</FormLabel>
                            {renderValueInput()}
                        </FormControl>
                    </VStack>
                </ModalBody>
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
