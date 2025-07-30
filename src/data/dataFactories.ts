import { Acquisition, DicomField, Template, ComplianceReport, PublicReport, ValidationRule } from '../types';

// Factory for generating DICOM fields with realistic values
export class DicomFieldFactory {
  private static fieldTemplates = {
    // Core identification fields
    'ProtocolName': { name: 'Protocol Name', vr: 'LO', values: ['T1_MPRAGE', 'BOLD_task', 'DTI', 'T2_FLAIR', 'QSM'] },
    'SeriesDescription': { name: 'Series Description', vr: 'LO', values: ['T1w', 'task-rest_bold', 'dwi', 'FLAIR', 'gre'] },
    'SequenceName': { name: 'Sequence Name', vr: 'SH', values: ['gr_mpr_tra_T1_900', 'epfid2d1_64', 'ep_b0', 'tse2d1_17'] },
    
    // Technical parameters
    'RepetitionTime': { name: 'Repetition Time', vr: 'DS', values: [2000, 3000, 8000, 2500] },
    'EchoTime': { name: 'Echo Time', vr: 'DS', values: [3.25, 30, 80, 5.0] },
    'FlipAngle': { name: 'Flip Angle', vr: 'DS', values: [9, 90, 180, 12] },
    'SliceThickness': { name: 'Slice Thickness', vr: 'DS', values: [1.0, 2.0, 3.0, 0.8] },
    
    // Hardware parameters
    'Manufacturer': { name: 'Manufacturer', vr: 'LO', values: ['SIEMENS', 'GE MEDICAL SYSTEMS', 'Philips Medical Systems'] },
    'MagneticFieldStrength': { name: 'Magnetic Field Strength', vr: 'DS', values: [3.0, 1.5, 7.0] },
    'ReceiveCoilName': { name: 'Receive Coil Name', vr: 'SH', values: ['HeadMatrix', '32Ch Head', 'Head/Neck 20'] },
    
    // Image parameters
    'ImageType': { 
      name: 'Image Type', 
      vr: 'CS', 
      values: [
        ['ORIGINAL', 'PRIMARY', 'M', 'ND'],
        ['ORIGINAL', 'PRIMARY', 'P', 'ND'],
        ['DERIVED', 'SECONDARY', 'ADC', 'ND']
      ]
    },
    'SeriesNumber': { name: 'Series Number', vr: 'IS', values: [1, 2, 3, 4, 5] },
    'PixelSpacing': { name: 'Pixel Spacing', vr: 'DS', values: [[1.25, 1.25], [0.5, 0.5], [2.0, 2.0]] }
  };

  static createField(tag: string, level: 'acquisition' | 'series' = 'acquisition', customValue?: any): DicomField {
    const template = this.fieldTemplates[tag as keyof typeof this.fieldTemplates];
    if (!template) {
      throw new Error(`Unknown DICOM field: ${tag}`);
    }

    const value = customValue !== undefined 
      ? customValue 
      : template.values[Math.floor(Math.random() * template.values.length)];

    return {
      tag,
      name: template.name,
      value,
      vr: template.vr,
      level
    };
  }

  static createRandomFields(count: number, level: 'acquisition' | 'series' = 'acquisition'): DicomField[] {
    const availableTags = Object.keys(this.fieldTemplates);
    const selectedTags = availableTags
      .sort(() => 0.5 - Math.random())
      .slice(0, count);
    
    return selectedTags.map(tag => this.createField(tag, level));
  }

  static createTypicalAcquisitionFields(acquisitionType: 'T1' | 'BOLD' | 'DTI' | 'T2'): DicomField[] {
    const baseFields = [
      this.createField('Manufacturer', 'acquisition'),
      this.createField('MagneticFieldStrength', 'acquisition'),
      this.createField('ReceiveCoilName', 'acquisition')
    ];

    switch (acquisitionType) {
      case 'T1':
        return [
          ...baseFields,
          this.createField('ProtocolName', 'acquisition', 'T1_MPRAGE'),
          this.createField('RepetitionTime', 'acquisition', 2000),
          this.createField('EchoTime', 'acquisition', 3.25),
          this.createField('FlipAngle', 'acquisition', 9),
          this.createField('SliceThickness', 'acquisition', 1.0)
        ];
      
      case 'BOLD':
        return [
          ...baseFields,
          this.createField('ProtocolName', 'acquisition', 'BOLD_task'),
          this.createField('RepetitionTime', 'acquisition', 3000),
          this.createField('EchoTime', 'acquisition', 30),
          this.createField('FlipAngle', 'acquisition', 90),
          this.createField('SliceThickness', 'acquisition', 3.0)
        ];
      
      case 'DTI':
        return [
          ...baseFields,
          this.createField('ProtocolName', 'acquisition', 'DTI'),
          this.createField('RepetitionTime', 'acquisition', 8000),
          this.createField('EchoTime', 'acquisition', 80),
          this.createField('FlipAngle', 'acquisition', 90),
          this.createField('SliceThickness', 'acquisition', 2.0)
        ];
      
      case 'T2':
        return [
          ...baseFields,
          this.createField('ProtocolName', 'acquisition', 'T2_FLAIR'),
          this.createField('RepetitionTime', 'acquisition', 2500),
          this.createField('EchoTime', 'acquisition', 5.0),
          this.createField('FlipAngle', 'acquisition', 180),
          this.createField('SliceThickness', 'acquisition', 1.0)
        ];
      
      default:
        return baseFields;
    }
  }

