import React, { useState, useEffect, useRef } from "react";
import { useAlert } from "./Alert";
import {
  Box,
  Heading,
  Button,
  Divider,
  VStack,
  HStack,
  Text,
  Input,
  Select,
} from "@chakra-ui/react";
import Tagify from "@yaireo/tagify"; // Use the imported module directly
import "@yaireo/tagify/dist/tagify.css";

type ConstraintType = "value" | "range" | "value+tolerance" | "contains";

interface FieldData {
  constraintType: ConstraintType;
  value: string;
  minValue?: string;
  maxValue?: string;
  tolerance?: string;
}

interface ConstantField {
  id: string;
  name: string;
  data: FieldData;
}

interface VariableRow {
  Series: FieldData;
  [key: string]: FieldData;
}

interface FormData {
  constant: ConstantField[];
  variable: VariableRow[];
}

interface CollapsibleCardProps {
  acquisition: string;
  pyodide: any;
  validFields: string[];
  onDeleteAcquisition?: (acquisition: string) => void;
  onSaveAcquisition?: (acquisition: string, acquisitionJson: any) => void;
  onGlobalEditChange?: (acq: string, isEditing: boolean) => void;
  onStageChange?: (acq: string, stage: number) => void;
  initialEditMode?: boolean;
  initialStage?: number;
  hideBackButton?: boolean;
}

interface AutocompleteInputProps {
  initialValue: string;
  validFields: string[];
  onChange: (value: string) => void;
}

// AutocompleteInput using a native datalist for constant fields
const AutocompleteInput: React.FC<AutocompleteInputProps> = ({
  initialValue,
  validFields,
  onChange,
}) => {
  const [value, setValue] = useState(initialValue);
  // Create a unique id for the datalist to prevent collisions.
  const idRef = useRef("valid-fields-" + Math.random().toString(36).substr(2, 9));

  return (
    <>
      <Input
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          onChange(e.target.value);
        }}
        list={idRef.current}
        placeholder="Enter field name"
      />
      <datalist id={idRef.current}>
        {validFields.map((field) => (
          <option key={field} value={field} />
        ))}
      </datalist>
    </>
  );
};

