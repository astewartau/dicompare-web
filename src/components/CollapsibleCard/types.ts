// components/CollapsibleCard/types.ts

export type ConstraintType = "value" | "range" | "value+tolerance" | "contains";
export type DataType = "number" | "string" | "list";

export interface FieldData {
  constraintType: ConstraintType;
  value: string;
  minValue?: string;
  maxValue?: string;
  tolerance?: string;
  dataType: DataType;
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

export interface CollapsibleCardProps {
  acquisition: string;
  validFields: string[];
  onDeleteAcquisition?: (acquisition: string) => void;
  onSaveAcquisition?: (acquisition: string, acquisitionJson: any) => void;
  onGlobalEditChange?: (acq: string, isEditing: boolean) => void;
  onStageChange?: (acq: string, stage: number) => void;
  initialEditMode?: boolean;
  initialStage?: number;
  hideBackButton?: boolean;
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
