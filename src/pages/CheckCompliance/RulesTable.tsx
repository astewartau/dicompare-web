// RulesTable.tsx
import React from 'react';
import { Box, Text, Tooltip } from '@chakra-ui/react';
import { CheckCircleIcon, WarningIcon } from '@chakra-ui/icons';
import { FieldCompliance } from './types';

interface RulesTableProps {
    rules: Array<{ rule_name?: string; name?: string; message: string }>;
    complianceMap: Record<string, FieldCompliance>;
    schemaId?: string; // Schema ID for compliance lookup
}

const RulesTable: React.FC<RulesTableProps> = ({ rules, complianceMap, schemaId }) => {
    // Function to get compliance status with ID support
    const getComplianceStatus = (ruleName: string) => {
        // Include the schema ID in the key if available
        const key = schemaId ? `${ruleName}#${schemaId}` : ruleName;
        console.log('RulesTable looking up key:', key, 'Available keys:', Object.keys(complianceMap));
        return complianceMap[key] || { status: 'warning', message: '' };
    };

    return (
        <Box width="100%" mb={4}>
            <Text fontWeight="medium" mb={2}>
                Validation Rules
            </Text>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                    <tr>
                        <th style={{ padding: '4px', textAlign: 'left' }}>Rule Name</th>
                        <th style={{ padding: '4px', textAlign: 'left' }}>Description</th>
                        <th style={{ padding: '4px', textAlign: 'center' }}>Status</th>
                    </tr>
                </thead>
                <tbody>
                    {rules.map((rule) => {
                        const ruleName = rule.rule_name || rule.name || '';
                        const comp = getComplianceStatus(ruleName);
                        const icon =
                            comp.status === 'ok' ? (
                                <CheckCircleIcon color="green.500" />
                            ) : (
                                <WarningIcon color="red.500" />
                            );
                        return (
                            <tr key={ruleName}>
                                <td style={{ padding: '4px' }}>{ruleName}</td>
                                <td style={{ padding: '4px' }}>{rule.message}</td>
                                <td style={{ padding: '4px', textAlign: 'center' }}>
                                    <Tooltip label={comp.message || (comp.status === 'ok' ? 'OK' : 'Failed')}>
                                        {icon}
                                    </Tooltip>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </Box>
    );
};

export default RulesTable;
