import { 
  Acquisition, 
  Template, 
  ComplianceReport, 
  PublicReport, 
  DicomField,
  AcquisitionComplianceResult,
  SeriesComplianceResult,
  ComplianceResult
} from '../types';

// Mock DICOM Fields
export const mockDicomFields: DicomField[] = [
  { tag: '0008,0060', name: 'Modality', value: 'MR', vr: 'CS', level: 'acquisition' },
  { tag: '0008,0070', name: 'Manufacturer', value: 'SIEMENS', vr: 'LO', level: 'acquisition' },
  { tag: '0008,1090', name: 'ManufacturerModelName', value: 'Prisma', vr: 'LO', level: 'acquisition' },
  { tag: '0018,0087', name: 'MagneticFieldStrength', value: '3.0', vr: 'DS', level: 'acquisition' },
  { tag: '0018,5100', name: 'PatientPosition', value: 'HFS', vr: 'CS', level: 'acquisition' },
  { tag: '0008,0008', name: 'ImageType', value: ['ORIGINAL', 'PRIMARY', 'M', 'ND'], vr: 'CS', level: 'series' },
  { tag: '0018,0080', name: 'RepetitionTime', value: '2000', vr: 'DS', level: 'series' },
  { tag: '0018,0081', name: 'EchoTime', value: '30', vr: 'DS', level: 'series' },
  { tag: '0018,1314', name: 'FlipAngle', value: '90', vr: 'DS', level: 'series' },
  { tag: '0020,0011', name: 'SeriesNumber', value: '1', vr: 'IS', level: 'series' }
];

// Mock Acquisitions
export const mockAcquisitions: Acquisition[] = [
  {
    id: 'acq_001',
    protocolName: 'T1_MPRAGE_SAG',
    seriesDescription: 'T1 MPRAGE Sagittal',
    totalFiles: 192,
    acquisitionFields: mockDicomFields.filter(f => f.level === 'acquisition'),
    seriesFields: mockDicomFields.filter(f => f.level === 'series'),
    metadata: {
      manufacturer: 'SIEMENS',
      magneticFieldStrength: '3.0T',
      patientPosition: 'HFS'
    }
  },
  {
    id: 'acq_002',
    protocolName: 'T2_FLAIR_AXIAL',
    seriesDescription: 'T2 FLAIR Axial',
    totalFiles: 28,
    acquisitionFields: [
      { tag: '0008,0060', name: 'Modality', value: 'MR', vr: 'CS', level: 'acquisition' },
      { tag: '0008,0070', name: 'Manufacturer', value: 'SIEMENS', vr: 'LO', level: 'acquisition' },
      { tag: '0018,0087', name: 'MagneticFieldStrength', value: '3.0', vr: 'DS', level: 'acquisition' }
    ],
    seriesFields: [
      { tag: '0018,0080', name: 'RepetitionTime', value: '9000', vr: 'DS', level: 'series' },
      { tag: '0018,0081', name: 'EchoTime', value: '125', vr: 'DS', level: 'series' },
      { tag: '0018,0082', name: 'InversionTime', value: '2500', vr: 'DS', level: 'series' }
    ],
    metadata: {
      manufacturer: 'SIEMENS',
      magneticFieldStrength: '3.0T',
      patientPosition: 'HFS'
    }
  },
  {
    id: 'acq_003',
    protocolName: 'DTI_AXIAL',
    seriesDescription: 'Diffusion Tensor Imaging',
    totalFiles: 72,
    acquisitionFields: [
      { tag: '0008,0060', name: 'Modality', value: 'MR', vr: 'CS', level: 'acquisition' },
      { tag: '0008,0070', name: 'Manufacturer', value: 'SIEMENS', vr: 'LO', level: 'acquisition' }
    ],
    seriesFields: [
      { tag: '0018,0080', name: 'RepetitionTime', value: '8000', vr: 'DS', level: 'series' },
      { tag: '0018,0081', name: 'EchoTime', value: '88', vr: 'DS', level: 'series' },
      { tag: '0018,9087', name: 'DiffusionBValue', value: '1000', vr: 'FD', level: 'series' }
    ],
    metadata: {
      manufacturer: 'SIEMENS',
      magneticFieldStrength: '3.0T'
    }
  }
];

// Mock Templates
export const mockTemplates: Template[] = [
  {
    id: 'template_001',
    name: 'Brain MRI Basic Protocol',
    description: 'Standard brain MRI validation template for T1, T2, and FLAIR sequences',
    authors: ['Dr. Sarah Johnson', 'Dr. Michael Chen'],
    version: '1.2',
    createdDate: '2024-01-15',
    format: 'json',
    acquisitions: {
      't1_mprage': {
        name: 'T1 MPRAGE',
        fields: [
          {
            tag: '0008,0060',
            name: 'Modality',
            required: true,
            validationRule: { type: 'exact', value: 'MR' },
            level: 'acquisition'
          },
          {
            tag: '0018,0087',
            name: 'MagneticFieldStrength',
            required: true,
            validationRule: { type: 'exact', value: '3.0' },
            level: 'acquisition'
          },
          {
            tag: '0018,0080',
            name: 'RepetitionTime',
            required: true,
            validationRule: { type: 'range', min: 1800, max: 2200 },
            level: 'series'
          }
        ]
      }
    }
  },
  {
    id: 'template_002',
    name: 'Multi-Vendor Harmonization',
    description: 'Cross-vendor compatibility template for multi-site studies',
    authors: ['Dr. Emily Rodriguez', 'Dr. James Wilson'],
    version: '2.0',
    createdDate: '2024-02-20',
    format: 'python',
    acquisitions: {
      'structural_mri': {
        name: 'Structural MRI',
        fields: [
          {
            tag: '0008,0070',
            name: 'Manufacturer',
            required: true,
            validationRule: { type: 'pattern', pattern: '^(SIEMENS|GE|PHILIPS)$' },
            level: 'acquisition'
          }
        ]
      }
    }
  }
];

