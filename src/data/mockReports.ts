import { ComplianceReport, PublicReport, AcquisitionComplianceResult, SeriesComplianceResult, ComplianceResult } from '../types';
import { ComplianceStatus } from './mockFields';

// Enhanced compliance results with realistic medical imaging validation scenarios
const createMockComplianceResults = (scenario: 'pass' | 'fail_timing' | 'fail_hardware' | 'partial'): ComplianceResult[] => {
  const baseResults: ComplianceResult[] = [
    {
      fieldTag: '0008,0060',
      fieldName: 'Modality',
      status: 'pass',
      expected: 'MR',
      actual: 'MR',
      message: 'Field matches expected value exactly'
    },
    {
      fieldTag: '0008,0070',
      fieldName: 'Manufacturer',
      status: 'pass',
      expected: 'SIEMENS',
      actual: 'SIEMENS',
      message: 'Field matches expected value exactly'
    },
    {
      fieldTag: '0018,0087',
      fieldName: 'MagneticFieldStrength',
      status: 'pass',
      expected: '3',
      actual: '3',
      message: 'Field matches expected value exactly'
    }
  ];

  switch (scenario) {
    case 'fail_timing':
      return [
        ...baseResults,
        {
          fieldTag: '0018,0080',
          fieldName: 'RepetitionTime',
          status: 'fail',
          expected: '2000 ± 50 (1950-2050)',
          actual: '2300',
          message: 'Value 2300 ms exceeds tolerance range of 2000 ± 50 ms'
        },
        {
          fieldTag: '0018,0081',
          fieldName: 'EchoTime',
          status: 'fail',
          expected: '3.25 ± 0.1 (3.15-3.35)',
          actual: '4.2',
          message: 'Value 4.2 ms exceeds tolerance range of 3.25 ± 0.1 ms'
        }
      ];
      
    case 'fail_hardware':
      return [
        ...baseResults.slice(0, 2), // Keep modality and manufacturer
        {
          fieldTag: '0018,0087',
          fieldName: 'MagneticFieldStrength',
          status: 'fail',
          expected: '3',
          actual: '1.5',
          message: 'Field strength 1.5T does not match required 3T'
        },
        {
          fieldTag: '0018,1250',
          fieldName: 'ReceiveCoilName',
          status: 'fail',
          expected: 'Contains "HeadNeck"',
          actual: 'Body_18',
          message: 'Coil "Body_18" does not contain required substring "HeadNeck"'
        }
      ];
      
    case 'partial':
      return [
        ...baseResults,
        {
          fieldTag: '0018,0080',
          fieldName: 'RepetitionTime',
          status: 'pass',
          expected: '2000 ± 50 (1950-2050)',
          actual: '1980',
          message: 'Value 1980 ms within tolerance range of 2000 ± 50 ms'
        },
        {
          fieldTag: '0018,1314',
          fieldName: 'FlipAngle',
          status: 'fail',
          expected: '8-12°',
          actual: '15',
          message: 'Value 15° is outside acceptable range 8-12°'
        }
      ];
      
    default: // 'pass'
      return [
        ...baseResults,
        {
          fieldTag: '0018,0080',
          fieldName: 'RepetitionTime',
          status: 'pass',
          expected: '2000 ± 50 (1950-2050)',
          actual: '2010',
          message: 'Value 2010 ms within tolerance range of 2000 ± 50 ms'
        },
        {
          fieldTag: '0018,0081',
          fieldName: 'EchoTime',
          status: 'pass',
          expected: '3.25 ± 0.1 (3.15-3.35)',
          actual: '3.28',
          message: 'Value 3.28 ms within tolerance range of 3.25 ± 0.1 ms'
        }
      ];
  }
};