  static createTypicalSeriesFields(acquisitionType: 'T1' | 'BOLD' | 'DTI' | 'T2'): DicomField[] {
    const baseSeriesFields = [
      this.createField('SeriesNumber', 'series'),
      this.createField('ImageType', 'series')
    ];

    switch (acquisitionType) {
      case 'BOLD':
        return [
          ...baseSeriesFields,
          this.createField('EchoTime', 'series') // Multi-echo BOLD
        ];
      
      case 'DTI':
        return [
          ...baseSeriesFields
          // DTI typically has b-value variations but we don't have that field in our template
        ];
      
      default:
        return baseSeriesFields;
    }
  }
}

// Factory for generating acquisitions
export class AcquisitionFactory {
  static create(
    id: string,
    acquisitionType: 'T1' | 'BOLD' | 'DTI' | 'T2' = 'T1',
    options: {
      protocolName?: string;
      seriesDescription?: string;
      totalFiles?: number;
      customAcquisitionFields?: DicomField[];
      customSeriesFields?: DicomField[];
    } = {}
  ): Acquisition {
    const typeDefaults = {
      T1: { protocol: 'T1_MPRAGE', series: 'T1w', files: 192 },
      BOLD: { protocol: 'BOLD_task', series: 'task-rest_bold', files: 240 },
      DTI: { protocol: 'DTI', series: 'dwi', files: 64 },
      T2: { protocol: 'T2_FLAIR', series: 'FLAIR', files: 160 }
    };

    const defaults = typeDefaults[acquisitionType];

    return {
      id,
      protocolName: options.protocolName || defaults.protocol,
      seriesDescription: options.seriesDescription || defaults.series,
      totalFiles: options.totalFiles || defaults.files,
      acquisitionFields: options.customAcquisitionFields || DicomFieldFactory.createTypicalAcquisitionFields(acquisitionType),
      seriesFields: options.customSeriesFields || DicomFieldFactory.createTypicalSeriesFields(acquisitionType),
      metadata: {
        manufacturer: 'SIEMENS',
        magneticFieldStrength: '3.0',
        patientPosition: 'HFS',
        sequenceName: defaults.protocol,
        seriesCount: 2,
        notes: `Generated ${acquisitionType} acquisition for testing`
      }
    };
  }

  static createMultiple(count: number, acquisitionTypes?: Array<'T1' | 'BOLD' | 'DTI' | 'T2'>): Acquisition[] {
    const types: Array<'T1' | 'BOLD' | 'DTI' | 'T2'> = acquisitionTypes || ['T1', 'BOLD', 'DTI', 'T2'];
    
    return Array.from({ length: count }, (_, index) => {
      const type = types[index % types.length];
      return this.create(`acq_${index + 1}`, type);
    });
  }
}

// Factory for generating templates/schemas
export class TemplateFactory {
  static create(
    id: string,
    name: string,
    options: {
      description?: string;
      authors?: string[];
      format?: 'json' | 'python';
      acquisitions?: Acquisition[];
    } = {}
  ): Template {
    const acquisitions = options.acquisitions || AcquisitionFactory.createMultiple(2);
    
    return {
      id,
      name,
      description: options.description || `Generated template for ${name}`,
      authors: options.authors || ['Test Author', 'Generated Data'],
      version: '1.0.0',
      createdDate: new Date().toISOString(),
      format: options.format || 'json',
      acquisitions: acquisitions.reduce((acc, acq) => {
        acc[acq.id] = {
          name: acq.protocolName,
          fields: [
            ...acq.acquisitionFields.map(field => ({
              tag: field.tag,
              name: field.name,
              required: true,
              validationRule: { type: 'exact', value: field.value } as ValidationRule,
              level: field.level as 'acquisition' | 'series',
              dataType: this.inferDataType(field.value)
            })),
            ...acq.seriesFields.map(field => ({
              tag: field.tag,
              name: field.name,
              required: true,
              validationRule: { type: 'exact', value: field.value } as ValidationRule,
              level: field.level as 'acquisition' | 'series',
              dataType: this.inferDataType(field.value)
            }))
          ]
        };
        return acc;
      }, {} as Template['acquisitions'])
    };
  }

