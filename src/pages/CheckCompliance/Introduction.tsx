import React, { useEffect } from 'react';
import { Box, Text, VStack, Flex, Icon } from '@chakra-ui/react';
import { FiUpload, FiSettings, FiCheckCircle } from 'react-icons/fi';

interface IntroductionProps {
    setIsNextDisabled?: React.Dispatch<React.SetStateAction<boolean>>;
}

const Introduction: React.FC<IntroductionProps> = ({ setIsNextDisabled }) => {
    useEffect(() => {
        if (setIsNextDisabled) {
            setIsNextDisabled(false);
        }
    }, [setIsNextDisabled]);

    return (
        <Box p={8}>
            <Text fontSize="md" mb={6}>
                This module allows you to check an MRI scanning session for compliance with a selected template. Follow the
                steps below to upload files, configure settings, and review results.
            </Text>

            <VStack spacing={6} mt={100}>
                <Flex justify="space-around" w="100%">
                    <Box textAlign="center">
                        <Icon as={FiUpload} w={20} h={20} color="teal.500" mb={2} />
                        <Text fontSize="lg" fontWeight="bold">
                            Upload Files
                        </Text>
                        <Text fontSize="sm">Add your DICOM files for validation</Text>
                    </Box>
                    <Box textAlign="center">
                        <Icon as={FiSettings} w={20} h={20} color="teal.500" mb={2} />
                        <Text fontSize="lg" fontWeight="bold">
                            Configure
                        </Text>
                        <Text fontSize="sm">Upload or select a configuration</Text>
                    </Box>
                    <Box textAlign="center">
                        <Icon as={FiCheckCircle} w={20} h={20} color="teal.500" mb={2} />
                        <Text fontSize="lg" fontWeight="bold">
                            Review Results
                        </Text>
                        <Text fontSize="sm">Check the compliance summary</Text>
                    </Box>
                </Flex>
            </VStack>
        </Box>
    );
};

export default Introduction;
