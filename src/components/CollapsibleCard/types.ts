// components/CollapsibleCard/types.ts

export type ConstraintType = 'value' | 'range' | 'value+tolerance' | 'contains';
export type BaseDataType = 'number' | 'string' | 'list' | 'raw_json';
export type ListSubType = 'number' | 'string';
export type DataType = BaseDataType; // Keep for backward compatibility

export interface FieldData {
    constraintType: ConstraintType;
    value: string;
    minValue?: string;
    maxValue?: string;
    tolerance?: string;
    dataType: BaseDataType;
    listSubType?: ListSubType;
}

export interface ConstantField {
    id: string;
    name: string;
    data: FieldData;
}

export interface VariableRow {
    Series: FieldData;
    [key: string]: FieldData;
}

export interface FormData {
    constant: ConstantField[];
    variable: VariableRow[];
}

// In CollapsibleCard/types.ts, add to CollapsibleCardProps:
export interface CollapsibleCardProps {
    acquisition: string;
    validFields: string[];
    allValidFields?: string[]; // Add this new prop
    onDeleteAcquisition?: (acq: string) => void;
    onSaveAcquisition?: (acq: string, jsonData: any) => void;
    onGlobalEditChange?: (acq: string, isEditing: boolean) => void;
    onStageChange?: (acq: string, stage: number) => void;
    initialEditMode?: boolean;
    initialStage?: number;
    hideBackButton?: boolean;
    isDicomGenerated?: boolean; // New prop
    initialFormData?: FormData; // New prop
}

export interface AutocompleteInputProps {
    initialValue: string;
    validFields: string[];
    onChange: (value: string) => void;
}

export interface TagifyInputProps {
    initialTags: string[];
    onChange: (tags: string[]) => void;
}

export interface EditableCellProps {
    cellData: FieldData;
    editable: boolean;
    onChange: (updates: Partial<FieldData>) => void;
    fieldName?: string;
    showDataType?: boolean;
}