// Mock series results for different scenarios
const createMockSeriesResults = (scenario: string): SeriesComplianceResult[] => {
  switch (scenario) {
    case 'multi_echo':
      return [
        {
          seriesId: 'echo_1',
          seriesDescription: 'QSM Echo 1 (TE=7.38ms)',
          overallStatus: 'pass',
          fieldResults: [
            {
              fieldTag: '0018,0081',
              fieldName: 'EchoTime',
              status: 'pass',
              expected: '7.38 ± 0.1',
              actual: '7.35',
              message: 'Echo time within tolerance'
            },
            {
              fieldTag: '0008,0008',
              fieldName: 'ImageType',
              status: 'pass',
              expected: '["ORIGINAL", "PRIMARY", "M", "ND"]',
              actual: '["ORIGINAL", "PRIMARY", "M", "ND"]',
              message: 'Image type matches expected'
            }
          ]
        },
        {
          seriesId: 'echo_2',
          seriesDescription: 'QSM Echo 2 (TE=14.76ms)',
          overallStatus: 'fail',
          fieldResults: [
            {
              fieldTag: '0018,0081',
              fieldName: 'EchoTime',
              status: 'fail',
              expected: '14.76 ± 0.1',
              actual: '15.2',
              message: 'Echo time 15.2ms exceeds tolerance range'
            }
          ]
        }
      ];
      
    case 'dti':
      return [
        {
          seriesId: 'b0_series',
          seriesDescription: 'DTI B0 Images',
          overallStatus: 'pass',
          fieldResults: [
            {
              fieldTag: '0018,9087',
              fieldName: 'DiffusionBValue',
              status: 'pass',
              expected: '0',
              actual: '0',
              message: 'B-value matches expected for B0 images'
            }
          ]
        },
        {
          seriesId: 'dwi_series',
          seriesDescription: 'DTI Diffusion Weighted',
          overallStatus: 'pass',
          fieldResults: [
            {
              fieldTag: '0018,9087',
              fieldName: 'DiffusionBValue',
              status: 'pass',
              expected: '1000',
              actual: '1000',
              message: 'B-value matches expected for DWI'
            }
          ]
        }
      ];
      
    default: // single series
      return [
        {
          seriesId: 'series_001',
          seriesDescription: 'T1 MPRAGE SAG',
          overallStatus: scenario.includes('fail') ? 'fail' : 'pass',
          fieldResults: createMockComplianceResults(scenario as any)
        }
      ];
  }
};

// Mock acquisition results
const createMockAcquisitionResults = (): AcquisitionComplianceResult[] => [
  {
    acquisitionId: 'acq_001',
    acquisitionName: 'T1_MPRAGE_SAG',
    overallStatus: 'pass',
    acquisitionFieldResults: createMockComplianceResults('pass').slice(0, 3),
    seriesResults: createMockSeriesResults('pass')
  },
  {
    acquisitionId: 'acq_002',
    acquisitionName: 'QSM_multi_echo',
    overallStatus: 'fail',
    acquisitionFieldResults: createMockComplianceResults('pass').slice(0, 3),
    seriesResults: createMockSeriesResults('multi_echo')
  },
  {
    acquisitionId: 'acq_003',
    acquisitionName: 'DTI_30dir_b1000',
    overallStatus: 'pass',
    acquisitionFieldResults: createMockComplianceResults('pass').slice(0, 3),
    seriesResults: createMockSeriesResults('dti')
  }
];

// Enhanced compliance reports with realistic medical scenarios
export const mockComplianceReports: ComplianceReport[] = [
  {
    id: 'report_001',
    templateName: 'HCP-Style Structural MRI Protocol',
    templateVersion: '1.3',
    analysisDate: '2024-03-15T10:30:00Z',
    overallStatus: 'pass',
    summary: {
      totalAcquisitions: 3,
      passedAcquisitions: 3,
      failedAcquisitions: 0,
      totalSeries: 6,
      passedSeries: 6,
      failedSeries: 0
    },
    acquisitionResults: createMockAcquisitionResults().map(r => ({ ...r, overallStatus: 'pass' }))
  },
  {
    id: 'report_002',
    templateName: 'Multi-Vendor Brain MRI Harmonization',
    templateVersion: '2.1',
    analysisDate: '2024-03-16T14:22:00Z',
    overallStatus: 'fail',
    summary: {
      totalAcquisitions: 3,
      passedAcquisitions: 1,
      failedAcquisitions: 2,
      totalSeries: 4,
      passedSeries: 2,
      failedSeries: 2
    },
    acquisitionResults: [
      {
        acquisitionId: 'acq_001',
        acquisitionName: 'T1_MPRAGE_SAG',
        overallStatus: 'pass',
        acquisitionFieldResults: createMockComplianceResults('pass').slice(0, 4),
        seriesResults: createMockSeriesResults('pass')
      },
      {
        acquisitionId: 'acq_002',
        acquisitionName: 'T1_MPRAGE_PHILIPS',
        overallStatus: 'fail',
        acquisitionFieldResults: createMockComplianceResults('fail_timing'),
        seriesResults: createMockSeriesResults('fail_timing')
      }
    ]
  }
];

