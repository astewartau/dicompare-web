// AcquisitionSelector.tsx
import React from 'react';
import { Box, Text, Button, VStack, Heading, Divider, Badge, Flex, useColorModeValue } from '@chakra-ui/react';
import { AddIcon } from '@chakra-ui/icons';
import { SchemaFile } from './types';

interface AcquisitionSelectorProps {
    schema: SchemaFile;
    onSelectAcquisition: (schemaFile: SchemaFile, acquisitionName: string) => void;
    onBack: () => void;
}

const AcquisitionSelector: React.FC<AcquisitionSelectorProps> = ({ schema, onSelectAcquisition, onBack }) => {
    // Parse the schema to get acquisitions
    const schemaData = React.useMemo(() => {
        try {
            return JSON.parse(schema.content);
        } catch (e) {
            console.error('Failed to parse schema:', e);
            return { acquisitions: {} };
        }
    }, [schema.content]);

    const acquisitions = Object.keys(schemaData.acquisitions || {});
    const bgColor = useColorModeValue('gray.50', 'gray.700');
    const borderColor = useColorModeValue('gray.200', 'gray.600');

    if (acquisitions.length === 0) {
        return (
            <Box textAlign="center" p={6}>
                <Text mb={4}>No acquisitions found in this schema.</Text>
                <Button onClick={onBack} colorScheme="gray">
                    Back to Library
                </Button>
            </Box>
        );
    }

    return (
        <Box>
            <Heading size="md" mb={4}>
                Select an Acquisition from {schema.name}
            </Heading>

            {schemaData.description && (
                <Text mb={4} color="gray.600">
                    {schemaData.description}
                </Text>
            )}

            {schemaData.authors && schemaData.authors.length > 0 && (
                <Flex mb={4} gap={2} alignItems="center">
                    <Text fontWeight="medium">Authors:</Text>
                    {schemaData.authors.map((author: string, idx: number) => (
                        <Badge key={idx} colorScheme="blue">
                            {author}
                        </Badge>
                    ))}
                </Flex>
            )}

            <Divider my={4} />

            <VStack spacing={3} align="stretch">
                {acquisitions.map((acqName) => {
                    const acq = schemaData.acquisitions[acqName];
                    const fieldCount = acq.fields?.length || 0;
                    const seriesCount = acq.series?.length || 0;

                    return (
                        <Box
                            key={acqName}
                            p={4}
                            borderWidth="1px"
                            borderRadius="md"
                            borderColor={borderColor}
                            bg={bgColor}
                            _hover={{ bg: useColorModeValue('gray.100', 'gray.600') }}
                        >
                            <Flex justifyContent="space-between" alignItems="center">
                                <Box>
                                    <Text fontWeight="bold">{acqName}</Text>
                                    <Flex mt={1} gap={2}>
                                        <Badge colorScheme="purple">{fieldCount} fields</Badge>
                                        <Badge colorScheme="green">{seriesCount} series</Badge>
                                    </Flex>
                                </Box>
                                <Button
                                    colorScheme="teal"
                                    leftIcon={<AddIcon />}
                                    onClick={() => onSelectAcquisition(schema, acqName)}
                                >
                                    Select
                                </Button>
                            </Flex>
                        </Box>
                    );
                })}
            </VStack>

            <Box mt={6} textAlign="center">
                <Button onClick={onBack} colorScheme="gray">
                    Back to Library
                </Button>
            </Box>
        </Box>
    );
};

export default AcquisitionSelector;
