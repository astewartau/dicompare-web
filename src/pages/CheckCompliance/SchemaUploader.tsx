// SchemaUploader.tsx
import React from 'react';
import {
    Modal,
    ModalOverlay,
    ModalContent,
    ModalHeader,
    ModalFooter,
    ModalBody,
    ModalCloseButton,
    Button,
    Spinner,
    Text,
    Box,
} from '@chakra-ui/react';
import { SchemaFile } from './types';
import SchemaLibrary from './SchemaLibrary';

interface SchemaUploaderProps {
    isOpen: boolean;
    onClose: () => void;
    onSchemaLoad: (file: SchemaFile, acquisitionName?: string) => void;
    isLoading: boolean;
    schemaLibrary: SchemaFile[];
    onAddToLibrary: (schema: SchemaFile) => void;
    onRemoveFromLibrary: (schemaName: string) => void;
}

const SchemaUploader: React.FC<SchemaUploaderProps> = ({
    isOpen,
    onClose,
    onSchemaLoad,
    isLoading,
    schemaLibrary,
    onAddToLibrary,
    onRemoveFromLibrary,
}) => {
    const handleSelectSchema = (schema: SchemaFile, acquisitionName?: string) => {
        onSchemaLoad(schema, acquisitionName);
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} size="xl">
            <ModalOverlay />
            <ModalContent>
                <ModalHeader>Select Schema</ModalHeader>
                <ModalCloseButton />
                <ModalBody>
                    {isLoading ? (
                        <Box textAlign="center" py={8}>
                            <Spinner size="xl" color="teal.500" />
                            <Text mt={4}>Loading schema...</Text>
                        </Box>
                    ) : (
                        <SchemaLibrary
                            schemas={schemaLibrary}
                            onSelectSchema={handleSelectSchema}
                            onAddSchema={onAddToLibrary}
                            onDeleteSchema={onRemoveFromLibrary}
                        />
                    )}
                </ModalBody>
                <ModalFooter>
                    <Button colorScheme="gray" onClick={onClose}>
                        Cancel
                    </Button>
                </ModalFooter>
            </ModalContent>
        </Modal>
    );
};

export default SchemaUploader;
