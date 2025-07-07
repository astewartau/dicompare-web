// FieldsTable.tsx
import React from 'react';
import { Box, Tooltip } from '@chakra-ui/react';
import { CheckCircleIcon, WarningIcon } from '@chakra-ui/icons';
import { FieldCompliance } from './types';

interface FieldsTableProps {
    fields: Array<{ field: string; value?: any; tolerance?: number; contains?: any; minValue?: any; maxValue?: any }>;
    cardType: 'ref' | 'inp';
    complianceMap: Record<string, FieldCompliance>;
    schemaId?: string; // Schema ID for compliance lookup
}

const FieldsTable: React.FC<FieldsTableProps> = ({ fields, cardType, complianceMap, schemaId }) => {
    // Function to get compliance status with ID support
    const getComplianceStatus = (fieldName: string) => {
        if (cardType !== 'ref') return null;
        // Include the schema ID in the key if available
        const key = schemaId ? `${fieldName}#${schemaId}` : fieldName;
        console.log('FieldsTable looking up key:', key, 'Available keys:', Object.keys(complianceMap));
        return complianceMap[key];
    };

    // Helper function to format constraint display
    const formatConstraintDisplay = (field: { field: string; value?: any; tolerance?: number; contains?: any; minValue?: any; maxValue?: any }) => {
        // Check for contains constraint
        if (field.contains !== undefined) {
            return `Contains: "${field.contains}"`;
        }
        
        // Check for range constraint
        if (field.minValue !== undefined && field.maxValue !== undefined) {
            return `Range: ${field.minValue} - ${field.maxValue}`;
        }
        
        // Check for value with tolerance
        if (field.value !== undefined && field.tolerance !== undefined) {
            const formattedValue = Array.isArray(field.value) ? field.value.join(', ') : String(field.value);
            return `${formattedValue} ± ${field.tolerance}`;
        }
        
        // Regular value constraint
        if (field.value !== undefined) {
            if (Array.isArray(field.value)) {
                return field.value.join(', ');
            }
            if (typeof field.value === 'object' && field.value !== null && typeof field.value.join === 'function') {
                // Handle array-like objects that have a join method
                return Array.from(field.value).join(', ');
            }
            return String(field.value);
        }
        
        return '';
    };

    return (
        <Box width="100%" mb={2}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                    <tr>
                        <th style={{ borderBottom: '1px solid #ccc', padding: '4px', textAlign: 'left' }}>Field</th>
                        <th style={{ borderBottom: '1px solid #ccc', padding: '4px', textAlign: 'right' }}>Value</th>
                        {cardType === 'ref' && (
                            <th style={{ borderBottom: '1px solid #ccc', padding: '4px' }}>Compliance</th>
                        )}
                    </tr>
                </thead>
                <tbody>
                    {fields.map((fld, idx) => {
                        const compliance = getComplianceStatus(fld.field);
                        let icon = null;
                        if (cardType === 'ref' && compliance) {
                            icon =
                                compliance.status === 'ok' ? (
                                    <Tooltip label="OK">
                                        <CheckCircleIcon color="green.500" />
                                    </Tooltip>
                                ) : (
                                    <Tooltip label={compliance.message || 'Issue found'}>
                                        <WarningIcon color="red.500" />
                                    </Tooltip>
                                );
                        }
                        return (
                            <tr key={idx}>
                                <td style={{ borderBottom: '1px solid #eee', padding: '4px' }}>{fld.field}</td>
                                <td style={{ borderBottom: '1px solid #eee', padding: '4px', textAlign: 'right' }}>
                                    {formatConstraintDisplay(fld)}
                                </td>
                                {cardType === 'ref' && (
                                    <td style={{ borderBottom: '1px solid #eee', padding: '4px', textAlign: 'center' }}>
                                        {icon}
                                    </td>
                                )}
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </Box>
    );
};

export default FieldsTable;
