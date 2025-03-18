// components/CollapsibleCard/EditConstantModal.tsx
import React, {
    useState,
    useEffect,
    useRef,
    useCallback,
} from "react";
import {
    Modal,
    ModalOverlay,
    ModalContent,
    ModalHeader,
    ModalCloseButton,
    ModalBody,
    ModalFooter,
    Button,
    FormControl,
    FormLabel,
    FormErrorMessage,
    Select,
    HStack,
    Input as ChakraInput,
    Tabs,
    TabList,
    TabPanels,
    Tab,
    TabPanel,
} from "@chakra-ui/react";
import Tagify from "@yaireo/tagify";
import "@yaireo/tagify/dist/tagify.css";
import { ConstantField, DataType, ConstraintType, VariableRow } from "./types";

export const allowedConstraints = (dataType: DataType): ConstraintType[] => {
    return dataType === "number"
        ? ["value", "range", "value+tolerance"]
        : ["value", "contains"];
};

interface EditConstantModalProps {
    isOpen: boolean;
    onClose: () => void;
    mode?: "constant" | "series";
    // For constant mode:
    constantField?: ConstantField;
    // For series mode, pass the entire variable row:
    seriesRow?: VariableRow;
    // onSave returns the updated constant field (in constant mode)
    // or updated variable row (in series mode)
    onSave: (updated: ConstantField | VariableRow) => void;
}

