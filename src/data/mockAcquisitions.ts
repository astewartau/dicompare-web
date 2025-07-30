import { Acquisition } from '../types';
import { t1MprageFields, boldFmriFields, dtiFields, EnhancedDicomField } from './mockFields';

// NOTE: This mock data has been superseded by the Pyodide-based mock implementation
// in src/services/PyodideManager.ts for the Generate Template flow.
// This file is kept for backward compatibility with compliance components.

// Helper function to separate acquisition vs series fields properly
const separateFields = (fields: EnhancedDicomField[]) => {
  const acquisitionFields = fields.filter(f => f.level === 'acquisition');
  const seriesFields = fields.filter(f => f.level === 'series');
  
  return { acquisitionFields, seriesFields };
};

// Realistic acquisitions based on actual dicompare package patterns
export const mockAcquisitions: Acquisition[] = [
  {
    id: 'acq_001',
    protocolName: 'T1_MPRAGE_SAG',
    seriesDescription: 'T1 MPRAGE Sagittal',
    totalFiles: 192,
    ...separateFields(t1MprageFields),
    metadata: {
      manufacturer: 'SIEMENS',
      magneticFieldStrength: '3.0T',
      patientPosition: 'HFS',
      sequenceName: 'tfl3d1',
      // T1 MPRAGE has constant ImageType, so no series needed
      seriesCount: 1,
      notes: 'Standard structural T1-weighted acquisition'
    }
  },
  {
    id: 'acq_002', 
    protocolName: 'BOLD_task_rest',
    seriesDescription: 'BOLD resting state fMRI',
    totalFiles: 240,
    ...separateFields(boldFmriFields),
    metadata: {
      manufacturer: 'SIEMENS',
      magneticFieldStrength: '3.0T',
      patientPosition: 'HFS',
      sequenceName: 'epfid2d1_64',
      multibandFactor: '8',
      // BOLD has constant EchoTime and ImageType, so no series needed
      seriesCount: 1,
      notes: 'High temporal resolution functional MRI with multiband acceleration'
    }
  },
  {
    id: 'acq_003',
    protocolName: 'DTI_30dir_b1000',
    seriesDescription: 'Diffusion Tensor Imaging 30 directions',
    totalFiles: 93, // 30 directions + 3 b0 images × 3 runs
    ...separateFields(dtiFields),
    series: [
      {
        name: 'b0 Reference',
        fields: {
          '0018,9087': {
            value: 0,
            dataType: 'number',
            validationRule: { type: 'exact' }
          }, // DiffusionBValue - b0
          '0008,0008': ['ORIGINAL', 'PRIMARY', 'DIFFUSION', 'NONE'], // ImageType
          '0020,0011': 1 // SeriesNumber
        }
      },
      {
        name: 'DTI b1000',
        fields: {
          '0018,9087': {
            value: 1000,
            dataType: 'number', 
            validationRule: { type: 'exact' }
          }, // DiffusionBValue  
          '0008,0008': ['ORIGINAL', 'PRIMARY', 'DIFFUSION', 'ADC'], // ImageType
          '0020,0011': 2 // SeriesNumber
        }
      }
    ],
    metadata: {
      manufacturer: 'SIEMENS',
      magneticFieldStrength: '3.0T',
      patientPosition: 'HFS',
      sequenceName: 'ep2d_diff',
      // DTI has 2 series: b0 and diffusion-weighted
      seriesCount: 2,
      notes: '30-direction DTI with b-value 1000 s/mm²'
    }
  },
  {
    id: 'acq_004',
    protocolName: 'T2_FLAIR_AXIAL',
    seriesDescription: 'T2 FLAIR Axial',
    totalFiles: 28,
    acquisitionFields: [
      { tag: '0008,0060', name: 'Modality', value: 'MR', vr: 'CS', level: 'acquisition', dataType: 'string' },
      { tag: '0008,0070', name: 'Manufacturer', value: 'SIEMENS', vr: 'LO', level: 'acquisition', dataType: 'string' },
      { tag: '0008,103E', name: 'SeriesDescription', value: 'T2_FLAIR_AXIAL', vr: 'LO', level: 'acquisition', dataType: 'string' },
      { tag: '0018,0024', name: 'SequenceName', value: 'tir2d1_16', vr: 'SH', level: 'acquisition', dataType: 'string' },
      { tag: '0018,0087', name: 'MagneticFieldStrength', value: '3', vr: 'DS', level: 'acquisition', dataType: 'number' },
      { tag: '0018,0080', name: 'RepetitionTime', value: '9000', vr: 'DS', level: 'acquisition', dataType: 'number' },
      { tag: '0018,0081', name: 'EchoTime', value: '125', vr: 'DS', level: 'acquisition', dataType: 'number' },
      { tag: '0018,0082', name: 'InversionTime', value: '2500', vr: 'DS', level: 'acquisition', dataType: 'number' },
      { tag: '0018,1314', name: 'FlipAngle', value: '120', vr: 'DS', level: 'acquisition', dataType: 'number' },
      { tag: '0018,0050', name: 'SliceThickness', value: '5', vr: 'DS', level: 'acquisition', dataType: 'number' },
      { tag: '0008,0008', name: 'ImageType', value: ['ORIGINAL', 'PRIMARY', 'M', 'ND'], vr: 'CS', level: 'acquisition', dataType: 'list_string' }
    ],
    seriesFields: [],
    metadata: {
      manufacturer: 'SIEMENS',
      magneticFieldStrength: '3.0T',
      patientPosition: 'HFS',
      sequenceName: 'tir2d1_16',
      seriesCount: 1,
      notes: 'Fluid-attenuated inversion recovery for lesion detection'
    }
  },
  {
    id: 'acq_005',
    protocolName: 'QSM_multi_echo',
    seriesDescription: 'Quantitative Susceptibility Mapping',
    totalFiles: 96, // 4 echoes × 24 slices
    acquisitionFields: [
      { tag: '0008,0060', name: 'Modality', value: 'MR', vr: 'CS', level: 'acquisition', dataType: 'string' },
      { tag: '0008,0070', name: 'Manufacturer', value: 'SIEMENS', vr: 'LO', level: 'acquisition', dataType: 'string' },
      { tag: '0008,103E', name: 'SeriesDescription', value: 'QSM_multi_echo', vr: 'LO', level: 'acquisition', dataType: 'string' },
      { tag: '0018,0024', name: 'SequenceName', value: 'gre3d1vfl', vr: 'SH', level: 'acquisition', dataType: 'string' },
      { tag: '0018,0087', name: 'MagneticFieldStrength', value: '3', vr: 'DS', level: 'acquisition', dataType: 'number' },
      { tag: '0018,0080', name: 'RepetitionTime', value: '28', vr: 'DS', level: 'acquisition', dataType: 'number' },
      { tag: '0018,1314', name: 'FlipAngle', value: '15', vr: 'DS', level: 'acquisition', dataType: 'number' },
      { tag: '0018,0050', name: 'SliceThickness', value: '2', vr: 'DS', level: 'acquisition', dataType: 'number' }
    ],
    // QSM has multiple series for different echo times
    seriesFields: [
      { tag: '0018,0081', name: 'EchoTime', value: 7.38, vr: 'DS', level: 'series', dataType: 'number' },
      { tag: '0008,0008', name: 'ImageType', value: ['ORIGINAL', 'PRIMARY', 'M', 'ND'], vr: 'CS', level: 'series', dataType: 'list_string' }
    ],
    series: [
      {
        name: 'Echo 1',
        fields: {
          '0018,0081': {
            value: 7.38,
            dataType: 'number',
            validationRule: { type: 'exact' }
          }, // EchoTime - number
          '0008,0008': ['ORIGINAL', 'PRIMARY', 'M', 'ND'], // ImageType - list_string
          '0020,0011': 1 // SeriesNumber
        }
      },
      {
        name: 'Echo 2', 
        fields: {
          '0018,0081': {
            value: 14.76,
            dataType: 'number',
            validationRule: { type: 'exact' }
          }, // EchoTime - number
          '0008,0008': ['ORIGINAL', 'PRIMARY', 'M', 'ND'], // ImageType - list_string
          '0020,0011': 2 // SeriesNumber
        }
      },
      {
        name: 'Echo 3',
        fields: {
          '0018,0081': {
            value: 22.14,
            dataType: 'number',
            validationRule: { type: 'exact' }
          }, // EchoTime - number
          '0008,0008': ['ORIGINAL', 'PRIMARY', 'M', 'ND'], // ImageType - list_string  
          '0020,0011': 3 // SeriesNumber
        }
      },
      {
        name: 'Echo 4',
        fields: {
          '0018,0081': {
            value: 29.52,
            dataType: 'number',
            validationRule: { type: 'exact' }
          }, // EchoTime - number
          '0008,0008': ['ORIGINAL', 'PRIMARY', 'M', 'ND'], // ImageType - list_string
          '0020,0011': 4 // SeriesNumber
        }
      }
    ],
    metadata: {
      manufacturer: 'SIEMENS',
      magneticFieldStrength: '3.0T',
      patientPosition: 'HFS',
      sequenceName: 'gre3d1vfl',
      // Multi-echo: 4 series for different echo times
      seriesCount: 4,
      echoTimes: ['7.38', '14.76', '22.14', '29.52'],
      notes: 'Multi-echo gradient echo for quantitative susceptibility mapping'
    }
  }
];

// Helper function to get acquisition by protocol name
export const getAcquisitionByProtocol = (protocolName: string): Acquisition | undefined => {
  return mockAcquisitions.find(acq => acq.protocolName === protocolName);
};

// Helper function to get acquisitions by manufacturer
export const getAcquisitionsByManufacturer = (manufacturer: string): Acquisition[] => {
  return mockAcquisitions.filter(acq => 
    acq.metadata?.manufacturer?.toUpperCase().includes(manufacturer.toUpperCase())
  );
};

// Simulate the acquisition detection logic (in real app, this would be handled by dicompare package)
export const detectAcquisitionsFromFiles = (files: File[]): Promise<Acquisition[]> => {
  // Mock implementation - in reality this would analyze DICOM files
  return Promise.resolve(mockAcquisitions.slice(0, 3)); // Return first 3 acquisitions as detected
};