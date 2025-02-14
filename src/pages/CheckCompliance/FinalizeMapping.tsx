import React, { useEffect, useState } from 'react';
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
} from '@chakra-ui/react';
import { ChevronDownIcon, ChevronRightIcon } from '@chakra-ui/icons';

interface FinalizeMappingProps {
  runPythonCode: (code: string) => Promise<any>;
  onNext: (finalMappings: Array<{ reference: string; input: string }>) => void;
}

interface Acquisition {
  name: string;
  details: Record<string, any>;
}

const FinalizeMapping: React.FC<FinalizeMappingProps> = ({ runPythonCode, onNext }) => {
  const [referenceOptions, setReferenceOptions] = useState<Acquisition[]>([]);
  const [inputOptions, setInputOptions] = useState<Acquisition[]>([]);
  const [inputSelections, setInputSelections] = useState<Record<string, string>>({});
  const [expandedReferences, setExpandedReferences] = useState<Record<string, boolean>>({});
  const [expandedInputs, setExpandedInputs] = useState<Record<string, boolean>>({});
  const [allReferencesExpanded, setAllReferencesExpanded] = useState(false);
  const [allInputsExpanded, setAllInputsExpanded] = useState(false);

  // Helper to render input details in a list
  const renderInputDetails = (details: any) => {
    return (
      <Box>
        {Object.entries(details).map(([key, value]) => (
          <Text key={key}>
            <strong>{key}:</strong>{" "}
            {Array.isArray(value) ? value.join(', ') : String(value)}
          </Text>
        ))}
      </Box>
    );
  };

  useEffect(() => {
    const fetchMapping = async () => {
      try {
        // This snippet assumes that the following globals have been set in previous steps:
        // in_session, ref_session, reference_fields, and is_json.
        //
        // It builds input_acquisitions as a list of dictionaries. Each acquisition is
        // represented by its name plus a details object containing all fields from reference_fields.
        const code = `
import json
from dicompare.mapping import map_to_json_reference
from dicompare.cli.gen_session import create_json_reference

acquisition_fields = ["ProtocolName"]
if is_json:
    in_session = in_session.reset_index(drop=True)
    in_session["Series"] = (
        in_session.groupby(acquisition_fields)
        .apply(lambda group: group.groupby(reference_fields, dropna=False).ngroup().add(1))
        .reset_index(level=0, drop=True)
    ).apply(lambda x: f"{x}")
    in_session.sort_values(by=["Acquisition", "Series"] + acquisition_fields + reference_fields, inplace=True)
    
    missing_fields = [field for field in reference_fields if field not in in_session.columns]
    if missing_fields:
        raise ValueError(f"Input session is missing required reference fields: {missing_fields}")
    
    session_map = map_to_json_reference(in_session, ref_session)
    session_map_serializable = {f"{key[0]}::{key[1]}": f"{value[0]}::{value[1]}" for key, value in session_map.items()}

    # build input_acquisitions e.g. [{"Acquisition": "Acq1", "details": {"ProtocolName": "T1", "Series": {"Series 1": {"EchoTime": 5.84}, "Series 2": {"EchoTime": 5.84}}}}, ...]
    input_acquisitions = create_json_reference(session_df=in_session, reference_fields=reference_fields)
else:
    session_map_serializable = {acq["Acquisition"]: ref for acq, ref in zip(input_acquisitions, ref_session["acquisitions"])}

json.dumps({
    "input_acquisitions": input_acquisitions["acquisitions"],
    "reference_acquisitions": ref_session["acquisitions"],
    "session_map": session_map_serializable
})
`;
const result = await runPythonCode(code);
const parsed = JSON.parse(result);

// Convert reference_acquisitions to an array
const refArr: Acquisition[] = Object.entries(parsed.reference_acquisitions).map(
  ([acqName, obj]) => ({
    name: acqName,
    details: obj as any,
  })
);

// Convert input_acquisitions to an array
const inArr: Acquisition[] = Object.entries(parsed.input_acquisitions).map(
  ([acqName, obj]) => ({
    name: acqName,
    details: obj as any,
  })
);

setReferenceOptions(refArr);
setInputOptions(inArr);

// Initialize mapping from session_map
setInputSelections(parsed.session_map || {});
} catch (err) {
console.error('Mapping error:', err);
}
};
fetchMapping();
}, [runPythonCode]);

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

const handleNext = () => {
const finalMappings = Object.entries(inputSelections).map(([refName, inputName]) => ({
reference: refName,
input: inputName,
}));
onNext(finalMappings);
};

/**
* Renders a table with one column for "Series Name"
* and one column per unique field encountered across all series.
*/
const renderSeriesTable = (seriesArr: Array<{
name: string;
fields: Array<{ field: string; value?: any; tolerance?: number; contains?: any }>;
}>) => {
if (!Array.isArray(seriesArr) || seriesArr.length === 0) return null;

// Gather all field names
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
          const tol = maybeFieldObj?.tolerance !== undefined ? ` (tol:${maybeFieldObj.tolerance})` : '';
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

return (
<Box p={6}>
<Heading size="lg" mb={4}>
Finalize Mapping
</Heading>
<Text mb={4}>
Match the reference acquisitions (left) to the input acquisitions (right). Expand rows to view details.
</Text>

<Flex gap={6}>
{/* Reference Acquisitions */}
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
              {/* If there's a fields array */}
              {Array.isArray(ref.details.fields) && ref.details.fields.length > 0 && (
                <Box mb={2}>
                  <Text fontWeight="bold">Fields:</Text>
                  {ref.details.fields.map((fld: any, idx: number) => (
                    <Text key={idx}>
                      {fld.field}: {fld.value}
                      {fld.tolerance !== undefined ? ` (tolerance: ${fld.tolerance})` : ''}
                    </Text>
                  ))}
                </Box>
              )}

              {/* If there's a series array -> render multi-column table */}
              {Array.isArray(ref.details.series) && ref.details.series.length > 0 && (
                renderSeriesTable(ref.details.series)
              )}
            </Box>
          </Collapse>

          {/* Dropdown mapping */}
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

{/* Input Acquisitions */}
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
              {/* If there's a fields array */}
              {Array.isArray(inp.details.fields) && inp.details.fields.length > 0 && (
                <Box mb={2}>
                  <Text fontWeight="bold">Fields:</Text>
                  {inp.details.fields.map((fld: any, idx: number) => (
                    <Text key={idx}>
                      {fld.field}: {fld.value}
                      {fld.tolerance !== undefined ? ` (tolerance: ${fld.tolerance})` : ''}
                    </Text>
                  ))}
                </Box>
              )}

              {/* If there's a series array -> multi-column table */}
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

<Button mt={6} colorScheme="green" onClick={handleNext}>
Finalize and Proceed
</Button>
</Box>
);
};

export default FinalizeMapping;