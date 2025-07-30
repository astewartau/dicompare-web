import { DicomField } from '../types';

// NOTE: The comprehensive DICOM field dictionary has been moved to the Pyodide-based 
// mock implementation in src/services/PyodideManager.ts for the Generate Template flow.
// This file is kept for backward compatibility with compliance components.

// Field data types for enhanced validation
export type FieldDataType = 'number' | 'string' | 'list_string' | 'list_number' | 'json';
export type ValidationConstraint = 'exact' | 'tolerance' | 'contains' | 'range' | 'custom';
export type ComplianceStatus = 'OK' | 'ERROR' | 'WARNING' | 'NA';

// Enhanced field interface with validation constraints
export interface EnhancedDicomField extends DicomField {
  dataType?: FieldDataType;
  constraint?: {
    type: ValidationConstraint;
    value?: any;
    tolerance?: number;
    min?: number;
    max?: number;
    contains?: string;
    customLogic?: string;
  };
}

// Realistic DICOM fields based on actual dicompare package patterns
// Most fields are acquisition-level (constant within acquisition)
export const commonAcquisitionFields: EnhancedDicomField[] = [
  // Core identification fields
  { tag: '0008,0060', name: 'Modality', value: 'MR', vr: 'CS', level: 'acquisition', dataType: 'string' },
  { tag: '0008,103E', name: 'SeriesDescription', value: 'T1_MPRAGE_SAG', vr: 'LO', level: 'acquisition', dataType: 'string' },
  { tag: '0018,0024', name: 'SequenceName', value: 'tfl3d1', vr: 'SH', level: 'acquisition', dataType: 'string' },
  
  // Hardware specifications
  { tag: '0008,0070', name: 'Manufacturer', value: 'SIEMENS', vr: 'LO', level: 'acquisition', dataType: 'string' },
  { tag: '0008,1090', name: 'ManufacturerModelName', value: 'Prisma', vr: 'LO', level: 'acquisition', dataType: 'string' },
  { tag: '0018,0087', name: 'MagneticFieldStrength', value: '3', vr: 'DS', level: 'acquisition', dataType: 'number' },
  { tag: '0018,1250', name: 'ReceiveCoilName', value: 'HeadNeck_64', vr: 'SH', level: 'acquisition', dataType: 'string' },
  
  // Critical timing parameters (typically constant per acquisition)
  { tag: '0018,0080', name: 'RepetitionTime', value: '2000', vr: 'DS', level: 'acquisition', dataType: 'number',
    constraint: { type: 'tolerance', value: 2000, tolerance: 50 } },
  { tag: '0018,0081', name: 'EchoTime', value: '3.25', vr: 'DS', level: 'acquisition', dataType: 'number',
    constraint: { type: 'tolerance', value: 3.25, tolerance: 0.1 } },
  { tag: '0018,1314', name: 'FlipAngle', value: '9', vr: 'DS', level: 'acquisition', dataType: 'number',
    constraint: { type: 'range', min: 8, max: 12 } },
  
  // Spatial parameters
  { tag: '0018,0050', name: 'SliceThickness', value: '1', vr: 'DS', level: 'acquisition', dataType: 'number' },
  { tag: '0028,0030', name: 'PixelSpacing', value: [1.0, 1.0], vr: 'DS', level: 'acquisition', dataType: 'list_number' },
  { tag: '0018,5100', name: 'PatientPosition', value: 'HFS', vr: 'CS', level: 'acquisition', dataType: 'string' },
  { tag: '0020,0032', name: 'ImagePositionPatient', value: [0, -106.7, -35.2], vr: 'DS', level: 'acquisition', dataType: 'list_number' },
  
  // Advanced parameters
  { tag: '0019,1028', name: 'MultibandFactor', value: '1', vr: 'IS', level: 'acquisition', dataType: 'number' },
  { tag: '0051,1011', name: 'ParallelReductionFactorInPlane', value: '2', vr: 'DS', level: 'acquisition', dataType: 'number' },
  { tag: '0018,0095', name: 'PixelBandwidth', value: '240', vr: 'DS', level: 'acquisition', dataType: 'number' },
  
  // Protocol-specific
  { tag: '0008,0008', name: 'ImageType', value: ['ORIGINAL', 'PRIMARY', 'M', 'ND'], vr: 'CS', level: 'acquisition', dataType: 'list_string' },
  { tag: '0018,0022', name: 'ScanOptions', value: 'PFP\\SP', vr: 'CS', level: 'acquisition', dataType: 'string' },
  { tag: '0018,0023', name: 'MRAcquisitionType', value: '3D', vr: 'CS', level: 'acquisition', dataType: 'string' }
];

// Fields that commonly vary at series level (rare, only 1-3 fields typically)
export const commonSeriesFields: EnhancedDicomField[] = [
  // Primary series differentiator
  { tag: '0008,0008', name: 'ImageType', value: ['ORIGINAL', 'PRIMARY', 'M', 'ND'], vr: 'CS', level: 'series', dataType: 'list_string' },
  { tag: '0020,0011', name: 'SeriesNumber', value: '1', vr: 'IS', level: 'series', dataType: 'number' },
  
  // Multi-echo sequences
  { tag: '0018,0081', name: 'EchoTime', value: '10', vr: 'DS', level: 'series', dataType: 'number' },
  
  // DTI sequences
  { tag: '0018,9087', name: 'DiffusionBValue', value: '1000', vr: 'FD', level: 'series', dataType: 'number' },
  { tag: '0018,9089', name: 'DiffusionGradientDirectionSequence', value: {}, vr: 'SQ', level: 'series', dataType: 'json' }
];

