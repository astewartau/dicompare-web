import React, { useState } from "react";
import {
  Box,
  Heading,
  HStack,
  Button,
  Collapse,
  Divider,
  VStack,
  Text,
  Input,
  IconButton,
  useDisclosure,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Select as ChakraSelect,
  Switch,
  FormControl,
  FormLabel,
} from "@chakra-ui/react";
import Select from "react-select";
import { CloseIcon, EditIcon } from "@chakra-ui/icons";

const CollapsibleCard = ({ protocol, validFields }) => {
  const { isOpen, onToggle } = useDisclosure();

  // --- State for single-value input form
  const [selectedField, setSelectedField] = useState(null);
  const [inputType, setInputType] = useState("Value");
  const [newFieldValue, setNewFieldValue] = useState("");
  const [rangeValue, setRangeValue] = useState({ min: "", max: "" });
  const [toleranceValue, setToleranceValue] = useState({ value: "", tolerance: "" });
  const [containsValue, setContainsValue] = useState("");

  // --- State for table input form
  // Each element in `rows` has: { series: string, valueType: string, value: string }
  const [rows, setRows] = useState([]);

  // --- Toggling between single-value view and tabular view
  const [viewMode, setViewMode] = useState("single");

  // --- Global data
  const [dicomData, setDicomData] = useState(protocol.dicomData);
  const [editingIndex, setEditingIndex] = useState(null);

  // 1. When adding or editing a field, we can have single-value or table-based data.
  // 2. On "Save" we push or update into `dicomData`.

  const handleViewModeToggle = (checked) => {
    const newMode = checked ? "table" : "single";
    setViewMode(newMode);

    // If switching from single -> table while editing, try to convert the single input into one table row
    if (newMode === "table") {
      // Only if we actually have something in single-value inputs
      if (editingIndex !== null) {
        // We are editing an existing field: parse the existing dicomData[editingIndex] to rows
        const existing = dicomData[editingIndex];
        if (existing && !Array.isArray(existing.value)) {
          // Convert that single value into the rows array (1 row).
          const prevValueType = determineInputType(existing.value);
          const rowValue = parseValueForTable(prevValueType, existing.value);
          setRows([
            {
              series: "1",
              valueType: prevValueType,
              value: rowValue,
            },
          ]);
        } else if (Array.isArray(existing.value)) {
          // Already table data
          setRows(existing.value);
        }
      } else {
        // We're adding a new field. If there's something in single-value form, convert to 1 row.
        const rowValue = getSingleValuePreview();
        if (rowValue) {
          setRows([
            {
              series: "1",
              valueType: inputType,
              value: rowValue,
            },
          ]);
        }
      }
    } else {
      // If switching back to single mode, we could parse the first row back into single-value fields.
      // For simplicity, we only parse the first row if it exists.
      if (rows && rows.length > 0) {
        const [firstRow] = rows;
        setInputType(firstRow.valueType);
        restoreSingleValueFromRow(firstRow.valueType, firstRow.value);
      }
    }
  };

  const parseValueForTable = (type, str) => {
    // Convert the stored string (like "Range: 1 - 10") into the raw value for the table cell.
    // We'll keep it simple and just store the entire raw string in the table cell.
    // Alternatively, you could parse it more deeply if needed.
    return str;
  };

  const restoreSingleValueFromRow = (type, str) => {
    // We do the reverse of parseValueForTable.
    // If it was "Range: 1 - 10", we set rangeValue = { min: "1", max: "10" }
    // If it was "Value: 5, Tolerance: ±2", we set toleranceValue accordingly.
    // etc.
    if (type === "Range") {
      const [min, max] = str.replace("Range: ", "").split(" - ");
      setRangeValue({ min, max });
    } else if (type === "Value and Tolerance") {
      const [valueStr, tolStr] = str
        .replace("Value: ", "")
        .replace(", Tolerance: ±", "|")
        .split("|");
      setToleranceValue({ value: valueStr, tolerance: tolStr });
    } else if (type === "Contains") {
      setContainsValue(str.replace("Contains: ", ""));
    } else {
      // default "Value"
      setNewFieldValue(str);
    }
  };

  const getSingleValuePreview = () => {
    // This returns the single-value that the user entered, as a single string
    // so we can store it in the table row if they switch to table mode.
    let value = "";
    if (inputType === "Value") {
      value = newFieldValue;
    } else if (inputType === "Range") {
      value = `Range: ${rangeValue.min} - ${rangeValue.max}`;
    } else if (inputType === "Value and Tolerance") {
      value = `Value: ${toleranceValue.value}, Tolerance: ±${toleranceValue.tolerance}`;
    } else if (inputType === "Contains") {
      value = `Contains: ${containsValue}`;
    }
    return value;
  };

  const handleAddOrEditField = () => {
    // If we are in 'single' mode, build the value from the single-value inputs
    // If we are in 'table' mode, build the value as an array of rows
    if (selectedField) {
      let finalValue;

      if (viewMode === "single") {
        finalValue = getSingleValuePreview();
        if (!finalValue) return; // no empty
      } else {
        // viewMode === "table"
        // We store the entire rows array
        if (rows.length === 0) {
          // no empty table
          return;
        }
        finalValue = [...rows]; // copy array
      }

      const updatedData = [...dicomData];
      if (editingIndex !== null) {
        // Update existing
        updatedData[editingIndex] = { key: selectedField.value, value: finalValue };
      } else {
        // Add new
        updatedData.push({ key: selectedField.value, value: finalValue });
      }

      setDicomData(updatedData);
      handleClearInputs();
    }
  };

  const handleEditField = (index) => {
    const fieldToEdit = dicomData[index];
    setEditingIndex(index);
    setSelectedField({ value: fieldToEdit.key, label: fieldToEdit.key });

    // Detect if the field is an array => switch to table mode
    if (Array.isArray(fieldToEdit.value)) {
      setViewMode("table");
      setRows(fieldToEdit.value);
    } else {
      // Single-value mode
      setViewMode("single");
      const fieldType = determineInputType(fieldToEdit.value);
      setInputType(fieldType);
      if (fieldType === "Value") {
        setNewFieldValue(fieldToEdit.value);
      } else if (fieldType === "Range") {
        const [min, max] = fieldToEdit.value.replace("Range: ", "").split(" - ");
        setRangeValue({ min, max });
      } else if (fieldType === "Value and Tolerance") {
        const [value, tolerance] = fieldToEdit.value
          .replace("Value: ", "")
          .replace(", Tolerance: ±", "|")
          .split("|");
        setToleranceValue({ value, tolerance });
      } else if (fieldType === "Contains") {
        setContainsValue(fieldToEdit.value.replace("Contains: ", ""));
      }
    }
  };

  const determineInputType = (value) => {
    if (value.startsWith("Range:")) return "Range";
    if (value.startsWith("Value:")) return "Value and Tolerance";
    if (value.startsWith("Contains:")) return "Contains";
    return "Value";
  };

  const handleClearInputs = () => {
    setSelectedField(null);
    setNewFieldValue("");
    setRangeValue({ min: "", max: "" });
    setToleranceValue({ value: "", tolerance: "" });
    setContainsValue("");
    setInputType("Value");
    setEditingIndex(null);
    setViewMode("single");
    setRows([]);
  };

  const handleRemoveField = (index) => {
    setDicomData(dicomData.filter((_, i) => i !== index));
  };

  // --- Table row modifications (for tabular mode)
  const addTableRow = () => {
    setRows([
      ...rows,
      {
        series: String(rows.length + 1),
        valueType: "Value",
        value: "",
      },
    ]);
  };

  const removeTableRow = (rowIndex) => {
    const updated = rows.filter((_, i) => i !== rowIndex);
    setRows(updated);
  };

  const handleTableRowChange = (rowIndex, key, val) => {
    const updated = [...rows];
    updated[rowIndex][key] = val;
    setRows(updated);
  };

  const fieldOptions = validFields.map((field) => ({
    value: field,
    label: field,
  }));

  const inputTypeOptions = [
    { value: "Value", label: "Value" },
    { value: "Range", label: "Range" },
    { value: "Value and Tolerance", label: "Value and Tolerance" },
    { value: "Contains", label: "Contains" },
  ];

  return (
    <Box p={4} borderWidth="1px" borderRadius="md" bg="white" boxShadow="sm" minWidth="100%">
      {/* Card Header */}
      <HStack justify="space-between">
        <Heading as="h3" size="md" color="teal.500">
          {protocol.ProtocolName}
        </Heading>
        <Button size="sm" onClick={onToggle} colorScheme="teal">
          {isOpen ? "Collapse" : "Expand"}
        </Button>
      </HStack>

      <Collapse in={isOpen} animateOpacity style={{ width: "100%" }}>
        <Divider my={4} />

        {/* DICOM Data Display */}
        <VStack align="start" spacing={2} maxHeight={200} overflowY="auto" width="100%">
          {dicomData.map((item, index) => (
            <Box key={index} width="100%">
              {/* If the value is an array, display it as a table, else as normal text */}
              {Array.isArray(item.value) ? (
                <VStack align="start" spacing={1} width="100%">
                  <HStack justify="space-between" width="100%">
                    <Text fontWeight="bold" fontSize="md" color="gray.600">
                      {item.key} (Tabular):
                    </Text>
                    <HStack>
                      <IconButton
                        icon={<EditIcon />}
                        size="xs"
                        colorScheme="blue"
                        onClick={() => handleEditField(index)}
                      />
                      <IconButton
                        icon={<CloseIcon />}
                        size="xs"
                        colorScheme="red"
                        onClick={() => handleRemoveField(index)}
                      />
                    </HStack>
                  </HStack>
                  <Table size="sm" variant="simple">
                    <Thead>
                      <Tr>
                        <Th>Series</Th>
                        <Th>Value Type</Th>
                        <Th>Value</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {item.value.map((row, rowIndex) => (
                        <Tr key={rowIndex}>
                          <Td>{row.series}</Td>
                          <Td>{row.valueType}</Td>
                          <Td>{row.value}</Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                </VStack>
              ) : (
                <HStack justify="space-between" width="100%">
                  <HStack>
                    <Text fontWeight="bold" fontSize="md" color="gray.600">
                      {item.key}:
                    </Text>
                    <Text fontSize="md" color="gray.800">
                      {item.value}
                    </Text>
                  </HStack>
                  <HStack>
                    <IconButton
                      icon={<EditIcon />}
                      size="xs"
                      colorScheme="blue"
                      onClick={() => handleEditField(index)}
                    />
                    <IconButton
                      icon={<CloseIcon />}
                      size="xs"
                      colorScheme="red"
                      onClick={() => handleRemoveField(index)}
                    />
                  </HStack>
                </HStack>
              )}
            </Box>
          ))}
        </VStack>

        <Divider my={4} />

        {/* Add/Edit Form */}
        <VStack align="start" spacing={4} width="100%">
          {/* Field Selection */}
          <Select
            options={fieldOptions}
            value={selectedField}
            onChange={(selectedOption) => setSelectedField(selectedOption)}
            placeholder="Search or select field"
            isSearchable
            styles={{ container: (base) => ({ ...base, width: "100%" }) }}
          />

          {/* Toggle between single-value and table */}
          <FormControl display="flex" alignItems="center">
            <FormLabel htmlFor="view-mode-switch" mb="0">
              Tabular View?
            </FormLabel>
            <Switch
              id="view-mode-switch"
              isChecked={viewMode === "table"}
              onChange={(e) => handleViewModeToggle(e.target.checked)}
            />
          </FormControl>

          {/* If single-value view, show the existing input fields */}
          {viewMode === "single" && (
            <>
              <ChakraSelect
                value={inputType}
                onChange={(e) => setInputType(e.target.value)}
                placeholder="Select input type"
              >
                {inputTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </ChakraSelect>

              {inputType === "Value" && (
                <Input
                  placeholder="Enter value"
                  value={newFieldValue}
                  onChange={(e) => setNewFieldValue(e.target.value)}
                  width="100%"
                />
              )}
              {inputType === "Range" && (
                <HStack width="100%">
                  <Input
                    placeholder="Min value"
                    value={rangeValue.min}
                    onChange={(e) =>
                      setRangeValue({ ...rangeValue, min: e.target.value })
                    }
                    width="48%"
                  />
                  <Input
                    placeholder="Max value"
                    value={rangeValue.max}
                    onChange={(e) =>
                      setRangeValue({ ...rangeValue, max: e.target.value })
                    }
                    width="48%"
                  />
                </HStack>
              )}
              {inputType === "Value and Tolerance" && (
                <HStack width="100%">
                  <Input
                    placeholder="Value"
                    value={toleranceValue.value}
                    onChange={(e) =>
                      setToleranceValue({
                        ...toleranceValue,
                        value: e.target.value,
                      })
                    }
                    width="48%"
                  />
                  <Input
                    placeholder="Tolerance"
                    value={toleranceValue.tolerance}
                    onChange={(e) =>
                      setToleranceValue({
                        ...toleranceValue,
                        tolerance: e.target.value,
                      })
                    }
                    width="48%"
                  />
                </HStack>
              )}
              {inputType === "Contains" && (
                <Input
                  placeholder="Enter substring"
                  value={containsValue}
                  onChange={(e) => setContainsValue(e.target.value)}
                  width="100%"
                />
              )}
            </>
          )}

          {/* If table view, show the table input form */}
          {viewMode === "table" && (
            <VStack align="start" spacing={2} width="100%">
              <Table size="sm" variant="simple">
                <Thead>
                  <Tr>
                    <Th>Series</Th>
                    <Th>Value Type</Th>
                    <Th>Value</Th>
                    <Th>Remove</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {rows.map((row, rowIndex) => (
                    <Tr key={rowIndex}>
                      <Td>
                        <Input
                          size="sm"
                          value={row.series}
                          onChange={(e) =>
                            handleTableRowChange(rowIndex, "series", e.target.value)
                          }
                        />
                      </Td>
                      <Td>
                        <ChakraSelect
                          size="sm"
                          value={row.valueType}
                          onChange={(e) =>
                            handleTableRowChange(rowIndex, "valueType", e.target.value)
                          }
                        >
                          {inputTypeOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </ChakraSelect>
                      </Td>
                      <Td>
                        <Input
                          size="sm"
                          value={row.value}
                          onChange={(e) =>
                            handleTableRowChange(rowIndex, "value", e.target.value)
                          }
                        />
                      </Td>
                      <Td>
                        <IconButton
                          icon={<CloseIcon />}
                          size="sm"
                          colorScheme="red"
                          onClick={() => removeTableRow(rowIndex)}
                        />
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
              <Button size="sm" onClick={addTableRow} colorScheme="blue">
                Add Row
              </Button>
            </VStack>
          )}

          {/* Action Buttons */}
          <HStack spacing={4} width="100%">
            <Button colorScheme="teal" size="sm" onClick={handleAddOrEditField}>
              {editingIndex !== null ? "Save Changes" : "Add Field"}
            </Button>
            <Button colorScheme="gray" size="sm" onClick={handleClearInputs}>
              Clear
            </Button>
          </HStack>
        </VStack>
      </Collapse>
    </Box>
  );
};

export default CollapsibleCard;