const CollapsibleCard: React.FC<CollapsibleCardProps> = ({
  acquisition,
  pyodide,
  validFields,
  onDeleteAcquisition,
  onSaveAcquisition,
  onGlobalEditChange,
  onStageChange,
  initialEditMode = false,
  initialStage = 1,
  hideBackButton = false,
}) => {
  const [stage, setStage] = useState<number>(initialStage);
  const [loading, setLoading] = useState<boolean>(false);
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [formData, setFormData] = useState<FormData>({ constant: [], variable: [] });
  const [editingRows, setEditingRows] = useState<Record<number, boolean>>({});
  const [editingConstants, setEditingConstants] = useState<Record<string, boolean>>({});
  const [globalEdit, setGlobalEdit] = useState<boolean>(initialEditMode);

  const [acquisitionTitle, setAcquisitionTitle] = useState<string>(acquisition);
  const [acquisitionDescription, setAcquisitionDescription] = useState<string>("");

  // The multi-select field for stage 1 still uses Tagify.
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const tagifyRef = useRef<any>(null);

  const { displayAlert } = useAlert();

  // Helper function to transform a FieldData value.
  const transformField = (data: FieldData): any => {
    // Attempt to parse as a number; if valid, return numeric value.
    const num = parseFloat(data.value);
    return !isNaN(num) ? num : data.value;
  };

  const presetOptions = [
    {
      label: "QSM",
      tags: ["FlipAngle", "MagneticFieldStrength", "RepetitionTime", "EchoTime", "ImageType"],
    },
    {
      label: "Default",
      tags: [],
    },
  ];

  useEffect(() => {
    if (onGlobalEditChange) {
      onGlobalEditChange(acquisition, globalEdit);
    }
  }, [globalEdit, onGlobalEditChange, acquisition]);

  useEffect(() => {
    if (onStageChange) {
      onStageChange(acquisition, stage);
    }
  }, [stage, onStageChange, acquisition]);

  useEffect(() => {
    if (stage === 1 && inputRef.current && validFields.length) {
      if (tagifyRef.current) {
        tagifyRef.current.destroy();
        tagifyRef.current = null;
      }
      tagifyRef.current = new Tagify(inputRef.current, {
        enforceWhitelist: true,
        whitelist: validFields,
        dropdown: { enabled: 1, maxItems: 10, position: "all" },
        outerWidth: "100%",
      });
      if (selectedFields.length > 0) {
        tagifyRef.current.addTags(selectedFields);
      }
      tagifyRef.current.on("change", () => {
        const tags = tagifyRef.current.value.map((tag: any) => tag.value);
        setSelectedFields(tags);
      });
    }
  }, [stage, validFields]);

  const handleGlobalSave = () => {
    const constantFieldsJson = formData.constant.map(field => ({
      field: field.name,
      value: transformField(field.data),
    }));
    const seriesJson = formData.variable.map(row => {
      const seriesName = row.Series.value;
      const fields = Object.keys(row)
        .filter(key => key !== "Series")
        .map(key => ({
          field: key,
          value: transformField(row[key]),
        }));
      return { name: seriesName, fields };
    });
    const acquisitionJson = { fields: constantFieldsJson, series: seriesJson };
    // Pass the JSON upward
    if (onSaveAcquisition) {
      onSaveAcquisition(acquisition, acquisitionJson);
    }
    // Exit global edit mode
    setGlobalEdit(false);
  };

  const handleDeleteAcquisition = () => {
    if (onDeleteAcquisition) {
      onDeleteAcquisition(acquisition);
    }
  };

  const handleNext = async () => {
    setLoading(true);
    try {
      pyodide.globals.set("current_acquisition", acquisition);
      pyodide.globals.set("selected_fields", selectedFields);
      const uniqueRows = await pyodide.runPythonAsync(`
        df = session[session['Acquisition'] == current_acquisition][selected_fields].drop_duplicates()
        df = df.sort_values(by=list(selected_fields))
        result = df.to_dict(orient='records')
        for i in range(len(result)):
          result[i]['Series'] = i + 1
        result
      `);
      const data = uniqueRows.toJs();
      const { constantFields, variableFields } = computeConstantFields(data, selectedFields);
      const newConstant: ConstantField[] = [];
      for (const field in constantFields) {
        newConstant.push({
          id: field,
          name: field,
          data: { constraintType: "value", value: String(constantFields[field]) },
        });
      }
      const newVariable: VariableRow[] = data.map((row: Record<string, any>) => {
        const newRow: VariableRow = {
          Series: { constraintType: "value", value: String(row["Series"]) },
        };
        for (const field of variableFields) {
          newRow[field] = { constraintType: "value", value: String(row[field] || "") };
        }
        return newRow;
      });
      setFormData({ constant: newConstant, variable: newVariable });
      setStage(2);
      setGlobalEdit(false);
      handleGlobalSave();
    } catch (err) {
      console.error("Error fetching data:", err);
    } finally {
      setLoading(false);
    }
  };

  const updateConstantField = (
    id: string,
    updates: Partial<FieldData> & { name?: string }
  ) => {
    setFormData((prev) => {
      const newConst = prev.constant.map((field) =>
        field.id === id
          ? { ...field, name: updates.name ?? field.name, data: { ...field.data, ...updates } }
          : field
      );
      return { ...prev, constant: newConst };
    });
  };

  const updateVariableField = (
    rowIndex: number,
    field: string,
    updates: Partial<FieldData>
  ) => {
    setFormData((prev) => {
      const newVariable = prev.variable.map((row, idx) => {
        if (idx === rowIndex) {
          return { ...row, [field]: { ...row[field], ...updates } };
        }
        return row;
      });
      return { ...prev, variable: newVariable };
    });
  };

  const handleMakeVariable = (id: string) => {
    const fieldToConvert = formData.constant.find((f) => f.id === id);
    if (!fieldToConvert) return;
    const columnName = fieldToConvert.name;
    setFormData((prev) => {
      const newConstant = prev.constant.filter((f) => f.id !== id);
      let newVariable = prev.variable.map((row) => ({
        ...row,
        [columnName]: fieldToConvert.data,
      }));
      if (newVariable.length === 0) {
        newVariable = [
          {
            Series: { constraintType: "value", value: "1" },
            [columnName]: fieldToConvert.data,
          },
        ];
      }
      return { constant: newConstant, variable: newVariable };
    });
    setEditingConstants((prev) => {
      const newFlags = { ...prev };
      delete newFlags[id];
      return newFlags;
    });
  };

  const deduplicateRows = (rows: VariableRow[]): VariableRow[] => {
    const seen = new Set<string>();
    const deduped = rows.filter((row) => {
      const { Series, ...rest } = row;
      const sorted = Object.keys(rest)
        .sort()
        .reduce((acc, key) => {
          acc[key] = rest[key];
          return acc;
        }, {} as Record<string, any>);
      const key = JSON.stringify(sorted);
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
    return deduped.map((row, index) => ({
      ...row,
      Series: { ...row.Series, value: String(index + 1) },
    }));
  };

  const computeConstantFields = (data: any[], selectedFields: string[]) => {
    let constantFields: Record<string, any> = {};
    let variableFields: string[] = [];

    if (data.length > 0) {
      selectedFields.forEach((field) => {
        const allSame = data.every((row) => row[field] === data[0][field]);
        if (allSame) {
          constantFields[field] = data[0][field];
        } else {
          variableFields.push(field);
        }
      });
    }
    return { constantFields, variableFields };
  };

  const handleMakeConstant = (column: string) => {
    setFormData((prev) => {
      let earliestValue: FieldData = { constraintType: "value", value: "" };
      if (prev.variable.length > 0 && prev.variable[0][column]) {
        earliestValue = prev.variable[0][column];
      }
      let newVariable = prev.variable.map((row) => {
        const newRow = { ...row };
        delete newRow[column];
        return newRow;
      });
      newVariable = deduplicateRows(newVariable);
      const newConstantField = {
        id: column,
        name: column,
        data: earliestValue,
      };
      return { constant: [...prev.constant, newConstantField], variable: newVariable };
    });
  };

  const handleAddConstantField = () => {
    const newField = {
      id: String(Date.now()),
      name: "",
      data: { constraintType: "value", value: "" },
    };
    setFormData((prev) => ({
      ...prev,
      constant: [...prev.constant, newField],
    }));
    setEditingConstants((prev) => ({ ...prev, [newField.id]: true }));
  };

  const handleAddSeries = () => {
    setFormData((prev) => {
      const nextSeries = prev.variable.length + 1;
      const newRow: VariableRow = { Series: { constraintType: "value", value: String(nextSeries) } };
      if (prev.variable.length > 0) {
        Object.keys(prev.variable[0]).forEach((col) => {
          if (col !== "Series") {
            newRow[col] = { constraintType: "value", value: "" };
          }
        });
      }
      return { ...prev, variable: [...prev.variable, newRow] };
    });
    setEditingRows((prev) => ({ ...prev, [formData.variable.length]: true }));
  };

  const handleDeleteConstantField = (id: string) => {
    setFormData((prev) => ({
      ...prev,
      constant: prev.constant.filter((field) => field.id !== id),
    }));
    setEditingConstants((prev) => {
      const newFlags = { ...prev };
      delete newFlags[id];
      return newFlags;
    });
  };

  const handleDeleteSeries = (rowIndex: number) => {
    setFormData((prev) => {
      const filtered = prev.variable.filter((_, idx) => idx !== rowIndex);
      const renumbered = filtered.map((row, index) => ({
        ...row,
        Series: { ...row.Series, value: String(index + 1) },
      }));
      return { ...prev, variable: renumbered };
    });
    setEditingRows({});
  };

  const handleDeleteVariableColumn = (column: string) => {
    setFormData((prev) => {
      let newVariable = prev.variable.map((row) => {
        const newRow = { ...row };
        delete newRow[column];
        return newRow;
      });
      newVariable = deduplicateRows(newVariable);
      const colsRemaining = new Set<string>();
      newVariable.forEach((row) => {
        Object.keys(row).forEach((k) => {
          if (k !== "Series") colsRemaining.add(k);
        });
      });
      if (colsRemaining.size === 0) {
        newVariable = [];
      }
      return { ...prev, variable: newVariable };
    });
  };

  const getRowUniqueKey = (row: VariableRow): string => {
    const keys = Object.keys(row).filter((key) => key !== "Series").sort();
    return keys
      .map((key) => {
        const { constraintType, value, minValue, maxValue, tolerance } = row[key];
        return `${key}:${constraintType}:${value}:${minValue || ""}:${maxValue || ""}:${tolerance || ""}`;
      })
      .join("|");
  };

  const toggleEditConstant = (id: string) => {
    const field = formData.constant.find((f) => f.id === id);
    if (editingConstants[id]) {
      if (!field?.name.trim()) {
        displayAlert("Field name cannot be empty.", "Validation Error");
        return;
      }
      const duplicates = formData.constant.filter((f) => f.name === field.name);
      if (duplicates.length > 1) {
        displayAlert("Field names must be unique.", "Validation Error");
        return;
      }
    }
    setEditingConstants((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleEditRow = (rowIndex: number) => {
    if (editingRows[rowIndex]) {
      const currentRow = formData.variable[rowIndex];
      if (currentRow) {
        const currentKey = getRowUniqueKey(currentRow);
        const duplicate = formData.variable.some((row, idx) => {
          if (idx === rowIndex) return false;
          return getRowUniqueKey(row) === currentKey;
        });
        const duplicateSeries = formData.variable.some((row, idx) => {
          if (idx === rowIndex) return false;
          return row.Series.value === currentRow.Series.value;
        });
        if (duplicateSeries) {
          displayAlert("Series names must be unique.", "Validation Error");
          return;
        }
        if (duplicate) {
          displayAlert("Variable rows must be unique.", "Validation Error");
          return;
        }
      }
    }
    setEditingRows((prev) => ({ ...prev, [rowIndex]: !prev[rowIndex] }));
  };

  const EditableCell: React.FC<{
    cellData: FieldData;
    editable: boolean;
    onChange: (updates: Partial<FieldData>) => void;
    fieldName?: string;
  }> = ({ cellData, editable, onChange, fieldName }) => {
    const [localValue, setLocalValue] = useState(cellData.value);
    const [localMin, setLocalMin] = useState(cellData.minValue || "");
    const [localMax, setLocalMax] = useState(cellData.maxValue || "");
    const [localTolerance, setLocalTolerance] = useState(cellData.tolerance || "");

    useEffect(() => {
      if (!editable) {
        setLocalValue(cellData.value);
        setLocalMin(cellData.minValue || "");
        setLocalMax(cellData.maxValue || "");
        setLocalTolerance(cellData.tolerance || "");
      }
    }, [editable, cellData]);

    if (!editable) {
      let display = "";
      switch (cellData.constraintType) {
        case "value":
          display = cellData.value;
          break;
        case "range":
          display = `range: [${cellData.minValue || ""}, ${cellData.maxValue || ""}]`;
          break;
        case "value+tolerance":
          display = `${cellData.value} +/- ${cellData.tolerance || ""}`;
          break;
        case "contains":
          display = `contains: ${cellData.value}`;
          break;
        default:
          display = cellData.value;
      }
      return <Text>{display}</Text>;
    }

    return (
      <VStack align="start" spacing={1}>
        {fieldName !== "Series" && (
          <Select
            size="xs"
            value={cellData.constraintType}
            onChange={(e) =>
              onChange({ constraintType: e.target.value as ConstraintType })
            }
          >
            <option value="value">Exact Value</option>
            <option value="range">Range</option>
            <option value="value+tolerance">Value + Tolerance</option>
            <option value="contains">Contains</option>
          </Select>
        )}
        {cellData.constraintType === "value" && (
          <Input
            size="xs"
            value={localValue}
            onChange={(e) => setLocalValue(e.target.value)}
            onBlur={() => onChange({ value: localValue })}
            width={40}
          />
        )}
        {cellData.constraintType === "range" && (
          <HStack spacing={1}>
            <Input
              size="xs"
              placeholder="Min"
              value={localMin}
              onChange={(e) => setLocalMin(e.target.value)}
              onBlur={() => onChange({ minValue: localMin })}
              width={20}
            />
            <Input
              size="xs"
              placeholder="Max"
              value={localMax}
              onChange={(e) => setLocalMax(e.target.value)}
              onBlur={() => onChange({ maxValue: localMax })}
              width={20}
            />
          </HStack>
        )}
        {cellData.constraintType === "value+tolerance" && (
          <>
            <Input
              size="xs"
              value={localValue}
              onChange={(e) => setLocalValue(e.target.value)}
              onBlur={() => onChange({ value: localValue })}
              width={40}
            />
            <Input
              size="xs"
              placeholder="Tolerance"
              value={localTolerance}
              onChange={(e) => setLocalTolerance(e.target.value)}
              onBlur={() => onChange({ tolerance: localTolerance })}
              width={40}
            />
          </>
        )}
        {cellData.constraintType === "contains" && (
          <Input
            size="xs"
            value={localValue}
            onChange={(e) => setLocalValue(e.target.value)}
            onBlur={() => onChange({ value: localValue })}
            width={40}
          />
        )}
      </VStack>
    );
  };

  const renderConstantFieldsTable = () => (
    <Box width="100%" mb={4}>
      {formData.constant.length === 0 ? null : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ borderBottom: "1px solid #ccc" }}>Field</th>
              <th style={{ borderBottom: "1px solid #ccc", textAlign: "right" }}>Value</th>
              {globalEdit && <th style={{ borderBottom: "1px solid #ccc", textAlign: "center" }}>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {formData.constant.map((fieldObj) => (
              <tr key={fieldObj.id}>
                <td style={{ borderBottom: "1px solid #eee", padding: "4px" }}>
                  {globalEdit && editingConstants[fieldObj.id] ? (
                    <AutocompleteInput
                      initialValue={fieldObj.name}
                      validFields={validFields}
                      onChange={(value) => updateConstantField(fieldObj.id, { name: value })}
                    />
                  ) : (
                    <Text>{fieldObj.name || "(no name)"}</Text>
                  )}
                </td>
                <td style={{ borderBottom: "1px solid #eee", padding: "4px", textAlign: "right" }}>
                  <EditableCell
                    cellData={fieldObj.data}
                    editable={globalEdit && !!editingConstants[fieldObj.id]}
                    onChange={(updates) => updateConstantField(fieldObj.id, updates)}
                    fieldName={fieldObj.name}
                  />
                </td>
                {globalEdit && (
                  <td style={{ borderBottom: "1px solid #eee", padding: "4px", textAlign: "center" }}>
                    <Button size="xs" onClick={() => toggleEditConstant(fieldObj.id)}>
                      {editingConstants[fieldObj.id] ? "Save" : "Edit"}
                    </Button>
                    {!editingConstants[fieldObj.id] && (
                      <Button size="xs" ml={2} onClick={() => handleMakeVariable(fieldObj.id)}>
                        Make variable
                      </Button>
                    )}
                    <Button size="xs" colorScheme="red" ml={2} onClick={() => handleDeleteConstantField(fieldObj.id)}>
                      Delete
                    </Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {globalEdit && (
        <Button size="sm" mt={2} onClick={handleAddConstantField}>
          Add Constant Field
        </Button>
      )}
    </Box>
  );

  const renderVariableRowsTable = () => {
    if (formData.variable.length === 0) return null;
    const firstRow = formData.variable[0];
    const otherCols = Object.keys(firstRow).filter((col) => col !== "Series");
    const columns = ["Series", ...otherCols];
    return (
      <Box width="100%">
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col} style={{ borderBottom: "1px solid #ccc", padding: "4px" }}>
                  {col === "Series" ? (
                    <Text>{col}</Text>
                  ) : (
                    <VStack spacing={1}>
                      <Text>{col}</Text>
                      {globalEdit && (
                        <HStack spacing={1}>
                          <Button size="xs" onClick={() => handleMakeConstant(col)}>
                            Make constant
                          </Button>
                          <Button size="xs" colorScheme="red" onClick={() => handleDeleteVariableColumn(col)}>
                            Delete
                          </Button>
                        </HStack>
                      )}
                    </VStack>
                  )}
                </th>
              ))}
              {globalEdit && (
                <th style={{ borderBottom: "1px solid #ccc", padding: "4px", textAlign: "right" }}>
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {formData.variable.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {columns.map((col) => (
                  <td key={col} style={{ borderBottom: "1px solid #eee", padding: "4px" }}>
                    {col === "Series" ? (
                      globalEdit && editingRows[rowIndex] ? (
                        <EditableCell
                          cellData={row.Series}
                          editable={true}
                          onChange={(updates) => updateVariableField(rowIndex, "Series", updates)}
                          fieldName="Series"
                        />
                      ) : (
                        <Text>{row.Series.value}</Text>
                      )
                    ) : (
                      <EditableCell
                        cellData={row[col]}
                        editable={globalEdit && !!editingRows[rowIndex]}
                        onChange={(updates) => updateVariableField(rowIndex, col, updates)}
                        fieldName={col}
                      />
                    )}
                  </td>
                ))}
                {globalEdit && (
                  <td style={{ borderBottom: "1px solid #eee", padding: "4px", textAlign: "center" }}>
                    <Button size="xs" onClick={() => toggleEditRow(rowIndex)}>
                      {editingRows[rowIndex] ? "Save" : "Edit"}
                    </Button>
                    <Button size="xs" colorScheme="red" ml={2} onClick={() => handleDeleteSeries(rowIndex)}>
                      Delete
                    </Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {globalEdit && (
          <Button size="sm" mt={2} onClick={handleAddSeries}>
            Add Series
          </Button>
        )}
      </Box>
    );
  };

  return (
    <Box p={4} borderWidth="1px" borderRadius="md" bg="white" boxShadow="sm" width="100%">
      <HStack justify="space-between" align="start" mb={4}>
        <Box>
          {globalEdit ? (
            <VStack align="start" spacing={2}>
              <Input
                size="md"
                value={acquisitionTitle}
                onChange={(e) => setAcquisitionTitle(e.target.value)}
                placeholder="Enter acquisition title"
                width="100%"
                mb={2}
              />
              <Input
                size="sm"
                value={acquisitionDescription}
                onChange={(e) => setAcquisitionDescription(e.target.value)}
                placeholder="Enter acquisition description (optional)"
                width="100%"
              />
            </VStack>
          ) : (
            <>
              <Heading as="h4" size="md" color="teal.500">
                {acquisitionTitle}
              </Heading>
              {acquisitionDescription && (
                <Text fontSize="sm" color="gray.600">
                  {acquisitionDescription}
                </Text>
              )}
            </>
          )}
        </Box>
        <HStack spacing={2}>
          {stage === 1 ? (
            <>
              <Button size="sm" onClick={handleNext} isLoading={loading} colorScheme="teal" disabled={!selectedFields.length}>
                Next
              </Button>
              <Button size="sm" colorScheme="red" onClick={handleDeleteAcquisition}>
                Delete
              </Button>
            </>
          ) : (
            <>
              {!hideBackButton && !globalEdit && (
                <Button size="sm" onClick={() => setStage(1)} colorScheme="teal">
                  Back
                </Button>
              )}
              {globalEdit ? (
                <Button size="sm" onClick={handleGlobalSave} colorScheme="blue" disabled={
                  Object.values(editingRows).some(v => v) || Object.values(editingConstants).some(v => v)
                }>
                  Save
                </Button>
              ) : (
                <Button size="sm" onClick={() => setGlobalEdit(true)} colorScheme="blue">
                  Edit
                </Button>
              )}
              <Button size="sm" colorScheme="red" onClick={handleDeleteAcquisition}>
                Delete
              </Button>
            </>
          )}
        </HStack>
      </HStack>
      {stage === 1 ? (
        <>
          <Box mt={2}>
            <Text fontSize="xs" color="gray.500" mb={1}>
              Presets:
            </Text>
            <Select
              size="sm"
              onChange={(e) => {
                const preset = presetOptions.find((p) => p.label === e.target.value);
                if (preset && tagifyRef.current) {
                  tagifyRef.current.removeAllTags();
                  tagifyRef.current.addTags(preset.tags);
                }
              }}
              placeholder="Select a preset..."
            >
              {presetOptions.map((preset) => (
                <option key={preset.label} value={preset.label}>
                  {preset.label}
                </option>
              ))}
            </Select>
          </Box>
          <Text fontSize="xs" mb={2} color="gray.500">
            Enter fields for validation:
          </Text>
          <textarea
            ref={inputRef}
            placeholder="Type or choose a field..."
            style={{ width: "100%", minHeight: "40px" }}
          />
          <Box mt={2}>
            <Text fontSize="xs" color="gray.500" mb={1}>
              All DICOM tags:
            </Text>
            <Box maxH="150px" overflowY="auto" border="1px solid #ccc" borderRadius="md" p={2}>
              <VStack align="start" spacing={1}>
                {validFields.map((tag) => (
                  <Button
                    key={tag}
                    size="xs"
                    variant="outline"
                    onClick={() => {
                      if (tagifyRef.current) {
                        tagifyRef.current.addTags([tag]);
                      }
                    }}
                  >
                    {tag}
                  </Button>
                ))}
              </VStack>
            </Box>
          </Box>
        </>
      ) : (
        <>
          <Divider my={4} />
          <VStack align="start" spacing={4} width="100%">
            {renderConstantFieldsTable()}
            {renderVariableRowsTable()}
          </VStack>
        </>
      )}
    </Box>
  );
};

export default CollapsibleCard;
