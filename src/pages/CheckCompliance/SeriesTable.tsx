// SeriesTable.tsx
import React from 'react';
import { Box, Tooltip } from '@chakra-ui/react';
import { CheckCircleIcon, WarningIcon } from '@chakra-ui/icons';
import { FieldCompliance } from './types';

interface SeriesTableProps {
    seriesArr: Array<{
        name: string;
        fields: Array<{ field: string; value?: any; tolerance?: number; contains?: any; minValue?: any; maxValue?: any }>;
    }>;
    cardType: 'ref' | 'inp';
    acqName: string;
    complianceMap: Record<string, FieldCompliance>;
    schemaId?: string; // Schema ID for compliance lookup
}

const SeriesTable: React.FC<SeriesTableProps> = ({ seriesArr, cardType, acqName, complianceMap, schemaId }) => {
    if (!seriesArr.length) return null;

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
            return `${Array.isArray(field.value) ? field.value.join(', ') : field.value} ± ${field.tolerance}`;
        }
        
        // Regular value constraint
        if (field.value !== undefined) {
            if (Array.isArray(field.value)) {
                return field.value.join(', ');
            }
            return String(field.value);
        }
        
        return '';
    };

    // Gather all field names
    const allFieldNames = Array.from(
        seriesArr.reduce((set, s) => {
            s.fields.forEach((f) => set.add(f.field));
            return set;
        }, new Set<string>())
    );

    // Function to get compliance status with ID support
    const getComplianceStatus = (seriesName: string, fieldName: string) => {
        if (cardType !== 'ref') return null;
        // Include the schema ID in the key if available
        const key = schemaId
            ? `${acqName}#${schemaId}|${seriesName}|${fieldName}`
            : `${acqName}|${seriesName}|${fieldName}`;
        console.log('SeriesTable looking up key:', key, 'Available keys:', Object.keys(complianceMap).filter(k => k.includes('|')));
        return complianceMap[key];
    };

    return (
        <Box>
            <Box as="table" width="100%" style={{ borderCollapse: 'collapse' }}>
                <thead>
                    <tr>
                        <th style={{ padding: '4px' }}>Series</th>
                        {allFieldNames.map((fn) => (
                            <th key={fn} style={{ padding: '4px' }}>
                                {fn}
                            </th>
                        ))}
                        {cardType === 'ref' && <th style={{ padding: '4px', textAlign: 'center' }}>Compliance</th>}
                    </tr>
                </thead>
                <tbody>
                    {seriesArr.map((s, idx) => {
                        const composite = s.fields.map((f) => f.field).join(', ');
                        // Get compliance for this series using the helper function
                        console.log('SeriesTable: Looking for series compliance:', {
                            seriesName: s.name,
                            composite,
                            acqName,
                            schemaId,
                            expectedKey: schemaId ? `${acqName}#${schemaId}|${s.name}|${composite}` : `${acqName}|${s.name}|${composite}`
                        });
                        const comp = getComplianceStatus(s.name, composite);

                        return (
                            <tr key={idx}>
                                <td style={{ padding: '4px' }}>{s.name}</td>
                                {allFieldNames.map((fn) => {
                                    const fld = s.fields.find((f) => f.field === fn);
                                    return (
                                        <td key={fn} style={{ padding: '4px', textAlign: 'right' }}>
                                            {fld ? formatConstraintDisplay(fld) : ''}
                                        </td>
                                    );
                                })}
                                {cardType === 'ref' && (
                                    <td style={{ padding: '4px', textAlign: 'center' }}>
                                        {comp ? (
                                            comp.status === 'ok' ? (
                                                <Tooltip label="OK">
                                                    <CheckCircleIcon color="green.500" />
                                                </Tooltip>
                                            ) : (
                                                <Tooltip label={comp.message}>
                                                    <WarningIcon color="red.500" />
                                                </Tooltip>
                                            )
                                        ) : null}
                                    </td>
                                )}
                            </tr>
                        );
                    })}
                </tbody>
            </Box>
        </Box>
    );
};

export default SeriesTable;
