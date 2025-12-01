import { Template } from '../types';
import { ValidationConstraint, ComplianceStatus } from './mockFields';

// Enhanced template interface with realistic validation constraints
export interface EnhancedTemplate extends Omit<Template, 'acquisitions'> {
  acquisitions: {
    [key: string]: {
      name: string;
      fields: Array<{
        tag: string;
        name: string;
        required: boolean;
        validationRule: {
          type: ValidationConstraint;
          value?: any;
          tolerance?: number;
          min?: number;
          max?: number;
          contains?: string;
        };
        level: 'acquisition' | 'series';
        dataType?: 'number' | 'string' | 'list_string' | 'list_number' | 'json';
      }>;
      series?: Array<{
        id: string;
        name: string;
        fields: Record<string, any>;
      }>;
    };
  };
}

// Realistic templates based on actual medical imaging protocols
export const mockTemplates: EnhancedTemplate[] = [
  {
    id: 'template_001',
    name: 'HCP-Style Structural MRI Protocol',
    description: 'Human Connectome Project inspired structural MRI validation template for T1 MPRAGE with strict parameter tolerances',
    authors: ['Dr. Sarah Johnson', 'Dr. Michael Chen'],
    version: '1.3',
    createdDate: '2024-01-15',
    format: 'json',
    acquisitions: {
      't1_mprage': {
        name: 'T1 MPRAGE',
        fields: [
          // Core identification - exact match required
          {
            tag: '0008,0060',
            name: 'Modality',
            required: true,
            validationRule: { type: 'exact', value: 'MR' },
            level: 'acquisition',
            dataType: 'string'
          },
          {
            tag: '0018,0024',
            name: 'SequenceName',
            required: true,
            validationRule: { type: 'contains', contains: 'tfl3d1' },
            level: 'acquisition',
            dataType: 'string'
          },
          
          // Hardware requirements
          {
            tag: '0008,0070',
            name: 'Manufacturer',
            required: true,
            validationRule: { type: 'exact', value: 'SIEMENS' },
            level: 'acquisition',
            dataType: 'string'
          },
          {
            tag: '0018,0087',
            name: 'MagneticFieldStrength',
            required: true,
            validationRule: { type: 'exact', value: '3' },
            level: 'acquisition',
            dataType: 'string'
          },
          
          // Critical timing parameters with tolerances
          {
            tag: '0018,0080',
            name: 'RepetitionTime',
            required: true,
            validationRule: { type: 'tolerance', value: 2000, tolerance: 50 },
            level: 'acquisition',
            dataType: 'number'
          },
          {
            tag: '0018,0081',
            name: 'EchoTime',
            required: true,
            validationRule: { type: 'tolerance', value: 3.25, tolerance: 0.1 },
            level: 'acquisition',
            dataType: 'number'
          },
          {
            tag: '0018,1314',
            name: 'FlipAngle',
            required: true,
            validationRule: { type: 'range', min: 8, max: 12 },
            level: 'acquisition',
            dataType: 'number'
          },
          
          // Spatial parameters
          {
            tag: '0018,0050',
            name: 'SliceThickness',
            required: true,
            validationRule: { type: 'tolerance', value: 1.0, tolerance: 0.1 },
            level: 'acquisition',
            dataType: 'number'
          },
          {
            tag: '0028,0030',
            name: 'PixelSpacing',
            required: false,
            validationRule: { type: 'tolerance', value: [1.0, 1.0], tolerance: 0.1 },
            level: 'acquisition',
            dataType: 'list_number'
          }
        ],
        // Single series expected for T1 MPRAGE
        series: [
          {
            id: 'series_1',
            name: 'Series 01',
            fields: {
              'ImageType': ['ORIGINAL', 'PRIMARY', 'M', 'ND']
            }
          }
        ]
      }
    }
  },
  
  {
    id: 'template_002',
    name: 'Multi-Vendor Brain MRI Harmonization',
    description: 'Cross-vendor compatibility template for multi-site studies supporting Siemens, GE, and Philips scanners',
    authors: ['Dr. Emily Rodriguez', 'Dr. James Wilson', 'Dr. Lisa Chang'],
    version: '2.1',
    createdDate: '2024-02-20',
    format: 'json',
    acquisitions: {
      'structural_mri': {
        name: 'Structural MRI (Any T1)',
        fields: [
          {
            tag: '0008,0060',
            name: 'Modality',
            required: true,
            validationRule: { type: 'exact', value: 'MR' },
            level: 'acquisition',
            dataType: 'string'
          },
          {
            tag: '0008,0070',
            name: 'Manufacturer',
            required: true,
            validationRule: { type: 'exact', value: 'SIEMENS' },
            level: 'acquisition',
            dataType: 'string'
          },
          {
            tag: '0018,0087',
            name: 'MagneticFieldStrength',
            required: true,
            validationRule: { type: 'range', min: 2.9, max: 3.1 },
            level: 'acquisition',
            dataType: 'number'
          },
          {
            tag: '0008,103E',
            name: 'SeriesDescription',
            required: true,
            validationRule: { type: 'contains', contains: 'T1' },
            level: 'acquisition',
            dataType: 'string'
          },
          
          // Flexible timing parameters for cross-vendor compatibility
          {
            tag: '0018,0080',
            name: 'RepetitionTime',
            required: true,
            validationRule: { type: 'range', min: 1500, max: 3000 },
            level: 'acquisition',
            dataType: 'number'
          },
          {
            tag: '0018,0081',
            name: 'EchoTime',
            required: true,
            validationRule: { type: 'range', min: 2.0, max: 6.0 },
            level: 'acquisition',
            dataType: 'number'
          }
        ]
      }
    }
  },
  
  {
    id: 'template_003',
    name: 'Advanced DTI Quality Control',
    description: 'Comprehensive diffusion tensor imaging validation with b-value and direction checking',
    authors: ['Dr. Amanda Foster', 'Dr. Robert Kumar'],
    version: '1.0',
    createdDate: '2024-03-05',
    format: 'json',
    acquisitions: {
      'dti_30dir': {
        name: 'DTI 30 Directions',
        fields: [
          {
            tag: '0008,0060',
            name: 'Modality',
            required: true,
            validationRule: { type: 'exact', value: 'MR' },
            level: 'acquisition',
            dataType: 'string'
          },
          {
            tag: '0008,103E',
            name: 'SeriesDescription',
            required: true,
            validationRule: { type: 'contains', contains: 'DTI' },
            level: 'acquisition',
            dataType: 'string'
          },
          {
            tag: '0018,0024',
            name: 'SequenceName',
            required: true,
            validationRule: { type: 'contains', contains: 'diff' },
            level: 'acquisition',
            dataType: 'string'
          },
          {
            tag: '0018,0080',
            name: 'RepetitionTime',
            required: true,
            validationRule: { type: 'range', min: 7000, max: 10000 },
            level: 'acquisition',
            dataType: 'number'
          },
          {
            tag: '0018,0081',
            name: 'EchoTime',
            required: true,
            validationRule: { type: 'range', min: 80, max: 100 },
            level: 'acquisition',
            dataType: 'number'
          },
          {
            tag: '0018,0050',
            name: 'SliceThickness',
            required: true,
            validationRule: { type: 'tolerance', value: 2.0, tolerance: 0.2 },
            level: 'acquisition',
            dataType: 'number'
          }
        ],
        // DTI typically has 2 series: b0 and diffusion-weighted
        series: [
          {
            id: 'series_b0',
            name: 'B0 Images',
            fields: {
              'DiffusionBValue': 0,
              'ImageType': ['ORIGINAL', 'PRIMARY', 'DIFFUSION', 'NONE']
            }
          },
          {
            id: 'series_dwi',
            name: 'Diffusion Weighted',
            fields: {
              'DiffusionBValue': 1000,
              'ImageType': ['ORIGINAL', 'PRIMARY', 'DIFFUSION', 'TRACE']
            }
          }
        ]
      }
    }
  },
  
  {
    id: 'template_004',
    name: 'Quantitative Susceptibility Mapping Protocol',
    description: 'Multi-echo gradient echo validation for QSM with precise echo time requirements',
    authors: ['Dr. Chen Wei', 'Dr. Maria Santos'],
    version: '1.1',
    createdDate: '2024-03-12',
    format: 'python',
    acquisitions: {
      'qsm_multi_echo': {
        name: 'QSM Multi-Echo GRE',
        fields: [
          {
            tag: '0008,0060',
            name: 'Modality',
            required: true,
            validationRule: { type: 'exact', value: 'MR' },
            level: 'acquisition',
            dataType: 'string'
          },
          {
            tag: '0018,0024',
            name: 'SequenceName',
            required: true,
            validationRule: { type: 'contains', contains: 'gre' },
            level: 'acquisition',
            dataType: 'string'
          },
          {
            tag: '0018,0080',
            name: 'RepetitionTime',
            required: true,
            validationRule: { type: 'range', min: 25, max: 35 },
            level: 'acquisition',
            dataType: 'number'
          },
          {
            tag: '0018,1314',
            name: 'FlipAngle',
            required: true,
            validationRule: { type: 'range', min: 10, max: 20 },
            level: 'acquisition',
            dataType: 'number'
          },
          {
            tag: '0018,0050',
            name: 'SliceThickness',
            required: true,
            validationRule: { type: 'tolerance', value: 2.0, tolerance: 0.1 },
            level: 'acquisition',
            dataType: 'number'
          }
        ],
        // Multi-echo: 4 series with different echo times
        series: [
          {
            id: 'echo_1',
            name: 'Echo 1',
            fields: {
              'EchoTime': 7.38,
              'ImageType': ['ORIGINAL', 'PRIMARY', 'M', 'ND']
            }
          },
          {
            id: 'echo_2', 
            name: 'Echo 2',
            fields: {
              'EchoTime': 14.76,
              'ImageType': ['ORIGINAL', 'PRIMARY', 'M', 'ND']
            }
          },
          {
            id: 'echo_3',
            name: 'Echo 3', 
            fields: {
              'EchoTime': 22.14,
              'ImageType': ['ORIGINAL', 'PRIMARY', 'M', 'ND']
            }
          },
          {
            id: 'echo_4',
            name: 'Echo 4',
            fields: {
              'EchoTime': 29.52,
              'ImageType': ['ORIGINAL', 'PRIMARY', 'M', 'ND']
            }
          }
        ]
      }
    }
  }
];

