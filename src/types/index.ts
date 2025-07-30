// DICOM Field Types
export interface DicomField {
  tag: string;
  name: string;
  value: string | number | string[] | number[] | any;
  vr: string; // Value Representation
  level: 'acquisition' | 'series';
}

// Enhanced field types for validation
export type FieldDataType = 'number' | 'string' | 'list_string' | 'list_number' | 'json';
export type ValidationConstraint = 'exact' | 'tolerance' | 'contains' | 'range' | 'custom';
export type ComplianceStatus = 'OK' | 'ERROR' | 'WARNING' | 'NA';

// Acquisition Types
export interface Acquisition {
  id: string;
  protocolName: string;
  seriesDescription: string;
  totalFiles: number;
  acquisitionFields: DicomField[];
  seriesFields: DicomField[];
  metadata: {
    manufacturer?: string;
    magneticFieldStrength?: string;
    patientPosition?: string;
    sequenceName?: string;
    seriesCount?: number;
    echoTimes?: string[];
    multibandFactor?: string;
    notes?: string;
    [key: string]: any;
  };
}

// Schema/Template Types
export interface ValidationRule {
  type: ValidationConstraint;
  value?: any;
  min?: number;
  max?: number;
  pattern?: string;
  tolerance?: number;
  contains?: string;
  customLogic?: string;
}

export interface SchemaField {
  tag: string;
  name: string;
  required: boolean;
  validationRule: ValidationRule;
  level: 'acquisition' | 'series';
  dataType?: FieldDataType;
}

export interface Template {
  id: string;
  name: string;
  description?: string;
  authors: string[];
  version: string;
  createdDate: string;
  format: 'json' | 'python';
  acquisitions: {
    [acquisitionId: string]: {
      name: string;
      fields: SchemaField[];
    };
  };
}

// Compliance Types
export interface ComplianceResult {
  fieldTag: string;
  fieldName: string;
  status: 'pass' | 'fail' | 'warning';
  expected: any;
  actual: any;
  message: string;
}

export interface SeriesComplianceResult {
  seriesId: string;
  seriesDescription: string;
  overallStatus: 'pass' | 'fail' | 'warning';
  fieldResults: ComplianceResult[];
}

export interface AcquisitionComplianceResult {
  acquisitionId: string;
  acquisitionName: string;
  overallStatus: 'pass' | 'fail' | 'warning';
  acquisitionFieldResults: ComplianceResult[];
  seriesResults: SeriesComplianceResult[];
}

export interface ComplianceReport {
  id: string;
  templateName: string;
  templateVersion: string;
  analysisDate: string;
  overallStatus: 'pass' | 'fail' | 'warning';
  summary: {
    totalAcquisitions: number;
    passedAcquisitions: number;
    failedAcquisitions: number;
    totalSeries: number;
    passedSeries: number;
    failedSeries: number;
  };
  acquisitionResults: AcquisitionComplianceResult[];
}

// Data Loading Types
export interface DicomFile {
  id: string;
  filename: string;
  size: number;
  path: string;
  metadata: { [key: string]: any };
}

export interface ProcessingProgress {
  currentFile: number;
  totalFiles: number;
  currentOperation: string;
  percentage: number;
}

// Public Reports Types
export interface PublicReport {
  id: string;
  title: string;
  institution: string;
  studyType: string;
  description: string;
  dateCreated: string;
  tags: string[];
  downloadUrl?: string;
  reportType: 'compliance' | 'certificate';
}

// UI State Types
export interface AppState {
  currentAcquisitions: Acquisition[];
  selectedTemplate: Template | null;
  complianceReport: ComplianceReport | null;
  isProcessing: boolean;
  processingProgress: ProcessingProgress | null;
}