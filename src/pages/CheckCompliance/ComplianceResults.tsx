import React, { useEffect, useState } from "react";
import {
  Box,
  Heading,
  Text,
  Button,
  Collapse,
  IconButton,
  VStack,
  HStack,
  Badge,
  Code,
  useClipboard
} from "@chakra-ui/react";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  WarningIcon,
  CheckCircleIcon,
  CopyIcon
} from "@chakra-ui/icons";

/** The shape of each compliance item in the raw array from Python. */
interface ComplianceItem {
  "reference acquisition"?: string; 
  "input acquisition"?: string;     
  "series"?: string | null;        
  "field"?: string;                
  "expected"?: any;                
  "value"?: any;                   
  "message"?: string;              
  "passed": string;                // "✅" or "❌"
}

/** We group these items by the 'input acquisition'. */
interface AcquisitionGroup {
  /** The name of the input acquisition (like "acq-t1mpragesagp2") */
  inputAcquisitionName: string;
  /** The corresponding reference acquisition (like "acq-greqsm5echoesiso1mm") */
  referenceAcquisitionName: string;
  errors: ComplianceItem[];
  compliant: ComplianceItem[];
}

/** The shape of the map: each key is an input acquisition name,
 *  each value is an AcquisitionGroup.
 */
type AcquisitionMap = Record<string, AcquisitionGroup>;

/** 
 * Props for this component:
 *  - runPythonCode: function that runs code in Pyodide, returning JSON string
 */
interface ComplianceResultsProps {
  runPythonCode: (code: string) => Promise<string>;
  setNextEnabled: React.Dispatch<React.SetStateAction<boolean>>;
}

/**
 * React component that:
 * 1) Fetches the raw compliance summary array via Python
 * 2) Groups items by "input acquisition"
 * 3) Shows a top-level summary, then collapsible sections per acquisition
 * 4) Also displays a JSON debug box with copy-to-clipboard
 */
