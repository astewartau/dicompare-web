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
import Tagify from "@yaireo/tagify";
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
  id: string; // unique ID
  name: string; // field name (may be empty initially)
  data: FieldData;
}

interface VariableRow {
  // Each row must include a "Series" field.
  Series: FieldData;
  [key: string]: FieldData;
}

interface FormData {
  constant: ConstantField[]; // constant fields array
  variable: VariableRow[];   // variable rows array
}

interface CollapsibleCardProps {
  acquisition: string;
  pyodide: any;
  validFields: string[];
  onDataChange: (acquisition: string, data: any) => void;
}

/** Given an array of plain row objects and a list of fields,
 * compute which fields are constant (all rows have the same value) and which vary.
 */
function computeConstantFields(
  rows: Record<string, any>[],
  fields: string[]
): { constantFields: Record<string, any>; variableFields: string[] } {
  const constantFields: Record<string, any> = {};
  const variableFields = [...fields];
  if (!rows.length || !fields.length) return { constantFields, variableFields };
  for (const field of fields) {
    const firstVal = rows[0][field];
    let isConstant = true;
    for (let i = 0; i < rows.length; i++) {
      if (rows[i][field] !== firstVal) {
        isConstant = false;
        break;
      }
    }
    if (isConstant) {
      constantFields[field] = firstVal;
      const idx = variableFields.indexOf(field);
      if (idx !== -1) variableFields.splice(idx, 1);
    }
  }
  return { constantFields, variableFields };
}

/**
 * This component has two stages:
 *
 * 1. Stage 1 – The user selects tags via a Tagify input.
 *
 * 2. Stage 2 – Data is fetched via Python and used to prefill a form data object.
 *    The UI then displays two tables (constant fields and variable rows).
 *
 * Initially, stage 2 displays a neat, read‑only table (no extra buttons or actions).
 * At the top of stage 2 (along with the Back button) is a large "EDIT" button.
 * When the user clicks EDIT, all the action buttons (Edit/Save, Delete, Make variable, etc.)
 * and an extra Actions column appear in both tables. The global button then changes to "SAVE".
 * Clicking SAVE returns the tables to read‑only mode.
 */