// Enhanced public reports with realistic medical imaging scenarios
export const mockPublicReports: PublicReport[] = [
  {
    id: 'pub_001',
    title: 'HCP-Style Brain MRI Quality Assessment - Johns Hopkins',
    institution: 'Johns Hopkins School of Medicine',
    studyType: 'Structural Brain MRI',
    description: 'Comprehensive quality assessment of Human Connectome Project-style brain MRI protocols. Validates T1 MPRAGE, T2 SPACE, and resting-state fMRI acquisitions across 3T Siemens Prisma scanners with strict timing tolerances and spatial resolution requirements.',
    dateCreated: '2024-01-20',
    tags: ['brain', 'structural-mri', 'hcp-protocol', 'quality-control', '3t-siemens'],
    reportType: 'compliance'
  },
  {
    id: 'pub_002',
    title: 'Multi-Echo Quantitative Susceptibility Mapping Validation - NYU',
    institution: 'NYU Grossman School of Medicine',
    studyType: 'Quantitative Susceptibility Mapping',
    description: 'Validation protocol for multi-echo gradient echo sequences used in quantitative susceptibility mapping. Ensures precise echo time spacing (ΔTE=7.38ms) and optimal flip angle settings for iron quantification in subcortical gray matter structures.',
    dateCreated: '2024-02-05',
    tags: ['qsm', 'multi-echo', 'iron-quantification', 'gradient-echo', 'subcortical'],
    reportType: 'compliance'
  },
  {
    id: 'pub_003',
    title: 'Diffusion Tensor Imaging Protocol Certification - Mass General',
    institution: 'Massachusetts General Hospital',
    studyType: 'Diffusion Tensor Imaging',
    description: 'Certification report for high-quality DTI protocols including 30-direction, 64-direction, and multi-shell HARDI acquisitions. Validates b-value accuracy, gradient direction orthogonality, and motion correction parameters for white matter tractography studies.',
    dateCreated: '2024-02-15',
    tags: ['dti', 'tractography', 'white-matter', 'hardi', 'multi-shell'],
    reportType: 'certificate'
  },
  {
    id: 'pub_004',
    title: 'Multi-Vendor Harmonization for Alzheimer\'s Research - ADNI',
    institution: 'Alzheimer\'s Disease Neuroimaging Initiative',
    studyType: 'Multi-Site Longitudinal Brain MRI',
    description: 'Cross-vendor compatibility assessment for longitudinal brain imaging across Siemens, GE, and Philips 3T systems. Establishes harmonization protocols for structural T1, FLAIR, and arterial spin labeling sequences in aging and dementia research.',
    dateCreated: '2024-03-01',
    tags: ['multi-vendor', 'alzheimers', 'longitudinal', 'harmonization', 'aging', 'asl'],
    reportType: 'compliance'
  },
  {
    id: 'pub_005',
    title: 'Pediatric Brain MRI Safety and Protocol Compliance - Boston Children\'s',
    institution: 'Boston Children\'s Hospital',
    studyType: 'Pediatric Brain MRI',
    description: 'Comprehensive safety and protocol compliance assessment for pediatric brain MRI acquisitions. Validates age-appropriate SAR limits, reduced scan times, motion-robust sequences, and sedation-free imaging protocols for children ages 6 months to 18 years.',
    dateCreated: '2024-03-10',
    tags: ['pediatric', 'safety', 'sar-limits', 'motion-robust', 'sedation-free'],
    reportType: 'certificate'
  },
  {
    id: 'pub_006',
    title: 'Ultra-High Field 7T Neuroimaging Protocol - University of Minnesota',
    institution: 'Center for Magnetic Resonance Research, University of Minnesota',
    studyType: '7T Brain MRI',
    description: 'Specialized validation protocol for 7 Tesla brain imaging including ultra-high resolution anatomical imaging, functional connectivity, and quantitative MRI. Addresses unique challenges of B0/B1 inhomogeneity, SAR constraints, and RF shimming at ultra-high field.',
    dateCreated: '2024-03-18',
    tags: ['7tesla', 'ultra-high-field', 'b0-shimming', 'b1-shimming', 'sar-constraints'],
    reportType: 'compliance'
  },
  {
    id: 'pub_007',
    title: 'Cardiac MRI Cine and Late Gadolinium Enhancement - Stanford',
    institution: 'Stanford Cardiovascular Institute',
    studyType: 'Cardiac MRI',
    description: 'Validation protocol for cardiac MRI sequences including balanced SSFP cine imaging, phase-contrast flow quantification, and late gadolinium enhancement for myocardial viability assessment. Ensures proper cardiac gating, breath-hold timing, and contrast timing protocols.',
    dateCreated: '2024-03-25',
    tags: ['cardiac', 'cine-imaging', 'late-enhancement', 'myocardial-viability', 'cardiac-gating'],
    reportType: 'certificate'
  },
  {
    id: 'pub_008',
    title: 'Functional MRI Task Paradigm Validation - UCLA',
    institution: 'UCLA Brain Imaging Center',
    studyType: 'Task-based fMRI',
    description: 'Protocol validation for task-based functional MRI studies including working memory, emotion processing, and language paradigms. Validates EPI sequence parameters, stimulus timing synchronization, and physiological monitoring integration for robust activation detection.',
    dateCreated: '2024-04-02',
    tags: ['task-fmri', 'working-memory', 'emotion', 'language', 'epi-sequence'],
    reportType: 'compliance'
  }
];

