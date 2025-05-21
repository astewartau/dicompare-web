// types.ts
export interface Acquisition {
    name: string;
    details: Record<string, any>;
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