  private static inferDataType(value: any): 'string' | 'number' | 'list_string' | 'list_number' | 'json' {
    if (Array.isArray(value)) {
      return typeof value[0] === 'number' ? 'list_number' : 'list_string';
    }
    if (typeof value === 'number') {
      return 'number';
    }
    if (typeof value === 'object') {
      return 'json';
    }
    return 'string';
  }
}

// Factory for generating compliance reports
export class ComplianceReportFactory {
  static create(
    id: string,
    templateName: string,
    options: {
      overallStatus?: 'pass' | 'fail' | 'warning';
      acquisitionCount?: number;
      passRate?: number;
    } = {}
  ): ComplianceReport {
    const acquisitionCount = options.acquisitionCount || 3;
    const passRate = options.passRate || 0.8;
    const passedCount = Math.floor(acquisitionCount * passRate);
    
    return {
      id,
      templateName,
      templateVersion: '1.0.0',
      analysisDate: new Date().toISOString(),
      overallStatus: options.overallStatus || (passedCount === acquisitionCount ? 'pass' : 'warning'),
      summary: {
        totalAcquisitions: acquisitionCount,
        passedAcquisitions: passedCount,
        failedAcquisitions: acquisitionCount - passedCount,
        totalSeries: acquisitionCount * 2,
        passedSeries: passedCount * 2,
        failedSeries: (acquisitionCount - passedCount) * 2
      },
      acquisitionResults: Array.from({ length: acquisitionCount }, (_, index) => ({
        acquisitionId: `acq_${index + 1}`,
        acquisitionName: `Acquisition ${index + 1}`,
        overallStatus: index < passedCount ? 'pass' : 'fail' as const,
        acquisitionFieldResults: [],
        seriesResults: []
      }))
    };
  }
}

// Factory for generating public reports
export class PublicReportFactory {
  static create(
    id: string,
    options: {
      institution?: string;
      studyType?: string;
      reportType?: 'compliance' | 'certificate';
    } = {}
  ): PublicReport {
    const institutions = ['Johns Hopkins', 'Mayo Clinic', 'Stanford Medical', 'UCLA Health', 'Mass General'];
    const studyTypes = ['Brain MRI', 'Cardiac MRI', 'Spinal MRI', 'Abdominal MRI', 'DTI Study'];
    
    return {
      id,
      title: `${options.studyType || studyTypes[Math.floor(Math.random() * studyTypes.length)]} Compliance Report`,
      institution: options.institution || institutions[Math.floor(Math.random() * institutions.length)],
      studyType: options.studyType || studyTypes[Math.floor(Math.random() * studyTypes.length)],
      description: 'Generated compliance report for testing purposes',
      dateCreated: new Date().toISOString(),
      tags: ['generated', 'test', 'mri'],
      reportType: options.reportType || 'compliance'
    };
  }

  static createMultiple(count: number): PublicReport[] {
    return Array.from({ length: count }, (_, index) => 
      this.create(`report_${index + 1}`)
    );
  }
}

// Main factory class that orchestrates all other factories
export class MockDataFactory {
  static createCompleteDataset(options: {
    acquisitionCount?: number;
    templateCount?: number;
    reportCount?: number;
  } = {}) {
    return {
      acquisitions: AcquisitionFactory.createMultiple(options.acquisitionCount || 5),
      templates: Array.from({ length: options.templateCount || 3 }, (_, index) => 
        TemplateFactory.create(`template_${index + 1}`, `Test Template ${index + 1}`)
      ),
      reports: PublicReportFactory.createMultiple(options.reportCount || 10),
      complianceReports: Array.from({ length: 3 }, (_, index) => 
        ComplianceReportFactory.create(`compliance_${index + 1}`, `Template ${index + 1}`)
      )
    };
  }
}

export default MockDataFactory;