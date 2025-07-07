// types.ts
export interface Acquisition {
    id?: string; // Add unique ID
    name: string;
    details: any;
    source: string;
}

export interface Pair {
    ref: Acquisition | null;
    inp: Acquisition | null;
}

export interface FieldCompliance {
    status: 'ok' | 'error' | 'warning';
    message?: string;
    matched?: string | string[] | null;
}

export interface FinalizeMappingProps {
    onValidationChange: (valid: boolean) => void;
    onReportReady: (report: any) => void;
}

export interface SchemaFile {
    name: string;
    content: string;
}
// Add to types.ts
export interface SchemaUploaderProps {
    isOpen: boolean;
    onClose: () => void;
    onSchemaLoad: (file: SchemaFile) => void;
    isLoading: boolean;
    schemaLibrary: SchemaFile[];
    onAddToLibrary: (schema: SchemaFile) => void;
    onRemoveFromLibrary: (schemaName: string) => void;
}