const EditConstantModal: React.FC<EditConstantModalProps> = ({
    isOpen,
    onClose,
    onSave,
    mode = "constant",
    constantField,
    seriesRow,
}) => {
    const isSeries = mode === "series";

    // For constant mode.
    const [localField, setLocalField] = useState<ConstantField>(
        constantField || {
            id: "",
            name: "",
            data: { constraintType: "value", value: "", dataType: "string" },
        }
    );
    // For series mode.
    const [localRow, setLocalRow] = useState<VariableRow>(seriesRow || {});

    // Error state for constant mode.
    const [errors, setErrors] = useState<{
        fieldName?: string;
        value?: string;
        minValue?: string;
        maxValue?: string;
        tolerance?: string;
    }>({});
    // Error state for series mode (per field).
    const [errorsRow, setErrorsRow] = useState<{
        [key: string]: { value?: string; minValue?: string; maxValue?: string; tolerance?: string };
    }>({});

    const tagifyInstanceRef = useRef<Tagify | null>(null);
    const inputElementRef = useRef<HTMLInputElement | null>(null);
    // For series mode, maintain a ref map for Tagify instances per field.
    const tagifySeriesRefs = useRef<{ [key: string]: Tagify | null }>({});

    // Shared numeric input handlers.
    const handleNumericKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        const allowedKeys = [
            "Backspace",
            "Tab",
            "ArrowLeft",
            "ArrowRight",
            "Delete",
            "Home",
            "End",
        ];
        if (allowedKeys.includes(e.key)) return;
        if (e.key === "." && !e.currentTarget.value.includes(".")) return;
        if (
            e.key === "-" &&
            e.currentTarget.selectionStart === 0 &&
            !e.currentTarget.value.includes("-")
        )
            return;
        if (!/^\d$/.test(e.key)) e.preventDefault();
    };

    const handleNumericPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
        const pasteData = e.clipboardData.getData("text");
        if (/[^0-9.-]/.test(pasteData)) e.preventDefault();
    };

    // For constant mode, set up Tagify.
    const setTagifyRefConstant = useCallback(
        (el: HTMLInputElement | null) => {
            inputElementRef.current = el;
            if (el && isOpen && localField.data.dataType === "list" && !tagifyInstanceRef.current) {
                tagifyInstanceRef.current = new Tagify(el, { duplicates: true });
                if (tagifyInstanceRef.current.DOM.scope) {
                    tagifyInstanceRef.current.DOM.scope.style.width = "100%";
                }
                const initialTags = localField.data.value
                    ? localField.data.value.split(",").map((t) => t.trim()).filter(Boolean)
                    : [];
                tagifyInstanceRef.current.addTags(initialTags);
                tagifyInstanceRef.current.on("change", () => {
                    const tags = tagifyInstanceRef.current?.value.map((tag) => tag.value) || [];
                    setLocalField((prev) => ({
                        ...prev,
                        data: { ...prev.data, value: tags.join(", ") },
                    }));
                });
            }
        },
        [isOpen, localField.data.dataType]
    );

    useEffect(() => {
        if (!isSeries && constantField) {
            setLocalField(constantField);
        }
    }, [constantField, isSeries]);

    useEffect(() => {
        if (!isSeries && tagifyInstanceRef.current && localField.data.dataType === "list") {
            const currentTags = tagifyInstanceRef.current.value.map((tag) => tag.value);
            const newTags = localField.data.value
                ? localField.data.value.split(",").map((t) => t.trim()).filter(Boolean)
                : [];
            if (JSON.stringify(currentTags) !== JSON.stringify(newTags)) {
                tagifyInstanceRef.current.removeAllTags();
                tagifyInstanceRef.current.addTags(newTags);
            }
        }
    }, [localField.data.value, localField.data.dataType, isSeries]);

    useEffect(() => {
        if (isSeries && seriesRow) {
            setLocalRow(seriesRow);
        }
    }, [seriesRow, isSeries]);

    // --- Constant mode handlers ---
    const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setLocalField((prev) => ({ ...prev, name: e.target.value }));
        if (e.target.value.trim()) {
            setErrors((prev) => ({ ...prev, fieldName: undefined }));
        }
    };

    const handleDataTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const dt = e.target.value as DataType;
        const newConstraint = allowedConstraints(dt)[0];
        setLocalField((prev) => ({
            ...prev,
            data: { ...prev.data, dataType: dt, constraintType: newConstraint, value: "" },
        }));
        if (dt !== "list" && tagifyInstanceRef.current) {
            tagifyInstanceRef.current.destroy();
            tagifyInstanceRef.current = null;
        }
    };

    const handleConstraintChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        setLocalField((prev) => ({
            ...prev,
            data: { ...prev.data, constraintType: e.target.value },
        }));
    };

    const handleMinChange = (newVal: string) => {
        setLocalField((prev) => ({
            ...prev,
            data: { ...prev.data, minValue: newVal },
        }));
        if (newVal.trim()) {
            setErrors((prev) => ({ ...prev, minValue: undefined }));
        }
    };

    const handleMaxChange = (newVal: string) => {
        setLocalField((prev) => ({
            ...prev,
            data: { ...prev.data, maxValue: newVal },
        }));
        if (newVal.trim()) {
            setErrors((prev) => ({ ...prev, maxValue: undefined }));
        }
    };

    const handleToleranceChange = (newVal: string) => {
        setLocalField((prev) => ({
            ...prev,
            data: { ...prev.data, tolerance: newVal },
        }));
        if (newVal.trim()) {
            setErrors((prev) => ({ ...prev, tolerance: undefined }));
        }
    };

    const validateConstantInputs = (): boolean => {
        const newErrors: {
            fieldName?: string;
            value?: string;
            minValue?: string;
            maxValue?: string;
            tolerance?: string;
        } = {};
        if (!localField.name || !localField.name.trim()) {
            newErrors.fieldName = "Field name is required.";
        }
        const { constraintType, value, minValue, maxValue, tolerance } = localField.data;
        if (constraintType === "value" || constraintType === "contains") {
            if (!value || !value.trim()) {
                newErrors.value = "This field is required.";
            }
        } else if (constraintType === "range") {
            if (!minValue || !minValue.trim()) {
                newErrors.minValue = "Min value is required.";
            }
            if (!maxValue || !maxValue.trim()) {
                newErrors.maxValue = "Max value is required.";
            }
        } else if (constraintType === "value+tolerance") {
            if (!value || !value.trim()) {
                newErrors.value = "Value is required.";
            }
            if (!tolerance || !tolerance.trim()) {
                newErrors.tolerance = "Tolerance is required.";
            }
        }
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    // --- Series mode handlers ---
    // In series mode each field is directly a FieldData.
    const updateSeriesField = (
        fieldKey: string,
        newData: Partial<{ constraintType: string; value?: string; minValue?: string; maxValue?: string; tolerance?: string; dataType: DataType }>
    ) => {
        setLocalRow((prev) => ({
            ...prev,
            [fieldKey]: { ...prev[fieldKey], ...newData },
        }));
    };

    // For fields with list datatype in series mode, set up Tagify.
    const setTagifySeriesRef = (fieldKey: string, currentValue: string) => (el: HTMLInputElement | null) => {
        if (!el) return;
        if (!tagifySeriesRefs.current[fieldKey]) {
            tagifySeriesRefs.current[fieldKey] = new Tagify(el, { duplicates: true });
            if (tagifySeriesRefs.current[fieldKey].DOM.scope) {
                tagifySeriesRefs.current[fieldKey].DOM.scope.style.width = "100%";
            }
            const initialTags = currentValue
                ? currentValue.split(",").map((t) => t.trim()).filter(Boolean)
                : [];
            tagifySeriesRefs.current[fieldKey].addTags(initialTags);
            tagifySeriesRefs.current[fieldKey].on("change", () => {
                const tags =
                    tagifySeriesRefs.current[fieldKey]?.value.map((tag) => tag.value) || [];
                updateSeriesField(fieldKey, { value: tags.join(", ") });
            });
        }
    };

    const renderSeriesFieldEditor = (fieldKey: string, field: any) => {
        // field is of type FieldData.
        const currentData = field || { constraintType: "value", value: "", dataType: "string" };
        const isNumber = currentData.dataType === "number";
        switch (currentData.constraintType) {
            case "value":
                if (currentData.dataType === "list") {
                    return (
                        <FormControl isInvalid={!!errorsRow[fieldKey]?.value}>
                            <FormLabel>Value</FormLabel>
                            <input
                                ref={setTagifySeriesRef(fieldKey, currentData.value)}
                                placeholder="Enter comma separated values"
                                style={{
                                    width: "100%",
                                    padding: "0.5rem",
                                    fontSize: "0.875rem",
                                    borderRadius: "0.375rem",
                                    border: "1px solid #E2E8F0",
                                }}
                            />
                            {errorsRow[fieldKey]?.value && (
                                <FormErrorMessage>{errorsRow[fieldKey].value}</FormErrorMessage>
                            )}
                        </FormControl>
                    );
                }
                return (
                    <FormControl isInvalid={!!errorsRow[fieldKey]?.value}>
                        <FormLabel>Value</FormLabel>
                        <ChakraInput
                            size="sm"
                            type={isNumber ? "number" : "text"}
                            value={currentData.value}
                            placeholder="Enter value"
                            onChange={(e) =>
                                updateSeriesField(fieldKey, { value: e.target.value })
                            }
                            onKeyDown={isNumber ? handleNumericKeyDown : undefined}
                            onPaste={isNumber ? handleNumericPaste : undefined}
                        />
                        {errorsRow[fieldKey]?.value && (
                            <FormErrorMessage>{errorsRow[fieldKey].value}</FormErrorMessage>
                        )}
                    </FormControl>
                );
            case "range":
                return (
                    <HStack spacing={2}>
                        <FormControl isInvalid={!!errorsRow[fieldKey]?.minValue}>
                            <ChakraInput
                                size="sm"
                                type={isNumber ? "number" : "text"}
                                value={currentData.minValue || ""}
                                placeholder="Min"
                                onChange={(e) =>
                                    updateSeriesField(fieldKey, { minValue: e.target.value })
                                }
                                onKeyDown={isNumber ? handleNumericKeyDown : undefined}
                                onPaste={isNumber ? handleNumericPaste : undefined}
                            />
                            {errorsRow[fieldKey]?.minValue && (
                                <FormErrorMessage>{errorsRow[fieldKey].minValue}</FormErrorMessage>
                            )}
                        </FormControl>
                        <FormControl isInvalid={!!errorsRow[fieldKey]?.maxValue}>
                            <ChakraInput
                                size="sm"
                                type={isNumber ? "number" : "text"}
                                value={currentData.maxValue || ""}
                                placeholder="Max"
                                onChange={(e) =>
                                    updateSeriesField(fieldKey, { maxValue: e.target.value })
                                }
                                onKeyDown={isNumber ? handleNumericKeyDown : undefined}
                                onPaste={isNumber ? handleNumericPaste : undefined}
                            />
                            {errorsRow[fieldKey]?.maxValue && (
                                <FormErrorMessage>{errorsRow[fieldKey].maxValue}</FormErrorMessage>
                            )}
                        </FormControl>
                    </HStack>
                );
            case "value+tolerance":
                return (
                    <HStack spacing={2}>
                        <FormControl isInvalid={!!errorsRow[fieldKey]?.value}>
                            <ChakraInput
                                size="sm"
                                type={isNumber ? "number" : "text"}
                                value={currentData.value}
                                placeholder="Enter value"
                                onChange={(e) =>
                                    updateSeriesField(fieldKey, { value: e.target.value })
                                }
                                onKeyDown={isNumber ? handleNumericKeyDown : undefined}
                                onPaste={isNumber ? handleNumericPaste : undefined}
                            />
                            {errorsRow[fieldKey]?.value && (
                                <FormErrorMessage>{errorsRow[fieldKey].value}</FormErrorMessage>
                            )}
                        </FormControl>
                        <FormControl isInvalid={!!errorsRow[fieldKey]?.tolerance}>
                            <ChakraInput
                                size="sm"
                                type={isNumber ? "number" : "text"}
                                value={currentData.tolerance || ""}
                                placeholder="Tolerance"
                                onChange={(e) =>
                                    updateSeriesField(fieldKey, { tolerance: e.target.value })
                                }
                                onKeyDown={isNumber ? handleNumericKeyDown : undefined}
                                onPaste={isNumber ? handleNumericPaste : undefined}
                            />
                            {errorsRow[fieldKey]?.tolerance && (
                                <FormErrorMessage>{errorsRow[fieldKey].tolerance}</FormErrorMessage>
                            )}
                        </FormControl>
                    </HStack>
                );
            case "contains":
                return (
                    <FormControl isInvalid={!!errorsRow[fieldKey]?.value}>
                        <ChakraInput
                            size="sm"
                            value={currentData.value}
                            placeholder="Enter substring"
                            onChange={(e) =>
                                updateSeriesField(fieldKey, { value: e.target.value })
                            }
                        />
                        {errorsRow[fieldKey]?.value && (
                            <FormErrorMessage>{errorsRow[fieldKey].value}</FormErrorMessage>
                        )}
                    </FormControl>
                );
            default:
                return null;
        }
    };

    // Helper: validate all series fields except "Series".
    const validateSeries = (): boolean => {
        let valid = true;
        const newErrors: typeof errorsRow = {};
        const fieldKeys = Object.keys(localRow).filter((key) => key !== "Series");
        for (const key of fieldKeys) {
            const field = localRow[key];
            const currentData = field || { constraintType: "value", value: "", dataType: "string" };
            if (
                currentData.constraintType === "value" ||
                currentData.constraintType === "contains" ||
                currentData.constraintType === "value+tolerance"
            ) {
                if (!currentData.value || !currentData.value.trim()) {
                    valid = false;
                    newErrors[key] = { ...newErrors[key], value: "This field is required." };
                }
            } else if (currentData.constraintType === "range") {
                if (!currentData.minValue || !currentData.minValue.trim()) {
                    valid = false;
                    newErrors[key] = { ...newErrors[key], minValue: "Min value is required." };
                }
                if (!currentData.maxValue || !currentData.maxValue.trim()) {
                    valid = false;
                    newErrors[key] = { ...newErrors[key], maxValue: "Max value is required." };
                }
            }
        }
        setErrorsRow(newErrors);
        return valid;
    };

    // Single handleSave declaration.
    const handleSave = () => {
        if (isSeries) {
            const seriesName = localRow["Series"]?.value || "";
            if (!seriesName.trim()) {
                setErrorsRow((prev) => ({
                    ...prev,
                    Series: { value: "Series name is required." },
                }));
                return;
            }
            if (!validateSeries()) return;
            onSave(localRow);
            onClose();
        } else {
            if (!validateConstantInputs()) return;
            onSave(localField);
            onClose();
        }
    };

    // Render constant mode form.
    const renderConstantForm = () => {
        const renderValueInput = () => {
            const { data } = localField;
            const isNumber = data.dataType === "number";
            switch (data.constraintType) {
                case "value":
                    if (data.dataType === "list") {
                        return (
                            <FormControl isInvalid={!!errors.value}>
                                <input
                                    ref={setTagifyRefConstant}
                                    placeholder="Enter comma separated values"
                                    style={{
                                        width: "100%",
                                        padding: "0.5rem",
                                        fontSize: "0.875rem",
                                        borderRadius: "0.375rem",
                                        border: "1px solid #E2E8F0",
                                    }}
                                />
                                {errors.value && <FormErrorMessage>{errors.value}</FormErrorMessage>}
                            </FormControl>
                        );
                    }
                    return (
                        <FormControl isInvalid={!!errors.value}>
                            <ChakraInput
                                size="sm"
                                type={isNumber ? "number" : "text"}
                                value={data.value}
                                placeholder="Enter value"
                                onChange={(e) =>
                                    setLocalField((prev) => ({
                                        ...prev,
                                        data: { ...prev.data, value: e.target.value },
                                    }))
                                }
                                onKeyDown={isNumber ? handleNumericKeyDown : undefined}
                                onPaste={isNumber ? handleNumericPaste : undefined}
                            />
                            {errors.value && <FormErrorMessage>{errors.value}</FormErrorMessage>}
                        </FormControl>
                    );
                case "range":
                    return (
                        <HStack spacing={2}>
                            <FormControl isInvalid={!!errors.minValue}>
                                <ChakraInput
                                    size="sm"
                                    type={isNumber ? "number" : "text"}
                                    value={localField.data.minValue || ""}
                                    placeholder="Min"
                                    onChange={(e) => handleMinChange(e.target.value)}
                                    onKeyDown={isNumber ? handleNumericKeyDown : undefined}
                                    onPaste={isNumber ? handleNumericPaste : undefined}
                                />
                                {errors.minValue && <FormErrorMessage>{errors.minValue}</FormErrorMessage>}
                            </FormControl>
                            <FormControl isInvalid={!!errors.maxValue}>
                                <ChakraInput
                                    size="sm"
                                    type={isNumber ? "number" : "text"}
                                    value={localField.data.maxValue || ""}
                                    placeholder="Max"
                                    onChange={(e) => handleMaxChange(e.target.value)}
                                    onKeyDown={isNumber ? handleNumericKeyDown : undefined}
                                    onPaste={isNumber ? handleNumericPaste : undefined}
                                />
                                {errors.maxValue && <FormErrorMessage>{errors.maxValue}</FormErrorMessage>}
                            </FormControl>
                        </HStack>
                    );
                case "value+tolerance":
                    return (
                        <HStack spacing={2}>
                            <FormControl isInvalid={!!errors.value}>
                                <ChakraInput
                                    size="sm"
                                    type={isNumber ? "number" : "text"}
                                    value={localField.data.value}
                                    placeholder="Enter value"
                                    onChange={(e) =>
                                        setLocalField((prev) => ({
                                            ...prev,
                                            data: { ...prev.data, value: e.target.value },
                                        }))
                                    }
                                    onKeyDown={isNumber ? handleNumericKeyDown : undefined}
                                    onPaste={isNumber ? handleNumericPaste : undefined}
                                />
                                {errors.value && <FormErrorMessage>{errors.value}</FormErrorMessage>}
                            </FormControl>
                            <FormControl isInvalid={!!errors.tolerance}>
                                <ChakraInput
                                    size="sm"
                                    type={isNumber ? "number" : "text"}
                                    value={localField.data.tolerance || ""}
                                    placeholder="Tolerance"
                                    onChange={(e) => handleToleranceChange(e.target.value)}
                                    onKeyDown={isNumber ? handleNumericKeyDown : undefined}
                                    onPaste={isNumber ? handleNumericPaste : undefined}
                                />
                                {errors.tolerance && <FormErrorMessage>{errors.tolerance}</FormErrorMessage>}
                            </FormControl>
                        </HStack>
                    );
                case "contains":
                    return (
                        <FormControl isInvalid={!!errors.value}>
                            <ChakraInput
                                size="sm"
                                value={localField.data.value}
                                placeholder="Enter substring"
                                onChange={(e) =>
                                    setLocalField((prev) => ({
                                        ...prev,
                                        data: { ...prev.data, value: e.target.value },
                                    }))
                                }
                            />
                            {errors.value && <FormErrorMessage>{errors.value}</FormErrorMessage>}
                        </FormControl>
                    );
                default:
                    return null;
            }
        };

        return (
            <>
                <FormControl isInvalid={!!errors.fieldName}>
                    <FormLabel>Field Name</FormLabel>
                    <ChakraInput
                        size="sm"
                        value={localField.name}
                        onChange={handleNameChange}
                        placeholder="Field name"
                    />
                    {errors.fieldName && <FormErrorMessage>{errors.fieldName}</FormErrorMessage>}
                </FormControl>
                <HStack spacing={4} mt={4}>
                    <FormControl>
                        <FormLabel>Data Type</FormLabel>
                        <Select size="sm" value={localField.data.dataType} onChange={handleDataTypeChange}>
                            {(["number", "string", "list"] as DataType[]).map((dt) => (
                                <option key={dt} value={dt}>
                                    {dt}
                                </option>
                            ))}
                        </Select>
                    </FormControl>
                    <FormControl>
                        <FormLabel>Constraint</FormLabel>
                        <Select size="sm" value={localField.data.constraintType} onChange={handleConstraintChange}>
                            {allowedConstraints(localField.data.dataType).map((ct) => (
                                <option key={ct} value={ct}>
                                    {ct}
                                </option>
                            ))}
                        </Select>
                    </FormControl>
                </HStack>
                <FormControl mt={4}>
                    <FormLabel>Value</FormLabel>
                    {renderValueInput()}
                </FormControl>
            </>
        );
    };

    // Render series mode form.
    // The Series Name appears above the tabs.
    const renderSeriesForm = () => {
        const seriesName = localRow["Series"]?.value || "";
        return (
            <>
                <FormControl mb={4} isInvalid={!!errorsRow["Series"]?.value}>
                    <FormLabel>Series Name</FormLabel>
                    <ChakraInput
                        size="sm"
                        value={seriesName}
                        placeholder="Enter series name"
                        onChange={(e) =>
                            setLocalRow((prev) => ({
                                ...prev,
                                Series: { ...prev["Series"], value: e.target.value },
                            }))
                        }
                    />
                    {errorsRow["Series"]?.value && (
                        <FormErrorMessage>{errorsRow["Series"].value}</FormErrorMessage>
                    )}
                </FormControl>
                <Tabs variant="enclosed">
                    <TabList>
                        {Object.keys(localRow)
                            .filter((key) => key !== "Series")
                            .map((key) => (
                                <Tab key={key}>{key}</Tab>
                            ))}
                    </TabList>
                    <TabPanels>
                        {Object.keys(localRow)
                            .filter((key) => key !== "Series")
                            .map((key) => {
                                const field = localRow[key];
                                const currentData = field || { constraintType: "value", value: "", dataType: "string" };
                                return (
                                    <TabPanel key={key}>
                                        <FormControl mb={4}>
                                            <FormLabel>Constraint</FormLabel>
                                            <Select
                                                size="sm"
                                                value={currentData.constraintType}
                                                onChange={(e) =>
                                                    updateSeriesField(key, { constraintType: e.target.value })
                                                }
                                            >
                                                {allowedConstraints(currentData.dataType).map((ct) => (
                                                    <option key={ct} value={ct}>
                                                        {ct}
                                                    </option>
                                                ))}
                                            </Select>
                                        </FormControl>
                                        {renderSeriesFieldEditor(key, currentData)}
                                    </TabPanel>
                                );
                            })}
                    </TabPanels>
                </Tabs>
            </>
        );
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} size="md">
            <ModalOverlay />
            <ModalContent>
                <ModalHeader>{isSeries ? "Edit Series Row" : "Edit Constant Field"}</ModalHeader>
                <ModalCloseButton />
                <ModalBody>
                    {isSeries ? renderSeriesForm() : renderConstantForm()}
                </ModalBody>
                <ModalFooter>
                    <Button size="sm" onClick={handleSave} colorScheme="blue">
                        Save
                    </Button>
                </ModalFooter>
            </ModalContent>
        </Modal>
    );
};

export default EditConstantModal;
