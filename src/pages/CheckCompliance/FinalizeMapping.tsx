import React, { useState } from 'react';
import {
  Box,
  Heading,
  Text,
  VStack,
  Select,
  Button,
  IconButton,
  Flex,
  Collapse,
  Tooltip,
  Spinner
} from '@chakra-ui/react';
import { ChevronDownIcon, ChevronRightIcon } from '@chakra-ui/icons';
import { usePyodide } from '../../components/PyodideContext';

interface FinalizeMappingProps {
}

interface Acquisition {
  name: string;
  details: Record<string, any>;
}

const FinalizeMapping: React.FC<FinalizeMappingProps> = ({
}) => {
  const [referenceOptions, setReferenceOptions] = useState<Acquisition[]>([]);
  const [inputOptions, setInputOptions] = useState<Acquisition[]>([]);
  const [inputSelections, setInputSelections] = useState<Record<string, string>>({});
  const [expandedReferences, setExpandedReferences] = useState<Record<string, boolean>>({});
  const [expandedInputs, setExpandedInputs] = useState<Record<string, boolean>>({});
  const [allReferencesExpanded, setAllReferencesExpanded] = useState(false);
  const [allInputsExpanded, setAllInputsExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const { runPythonCode } = usePyodide();

  const codeToRun = `
import json
from dicompare.mapping import map_to_json_reference
from dicompare.cli.gen_session import create_json_reference

acquisition_fields = ["ProtocolName"]

global in_session

in_session = in_session.reset_index(drop=True)
in_session.sort_values(by=["Acquisition"] + acquisition_fields + reference_fields, inplace=True)
missing_fields = [field for field in reference_fields if field not in in_session.columns]
if missing_fields:
    raise ValueError(f"Input session is missing required reference fields: {missing_fields}")

if "session_map" not in globals() or globals()["session_map"] is None:
    global session_map

    if is_json:
        input_acquisitions = create_json_reference(in_session, acquisition_fields + reference_fields)
        session_map = map_to_json_reference(in_session, ref_session)
    else:
        session_map = {acq["Acquisition"]: ref for acq, ref in zip(input_acquisitions, ref_session["acquisitions"])}

json.dumps({
    "input_acquisitions": input_acquisitions,
    "reference_acquisitions": ref_session["acquisitions"],
    "session_map": session_map
})
`;

  const handleAnalyze = async () => {
    try {
      setLoading(true);
      const result = await runPythonCode(codeToRun);
      const parsed = JSON.parse(result);

      const refArr: Acquisition[] = Object.entries(parsed.reference_acquisitions).map(
        ([acqName, obj]) => ({
          name: acqName,
          details: obj as any,
        })
      );

      const inArr: Acquisition[] = Object.entries(parsed.input_acquisitions.acquisitions).map(
        ([acqName, acqObject]) => ({
          name: acqName,
          details: acqObject,
        })
      );

      setReferenceOptions(refArr);
      setInputOptions(inArr);
      setInputSelections(parsed.session_map || {});
    } catch (err) {
      console.error('Mapping error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (referenceName: string, value: string) => {
    setInputSelections((prev) => ({ ...prev, [referenceName]: value }));
  };

  const toggleReferenceDetails = (referenceName: string) => {
    setExpandedReferences((prev) => ({
      ...prev,
      [referenceName]: !prev[referenceName],
    }));
  };

  const toggleInputDetails = (inputName: string) => {
    setExpandedInputs((prev) => ({
      ...prev,
      [inputName]: !prev[inputName],
    }));
  };

  const toggleAllReferences = () => {
    const newValue = !allReferencesExpanded;
    const expandedMap: Record<string, boolean> = {};
    referenceOptions.forEach((ref) => {
      expandedMap[ref.name] = newValue;
    });
    setExpandedReferences(expandedMap);
    setAllReferencesExpanded(newValue);
  };

  const toggleAllInputs = () => {
    const newValue = !allInputsExpanded;
    const expandedMap: Record<string, boolean> = {};
    inputOptions.forEach((inp) => {
      expandedMap[inp.name] = newValue;
    });
    setExpandedInputs(expandedMap);
    setAllInputsExpanded(newValue);
  };

  const renderSeriesTable = (
    seriesArr: Array<{
      name: string;
      fields: Array<{ field: string; value?: any; tolerance?: number; contains?: any }>;
    }>
  ) => {
    if (!Array.isArray(seriesArr) || seriesArr.length === 0) return null;

    const allFieldNames = new Set<string>();
    for (const s of seriesArr) {
      for (const f of s.fields) {
        allFieldNames.add(f.field);
      }
    }
    const fieldArray = Array.from(allFieldNames);

    return (
      <Box>
        <Text fontWeight="bold" mb={1}>Series:</Text>
        <Box as="table" width="100%" border="1px solid" borderColor="gray.200">
          <Box as="thead" bg="gray.100">
            <Box as="tr">
              <Box as="th" p={2}>Series Name</Box>
              {fieldArray.map((fieldName) => (
                <Box as="th" p={2} key={fieldName}>
                  {fieldName}
                </Box>
              ))}
            </Box>
          </Box>
          <Box as="tbody">
            {seriesArr.map((s, idx) => (
              <Box as="tr" key={idx}>
                <Box as="td" p={2}>
                  {s.name}
                </Box>
                {fieldArray.map((fieldName) => {
                  const maybeFieldObj = s.fields.find((x) => x.field === fieldName);
                  const val = maybeFieldObj?.value ?? maybeFieldObj?.contains ?? '';
                  const tol = maybeFieldObj?.tolerance !== undefined
                    ? ` (tol:${maybeFieldObj.tolerance})`
                    : '';
                  return (
                    <Box as="td" p={2} key={fieldName}>
                      {String(val) + tol}
                    </Box>
                  );
                })}
              </Box>
            ))}
          </Box>
        </Box>
      </Box>
    );
  };

  if (loading) {
    return (
      <Flex align="center" justify="center" minH="80vh">
        <Spinner size="xl" thickness="4px" speed="0.65s" color="blue.500" />
      </Flex>
    );
  }

  return (
    <Box p={6}>
      <Heading size="lg" mb={4}>
        Finalize Mapping
      </Heading>
      <Text mb={4}>
        Press "Analyze" to retrieve and map acquisitions.
      </Text>

      <Button mb={4} colorScheme="teal" onClick={handleAnalyze}>
        Analyze
      </Button>

      <Flex gap={6}>
        <Box flex="1">
          <Flex justify="space-between" align="center" mb={4}>
            <Heading size="md">Reference Acquisitions</Heading>
            <Tooltip
              label={allReferencesExpanded ? 'Collapse All' : 'Expand All'}
              placement="top"
            >
              <IconButton
                size="sm"
                icon={allReferencesExpanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
                onClick={toggleAllReferences}
                aria-label="Expand/collapse references"
              />
            </Tooltip>
          </Flex>

          <VStack spacing={4} align="stretch">
            {referenceOptions.map((ref) => {
              const expanded = expandedReferences[ref.name] || false;
              return (
                <Box key={ref.name} borderWidth="1px" borderRadius="md">
                  <Box
                    p={3}
                    display="flex"
                    alignItems="center"
                    justifyContent="space-between"
                    cursor="pointer"
                    onClick={() => toggleReferenceDetails(ref.name)}
                    _hover={{ bg: 'gray.100' }}
                  >
                    <Text fontWeight="bold">{ref.name}</Text>
                    <IconButton
                      size="sm"
                      icon={expanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
                      aria-label="Toggle reference details"
                    />
                  </Box>
                  <Collapse in={expanded}>
                    <Box p={3} bg="gray.50">
                      {Array.isArray(ref.details.fields) && ref.details.fields.length > 0 && (
                        <Box mb={2}>
                          <Text fontWeight="bold">Fields:</Text>
                          {ref.details.fields.map((fld: any, idx: number) => (
                            <Text key={idx}>
                              {fld.field}: {fld.value}
                              {fld.tolerance !== undefined
                                ? ` (tolerance: ${fld.tolerance})`
                                : ''}
                            </Text>
                          ))}
                        </Box>
                      )}
                      {Array.isArray(ref.details.series) && ref.details.series.length > 0 && (
                        renderSeriesTable(ref.details.series)
                      )}
                    </Box>
                  </Collapse>
                  <Box p={3}>
                    <Select
                      placeholder="Select Input"
                      value={inputSelections[ref.name] || ''}
                      onChange={(e) => handleInputChange(ref.name, e.target.value)}
                    >
                      {inputOptions.map((inp) => (
                        <option key={inp.name} value={inp.name}>
                          {inp.name}
                        </option>
                      ))}
                    </Select>
                  </Box>
                </Box>
              );
            })}
          </VStack>
        </Box>

        <Box flex="1">
          <Flex justify="space-between" align="center" mb={4}>
            <Heading size="md">Input Acquisitions</Heading>
            <Tooltip
              label={allInputsExpanded ? 'Collapse All' : 'Expand All'}
              placement="top"
            >
              <IconButton
                size="sm"
                icon={allInputsExpanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
                onClick={toggleAllInputs}
                aria-label="Expand/collapse inputs"
              />
            </Tooltip>
          </Flex>

          <VStack spacing={4} align="stretch">
            {inputOptions.map((inp) => {
              const expanded = expandedInputs[inp.name] || false;
              return (
                <Box key={inp.name} borderWidth="1px" borderRadius="md">
                  <Box
                    p={3}
                    display="flex"
                    alignItems="center"
                    justifyContent="space-between"
                    cursor="pointer"
                    onClick={() => toggleInputDetails(inp.name)}
                    _hover={{ bg: 'gray.100' }}
                  >
                    <Text fontWeight="bold">{inp.name}</Text>
                    <IconButton
                      size="sm"
                      icon={expanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
                      aria-label="Toggle input details"
                    />
                  </Box>
                  <Collapse in={expanded}>
                    <Box p={3} bg="gray.50">
                      {Array.isArray(inp.details.fields) && inp.details.fields.length > 0 && (
                        <Box mb={2}>
                          <Text fontWeight="bold">Fields:</Text>
                          {inp.details.fields.map((fld: any, idx: number) => (
                            <Text key={idx}>
                              {fld.field}: {fld.value}
                              {fld.tolerance !== undefined
                                ? ` (tolerance: ${fld.tolerance})`
                                : ''}
                            </Text>
                          ))}
                        </Box>
                      )}
                      {Array.isArray(inp.details.series) && inp.details.series.length > 0 && (
                        renderSeriesTable(inp.details.series)
                      )}
                    </Box>
                  </Collapse>
                </Box>
              );
            })}
          </VStack>
        </Box>
      </Flex>
    </Box>
  );
};

export default FinalizeMapping;
