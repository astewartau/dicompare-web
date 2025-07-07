// ComplianceReport.tsx
import React, { useState, useMemo } from 'react';
import { Box, Text, VStack, Collapse, Button, Badge, Flex } from '@chakra-ui/react';
import { ChevronDownIcon, ChevronUpIcon, CheckCircleIcon, WarningIcon } from '@chakra-ui/icons';
import { FieldCompliance } from './types';

interface ComplianceReportProps {
    acquisitionName: string;
    acquisitionId?: string;
    complianceMap: Record<string, FieldCompliance>;
    overallCompliance: Record<string, { status: 'ok' | 'error'; message: string }>;
}

const ComplianceReport: React.FC<ComplianceReportProps> = ({
    acquisitionName,
    acquisitionId,
    complianceMap,
    overallCompliance,
}) => {
    const [isExpanded, setIsExpanded] = useState(false);

    // Get the overall status for this acquisition
    const overallKey = acquisitionId ? `${acquisitionName}#${acquisitionId}` : acquisitionName;
    const overallStatus = overallCompliance[overallKey];

    // Filter compliance results for this acquisition - only show issues (errors and warnings)
    const complianceResults = useMemo(() => {
        const results: Array<{
            key: string;
            name: string;
            status: 'ok' | 'error' | 'warning';
            message: string;
            type: 'field' | 'rule';
        }> = [];

        Object.entries(complianceMap).forEach(([key, compliance]) => {
            // Check if this compliance result belongs to this acquisition
            const keyMatch = acquisitionId
                ? key.startsWith(`${acquisitionName}#${acquisitionId}`) || key.endsWith(`#${acquisitionId}`)
                : key.startsWith(acquisitionName);

            // Only include errors and warnings, skip successful checks
            if (keyMatch && compliance.status !== 'ok') {
                console.log('ComplianceReport: Processing error key:', {
                    key,
                    acquisitionName,
                    acquisitionId,
                    status: compliance.status,
                    message: compliance.message
                });
                // Extract the rule/field name from the key
                let name = key;
                if (acquisitionId) {
                    // Remove the acquisition name and ID from the key
                    name = key
                        .replace(`${acquisitionName}#${acquisitionId}|`, '')
                        .replace(`${acquisitionName}#${acquisitionId}`, '')
                        .replace(`#${acquisitionId}`, '');
                } else {
                    name = key.replace(`${acquisitionName}|`, '').replace(acquisitionName, '');
                }

                // Clean up the name
                name = name.startsWith('|') ? name.substring(1) : name;
                
                // For series compliance keys, show just the field name (not series|field)
                if (name.includes('|')) {
                    const parts = name.split('|');
                    if (parts.length >= 2) {
                        // For series keys like "3|ImageType", show just "ImageType"
                        name = parts[parts.length - 1];
                    }
                }
                
                if (!name) name = key;

                results.push({
                    key,
                    name,
                    status: compliance.status,
                    message: compliance.message || 'No message',
                    type: key.includes('|') ? 'field' : 'rule',
                });
            }
        });

        // Sort results: errors first, then warnings
        return results.sort((a, b) => {
            if (a.status === 'error' && b.status !== 'error') return -1;
            if (b.status === 'error' && a.status !== 'error') return 1;
            return a.name.localeCompare(b.name);
        });
    }, [complianceMap, acquisitionName, acquisitionId]);

    // Count results by status
    const statusCounts = useMemo(() => {
        const counts = { ok: 0, error: 0, warning: 0 };
        complianceResults.forEach((result) => {
            counts[result.status]++;
        });
        return counts;
    }, [complianceResults]);

    // Don't render anything if there are no issues to display
    if (complianceResults.length === 0) {
        return null;
    }

    const getStatusIcon = (status: 'ok' | 'error' | 'warning') => {
        switch (status) {
            case 'ok':
                return <CheckCircleIcon color="green.500" />;
            case 'error':
                return <WarningIcon color="red.500" />;
            case 'warning':
                return <WarningIcon color="orange.500" />;
            default:
                return null;
        }
    };

    const getStatusColor = (status: 'ok' | 'error' | 'warning') => {
        switch (status) {
            case 'ok':
                return 'green';
            case 'error':
                return 'red';
            case 'warning':
                return 'orange';
            default:
                return 'gray';
        }
    };

    return (
        <Box borderTopWidth="1px" borderTopColor="gray.200">
            <Button
                variant="ghost"
                size="sm"
                width="100%"
                justifyContent="space-between"
                onClick={() => setIsExpanded(!isExpanded)}
                leftIcon={getStatusIcon(overallStatus?.status || 'error') || undefined}
                rightIcon={isExpanded ? <ChevronUpIcon /> : <ChevronDownIcon />}
                py={2}
                px={3}
            >
                <Flex alignItems="center" gap={2}>
                    <Text fontSize="sm" fontWeight="medium">
                        Error Summary
                    </Text>
                    {statusCounts.error > 0 && (
                        <Badge colorScheme="red" size="sm">
                            {statusCounts.error} error{statusCounts.error !== 1 ? 's' : ''}
                        </Badge>
                    )}
                    {statusCounts.warning > 0 && (
                        <Badge colorScheme="orange" size="sm">
                            {statusCounts.warning} warning{statusCounts.warning !== 1 ? 's' : ''}
                        </Badge>
                    )}
                </Flex>
            </Button>

            <Collapse in={isExpanded}>
                <Box p={3} bg="gray.25" maxH="300px" overflowY="auto">
                    <VStack spacing={2} align="stretch">
                        {complianceResults.map((result) => (
                            <Box
                                key={result.key}
                                p={2}
                                borderWidth="1px"
                                borderRadius="md"
                                borderColor={`${getStatusColor(result.status)}.200`}
                                bg={
                                    result.status === 'error'
                                        ? 'red.50'
                                        : result.status === 'warning'
                                          ? 'orange.50'
                                          : 'green.50'
                                }
                            >
                                <Flex alignItems="flex-start" gap={2}>
                                    {getStatusIcon(result.status)}
                                    <Box flex="1">
                                        <Text fontSize="sm" fontWeight="medium" mb={1}>
                                            {result.name}
                                        </Text>
                                        <Text fontSize="xs" color="gray.600">
                                            {result.message}
                                        </Text>
                                    </Box>
                                </Flex>
                            </Box>
                        ))}
                    </VStack>
                </Box>
            </Collapse>
        </Box>
    );
};

export default ComplianceReport;