// Sequence-specific field sets based on real protocols
export const t1MprageFields: EnhancedDicomField[] = [
  ...commonAcquisitionFields.filter(f => 
    ['Modality', 'SeriesDescription', 'SequenceName', 'Manufacturer', 'MagneticFieldStrength', 
     'RepetitionTime', 'EchoTime', 'FlipAngle', 'SliceThickness', 'PatientPosition'].includes(f.name!)
  ).map(f => ({
    ...f,
    value: f.name === 'SeriesDescription' ? 'T1_MPRAGE_SAG' :
           f.name === 'SequenceName' ? 'tfl3d1' :
           f.name === 'RepetitionTime' ? '2000' :
           f.name === 'EchoTime' ? '3.25' :
           f.name === 'FlipAngle' ? '9' : f.value
  })),
  // ImageType is constant in T1 MPRAGE, so make it acquisition-level
  { tag: '0008,0008', name: 'ImageType', value: ['ORIGINAL', 'PRIMARY', 'M', 'ND'], vr: 'CS', level: 'acquisition', dataType: 'list_string' }
];

export const boldFmriFields: EnhancedDicomField[] = [
  ...commonAcquisitionFields.filter(f => 
    ['Modality', 'SeriesDescription', 'SequenceName', 'Manufacturer', 'MagneticFieldStrength', 
     'RepetitionTime', 'EchoTime', 'FlipAngle', 'MultibandFactor'].includes(f.name!)
  ).map(f => ({
    ...f,
    value: f.name === 'SeriesDescription' ? 'BOLD_task_rest' :
           f.name === 'SequenceName' ? 'epfid2d1_64' :
           f.name === 'RepetitionTime' ? '800' :
           f.name === 'EchoTime' ? '37' :
           f.name === 'FlipAngle' ? '52' :
           f.name === 'MultibandFactor' ? '8' : f.value
  })),
  // EchoTime and ImageType are constant in single-series BOLD, so make them acquisition-level
  { tag: '0008,0008', name: 'ImageType', value: ['ORIGINAL', 'PRIMARY', 'M', 'ND'], vr: 'CS', level: 'acquisition', dataType: 'list_string' }
];

export const dtiFields: EnhancedDicomField[] = [
  ...commonAcquisitionFields.filter(f => 
    ['Modality', 'SeriesDescription', 'SequenceName', 'Manufacturer', 'MagneticFieldStrength', 
     'RepetitionTime', 'EchoTime', 'SliceThickness'].includes(f.name!)
  ).map(f => ({
    ...f,
    value: f.name === 'SeriesDescription' ? 'DTI_30dir_b1000' :
           f.name === 'SequenceName' ? 'ep2d_diff' :
           f.name === 'RepetitionTime' ? '8400' :
           f.name === 'EchoTime' ? '88' :
           f.name === 'SliceThickness' ? '2' : f.value
  })),
  // Series-level: DiffusionBValue and ImageType vary
  { tag: '0018,9087', name: 'DiffusionBValue', value: '1000', vr: 'FD', level: 'series', dataType: 'number' },
  { tag: '0008,0008', name: 'ImageType', value: ['ORIGINAL', 'PRIMARY', 'DIFFUSION', 'NONE'], vr: 'CS', level: 'series', dataType: 'list_string' }
];

// Mock function to simulate field list fetch (for service layer)
export const getMockDicomFieldList = (): Promise<{ tag: string; name: string; vr: string; description?: string }[]> => {
  return Promise.resolve([
    { tag: '0008,0008', name: 'ImageType', vr: 'CS', description: 'Image identification characteristics' },
    { tag: '0008,0060', name: 'Modality', vr: 'CS', description: 'Type of equipment that originally acquired the data' },
    { tag: '0008,0070', name: 'Manufacturer', vr: 'LO', description: 'Manufacturer of the equipment' },
    { tag: '0008,103E', name: 'SeriesDescription', vr: 'LO', description: 'User provided description of the Series' },
    { tag: '0018,0024', name: 'SequenceName', vr: 'SH', description: 'User or equipment generated sequence name' },
    { tag: '0018,0050', name: 'SliceThickness', vr: 'DS', description: 'Nominal slice thickness in mm' },
    { tag: '0018,0080', name: 'RepetitionTime', vr: 'DS', description: 'The period of time in msec between the beginning of a pulse sequence' },
    { tag: '0018,0081', name: 'EchoTime', vr: 'DS', description: 'Time in msec between the middle of the excitation pulse and the peak of the echo' },
    { tag: '0018,0087', name: 'MagneticFieldStrength', vr: 'DS', description: 'Nominal field strength of MR magnet in Tesla' },
    { tag: '0018,1314', name: 'FlipAngle', vr: 'DS', description: 'Steady state angle in degrees to which the magnetic vector is flipped' },
    { tag: '0018,9087', name: 'DiffusionBValue', vr: 'FD', description: 'Diffusion b-value in sec/mm^2' },
    { tag: '0020,0011', name: 'SeriesNumber', vr: 'IS', description: 'A number that identifies this Series' },
    { tag: '0028,0030', name: 'PixelSpacing', vr: 'DS', description: 'Physical distance in the patient between the center of each pixel' }
  ]);
};