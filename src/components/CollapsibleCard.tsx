import React, { useState } from 'react';
import {
  Box,
  Heading,
  Button,
  Collapse,
  Divider,
  VStack,
  Text,
  useDisclosure,
  Select as ChakraSelect,
  Spinner,
  HStack,
} from '@chakra-ui/react';
import { CloseIcon } from '@chakra-ui/icons';

// Helper to compare arrays (like the original `arraysEqual`)
function arraysEqual(a: any[], b: any[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

// Utility that divides fields into constant vs variable
function getConstantFields(rows: Record<string, any>[], fields: string[]) {
  const constantFields: Record<string, any> = {};
  const variableFields = [...fields];

  if (!rows.length || !fields.length) {
    return { constantFields, variableFields };
  }

  fields.forEach((field) => {
    const firstValue = rows[0][field];
    let isConstant = true;
    for (let i = 0; i < rows.length; i++) {
      const current = rows[i][field];
      if (Array.isArray(firstValue) && Array.isArray(current)) {
        if (!arraysEqual(firstValue, current)) {
          isConstant = false;
          break;
        }
      } else {
        if (current !== firstValue) {
          isConstant = false;
          break;
        }
      }
    }
    if (isConstant) {
      constantFields[field] = firstValue;
      const idx = variableFields.indexOf(field);
      if (idx !== -1) {
        variableFields.splice(idx, 1);
      }
    }
  });

  return { constantFields, variableFields };
}

interface CollapsibleCardProps {
  acquisition: string;
  pyodide: any;
  validFields: string[];
}

const CollapsibleCard: React.FC<CollapsibleCardProps> = ({
  acquisition,
  pyodide,
  validFields,
}) => {
  const { isOpen, onToggle } = useDisclosure();
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, any>[]>([]);
  const [loading, setLoading] = useState(false);

  // Split the fields into constant vs. variable
  const { constantFields, variableFields } = getConstantFields(rows, selectedFields);

  // When user selects a field from the dropdown
  const handleAddField = (field: string) => {
    // Avoid duplicates
    if (!selectedFields.includes(field)) {
      const updated = [...selectedFields, field];
      setSelectedFields(updated);
      fetchRows(updated);
    }
  };

  // When user removes a field
  const handleRemoveField = (field: string) => {
    const updated = selectedFields.filter((f) => f !== field);
    setSelectedFields(updated);
    fetchRows(updated);
  };

  const fetchRows = async (fields: string[]) => {
    if (!fields.length) {
      setRows([]);
      return;
    }
    setLoading(true);
    try {
      // Pass acquisitions & fields to Python (similar to original code)
      pyodide.globals.set('current_acquisition', acquisition);
      pyodide.globals.set('selected_fields', fields);

      const uniqueRows = await pyodide.runPythonAsync(`
        df = session[session['Acquisition'] == current_acquisition][selected_fields].drop_duplicates()
        df = df.sort_values(by=list(df.columns))
        if len(df) > 1:
            df.insert(0, 'Series', range(1, len(df) + 1))
        df.to_dict(orient='records')
      `);

      // Convert to JS
      const rowData = uniqueRows.toJs();
      setRows(rowData);
    } catch (err) {
      console.error('Error fetching rows:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      p={4}
      borderWidth="1px"
      borderRadius="md"
      bg="white"
      boxShadow="sm"
      width="100%"
    >
      <HStack justify="space-between">
        <Heading as="h4" size="md" color="teal.500">
          {acquisition}
        </Heading>
        <Button size="sm" onClick={onToggle} colorScheme="teal">
          {isOpen ? 'Collapse' : 'Expand'}
        </Button>
      </HStack>

      <Collapse in={isOpen} animateOpacity>
        <Divider my={4} />
        {/* Field selection UI */}
        <Text fontSize="sm" mb={2} color="gray.600">
          Select fields for validation:
        </Text>
        <HStack mb={4}>
          <ChakraSelect
            placeholder="Choose a field"
            width="60%"
            onChange={(e) => {
              if (e.target.value) {
                handleAddField(e.target.value);
                e.target.value = '';
              }
            }}
          >
            {validFields.map((field) => (
              <option key={field} value={field}>
                {field}
              </option>
            ))}
          </ChakraSelect>
        </HStack>
        {/* Display currently selected fields */}
        <HStack wrap="wrap" spacing={2}>
          {selectedFields.map((field) => (
            <Button
              key={field}
              size="sm"
              variant="outline"
              colorScheme="blue"
              rightIcon={<CloseIcon boxSize="0.65em" />}
              onClick={() => handleRemoveField(field)}
            >
              {field}
            </Button>
          ))}
        </HStack>

        {loading && (
          <VStack mt={4}>
            <Spinner size="md" />
            <Text fontSize="sm">Loading table...</Text>
          </VStack>
        )}

        {!loading && rows.length > 0 && (
          <VStack align="start" spacing={4} mt={4}>
            {/* Constant fields table */}
            {Object.keys(constantFields).length > 0 && (
              <Box width="100%">
                <Text fontWeight="bold" mb={2}>
                  Constant Fields
                </Text>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ borderBottom: '1px solid #ccc' }}>Field</th>
                      <th style={{ borderBottom: '1px solid #ccc' }}>Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(constantFields).map(([field, val]) => (
                      <tr key={field}>
                        <td style={{ borderBottom: '1px solid #eee', padding: '4px' }}>
                          {field}
                        </td>
                        <td style={{ borderBottom: '1px solid #eee', padding: '4px' }}>
                          {val}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Box>
            )}

            {/* Variable fields table */}
            {variableFields.length > 0 && (
              <Box width="100%">
                <Text fontWeight="bold" mb={2}>
                  Variable Fields
                </Text>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {variableFields.map((vf) => (
                        <th
                          key={vf}
                          style={{ borderBottom: '1px solid #ccc', padding: '4px' }}
                        >
                          {vf}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i}>
                        {variableFields.map((vf) => (
                          <td
                            key={vf}
                            style={{ borderBottom: '1px solid #eee', padding: '4px' }}
                          >
                            {r[vf]}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Box>
            )}
          </VStack>
        )}
      </Collapse>
    </Box>
  );
};

export default CollapsibleCard;
