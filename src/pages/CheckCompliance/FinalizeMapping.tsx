import React, { useState } from "react";
import {
  Box,
  Heading,
  Text,
  VStack,
  Select,
  Button,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Collapse,
  IconButton,
  HStack,
} from "@chakra-ui/react";
import { ChevronDownIcon, ChevronRightIcon } from "@chakra-ui/icons";

const FinalizeMapping = ({ onNext }) => {
  const [inputSelections, setInputSelections] = useState({});
  const [expandedReference, setExpandedReference] = useState(null);

  const inputOptions = ["Input Acquisition 1", "Input Acquisition 2", "Input Acquisition 3"];
  const referenceOptions = [
    {
      name: "Reference Acquisition A",
      details: {
        Modality: "CT",
        Manufacturer: "GE Healthcare",
        StudyDate: "2022-01-01",
      },
    },
    {
      name: "Reference Acquisition B",
      details: {
        Modality: "MRI",
        Manufacturer: "Siemens",
        StudyDate: "2022-02-15",
      },
    },
    {
      name: "Reference Acquisition C",
      details: {
        Modality: "Ultrasound",
        Manufacturer: "Philips",
        StudyDate: "2022-03-10",
      },
    },
  ];

  const handleInputChange = (referenceName, value) => {
    setInputSelections((prev) => ({ ...prev, [referenceName]: value }));
  };

  const toggleDetails = (referenceName) => {
    setExpandedReference((prev) => (prev === referenceName ? null : referenceName));
  };

  const handleNext = () => {
    const finalMappings = referenceOptions.map((ref) => ({
      reference: ref.name,
      input: inputSelections[ref.name] || null,
    }));
    onNext(finalMappings);
  };

  return (
    <Box p={6}         minWidth="100vh"
>
      <Heading size="lg" mb={4}>Finalize Mapping</Heading>
      <Text mb={4}>Map input acquisitions to reference acquisitions:</Text>

      {/* Mapping Table */}
      <Box borderWidth="1px" borderRadius="md" overflowX="auto">
        <Table variant="simple">
          <Thead>
            <Tr>
              <Th>Reference Acquisition</Th>
              <Th>Input Acquisition</Th>
            </Tr>
          </Thead>
          <Tbody>
            {referenceOptions.map((reference, index) => (
              <React.Fragment key={index}>
                <Tr>
                  <Td>
                    <HStack spacing={2}>
                      <Text
                        fontWeight={expandedReference === reference.name ? "bold" : "normal"}
                        cursor="pointer"
                        onClick={() => toggleDetails(reference.name)}
                      >
                        {reference.name}
                      </Text>
                      <IconButton
                        size="sm"
                        icon={expandedReference === reference.name ? <ChevronDownIcon /> : <ChevronRightIcon />}
                        onClick={() => toggleDetails(reference.name)}
                        aria-label={`Toggle details for ${reference.name}`}
                      />
                    </HStack>
                  </Td>
                  <Td>
                    <Select
                      placeholder="Select Input Acquisition"
                      value={inputSelections[reference.name] || ""}
                      onChange={(e) => handleInputChange(reference.name, e.target.value)}
                    >
                      {inputOptions.map((option, idx) => (
                        <option key={idx} value={option}>{option}</option>
                      ))}
                    </Select>
                  </Td>
                </Tr>
                <Tr>
                  <Td colSpan={2} p={0}>
                    <Collapse in={expandedReference === reference.name} animateOpacity>
                      <Box
                        p={4}
                        bg="gray.50"
                        borderWidth="1px"
                        borderRadius="md"
                        maxH="150px"
                        overflowY="auto"
                      >
                        <Text><strong>Modality:</strong> {reference.details.Modality}</Text>
                        <Text><strong>Manufacturer:</strong> {reference.details.Manufacturer}</Text>
                        <Text><strong>Study Date:</strong> {reference.details.StudyDate}</Text>
                      </Box>
                    </Collapse>
                  </Td>
                </Tr>
              </React.Fragment>
            ))}
          </Tbody>
        </Table>
      </Box>

      {/* Next Button */}
      <Button
        mt={6}
        colorScheme="green"
        onClick={handleNext}
        isDisabled={Object.keys(inputSelections).length !== referenceOptions.length}
      >
        Finalize and Proceed
      </Button>
    </Box>
  );
};

export default FinalizeMapping;
