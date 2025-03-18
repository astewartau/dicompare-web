import { useState } from 'react';
import { Box, Heading, Text, Input, VStack, HStack, Badge, Button, Collapse, IconButton, Link } from '@chakra-ui/react';
import { ChevronDownIcon, ChevronUpIcon } from '@chakra-ui/icons';

const certificates = [
    {
        title: 'Brain MRI Study Compliance',
        description: 'Compliance report for MRI brain scan records.',
        author: 'Dr. John Smith',
        level: 'Gold',
        dateAdded: '2024-01-10',
        dateModified: '2024-02-05',
        from: 'Mayo Clinic',
        link: 'https://example.com/brain-mri-report',
    },
    {
        title: 'Spinal MRI Quality Check',
        description: 'Audit report for spinal MRI scan quality and compliance.',
        author: 'Dr. Jane Doe',
        level: 'Silver',
        dateAdded: '2024-02-01',
        dateModified: '2024-02-10',
        from: 'Cleveland Clinic',
        link: 'https://example.com/spinal-mri-audit',
    },
    {
        title: 'Cardiac MRI Metadata Integrity',
        description: 'Verification of cardiac MRI scan metadata accuracy.',
        author: 'Dr. Alan Turing',
        level: 'Bronze',
        dateAdded: '2024-01-15',
        dateModified: '2024-02-07',
        from: 'Johns Hopkins Hospital',
        link: 'https://example.com/cardiac-mri-integrity',
    },
    {
        title: 'Abdominal MRI Data Compliance',
        description: 'Compliance check for abdominal MRI scan datasets.',
        author: 'Dr. Emily Watson',
        level: 'Gold',
        dateAdded: '2024-02-05',
        dateModified: '2024-02-12',
        from: 'Massachusetts General Hospital',
        link: 'https://example.com/abdominal-mri-compliance',
    },
];

const CertificateList = () => {
    const [searchTerm, setSearchTerm] = useState('');
    const [expanded, setExpanded] = useState<number | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const certificatesPerPage = 2;

    const filteredCertificates = certificates.filter((cert) =>
        cert.title.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const indexOfLastCertificate = currentPage * certificatesPerPage;
    const indexOfFirstCertificate = indexOfLastCertificate - certificatesPerPage;
    const currentCertificates = filteredCertificates.slice(indexOfFirstCertificate, indexOfLastCertificate);

    const totalPages = Math.ceil(filteredCertificates.length / certificatesPerPage);

    return (
        <Box p={6}>
            <Heading as="h2" size="md" mb={4}>
                Public Certificates
            </Heading>
            <Input
                placeholder="Search certificates..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                mb={4}
            />
            <VStack spacing={4} align="stretch">
                {currentCertificates.map((cert, index) => (
                    <Box key={index} p={4} borderWidth="1px" borderRadius="md" bg="gray.50">
                        <HStack justify="space-between">
                            <Box>
                                <Heading as="h3" size="sm">
                                    <Link href={cert.link} isExternal color="blue.500">
                                        {cert.title}{' '}
                                        <Badge
                                            colorScheme={
                                                cert.level === 'Gold'
                                                    ? 'yellow'
                                                    : cert.level === 'Silver'
                                                      ? 'gray'
                                                      : 'orange'
                                            }
                                        >
                                            {cert.level}
                                        </Badge>
                                    </Link>
                                </Heading>
                                <Text fontSize="sm">Author: {cert.author}</Text>
                                <Text fontSize="sm">From: {cert.from}</Text>
                                <Text fontSize="xs">Date Added: {cert.dateAdded}</Text>
                                <Text fontSize="xs">Date Modified: {cert.dateModified}</Text>
                            </Box>
                            <IconButton
                                icon={expanded === index ? <ChevronUpIcon /> : <ChevronDownIcon />}
                                size="sm"
                                onClick={() => setExpanded(expanded === index ? null : index)}
                                aria-label="Toggle details"
                            />
                        </HStack>
                        <Collapse in={expanded === index} animateOpacity>
                            <Box mt={2} p={2} bg="white" borderRadius="md">
                                <Text fontSize="sm">{cert.description}</Text>
                            </Box>
                        </Collapse>
                    </Box>
                ))}
            </VStack>
            <HStack mt={4} justify="center">
                <Button
                    size="sm"
                    onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                    isDisabled={currentPage === 1}
                >
                    Previous
                </Button>
                <Text fontSize="sm">
                    Page {currentPage} of {totalPages}
                </Text>
                <Button
                    size="sm"
                    onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                    isDisabled={currentPage === totalPages}
                >
                    Next
                </Button>
            </HStack>
        </Box>
    );
};

export default CertificateList;
