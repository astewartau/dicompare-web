import React, { useState } from "react";
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
  useClipboard,
  Spinner,
  Flex
} from "@chakra-ui/react";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  WarningIcon,
  CheckCircleIcon,
  CopyIcon
} from "@chakra-ui/icons";
import { usePyodide } from "../../components/PyodideContext";

interface ComplianceItem {
  "reference acquisition"?: string;
  "input acquisition"?: string;
  "series"?: string | null;
  "field"?: string;
  "expected"?: any;
  "value"?: any;
  "message"?: string;
  "passed": string;
}

interface AcquisitionGroup {
  inputAcquisitionName: string;
  referenceAcquisitionName: string;
  errors: ComplianceItem[];
  compliant: ComplianceItem[];
}

type AcquisitionMap = Record<string, AcquisitionGroup>;

const ComplianceResults: React.FC = () => {
  const [acquisitionMap, setAcquisitionMap] = useState<AcquisitionMap>({});
  const [expandedAcqs, setExpandedAcqs] = useState<string[]>([]);
  const [rawJson, setRawJson] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const { hasCopied, onCopy } = useClipboard(rawJson);
  const { runPythonCode } = usePyodide();

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

  const handleAnalyze = async () => {
    setLoading(true);
    try {
      const code = `
import json
import pyodide
from dicompare.compliance import check_session_compliance_with_json_reference, check_session_compliance_with_python_module

if 'session_map' not in globals():
    global session_map
    session_map = {}
elif isinstance(session_map, str):
    session_map = json.loads(session_map)
elif isinstance(session_map, pyodide.ffi.JsProxy):
    session_map = session_map.to_py()

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
      const grouped = groupByAcquisition(parsed);
      setAcquisitionMap(grouped);
    } catch (error) {
      console.error("Compliance error:", error);
    } finally {
      setLoading(false);
    }
  };

  const toggleAcquisition = (acqName: string) => {
    setExpandedAcqs(prev =>
      prev.includes(acqName) ? prev.filter(a => a !== acqName) : [...prev, acqName]
    );
  };

  const allGroups = Object.values(acquisitionMap);
  const totalErrors = allGroups.reduce((sum, group) => sum + group.errors.length, 0);
  const totalCompliant = allGroups.reduce((sum, group) => sum + group.compliant.length, 0);
  const hasErrors = totalErrors > 0;
  const statusIcon = hasErrors ? <WarningIcon color="red.500" /> : <CheckCircleIcon color="green.500" />;

  const handleDownloadCertificate = () => {
    const blob = new Blob([rawJson], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "compliance_certificate.json";
    link.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <Flex align="center" justify="center" minH="50vh">
        <Spinner size="xl" thickness="4px" speed="0.65s" color="blue.500" />
      </Flex>
    );
  }

  if (!allGroups.length) {
    return (
      <Box p={4}>
        <Heading size="md" mb={4}>Compliance Results</Heading>
        <Text mb={4}>Press the button below to analyze compliance.</Text>
        <Button colorScheme="teal" onClick={handleAnalyze}>
          Analyze
        </Button>
      </Box>
    );
  }

  return (
    <Box p={4}>
      <Button colorScheme="teal" onClick={handleAnalyze}>
        Analyze
      </Button>
      <Heading size="md" mb={2}>Data Certificate</Heading>
      <HStack mb={4}>
        {statusIcon}
        <Text fontSize="sm">
          {hasErrors ? `${totalErrors} issue(s) found` : "No issues found"}
        </Text>
        <Text fontSize="sm" color="gray.600">
          | {totalCompliant} field(s) compliant
        </Text>
      </HStack>
      <Button colorScheme="blue" size="sm" mb={6} onClick={handleDownloadCertificate}>
        Download Certificate
      </Button>

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
                <Box mb={4}>
                  {!errorCount && (
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
                      {item.series && (
                        <Text fontSize="xs">
                          <strong>Series:</strong> {item.series}
                        </Text>
                      )}
                      <Text fontSize="xs">
                        <strong>Field:</strong> {item.field ?? "Unknown"}
                      </Text>
                      {item.expected !== undefined && (
                        <Text fontSize="xs">
                          <strong>Expected:</strong> {JSON.stringify(item.expected)}
                        </Text>
                      )}
                      {item.value !== undefined && (
                        <Text fontSize="xs">
                          <strong>Value:</strong> {JSON.stringify(item.value)}
                        </Text>
                      )}
                      <Text fontSize="xs">
                        <strong>Error:</strong> {item.message}
                      </Text>
                    </Box>
                  ))}
                </Box>

                <Box>
                  {!compliantCount && (
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
                      {item.series && (
                        <Text fontSize="xs">
                          <strong>Series:</strong> {item.series}
                        </Text>
                      )}
                      <Text fontSize="xs">
                        <strong>Field:</strong> {item.field ?? "Unknown"}
                      </Text>
                      {item.expected !== undefined && (
                        <Text fontSize="xs">
                          <strong>Expected:</strong> {JSON.stringify(item.expected)}
                        </Text>
                      )}
                      {item.value !== undefined && (
                        <Text fontSize="xs">
                          <strong>Value:</strong> {JSON.stringify(item.value)}
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