// Helper functions for report management
export const getComplianceReportById = (id: string): ComplianceReport | undefined => {
  return mockComplianceReports.find(report => report.id === id);
};

export const getPublicReportsByTag = (tag: string): PublicReport[] => {
  return mockPublicReports.filter(report => 
    report.tags.some(t => t.toLowerCase().includes(tag.toLowerCase()))
  );
};

export const getPublicReportsByInstitution = (institution: string): PublicReport[] => {
  return mockPublicReports.filter(report => 
    report.institution.toLowerCase().includes(institution.toLowerCase())
  );
};

export const getPublicReportsByStudyType = (studyType: string): PublicReport[] => {
  return mockPublicReports.filter(report => 
    report.studyType.toLowerCase().includes(studyType.toLowerCase())
  );
};

// Generate mock compliance report for template testing
export const generateMockComplianceReport = (
  templateName: string, 
  templateVersion: string,
  acquisitionCount: number = 3
): ComplianceReport => {
  const acquisitionResults = createMockAcquisitionResults().slice(0, acquisitionCount);
  const totalSeries = acquisitionResults.reduce((sum, acq) => sum + acq.seriesResults.length, 0);
  const passedAcquisitions = acquisitionResults.filter(acq => acq.overallStatus === 'pass').length;
  const passedSeries = acquisitionResults.reduce((sum, acq) => 
    sum + acq.seriesResults.filter(series => series.overallStatus === 'pass').length, 0
  );
  
  return {
    id: `report_${Date.now()}`,
    templateName,
    templateVersion,
    analysisDate: new Date().toISOString(),
    overallStatus: passedAcquisitions === acquisitionCount ? 'pass' : 'fail',
    summary: {
      totalAcquisitions: acquisitionCount,
      passedAcquisitions,
      failedAcquisitions: acquisitionCount - passedAcquisitions,
      totalSeries,
      passedSeries,
      failedSeries: totalSeries - passedSeries
    },
    acquisitionResults
  };
};