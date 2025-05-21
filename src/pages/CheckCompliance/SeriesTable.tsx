// common/SeriesTable.tsx
import React from 'react';
import {
  Box,
  Tooltip
} from '@chakra-ui/react';
import {
  CheckCircleIcon,
  WarningIcon
} from '@chakra-ui/icons';
import { FieldCompliance } from './types';

interface SeriesTableProps {
  seriesArr: Array<{
    name: string;
    fields: Array<{ field: string; value?: any; tolerance?: number; contains?: any }>;
  }>;
  cardType: 'ref' | 'inp';
  acqName: string;
  complianceMap: Record<string, FieldCompliance>;
}

const SeriesTable: React.FC<SeriesTableProps> = ({ 
  seriesArr, 
  cardType, 
  acqName, 
  complianceMap 
}) => {
  if (!seriesArr.length) return null;

  // Gather all field names
  const allFieldNames = Array.from(
    seriesArr.reduce((set, s) => {
      s.fields.forEach(f => set.add(f.field));
      return set;
    }, new Set<string>())
  );

  return (
    <Box>
      <Box as="table" width="100%" style={{ borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ padding: '4px' }}>Series</th>
            {allFieldNames.map(fn => (
              <th key={fn} style={{ padding: '4px' }}>{fn}</th>
            ))}
            {cardType === 'ref' && (
              <th style={{ padding: '4px', textAlign: 'center' }}>Compliance</th>
            )}
          </tr>
        </thead>
        <tbody>
          {seriesArr.map((s, idx) => {
            const composite = s.fields.map(f => f.field).join(', ');
            const seriesKey = `${acqName}|${s.name}|${composite}`;
            const comp = complianceMap[seriesKey];

            return (
              <tr key={idx}>
                <td style={{ padding: '4px' }}>{s.name}</td>
                {allFieldNames.map(fn => {
                  const fld = s.fields.find(f => f.field === fn);
                  const val = fld?.value ?? fld?.contains ?? '';
                  const tol = fld?.tolerance != null ? ` (tol: ${fld.tolerance})` : '';
                  return (
                    <td key={fn} style={{ padding: '4px', textAlign: 'right' }}>
                      {String(val) + tol}
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