// Helper functions for template management
export const getTemplateById = (id: string): EnhancedTemplate | undefined => {
  return mockTemplates.find(template => template.id === id);
};

export const getTemplatesByFormat = (format: 'json' | 'python'): EnhancedTemplate[] => {
  return mockTemplates.filter(template => template.format === format);
};

export const getTemplatesByAuthor = (authorName: string): EnhancedTemplate[] => {
  return mockTemplates.filter(template => 
    template.authors.some(author => 
      author.toLowerCase().includes(authorName.toLowerCase())
    )
  );
};

// Mock validation result generation
export const generateValidationResults = (
  acquisitionData: any, 
  template: EnhancedTemplate, 
  acquisitionKey: string
): { status: ComplianceStatus; message: string; details: any[] } => {
  const templateAcq = template.acquisitions[acquisitionKey];
  if (!templateAcq) {
    return { status: 'ERROR', message: 'Template acquisition not found', details: [] };
  }
  
  // Mock implementation - in reality this would be handled by dicompare package
  const results = templateAcq.fields.map(field => ({
    fieldTag: field.tag,
    fieldName: field.name,
    status: Math.random() > 0.2 ? 'OK' : 'ERROR' as ComplianceStatus,
    expected: field.validationRule.value || 'Various',
    actual: 'Mock Value',
    message: Math.random() > 0.2 ? 'Field validation passed' : 'Field validation failed'
  }));
  
  const hasErrors = results.some(r => r.status === 'ERROR');
  return {
    status: hasErrors ? 'ERROR' : 'OK',
    message: hasErrors ? 'Some fields failed validation' : 'All fields passed validation',
    details: results
  };
};