const ComplianceResults: React.FC<ComplianceResultsProps> = ({ runPythonCode, setNextEnabled }) => {
  const [acquisitionMap, setAcquisitionMap] = useState<AcquisitionMap>({});
  const [loaded, setLoaded] = useState(false);
  const [expandedAcqs, setExpandedAcqs] = useState<string[]>([]);

  // We'll store the raw JSON in a string to display in the debug section
  const [rawJson, setRawJson] = useState<string>("");

  // For copying JSON
  const { hasCopied, onCopy } = useClipboard(rawJson);

  // Fetch compliance data from Python on mount
  useEffect(() => {
    const fetchCompliance = async () => {
      try {
        const code = `
import json
from dicompare.compliance import check_session_compliance_with_json_reference, check_session_compliance_with_python_module

if isinstance(session_map, str):
    session_map = json.loads(session_map)

if is_json:
    compliance_summary = check_session_compliance_with_json_reference(
        in_session=in_session, ref_session=ref_session, session_map=session_map
    )
else:
    acquisition_map = {
        k if isinstance(k, str) else k.split("::")[0]: v
        for k, v in session_map.items()
    }
    compliance_summary = check_session_compliance_with_python_module(
        in_session=in_session, ref_models=ref_models, session_map=acquisition_map
    )

json.dumps(compliance_summary)
`;
        const pyResult = await runPythonCode(code);
        
        const prettyJson = JSON.stringify(JSON.parse(pyResult), null, 2);
        setRawJson(prettyJson);

        const parsed: ComplianceItem[] = JSON.parse(pyResult);
        if (!Array.isArray(parsed)) {
          throw new Error("Expected a list of compliance items, but got something else.");
        }

        const grouped = groupByAcquisition(parsed);
        setAcquisitionMap(grouped);
        setLoaded(true);
      } catch (err) {
        console.error("Compliance error:", err);
      }
    };

    fetchCompliance();
  }, [runPythonCode]);

  /**
   * Group the raw compliance items by their "input acquisition".
   * 
   * We'll store the reference acquisition name from the first item we see.
   * If multiple items in the same group have different references, 
   * we simply overwrite or keep the first one. 
   * Usually the mapping is 1:1, so it's fine.
   */
  const groupByAcquisition = (items: ComplianceItem[]): AcquisitionMap => {
    const map: AcquisitionMap = {};

    items.forEach(item => {
      const inputAcq = item["input acquisition"] || "Unknown Input Acq";
      const refAcq = item["reference acquisition"] || "Unknown Ref Acq";

      if (!map[inputAcq]) {
        map[inputAcq] = {
          inputAcquisitionName: inputAcq,
          referenceAcquisitionName: refAcq,
          errors: [],
          compliant: []
        };
      }

      if (item.passed === "❌") {
        map[inputAcq].errors.push(item);
      } else {
        map[inputAcq].compliant.push(item);
      }
    });

    return map;
  };

  // Expand/collapse the details of a specific acquisition
  const toggleAcquisition = (acqName: string) => {
    setExpandedAcqs(prev =>
      prev.includes(acqName) ? prev.filter(a => a !== acqName) : [...prev, acqName]
    );
  };

  // Summaries across all acquisitions
  const allGroups = Object.values(acquisitionMap);
  const totalErrors = allGroups.reduce((sum, group) => sum + group.errors.length, 0);
  const totalCompliant = allGroups.reduce((sum, group) => sum + group.compliant.length, 0);
  const hasErrors = totalErrors > 0;
  const statusIcon = hasErrors ? <WarningIcon color="red.500" /> : <CheckCircleIcon color="green.500" />;

  if (!loaded) {
    return <Box p={4}>Loading compliance data...</Box>;
  }

  // Example "Download Certificate" function
  const handleDownloadCertificate = () => {
    // In real usage, you might produce a PDF or otherwise format it
    // For demonstration, we can just download the raw JSON as a file
    const blob = new Blob([rawJson], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "compliance_certificate.json";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Box p={4}>
      {/* Top-level summary: Data Certificate */}
      <Box borderWidth="1px" borderRadius="md" p={4} mb={6} bg={hasErrors ? "red.50" : "green.50"}>
        <Heading size="md" mb={2}>Data Certificate</Heading>
        <HStack>
          {statusIcon}
          <Text fontSize="sm">
            {hasErrors ? `${totalErrors} issue(s) found` : "No issues found"}
          </Text>
        </HStack>
        <Text fontSize="sm" mt={2}>
          {totalCompliant} field(s) compliant
        </Text>
        {/* "Download Certificate" example */}
        <Button colorScheme="blue" size="sm" mt={3} onClick={handleDownloadCertificate}>
          Download Certificate
        </Button>
      </Box>

      {/* One collapsible panel per input acquisition */}
      {Object.values(acquisitionMap).map((group) => {
        const { inputAcquisitionName, referenceAcquisitionName, errors, compliant } = group;
        const isOpen = expandedAcqs.includes(inputAcquisitionName);
        const errorCount = errors.length;
        const compliantCount = compliant.length;

        return (
          <Box
            key={inputAcquisitionName}
            borderWidth="1px"
            borderRadius="md"
            mb={4}
            overflow="hidden"
          >
            {/* Header / Title: inputAcquisitionName → referenceAcquisitionName */}
            <Box
              p={3}
              bg="gray.100"
              display="flex"
              justifyContent="space-between"
              alignItems="center"
              cursor="pointer"
              onClick={() => toggleAcquisition(inputAcquisitionName)}
            >
              <Heading size="sm">
                {inputAcquisitionName} → {referenceAcquisitionName}
              </Heading>
              <Box>
                {errorCount > 0 && (
                  <Badge colorScheme="red" mr={2}>
                    {errorCount} error(s)
                  </Badge>
                )}
                {compliantCount > 0 && (
                  <Badge colorScheme="green" mr={2}>
                    {compliantCount} ok
                  </Badge>
                )}
                <IconButton
                  icon={isOpen ? <ChevronUpIcon /> : <ChevronDownIcon />}
                  size="sm"
                  aria-label="Toggle acquisition details"
                />
              </Box>
            </Box>

            <Collapse in={isOpen} animateOpacity>
              <Box p={3}>
                {/* Errors Section */}
                <Box mb={4}>
                  {errorCount === 0 && (
                    <Text fontSize="sm" color="gray.600">
                      No errors for this acquisition.
                    </Text>
                  )}
                  {errors.map((item, idx) => (
                    <Box
                      key={idx}
                      mt={2}
                      p={2}
                      borderWidth="1px"
                      borderRadius="md"
                      bg="red.50"
                    >
                      {item["series"] && (
                        <Text fontSize="xs">
                          <strong>Series:</strong> {item["series"]}
                        </Text>
                      )}
                      <Text fontSize="xs">
                        <strong>Field:</strong> {item.field ?? "Unknown"}
                      </Text>
                      {item["expected"] !== undefined && (
                        <Text fontSize="xs">
                          <strong>Expected:</strong> {JSON.stringify(item["expected"])}
                        </Text>
                      )}
                      {item["value"] !== undefined && (
                        <Text fontSize="xs">
                          <strong>Value:</strong> {JSON.stringify(item["value"])}
                        </Text>
                      )}
                      <Text fontSize="xs">
                        <strong>Error:</strong> {item.message}
                      </Text>
                    </Box>
                  ))}
                </Box>

                {/* Compliant fields Section */}
                <Box>
                  {compliantCount === 0 && (
                    <Text fontSize="sm" color="gray.600">
                      No compliant fields for this acquisition.
                    </Text>
                  )}
                  {compliant.map((item, idx) => (
                    <Box
                      key={idx}
                      mt={2}
                      p={2}
                      borderWidth="1px"
                      borderRadius="md"
                      bg="green.50"
                    >
                      {item["series"] && (
                        <Text fontSize="xs">
                          <strong>Series:</strong> {item["series"]}
                        </Text>
                      )}
                      <Text fontSize="xs">
                        <strong>Field:</strong> {item.field ?? "Unknown"}
                      </Text>
                      {item["expected"] !== undefined && (
                        <Text fontSize="xs">
                          <strong>Expected:</strong> {JSON.stringify(item["expected"])}
                        </Text>
                      )}
                      {item["value"] !== undefined && (
                        <Text fontSize="xs">
                          <strong>Value:</strong> {JSON.stringify(item["value"])}
                        </Text>
                      )}
                      <Text fontSize="xs">
                        <strong>Message:</strong> {item.message}
                      </Text>
                    </Box>
                  ))}
                </Box>
              </Box>
            </Collapse>
          </Box>
        );
      })}

      {/* JSON Debug Section */}
      <Box p={4} borderWidth="1px" borderRadius="md" bg="gray.50" overflow="auto" maxHeight="300px" mt={6}>
        <HStack justify="space-between" mb={2}>
          <Heading as="h3" size="sm">JSON Data</Heading>
          <Button leftIcon={<CopyIcon />} size="sm" onClick={onCopy}>
            {hasCopied ? 'Copied' : 'Copy JSON'}
          </Button>
        </HStack>
        <Code
          as="pre"
          fontSize="sm"
          bg="gray.100"
          p={2}
          borderRadius="md"
          whiteSpace="pre-wrap"
          wordBreak="break-word"
        >
          {rawJson}
        </Code>
      </Box>
    </Box>
  );
};

export default ComplianceResults;
