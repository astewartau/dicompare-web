import React, { useState, useEffect } from "react";
import {
  Box,
  Heading,
  Text,
  VStack,
  Select,
  Button,
  IconButton,
  Flex,
  Card,
  CardHeader,
  CardBody,
  CardFooter,
  Collapse,
  HStack,
  Tooltip,
} from "@chakra-ui/react";
import { ChevronDownIcon, ChevronRightIcon } from "@chakra-ui/icons";

const FinalizeMapping = ({ onNext }) => {
  const [inputSelections, setInputSelections] = useState({});
  const [expandedReferences, setExpandedReferences] = useState({});
  const [expandedInputs, setExpandedInputs] = useState({});
  const [allReferencesExpanded, setAllReferencesExpanded] = useState(false);
  const [allInputsExpanded, setAllInputsExpanded] = useState(false);

  const inputOptions = [
    { name: "Input Acquisition 1", details: { Modality: "MRI", Manufacturer: "Siemens", StudyDate: "2022-01-10" } },
    { name: "Input Acquisition 2", details: { Modality: "CT", Manufacturer: "Philips", StudyDate: "2022-02-20" } },
    { name: "Input Acquisition 3", details: { Modality: "Ultrasound", Manufacturer: "GE Healthcare", StudyDate: "2022-03-15" } },
  ];

  const referenceOptions = [
    { name: "Reference Acquisition A", details: { Modality: "CT", Manufacturer: "GE Healthcare", StudyDate: "2022-01-01" } },
    { name: "Reference Acquisition B", details: { Modality: "MRI", Manufacturer: "Siemens", StudyDate: "2022-02-15" } },
    { name: "Reference Acquisition C", details: { Modality: "Ultrasound", Manufacturer: "Philips", StudyDate: "2022-03-10" } },
  ];

  // Auto-match by modality
  useEffect(() => {
    const defaultSelections = {};
    referenceOptions.forEach((reference) => {
      const matchingInput = inputOptions.find(input => input.details.Modality === reference.details.Modality);
      if (matchingInput) {
        defaultSelections[reference.name] = matchingInput.name;
      }
    });
    setInputSelections(defaultSelections);
  }, []);

  const handleInputChange = (referenceName, value) => {
    setInputSelections((prev) => ({ ...prev, [referenceName]: value }));
  };

  const toggleReferenceDetails = (referenceName) => {
    setExpandedReferences((prev) => ({
      ...prev,
      [referenceName]: !prev[referenceName],
    }));
  };

  const toggleInputDetails = (inputName) => {
    setExpandedInputs((prev) => ({
      ...prev,
      [inputName]: !prev[inputName],
    }));
  };

  // Expand/Collapse all references
  const toggleAllReferences = () => {
    const newExpandedState = !allReferencesExpanded;
    const newExpandedReferences = {};
    referenceOptions.forEach((ref) => {
      newExpandedReferences[ref.name] = newExpandedState;
    });
    setExpandedReferences(newExpandedReferences);
    setAllReferencesExpanded(newExpandedState);
  };

  // Expand/Collapse all inputs
  const toggleAllInputs = () => {
    const newExpandedState = !allInputsExpanded;
    const newExpandedInputs = {};
    inputOptions.forEach((input) => {
      newExpandedInputs[input.name] = newExpandedState;
    });
    setExpandedInputs(newExpandedInputs);
    setAllInputsExpanded(newExpandedState);
  };

  const handleNext = () => {
    const finalMappings = referenceOptions.map((ref) => ({
      reference: ref.name,
      input: inputSelections[ref.name] || null,
    }));
    onNext(finalMappings);
  };

  return (
    <Box p={6} minWidth="100vh">
      <Heading size="lg" mb={4}>Finalize Mapping</Heading>
      <Text mb={4}>Match input acquisitions to reference acquisitions. Expand cards to view details.</Text>

      <Flex gap={6}>
        {/* LEFT COLUMN - Reference Acquisitions */}
        <Box flex="1">
          <Flex justify="space-between" align="center" mb={4}>
            <Heading size="md">Reference Acquisitions</Heading>
            <Tooltip label={allReferencesExpanded ? "Collapse All" : "Expand All"} placement="top">
              <IconButton
                size="sm"
                icon={allReferencesExpanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
                onClick={toggleAllReferences}
                aria-label="Expand/collapse all reference acquisitions"
              />
            </Tooltip>
          </Flex>
          <VStack spacing={4} align="stretch">
            {referenceOptions.map((reference, index) => (
              <Card key={index} borderWidth="1px" borderRadius="md">
                <CardHeader
                  display="flex"
                  alignItems="center"
                  justifyContent="space-between"
                  cursor="pointer"
                  onClick={() => toggleReferenceDetails(reference.name)}
                  _hover={{ bg: "gray.100" }}
                  p={3}
                >
                  <Text fontWeight="bold">{reference.name}</Text>
                  <IconButton
                    size="sm"
                    icon={expandedReferences[reference.name] ? <ChevronDownIcon /> : <ChevronRightIcon />}
                    aria-label={`Toggle details for ${reference.name}`}
                  />
                </CardHeader>
                <Collapse in={expandedReferences[reference.name]} animateOpacity>
                  <CardBody p={3} bg="gray.50">
                    {Object.entries(reference.details).map(([key, value]) => (
                      <Text key={key}><strong>{key}:</strong> {value}</Text>
                    ))}
                  </CardBody>
                </Collapse>
                <CardFooter p={3}>
                  <Select
                    placeholder="Select Input Acquisition"
                    value={inputSelections[reference.name] || ""}
                    onChange={(e) => handleInputChange(reference.name, e.target.value)}
                  >
                    {inputOptions.map((option, idx) => (
                      <option key={idx} value={option.name}>
                        {option.name}
                      </option>
                    ))}
                  </Select>
                </CardFooter>
              </Card>
            ))}
          </VStack>
        </Box>

        {/* RIGHT COLUMN - Input Acquisitions */}
        <Box flex="1">
          <Flex justify="space-between" align="center" mb={4}>
            <Heading size="md">Input Acquisitions</Heading>
            <Tooltip label={allInputsExpanded ? "Collapse All" : "Expand All"} placement="top">
              <IconButton
                size="sm"
                icon={allInputsExpanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
                onClick={toggleAllInputs}
                aria-label="Expand/collapse all input acquisitions"
              />
            </Tooltip>
          </Flex>
          <VStack spacing={4} align="stretch">
            {inputOptions.map((input, idx) => (
              <Card key={idx} borderWidth="1px" borderRadius="md">
                <CardHeader
                  display="flex"
                  alignItems="center"
                  justifyContent="space-between"
                  cursor="pointer"
                  onClick={() => toggleInputDetails(input.name)}
                  _hover={{ bg: "gray.100" }}
                  p={3}
                >
                  <Text fontWeight="bold">{input.name}</Text>
                  <IconButton
                    size="sm"
                    icon={expandedInputs[input.name] ? <ChevronDownIcon /> : <ChevronRightIcon />}
                    aria-label={`Toggle details for ${input.name}`}
                  />
                </CardHeader>
                <Collapse in={expandedInputs[input.name]} animateOpacity>
                  <CardBody p={3} bg="gray.50">
                    {Object.entries(input.details).map(([key, value]) => (
                      <Text key={key}><strong>{key}:</strong> {value}</Text>
                    ))}
                  </CardBody>
                </Collapse>
              </Card>
            ))}
          </VStack>
        </Box>
      </Flex>

      {/* Next Button */}
      <Button mt={6} colorScheme="green" onClick={handleNext} isDisabled={Object.keys(inputSelections).length !== referenceOptions.length}>
        Finalize and Proceed
      </Button>
    </Box>
  );
};

export default FinalizeMapping;
