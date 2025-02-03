import React, { useState } from 'react';
import {
    Box,
    Heading,
    Text,
    Input,
    Button,
    VStack,
    IconButton,
    Table,
    Thead,
    Tbody,
    Tr,
    Th,
    Td,
    Spinner,
} from '@chakra-ui/react';
import { CloseIcon } from '@chakra-ui/icons';

const UploadFiles = ({ onNext }) => {
    const [files, setFiles] = useState([]);
    const [isLoading, setIsLoading] = useState(false);

    const handleFileUpload = (event) => {
        const uploadedFiles = Array.from(event.target.files);
        setIsLoading(true);

        // Simulate a 3-second upload process
        setTimeout(() => {
            setFiles((prevFiles) => [...prevFiles, ...uploadedFiles]);
            setIsLoading(false);
        }, 3000);
    };

    const handleFileRemove = (index) => {
        setFiles((prevFiles) => prevFiles.filter((_, i) => i !== index));
    };

    return (
        <Box p={8}>
            <Heading as="h2" size="md" mb={4}>
                Upload DICOM Files
            </Heading>
            <Text fontSize="sm" mb={4}>
                Please upload the DICOM files from the MRI scanning session for compliance checking.
            </Text>
            <Input type="file" multiple mb={4} onChange={handleFileUpload} isDisabled={isLoading} />

            {/* Fake Loading State */}
            {isLoading && (
                <VStack spacing={4} mb={4}>
                    <Spinner size="lg" color="teal.500" />
                    <Text>Uploading files, please wait...</Text>
                </VStack>
            )}

            {/* File List */}
            {!isLoading && files.length > 0 && (
                <Box p={4} borderWidth="1px" borderRadius="md" bg="gray.50" maxHeight="500px" overflowY="auto" mb={4}>
                    <Text fontWeight="bold" mb={4}>
                        Uploaded Files:
                    </Text>
                    <Table variant="simple" size="sm">
                        <Thead>
                            <Tr>
                                <Th>Filename</Th>
                                <Th isNumeric>Size (KB)</Th>
                                <Th>Actions</Th>
                            </Tr>
                        </Thead>
                        <Tbody>
                            {files.map((file, index) => (
                                <Tr key={index}>
                                    <Td>{file.name}</Td>
                                    <Td isNumeric>{(file.size / 1024).toFixed(2)}</Td>
                                    <Td>
                                        <IconButton
                                            aria-label="Remove file"
                                            icon={<CloseIcon />}
                                            size="sm"
                                            colorScheme="red"
                                            onClick={() => handleFileRemove(index)}
                                        />
                                    </Td>
                                </Tr>
                            ))}
                        </Tbody>
                    </Table>
                </Box>
            )}

            <VStack spacing={4}>
                <Button colorScheme="teal" onClick={onNext} isDisabled={isLoading || files.length === 0}>
                    Next
                </Button>
            </VStack>
        </Box>
    );
};

export default UploadFiles;