// Mock Compliance Results
const mockComplianceResults: ComplianceResult[] = [
  {
    fieldTag: '0008,0060',
    fieldName: 'Modality',
    status: 'pass',
    expected: 'MR',
    actual: 'MR',
    message: 'Field matches expected value'
  },
  {
    fieldTag: '0018,0087',
    fieldName: 'MagneticFieldStrength',
    status: 'pass',
    expected: '3.0',
    actual: '3.0',
    message: 'Field matches expected value'
  },
  {
    fieldTag: '0018,0080',
    fieldName: 'RepetitionTime',
    status: 'fail',
    expected: '1800-2200',
    actual: '2500',
    message: 'Value 2500 is outside acceptable range 1800-2200'
  }
];

const mockSeriesResults: SeriesComplianceResult[] = [
  {
    seriesId: 'series_001',
    seriesDescription: 'T1 MPRAGE SAG',
    overallStatus: 'fail',
    fieldResults: mockComplianceResults
  }
];

const mockAcquisitionResults: AcquisitionComplianceResult[] = [
  {
    acquisitionId: 'acq_001',
    acquisitionName: 'T1_MPRAGE_SAG',
    overallStatus: 'fail',
    acquisitionFieldResults: mockComplianceResults.slice(0, 2),
    seriesResults: mockSeriesResults
  }
];

// Mock Compliance Report
export const mockComplianceReport: ComplianceReport = {
  id: 'report_001',
  templateName: 'Brain MRI Basic Protocol',
  templateVersion: '1.2',
  analysisDate: '2024-03-15T10:30:00Z',
  overallStatus: 'fail',
  summary: {
    totalAcquisitions: 3,
    passedAcquisitions: 2,
    failedAcquisitions: 1,
    totalSeries: 5,
    passedSeries: 3,
    failedSeries: 2
  },
  acquisitionResults: mockAcquisitionResults
};

// Mock Public Reports
export const mockPublicReports: PublicReport[] = [
  {
    id: 'pub_001',
    title: 'Brain MRI Quality Assessment - Johns Hopkins',
    institution: 'Johns Hopkins Medical Center',
    studyType: 'Brain MRI',
    description: 'Comprehensive quality assessment of brain MRI protocols across multiple sequences including T1, T2, FLAIR, and DTI.',
    dateCreated: '2024-01-20',
    tags: ['brain', 'mri', 'quality-control', 'multi-sequence'],
    reportType: 'compliance'
  },
  {
    id: 'pub_002',
    title: 'Spinal MRI Metadata Integrity Report - Mayo Clinic',
    institution: 'Mayo Clinic',
    studyType: 'Spinal MRI',
    description: 'Validation of spinal MRI metadata integrity and consistency across sagittal and axial acquisitions.',
    dateCreated: '2024-02-05',
    tags: ['spine', 'mri', 'metadata', 'integrity'],
    reportType: 'compliance'
  },
  {
    id: 'pub_003',
    title: 'Cardiac MRI Protocol Certification - Stanford',
    institution: 'Stanford Medical Center',
    studyType: 'Cardiac MRI',
    description: 'Certification report for cardiac MRI protocols including cine, perfusion, and late gadolinium enhancement sequences.',
    dateCreated: '2024-02-15',
    tags: ['cardiac', 'mri', 'certification', 'multi-protocol'],
    reportType: 'certificate'
  },
  {
    id: 'pub_004',
    title: 'Multi-Vendor Harmonization Study - ADNI',
    institution: 'Alzheimer\'s Disease Neuroimaging Initiative',
    studyType: 'Multi-Site Brain MRI',
    description: 'Cross-vendor compatibility assessment for Siemens, GE, and Philips scanners in longitudinal brain imaging study.',
    dateCreated: '2024-03-01',
    tags: ['multi-vendor', 'brain', 'harmonization', 'longitudinal'],
    reportType: 'compliance'
  },
  {
    id: 'pub_005',
    title: 'Pediatric Brain MRI Safety Compliance - Children\'s Hospital',
    institution: 'Boston Children\'s Hospital',
    studyType: 'Pediatric Brain MRI',
    description: 'Safety and protocol compliance assessment for pediatric brain MRI acquisitions with age-appropriate parameters.',
    dateCreated: '2024-03-10',
    tags: ['pediatric', 'brain', 'safety', 'compliance'],
    reportType: 'certificate'
  }
];

// Export all mock data
export const mockData = {
  acquisitions: mockAcquisitions,
  templates: mockTemplates,
  complianceReport: mockComplianceReport,
  publicReports: mockPublicReports,
  dicomFields: mockDicomFields
};