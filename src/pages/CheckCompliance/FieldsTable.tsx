// common/FieldsTable.tsx
import React from 'react';
import {
  Box,
  Tooltip
} from '@chakra-ui/react';
import {
  CheckCircleIcon,
  WarningIcon
} from '@chakra-ui/icons';
import { FieldCompliance } from '../FinalizeMapping/types';

interface FieldsTableProps {
  fields: Array<{ field: string; value?: any; tolerance?: number }>;
  cardType: 'ref' | 'inp';
  complianceMap: Record<string, FieldCompliance>;
}

const FieldsTable: React.FC<FieldsTableProps> = ({ fields, cardType, complianceMap }) => {
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
            const compliance = complianceMap[fld.field];
            let icon = null;
            if (cardType === 'ref' && compliance) {
              icon = compliance.status === 'ok' ? (
                <Tooltip label="OK">
                  <CheckCircleIcon color="green.500" />
                </Tooltip>
              ) : (
                <Tooltip label={compliance.message || "Issue found"}>
                  <WarningIcon color="red.500" />
                </Tooltip>
              );
            }
            return (
              <tr key={idx}>
                <td style={{ borderBottom: '1px solid #eee', padding: '4px' }}>{fld.field}</td>
                <td style={{ borderBottom: '1px solid #eee', padding: '4px', textAlign: 'right' }}>
                  {fld.value}{fld.tolerance !== undefined ? ` (tol: ${fld.tolerance})` : ''}
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
