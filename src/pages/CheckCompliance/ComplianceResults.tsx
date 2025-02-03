import React from 'react';
import {
    Box,
    Heading,
    Text,
    Button,
    VStack,
    Collapse,
    HStack,
    IconButton,
    Code,
    Badge,
    useClipboard,
} from '@chakra-ui/react';
import { ChevronDownIcon, ChevronUpIcon, CheckCircleIcon, WarningIcon, CopyIcon } from '@chakra-ui/icons';

const ComplianceResults = ({ onNext }) => {
    const results = {
        status: 'Partially Compliant',
        errors: [
            {
                field: 'InstitutionName',
                expected: 'Medical Center',
                actual: 'General Hospital',
                description: "The DICOM field 'InstitutionName' does not match the expected value.",
            },
            {
                field: 'StudyDate',
                expected: '2023-01-01',
                actual: '2023-05-20',
                description: "The DICOM field 'StudyDate' differs from the expected template value.",
            },
        ],
        compliantFields: [
            {
                field: 'PatientID',
                value: '12345',
                description: "The DICOM field 'PatientID' matches the expected value.",
            },
            {
                field: 'Modality',
                value: 'MRI',
                description: "The DICOM field 'Modality' matches the expected value.",
            },
        ],
        checkedDICOMS: 2031,
    };

    const [expandedErrors, setExpandedErrors] = React.useState([]);
    const [expandedCompliant, setExpandedCompliant] = React.useState([]);

    const toggleExpand = (index, type) => {
        if (type === 'error') {
            setExpandedErrors((prev) => (prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]));
        } else if (type === 'compliant') {
            setExpandedCompliant((prev) => (prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]));
        }
    };

    const certificationLevel = results.errors.length === 0 ? 'Gold' : results.errors.length <= 2 ? 'Silver' : 'Bronze';
    const issueCount = results.errors.length;
    const statusColor = issueCount === 0 ? 'green.100' : 'red.100';
    const statusIcon = issueCount === 0 ? <CheckCircleIcon color="green.500" /> : <WarningIcon color="red.500" />;
    const { hasCopied, onCopy } = useClipboard(JSON.stringify(results, null, 2));

    return (
        <Box p={8}>
            {/* Certificate Summary */}
            <Box p={4} borderWidth="1px" borderRadius="md" bg={statusColor} mb={6}>
                <Heading as="h3" size="md" mb={2}>
                    Data Certificate
                </Heading>
                <Text fontSize="sm">Template name: 'QSM'</Text>
                <HStack mt={2}>
                    {statusIcon}
                    <Text fontSize="sm" fontWeight="bold">
                        {issueCount === 0 ? '0 issues found' : `${issueCount} issues found`}
                    </Text>
                </HStack>
                <Text fontSize="sm" mt={2}>
                    Certification level:{' '}
                    <Badge
                        colorScheme={
                            certificationLevel === 'Gold'
                                ? 'yellow'
                                : certificationLevel === 'Silver'
                                  ? 'gray'
                                  : 'orange'
                        }
                    >
                        {certificationLevel}
                    </Badge>
                </Text>
                <Text fontSize="sm" mt={2}>
                    Checked {results.checkedDICOMS} DICOMs
                </Text>
                <Button colorScheme="blue" size="sm" mt={3}>
                    Download Certificate
                </Button>
            </Box>

            {/* Errors Section */}
            <Box
                p={4}
                borderWidth="1px"
                borderRadius="md"
                bg="red.50"
                overflow="auto"
                maxHeight="300px"
                minWidth="100vh"
                mb={6}
            >
                <Heading as="h3" size="sm" color="red.500" mb={4}>
                    Errors
                </Heading>
                {results.errors.map((error, index) => (
                    <Box key={index} mb={4}>
                        <HStack justify="space-between" align="center">
                            <Text fontSize="xs" fontWeight="bold">
                                {error.field}
                            </Text>
                            <IconButton
                                icon={expandedErrors.includes(index) ? <ChevronUpIcon /> : <ChevronDownIcon />}
                                size="sm"
                                onClick={() => toggleExpand(index, 'error')}
                                aria-label="Toggle error details"
                            />
                        </HStack>
                        <Collapse in={expandedErrors.includes(index)} animateOpacity>
                            <Box mt={2} pl={4}>
                                <Text fontSize="xs">
                                    <strong>Expected:</strong> {error.expected}
                                </Text>
                                <Text fontSize="xs">
                                    <strong>Actual:</strong> {error.actual}
                                </Text>
                                <Text fontSize="xs">{error.description}</Text>
                            </Box>
                        </Collapse>
                    </Box>
                ))}
            </Box>

            {/* Compliant Fields Section */}
            <Box p={4} borderWidth="1px" borderRadius="md" bg="green.50" overflow="auto" maxHeight="300px">
                <Heading as="h3" size="sm" color="green.500" mb={4}>
                    Compliant Fields
                </Heading>
                {results.compliantFields.map((field, index) => (
                    <Box key={index} mb={4}>
                        <HStack justify="space-between" align="center">
                            <Text fontSize="xs" fontWeight="bold">
                                {field.field}
                            </Text>
                            <IconButton
                                icon={expandedCompliant.includes(index) ? <ChevronUpIcon /> : <ChevronDownIcon />}
                                size="sm"
                                onClick={() => toggleExpand(index, 'compliant')}
                                aria-label="Toggle compliant field details"
                            />
                        </HStack>
                        <Collapse in={expandedCompliant.includes(index)} animateOpacity>
                            <Box mt={2} pl={4}>
                                <Text fontSize="xs">
                                    <strong>Value:</strong> {field.value}
                                </Text>
                                <Text fontSize="xs">{field.description}</Text>
                            </Box>
                        </Collapse>
                    </Box>
                ))}
            </Box>

            <Box p={4} borderWidth="1px" borderRadius="md" bg="gray.50" overflow="auto" maxHeight="300px" mb={6}>
                <HStack justify="space-between">
                    <Heading as="h3" size="sm">
                        JSON Data
                    </Heading>
                    <Button leftIcon={<CopyIcon />} size="sm" onClick={onCopy}>
                        {hasCopied ? 'Copied' : 'Copy JSON'}
                    </Button>
                </HStack>
                <Code
                    as="pre"
                    fontSize="sm"
                    bg="gray.100"
                    p={2}
                    borderRadius="md"
                    whiteSpace="pre-wrap"
                    wordBreak="break-word"
                >
                    {JSON.stringify(results, null, 2)}
                </Code>
            </Box>
            <Button colorScheme="green" onClick={onNext} mt={4}>
                Generate Signed Report
            </Button>
        </Box>
    );
};

export default ComplianceResults;
