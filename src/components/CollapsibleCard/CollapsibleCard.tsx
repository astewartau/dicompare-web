import React, { useState, useEffect, useRef } from 'react';
import {
    Box,
    Heading,
    Button,
    Divider,
    VStack,
    HStack,
    Text,
    Input,
    Icon,
    Select,
    Tooltip,
    IconButton,
} from '@chakra-ui/react';
import { FiPlus } from 'react-icons/fi';
import { EditIcon, DeleteIcon, RepeatIcon } from '@chakra-ui/icons';
import { usePyodide } from '../PyodideContext';
import { EditableCell } from './EditableCell';
import EditConstantModal from './EditConstantModal';
import { CollapsibleCardProps, FieldData, ConstantField, VariableRow, FormData, BaseDataType } from './types';
import { computeConstantFields, deduplicateRows } from './utils';
import Tagify from '@yaireo/tagify';
import '@yaireo/tagify/dist/tagify.css';

const presetOptions = [
    {
        label: 'QSM',
        tags: ['FlipAngle', 'MagneticFieldStrength', 'RepetitionTime', 'EchoTime', 'ImageType'],
    },
    {
        label: 'Default',
        tags: [],
    },
];

const CollapsibleCard: React.FC<CollapsibleCardProps> = ({
    acquisition,
    validFields,
    allValidFields = [], // Add this with default
    onDeleteAcquisition,
    onSaveAcquisition,
    onGlobalEditChange,
    onStageChange,
    initialEditMode = false,
    initialStage = 1,
    hideBackButton = false,
    isDicomGenerated = false,
    initialFormData,
}) => {
    const { runPythonCode, setPythonGlobal } = usePyodide();

    const [stage, setStage] = useState<number>(isDicomGenerated ? 2 : initialStage);
    const [loading, setLoading] = useState<boolean>(false);
    const [selectedFields, setSelectedFields] = useState<string[]>([]);
    const [formData, setFormData] = useState<FormData>(initialFormData || { constant: [], variable: [] });
    const [globalEdit, setGlobalEdit] = useState<boolean>(isDicomGenerated ? false : initialEditMode);

    const [acquisitionTitle, setAcquisitionTitle] = useState<string>(acquisition);
    const [acquisitionDescription, setAcquisitionDescription] = useState<string>('');

    const inputRef = useRef<HTMLTextAreaElement | null>(null);
    const tagifyRef = useRef<any>(null);

    // For constant fields editing via modal.
    const [constantModalOpen, setConstantModalOpen] = useState(false);
    const [editingConstantId, setEditingConstantId] = useState<string | null>(null);
    // For series (variable row) editing using EditConstantModal in series mode.
    const [seriesModalOpen, setSeriesModalOpen] = useState(false);
    const [editingSeriesRowIndex, setEditingSeriesRowIndex] = useState<number | null>(null);

    const handleOpenConstantModal = (id: string) => {
        setEditingConstantId(id);
        setConstantModalOpen(true);
    };

    const handleAddConstantField = () => {
        const newField: ConstantField = {
            id: String(Date.now()),
            name: '',
            data: { constraintType: 'value', value: '', dataType: 'string', listSubType: undefined },
        };
        // Open modal for the new constant field; it will be added upon saving.
        setEditingConstantId(newField.id);
        setConstantModalOpen(true);
        setFormData((prev) => ({
            ...prev,
            constant: [...prev.constant, newField],
        }));
    };

    const handleConstantModalSave = (updatedField: ConstantField) => {
        setFormData((prev) => ({
            ...prev,
            constant: prev.constant.map((field) => (field.id === updatedField.id ? updatedField : field)),
        }));
    };

    const inferDataType = (value: any): { dataType: BaseDataType; listSubType?: 'string' | 'number' } => {
        if (Array.isArray(value)) {
            // Analyze array contents to determine subtype
            if (value.length === 0) {
                return { dataType: 'list', listSubType: 'string' }; // Default to string for empty arrays
            }
            
            // Check if all elements are numbers
            const allNumbers = value.every(item => typeof item === 'number' || (typeof item === 'string' && !isNaN(parseFloat(item)) && isFinite(parseFloat(item))));
            
            return { 
                dataType: 'list', 
                listSubType: allNumbers ? 'number' : 'string' 
            };
        }
        if (typeof value === 'number') return { dataType: 'number' };
        return { dataType: 'string' };
    };

    const transformField = (data: FieldData): any => {
        switch (data.dataType) {
            case 'number':
                return parseFloat(data.value);
            case 'string':
                return data.value;
            case 'list':
                const items = data.value.split(',').map(s => s.trim());
                if (data.listSubType === 'number') {
                    return items.map(item => parseFloat(item));
                } else {
                    return items; // string list
                }
            case 'raw_json':
                try {
                    return JSON.parse(data.value);
                } catch (error) {
                    console.error('Invalid JSON:', data.value);
                    return data.value; // Fallback to string if JSON parsing fails
                }
            default:
                return data.value;
        }
    };

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
                dropdown: { enabled: 1, maxItems: 10, position: 'all' },
            });
            if (selectedFields.length > 0) {
                tagifyRef.current.addTags(selectedFields);
            }
            tagifyRef.current.on('change', () => {
                const tags = tagifyRef.current.value.map((tag: any) => tag.value);
                setSelectedFields(tags);
            });
        }
    }, [stage, validFields, selectedFields]);

    // Save the acquisition data when form data changes (for DICOM-generated cards)
    useEffect(() => {
        if (isDicomGenerated && stage === 2 && !globalEdit) {
            const constantFieldsJson = formData.constant.map((field) => ({
                field: field.name,
                value: transformField(field.data),
            }));
            const seriesJson = formData.variable.map((row) => {
                const seriesName = row.Series.value;
                const fields = Object.keys(row)
                    .filter((key) => key !== 'Series')
                    .map((key) => ({
                        field: key,
                        value: transformField(row[key]),
                    }));
                return { name: seriesName, fields };
            });
            const acquisitionJson = { fields: constantFieldsJson, series: seriesJson };
            if (onSaveAcquisition) {
                onSaveAcquisition(acquisition, acquisitionJson);
            }
        }
    }, [formData, isDicomGenerated, stage, globalEdit, acquisition, onSaveAcquisition]);

    const handleGlobalSave = () => {
        const constantFieldsJson = formData.constant.map((field) => ({
            field: field.name,
            value: transformField(field.data),
        }));
        const seriesJson = formData.variable.map((row) => {
            const seriesName = row.Series.value;
            const fields = Object.keys(row)
                .filter((key) => key !== 'Series')
                .map((key) => ({
                    field: key,
                    value: transformField(row[key]),
                }));
            return { name: seriesName, fields };
        });
        const acquisitionJson = { fields: constantFieldsJson, series: seriesJson };
        if (onSaveAcquisition) {
            onSaveAcquisition(acquisition, acquisitionJson);
        }
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
            setPythonGlobal('current_acquisition', acquisition);
            setPythonGlobal('selected_fields', selectedFields);
            const uniqueRows = await runPythonCode(`
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
                    data: {
                        constraintType: 'value',
                        value: String(constantFields[field]),
                        ...inferDataType(constantFields[field]),
                    },
                });
            }
            const newVariable: VariableRow[] = data.map((row: Record<string, any>) => {
                const newRow: VariableRow = {
                    Series: {
                        constraintType: 'value',
                        value: String(row['Series']),
                        dataType: 'string',
                    },
                };
                for (const field of variableFields) {
                    newRow[field] = {
                        constraintType: 'value',
                        value: String(row[field] ?? ''),
                        ...inferDataType(row[field]),
                    };
                }
                return newRow;
            });
            setFormData({ constant: newConstant, variable: newVariable });
            setStage(2);
            setGlobalEdit(false);
            const constantFieldsJson = newConstant.map((field) => ({
                field: field.name,
                value: transformField(field.data),
            }));
            const seriesJson = newVariable.map((row) => {
                const seriesName = row.Series.value;
                const fields = Object.keys(row)
                    .filter((key) => key !== 'Series')
                    .map((key) => ({
                        field: key,
                        value: transformField(row[key]),
                    }));
                return { name: seriesName, fields };
            });
            const acquisitionJson = { fields: constantFieldsJson, series: seriesJson };
            if (onSaveAcquisition) {
                onSaveAcquisition(acquisition, acquisitionJson);
            }
        } catch (err) {
            console.error('Error fetching data:', err);
        } finally {
            setLoading(false);
        }
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
                        Series: { constraintType: 'value', value: '1', dataType: 'string' },
                        [columnName]: fieldToConvert.data,
                    },
                ];
            }
            return { constant: newConstant, variable: newVariable };
        });
    };

    const handleMakeConstant = (column: string) => {
        setFormData((prev) => {
            let earliestValue: FieldData = { constraintType: 'value', value: '', dataType: 'string' };
            if (prev.variable.length > 0 && prev.variable[0][column]) {
                earliestValue = prev.variable[0][column];
            }
            // Remove the column from each variable row.
            let newVariable = prev.variable.map((row) => {
                const newRow = { ...row };
                delete newRow[column];
                return newRow;
            });
            // Remove rows that have no keys except "Series"
            newVariable = newVariable.filter((row) => Object.keys(row).filter((k) => k !== 'Series').length > 0);
            newVariable = deduplicateRows(newVariable);
            const newConstantField = {
                id: column,
                name: column,
                data: earliestValue,
            };
            return { constant: [...prev.constant, newConstantField], variable: newVariable };
        });
    };

    const handleAddSeries = () => {
        setFormData((prev) => {
            const nextSeries = prev.variable.length + 1;
            // Start with a new row having a Series field.
            const newRow: VariableRow = {
                Series: { constraintType: 'value', value: 'Series ' + nextSeries, dataType: 'string' },
            };
            // If there is at least one existing variable row, add the same keys (except "Series")
            if (prev.variable.length > 0) {
                const existingKeys = Object.keys(prev.variable[0]).filter((k) => k !== 'Series');
                existingKeys.forEach((key) => {
                    // Set a default empty FieldData with the same dataType as in the first row.
                    newRow[key] = { constraintType: 'value', value: '', dataType: prev.variable[0][key].dataType };
                });
            }
            const updated = [...prev.variable, newRow];
            setEditingSeriesRowIndex(updated.length - 1);
            return { ...prev, variable: updated };
        });
        setSeriesModalOpen(true);
    };

    const handleDeleteConstantField = (id: string) => {
        setFormData((prev) => ({
            ...prev,
            constant: prev.constant.filter((field) => field.id !== id),
        }));
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
                    if (k !== 'Series') colsRemaining.add(k);
                });
            });
            if (colsRemaining.size === 0) {
                newVariable = [];
            }
            return { ...prev, variable: newVariable };
        });
    };

    // Open modal for series editing using the new seriesRow prop.
    const handleOpenSeriesModal = (rowIndex: number) => {
        setEditingSeriesRowIndex(rowIndex);
        setSeriesModalOpen(true);
    };

    const renderConstantFieldsTable = () => (
        <Box width="100%" mb={4}>
            {formData.constant.length === 0 ? null : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr>
                            <th style={{ borderBottom: '1px solid #ccc' }}>Field</th>
                            <th style={{ borderBottom: '1px solid #ccc', textAlign: 'right' }}>Value</th>
                            {globalEdit && (
                                <th style={{ borderBottom: '1px solid #ccc', textAlign: 'center' }}>Actions</th>
                            )}
                        </tr>
                    </thead>
                    <tbody>
                        {formData.constant.map((fieldObj) => (
                            <tr key={fieldObj.id}>
                                <td style={{ borderBottom: '1px solid #eee', padding: '4px' }}>
                                    <Text>{fieldObj.name || '(no name)'}</Text>
                                </td>
                                <td style={{ borderBottom: '1px solid #eee', padding: '4px', textAlign: 'right' }}>
                                    <EditableCell
                                        cellData={fieldObj.data}
                                        editable={false}
                                        onChange={() => {}}
                                        fieldName={fieldObj.name}
                                        showDataType={globalEdit}
                                    />
                                </td>
                                {globalEdit && (
                                    <td style={{ borderBottom: '1px solid #eee', padding: '4px', textAlign: 'center' }}>
                                        <Tooltip label="Edit field" hasArrow placement="top">
                                            <IconButton
                                                size="xs"
                                                onClick={() => handleOpenConstantModal(fieldObj.id)}
                                                aria-label="Edit field"
                                                icon={<EditIcon />}
                                            />
                                        </Tooltip>
                                        <Tooltip label="Make variable" hasArrow placement="top">
                                            <IconButton
                                                size="xs"
                                                ml={2}
                                                onClick={() => handleMakeVariable(fieldObj.id)}
                                                aria-label="Make variable"
                                                icon={<RepeatIcon />}
                                            />
                                        </Tooltip>
                                        <Tooltip label="Delete field" hasArrow placement="top">
                                            <IconButton
                                                size="xs"
                                                ml={2}
                                                colorScheme="red"
                                                onClick={() => handleDeleteConstantField(fieldObj.id)}
                                                aria-label="Delete field"
                                                icon={<DeleteIcon />}
                                            />
                                        </Tooltip>
                                    </td>
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
            {globalEdit && (
                <Button size="sm" mt={2} onClick={handleAddConstantField} colorScheme="teal">
                    <Icon as={FiPlus} boxSize={4} />
                    Field
                </Button>
            )}
        </Box>
    );

    const renderVariableRowsTable = () => {
        if (formData.variable.length === 0) return null;
        // Determine columns from the first row.
        const firstRow = formData.variable[0];
        const otherCols = Object.keys(firstRow).filter((col) => col !== 'Series');
        const columns = ['Series', ...otherCols];
        return (
            <Box width="100%">
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr>
                            {columns.map((col) => (
                                <th key={col} style={{ borderBottom: '1px solid #ccc', padding: '4px' }}>
                                    {col === 'Series' ? (
                                        <Text>{col}</Text>
                                    ) : (
                                        <VStack spacing={1}>
                                            <Text>{col}</Text>
                                            {globalEdit && (
                                                <HStack spacing={1}>
                                                    <Tooltip label="Make constant" hasArrow placement="top">
                                                        <IconButton
                                                            size="xs"
                                                            onClick={() => handleMakeConstant(col)}
                                                            aria-label="Make constant"
                                                            icon={<RepeatIcon />}
                                                        />
                                                    </Tooltip>
                                                    <Tooltip label="Delete column" hasArrow placement="top">
                                                        <IconButton
                                                            size="xs"
                                                            colorScheme="red"
                                                            onClick={() => handleDeleteVariableColumn(col)}
                                                            aria-label="Delete column"
                                                            icon={<DeleteIcon />}
                                                        />
                                                    </Tooltip>
                                                </HStack>
                                            )}
                                        </VStack>
                                    )}
                                </th>
                            ))}
                            {globalEdit && (
                                <th style={{ borderBottom: '1px solid #ccc', padding: '4px', textAlign: 'right' }}>
                                    Actions
                                </th>
                            )}
                        </tr>
                    </thead>
                    <tbody>
                        {formData.variable.map((row, rowIndex) => (
                            <tr key={rowIndex}>
                                {columns.map((col) => (
                                    <td key={col} style={{ borderBottom: '1px solid #eee', padding: '4px' }}>
                                        {col === 'Series' ? (
                                            <Text>{row.Series.value}</Text>
                                        ) : (
                                            // Use a default empty object if the cell is missing.
                                            <EditableCell
                                                cellData={
                                                    row[col] ?? {
                                                        constraintType: 'value',
                                                        value: '',
                                                        dataType: 'string',
                                                    }
                                                }
                                                editable={false}
                                                onChange={() => {}}
                                                fieldName={col}
                                                showDataType={globalEdit}
                                            />
                                        )}
                                    </td>
                                ))}
                                {globalEdit && (
                                    <td
                                        style={{
                                            borderBottom: '1px solid #eee',
                                            padding: '4px',
                                            textAlign: 'center',
                                        }}
                                    >
                                        <Tooltip label="Edit series" hasArrow placement="top">
                                            <IconButton
                                                size="xs"
                                                onClick={() => handleOpenSeriesModal(rowIndex)}
                                                aria-label="Edit series"
                                                icon={<EditIcon />}
                                            />
                                        </Tooltip>
                                        <Tooltip label="Delete series" hasArrow placement="top">
                                            <IconButton
                                                size="xs"
                                                colorScheme="red"
                                                ml={2}
                                                onClick={() => handleDeleteSeries(rowIndex)}
                                                aria-label="Delete series"
                                                icon={<DeleteIcon />}
                                            />
                                        </Tooltip>
                                    </td>
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
                {globalEdit && (
                    <Button size="sm" mt={2} onClick={handleAddSeries} colorScheme="teal">
                        <Icon as={FiPlus} boxSize={4} />
                        Series
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
                                placeholder="Enter acquisition description"
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
                            <Button
                                size="sm"
                                onClick={handleNext}
                                isLoading={loading}
                                colorScheme="teal"
                                disabled={!selectedFields.length}
                            >
                                Next
                            </Button>
                            <Button size="sm" colorScheme="red" onClick={handleDeleteAcquisition}>
                                Delete
                            </Button>
                        </>
                    ) : (
                        <>
                            {!hideBackButton && !globalEdit && !isDicomGenerated && (
                                <Button size="sm" onClick={() => setStage(1)} colorScheme="teal">
                                    Back
                                </Button>
                            )}
                            {globalEdit ? (
                                <Button size="sm" onClick={handleGlobalSave} colorScheme="blue">
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
                        style={{ width: '100%', minHeight: '40px' }}
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
            {constantModalOpen && editingConstantId && (
                <EditConstantModal
                    isOpen={constantModalOpen}
                    onClose={() => {
                        setConstantModalOpen(false);
                        setEditingConstantId(null);
                    }}
                    constantField={formData.constant.find((field) => field.id === editingConstantId) as ConstantField}
                    onSave={(updatedField) => {
                        handleConstantModalSave(updatedField as ConstantField);
                        setConstantModalOpen(false);
                        setEditingConstantId(null);
                    }}
                    mode="constant"
                    validFields={allValidFields} // Add this
                />
            )}
            {seriesModalOpen && editingSeriesRowIndex !== null && (
                <EditConstantModal
                    isOpen={seriesModalOpen}
                    onClose={() => {
                        setSeriesModalOpen(false);
                        setEditingSeriesRowIndex(null);
                    }}
                    seriesRow={formData.variable[editingSeriesRowIndex]}
                    onSave={(updated: ConstantField | VariableRow) => {
                        if ('Series' in updated) {
                            setFormData((prev) => {
                                const newVariable = [...prev.variable];
                                newVariable[editingSeriesRowIndex] = updated;
                                return { ...prev, variable: newVariable };
                            });
                            setSeriesModalOpen(false);
                            setEditingSeriesRowIndex(null);
                        } else {
                            console.error('Unexpected type: ConstantField is not supported here.');
                        }
                    }}
                    mode="series"
                    validFields={allValidFields} // Add this
                />
            )}
        </Box>
    );
};

export default CollapsibleCard;