const CollapsibleCard: React.FC<CollapsibleCardProps> = ({
  acquisition,
  pyodide,
  validFields,
  onDataChange,
}) => {
  const [stage, setStage] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(false);
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [formData, setFormData] = useState<FormData>({ constant: [], variable: [] });
  // Use row index as the unique identifier for editing variable rows.
  const [editingRows, setEditingRows] = useState<Record<number, boolean>>({});
  // Flags for constant fields editing.
  const [editingConstants, setEditingConstants] = useState<Record<string, boolean>>({});
  // Global edit mode for stage 2.
  const [globalEdit, setGlobalEdit] = useState<boolean>(false);

  // Refs for Tagify.
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const tagifyRef = useRef<any>(null);

  // Refs for useAlert
  const { displayAlert } = useAlert();

  // Define preset options for stage 1.
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

  // Initialize Tagify in stage 1.
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
      tagifyRef.current.on("change", () => {
        const tags = tagifyRef.current.value.map((tag: any) => tag.value);
        setSelectedFields(tags);
      });
    }
  }, [stage, validFields]);

  // Push updated data to parent when formData changes in stage 2.
  useEffect(() => {
    if (stage === 2) {
      const constantFields = formData.constant.map(field => ({
        field: field.name,
        value: field.data.value
      }));
      const series = formData.variable.map(row => {
        const seriesName = row.Series.value; // now directly use the text
        const fields = Object.keys(row)
          .filter(key => key !== "Series")
          .map(key => ({
            field: key,
            value: row[key].value
          }));
        return { name: seriesName, fields };
      });
      const formattedData = { fields: constantFields, series: series };
      onDataChange(acquisition, formattedData);
    }
  }, [formData, stage, acquisition, onDataChange]);

  // When Next is pressed, fetch data via Python and prefill formData.
  const handleNext = async () => {
    if (!selectedFields.length) return;
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
      const data = uniqueRows.toJs(); // data is an array of plain objects
      const { constantFields, variableFields } = computeConstantFields(data, selectedFields);
      // Build constant formData as an array.
      const newConstant: ConstantField[] = [];
      for (const field in constantFields) {
        newConstant.push({
          id: field,
          name: field,
          data: { constraintType: "value", value: String(constantFields[field]) },
        });
      }
      // Build variable rows. Store Series as a string.
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
      setGlobalEdit(false); // start read-only
    } catch (err) {
      console.error("Error fetching data:", err);
    } finally {
      setLoading(false);
    }
  };

  // Functions to update formData.
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

  // "Make variable": remove constant field (by id) and add it as a new column in every variable row.
  // If no variable row exists, create one.
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
      // Sort keys for consistency.
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
    // Renumber Series values.
    return deduped.map((row, index) => ({
      ...row,
      Series: { ...row.Series, value: String(index + 1) },
    }));
  };


  // "Make constant" for a variable column: delete the column and add a new constant field.
  // Its value is taken from the first variable row.
  const handleMakeConstant = (column: string) => {
    setFormData((prev) => {
      // Get the earliest value from the first row for the column.
      let earliestValue: FieldData = { constraintType: "value", value: "" };
      if (prev.variable.length > 0 && prev.variable[0][column]) {
        earliestValue = prev.variable[0][column];
      }
      // Remove the column from each variable row.
      let newVariable = prev.variable.map((row) => {
        const newRow = { ...row };
        delete newRow[column];
        return newRow;
      });
      // Deduplicate rows using the helper.
      newVariable = deduplicateRows(newVariable);
      // Create the new constant field.
      const newConstantField = {
        id: column,
        name: column,
        data: earliestValue,
      };
      return { constant: [...prev.constant, newConstantField], variable: newVariable };
    });
  };



  // Add a new constant field row with an empty field name.
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
    // Set edit mode for the new row using its index.
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

  // When deleting a row, renumber Series so they remain consecutive (as strings).
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

  // Delete an entire variable column.
  const handleDeleteVariableColumn = (column: string) => {
    setFormData((prev) => {
      let newVariable = prev.variable.map((row) => {
        const newRow = { ...row };
        delete newRow[column];
        return newRow;
      });
      // Deduplicate rows using the helper function.
      newVariable = deduplicateRows(newVariable);
      // If no variable column remains besides Series, clear variable rows.
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

  // Helper: build a unique key for a variable row (excluding the Series field).
  const getRowUniqueKey = (row: VariableRow): string => {
    const keys = Object.keys(row).filter((key) => key !== "Series").sort();
    return keys
      .map((key) => {
        const { constraintType, value, minValue, maxValue, tolerance } = row[key];
        return `${key}:${constraintType}:${value}:${minValue || ""}:${maxValue || ""}:${tolerance || ""}`;
      })
      .join("|");
  };

  // Toggle edit mode for a constant field.
  const toggleEditConstant = (id: string) => {
    const field = formData.constant.find((f) => f.id === id);
    // If we are saving (currently editing)...
    if (editingConstants[id]) {
      if (!field?.name.trim()) {
        displayAlert("Field name cannot be empty.", "Validation Error");
        return;
      }
      // Check that constant names are unique.
      const duplicates = formData.constant.filter((f) => f.name === field.name);
      if (duplicates.length > 1) {
        displayAlert("Field names must be unique.", "Validation Error");
        return;
      }
    }
    setEditingConstants((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Toggle edit mode for a variable row using the row index.
  const toggleEditRow = (rowIndex: number) => {
    if (editingRows[rowIndex]) {
      const currentRow = formData.variable[rowIndex];
      if (currentRow) {
        const currentKey = getRowUniqueKey(currentRow);
        const duplicate = formData.variable.some((row, idx) => {
          if (idx === rowIndex) return false;
          return getRowUniqueKey(row) === currentKey;
        });
        // if series name is not unique, show error
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

  // Reusable cell component.
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

  // Render the Constant Fields table.
  const renderConstantFieldsTable = () => (
    <Box width="100%" mb={4}>
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
                  <Input
                    size="sm"
                    defaultValue={fieldObj.name}
                    placeholder="Enter field name"
                    onBlur={(e) => {
                      const newName = e.target.value;
                      updateConstantField(fieldObj.id, { name: newName });
                    }}
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
      {globalEdit && (
        <Button size="sm" mt={2} onClick={handleAddConstantField}>
          Add Constant Field
        </Button>
      )}
    </Box>
  );

  // Render the Variable Rows table with Series as the first column.
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
                          <Button size="xs" variant="ghost" onClick={() => handleMakeConstant(col)}>
                            Make constant
                          </Button>
                          <Button size="xs" variant="ghost" colorScheme="red" onClick={() => handleDeleteVariableColumn(col)}>
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
      <Heading as="h4" size="md" color="teal.500">
        {acquisition}
      </Heading>
      {stage === 1 ? (
        <>
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
              Preset Tag Combination:
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
          <Box mt={2}>
            <Button size="sm" onClick={handleNext} isLoading={loading}>
              Next
            </Button>
          </Box>
        </>
      ) : (
        <>
          <Divider my={4} />
          <HStack justify="space-between" width="100%" mb={4}>
            <Button size="sm" onClick={() => setStage(1)}>
              Back
            </Button>
            <Button size="sm" onClick={() => setGlobalEdit(!globalEdit)} colorScheme="teal">
              {globalEdit ? "Save" : "Edit"}
            </Button>
          </HStack>
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
