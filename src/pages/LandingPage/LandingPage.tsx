import { Box, Heading, Text, Flex, VStack, Button, HStack, Icon, Image } from '@chakra-ui/react';
import { useNavigate } from 'react-router-dom';
import { CheckCircleIcon, EditIcon } from '@chakra-ui/icons';
import CertificateList from './CertificateList';

const LandingPage = () => {
    const navigate = useNavigate();

    return (
        <Box>
            {/* Header Section */}
            <Flex justify="space-between" align="center" padding="1rem 2rem" bg="teal.500" color="white" boxShadow="md">
                <Heading as="h1" size="xl">
                    dicompare
                </Heading>
            </Flex>

            {/* Introductory Section */}
            <Flex
                direction={{ base: 'column', md: 'row' }}
                padding="2.5rem 2rem"
                bgGradient="linear(to-r, teal.500, teal.300)"
                color="white"
                align="center"
            >
                <Box flex="2">
                    <VStack align="start" spacing={4} marginRight={20}>
                        <Text fontSize="5xl" as="b">
                            Empowering imaging research with privacy-first data validation
                        </Text>
                        <Text fontSize="lg" mr={20}>
                            DICOMpare streamlines medical imaging research by providing tools to generate standardized
                            DICOM templates and validate data compliance. Our privacy-first approach ensures your
                            sensitive medical data never leaves your environment while maintaining the highest standards
                            for data quality and protocol adherence across multi-site studies.
                        </Text>
                    </VStack>
                </Box>
                <Box flex="0.8">
                    <Image
                        src="../assets/ct-scan.png"
                        alt="MRI Visualization"
                        borderRadius="md"
                        boxShadow="lg"
                        maxW="300px"
                        w="100%"
                    />
                </Box>
            </Flex>

            {/* Main Content */}
            <Flex direction="column" align="center" justify="center" padding="4rem 2rem" bg="gray.100">
                <HStack spacing={8}>
                    {/* Option 1: Generate Template */}
                    <VStack
                        spacing={4}
                        padding="2rem"
                        bg="white"
                        borderRadius="md"
                        boxShadow="lg"
                        align="center"
                        onClick={() => navigate('/generate-template')}
                        _hover={{ transform: 'scale(1.05)', transition: '0.3s' }}
                        cursor="pointer"
                    >
                        <Icon as={EditIcon} w={12} h={12} color="teal.500" />
                        <Heading as="h3" size="md" textAlign="center" color="teal.600">
                            Generate Template
                        </Heading>
                        <Text fontSize="sm" color="gray.500" textAlign="center">
                            Create a new DICOM template quickly and efficiently.
                        </Text>
                        <Button colorScheme="teal" size="sm">
                            Choose
                        </Button>
                    </VStack>

                    {/* Option 2: Check Compliance */}
                    <VStack
                        spacing={4}
                        padding="2rem"
                        bg="white"
                        borderRadius="md"
                        boxShadow="lg"
                        align="center"
                        onClick={() => navigate('/check-compliance')}
                        _hover={{ transform: 'scale(1.05)', transition: '0.3s' }}
                        cursor="pointer"
                    >
                        <Icon as={CheckCircleIcon} w={12} h={12} color="teal.500" />
                        <Heading as="h3" size="md" textAlign="center" color="teal.600">
                            Check Compliance
                        </Heading>
                        <Text fontSize="sm" color="gray.500" textAlign="center">
                            Validate your DICOM files to ensure compliance with standards.
                        </Text>
                        <Button colorScheme="teal" size="sm">
                            Choose
                        </Button>
                    </VStack>
                </HStack>
            </Flex>
            <CertificateList />
        </Box>
    );
};

export default LandingPage;
