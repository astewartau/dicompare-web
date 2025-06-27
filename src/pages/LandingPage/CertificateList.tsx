import { useState } from 'react';
import { Box, Heading, Text, Input, VStack, HStack, Badge, Button, Collapse, IconButton, Link } from '@chakra-ui/react';
import { ChevronDownIcon, ChevronUpIcon } from '@chakra-ui/icons';

const certificates = [
    {
        title: 'Brain MRI Study Compliance',
        description: 'Comprehensive compliance report for multi-site MRI brain scan records including metadata validation, image quality assessment, and protocol adherence across 150 subjects. This report demonstrates full compliance with FDA guidelines for clinical trials and includes detailed statistical analysis of acquisition parameters.',
        author: 'Dr. John Smith',
        dateAdded: '2024-01-10',
        dateModified: '2024-02-05',
        from: 'Mayo Clinic',
        link: 'https://example.com/brain-mri-report',
    },
    {
        title: 'Spinal MRI Quality Check',
        description: 'Comprehensive audit report for spinal MRI scan quality and compliance covering 200+ cases. Includes detailed analysis of T1, T2, and STIR sequences with validation of slice thickness, field strength consistency, and anatomical coverage. Report addresses common acquisition pitfalls and provides recommendations for protocol standardization.',
        author: 'Dr. Jane Doe',
        dateAdded: '2024-02-01',
        dateModified: '2024-02-10',
        from: 'Cleveland Clinic',
        link: 'https://example.com/spinal-mri-audit',
    },
    {
        title: 'Cardiac MRI Metadata Integrity',
        description: 'Detailed verification of cardiac MRI scan metadata accuracy for longitudinal cohort study. Validates patient demographics, scan parameters, contrast timing, and ECG gating information across 300 cardiac exams. Includes analysis of DICOM header consistency and recommendations for metadata standardization in multi-center studies.',
        author: 'Dr. Alan Turing',
        dateAdded: '2024-01-15',
        dateModified: '2024-02-07',
        from: 'Johns Hopkins Hospital',
        link: 'https://example.com/cardiac-mri-integrity',
    },
    {
        title: 'Abdominal MRI Data Compliance',
        description: 'Extensive compliance check for abdominal MRI scan datasets in oncology research. Covers validation of contrast protocols, acquisition timing, and anatomical coverage for liver, pancreas, and kidney imaging. Report includes quality metrics for 180 patient studies and demonstrates adherence to international imaging standards for cancer research.',
        author: 'Dr. Emily Watson',
        dateAdded: '2024-02-05',
        dateModified: '2024-02-12',
        from: 'Massachusetts General Hospital',
        link: 'https://example.com/abdominal-mri-compliance',
    },
    {
        title: 'Pediatric MRI Protocol Validation',
        description: 'Specialized validation report for pediatric MRI protocols addressing age-specific imaging requirements and safety considerations. Covers sedation protocols, scan duration optimization, and image quality assessment for patients aged 2-16 years across neurological and musculoskeletal applications.',
        author: 'Dr. Sarah Chen',
        dateAdded: '2024-03-01',
        dateModified: '2024-03-15',
        from: 'Boston Children\'s Hospital',
        link: 'https://example.com/pediatric-mri-validation',
    },
    {
        title: 'Multi-Vendor MRI Harmonization Study',
        description: 'Cross-platform validation study examining DICOM compliance and image quality consistency across Siemens, GE, and Philips MRI systems. Includes analysis of phantom studies, human volunteer data, and protocol optimization strategies for ensuring data harmonization in multi-site research studies.',
        author: 'Dr. Michael Rodriguez',
        dateAdded: '2024-03-10',
        dateModified: '2024-03-20',
        from: 'Stanford University Medical Center',
        link: 'https://example.com/multi-vendor-harmonization',
    },
];

const CertificateList = () => {
    const [searchTerm, setSearchTerm] = useState('');
    const [expanded, setExpanded] = useState<number | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const certificatesPerPage = 4;

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
                Public data reports
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
                                        {cert.title}
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
