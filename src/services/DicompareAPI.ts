import { pyodideManager } from './PyodideManager';
import { ParsedSchema, ComplianceReport, SchemaTemplate } from '../types/schema';
import { Acquisition as UIAcquisition, DicomField, Series as UISeries } from '../types';

export interface AnalysisResult {
  acquisitions: Acquisition[];
  summary: {
    total_files: number;
    total_acquisitions: number;
    common_fields: string[];
    suggested_validation_fields: string[];
  };
}

export interface Acquisition {
  id: string;
  protocol_name: string;
  series_description: string;
  total_files: number;
  acquisition_fields: FieldInfo[];
  series_fields: FieldInfo[];
  series: SeriesInfo[];
  metadata: Record<string, any>;
}

export interface FieldInfo {
  tag: string;
  name: string;
  value?: any;
  values?: any[];
  vr: string;
  level: 'acquisition' | 'series';
  data_type: 'string' | 'number' | 'list_string' | 'list_number' | 'json';
  consistency: 'constant' | 'varying';
  validation_rule?: {
    type: 'exact' | 'tolerance' | 'range' | 'contains';
    value?: any;
    tolerance?: number;
    min?: number;
    max?: number;
  };
}

export interface SeriesInfo {
  name: string;
  instance_count: number;
  field_values: Record<string, any>;
}

export interface FieldDictionary {
  tag: string;
  name: string;
  keyword: string;
  vr: string;
  vm: string;
  description: string;
  suggested_data_type: string;
  suggested_validation: string;
  common_values: any[];
  validation_hints?: {
    tolerance_typical?: number;
    range_typical?: [number, number];
  };
}

export interface ValidationTemplate {
  template: {
    version: string;
    name: string;
    description: string;
    created: string;
    acquisitions: any[];
    global_constraints: Record<string, any>;
  };
  statistics: {
    total_acquisitions: number;
    total_validation_fields: number;
    estimated_validation_time: string;
  };
}

class DicompareAPI {
  private initializationPromise: Promise<void> | null = null;

  /**
   * Ensure Pyodide is initialized. This is called automatically by other methods.
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initializationPromise) {
      this.initializationPromise = pyodideManager.initialize().then(() => {});
    }
    await this.initializationPromise;
  }

  /**
   * Analyze DICOM files to detect acquisitions and extract field metadata.
   * This is where the lazy loading happens - Pyodide loads on first call.
   */
  async analyzeFiles(filePaths: string[]): Promise<AnalysisResult> {
    await this.ensureInitialized();
    
    console.log('🔍 Analyzing DICOM files:', filePaths.length, 'files');
    
    const result = await pyodideManager.runPython(`
import json
result = dicompare.analyze_dicom_files(${JSON.stringify(filePaths)})
json.dumps(result)
    `);
    
    return JSON.parse(result);
  }

  /**
   * Get comprehensive field information from DICOM dictionary.
   */
  async getFieldInfo(tag: string): Promise<FieldDictionary> {
    await this.ensureInitialized();
    
    const result = await pyodideManager.runPython(`
import json
result = dicompare.get_field_info("${tag}")
json.dumps(result)
    `);
    
    return JSON.parse(result);
  }

  /**
   * Search DICOM fields by name, tag, or keyword.
   */
  async searchFields(query: string, limit: number = 20): Promise<FieldDictionary[]> {
    await this.ensureInitialized();
    
    const result = await pyodideManager.runPython(`
import json
result = dicompare.search_fields("${query}", ${limit})
json.dumps(result)
    `);
    
    return JSON.parse(result);
  }

  /**
   * Generate validation template from configured acquisitions.
   */
  async generateTemplate(acquisitions: any[], metadata: Record<string, any>): Promise<ValidationTemplate> {
    await this.ensureInitialized();
    
    const result = await pyodideManager.runPython(`
import json
result = dicompare.generate_validation_template(
    ${JSON.stringify(acquisitions)}, 
    ${JSON.stringify(metadata)}
)
json.dumps(result)
    `);
    
    return JSON.parse(result);
  }

  /**
   * Check if Pyodide is already initialized (useful for UI state).
   */
  isInitialized(): boolean {
    return pyodideManager.isInitialized();
  }

  /**
   * Parse uploaded schema file and extract detailed validation rules
   */
  async parseSchema(schemaContent: string, format: string = 'json'): Promise<ParsedSchema> {
    await this.ensureInitialized();
    
    const result = await pyodideManager.runPython(`
import json
result = dicompare.parse_schema(${JSON.stringify(schemaContent)}, "${format}")
json.dumps(result)
    `);
    
    const parsed = JSON.parse(result);
    if (parsed.error) {
      throw new Error(parsed.error);
    }
    
    return parsed.parsed_schema;
  }

  /**
   * Perform compliance checking using schema rules vs DICOM data
   */
  async validateCompliance(dicomData: AnalysisResult, schemaContent: string, format: string = 'json'): Promise<ComplianceReport> {
    await this.ensureInitialized();
    
    const result = await pyodideManager.runPython(`
import json
result = dicompare.validate_compliance(
    ${JSON.stringify(dicomData)}, 
    ${JSON.stringify(schemaContent)}, 
    "${format}"
)
json.dumps(result)
    `);
    
    const parsed = JSON.parse(result);
    if (parsed.error) {
      throw new Error(parsed.error);
    }
    
    return parsed.compliance_report;
  }

  /**
   * Get pre-loaded example schemas for demo purposes
   */
  async getExampleSchemas(): Promise<SchemaTemplate[]> {
    await this.ensureInitialized();
    
    const result = await pyodideManager.runPython(`
import json
result = dicompare.get_example_schemas()
json.dumps(result)
    `);
    
    return JSON.parse(result);
  }

  /**
   * Get example DICOM data (same as analyzeFiles for consistency)
   */
  async getExampleDicomData(): Promise<AnalysisResult> {
    await this.ensureInitialized();
    
    const result = await pyodideManager.runPython(`
import json
result = dicompare.get_example_dicom_data()
json.dumps(result)
    `);
    
    return JSON.parse(result);
  }

  /**
   * Get schema field requirements for a specific schema
   */
  async getSchemaFields(schemaId: string): Promise<FieldInfo[]> {
    await this.ensureInitialized();
    
    const result = await pyodideManager.runPython(`
import json
result = dicompare.get_schema_fields("${schemaId}")
json.dumps(result)
    `);
    
    return JSON.parse(result);
  }

  /**
   * Convert API acquisition data to UI format
   */
  private convertToUIAcquisition(apiAcquisition: Acquisition): UIAcquisition {
    return {
      id: apiAcquisition.id,
      protocolName: apiAcquisition.protocol_name,
      seriesDescription: apiAcquisition.series_description,
      totalFiles: apiAcquisition.total_files,
      acquisitionFields: apiAcquisition.acquisition_fields?.map((field): DicomField => ({
        tag: field.tag,
        name: field.name,
        value: field.value,
        vr: field.vr,
        level: field.level,
        dataType: field.data_type,
        consistency: field.consistency
      })) || [],
      seriesFields: apiAcquisition.series_fields?.map((field): DicomField => ({
        tag: field.tag,
        name: field.name,
        values: field.values,
        vr: field.vr,
        level: field.level,
        dataType: field.data_type,
        consistency: field.consistency
      })) || [],
      series: apiAcquisition.series?.map((seriesInfo): UISeries => ({
        name: seriesInfo.name,
        fields: seriesInfo.field_values || {}
      })) || [],
      metadata: apiAcquisition.metadata || {}
    };
  }

  /**
   * Get example DICOM data in UI format
   */
  async getExampleDicomDataForUI(): Promise<UIAcquisition[]> {
    const result = await this.getExampleDicomData();
    return result.acquisitions.map(acq => this.convertToUIAcquisition(acq));
  }

  /**
   * Analyze files and return UI-formatted acquisitions
   */
  async analyzeFilesForUI(filePaths: string[]): Promise<UIAcquisition[]> {
    const result = await this.analyzeFiles(filePaths);
    return result.acquisitions.map(acq => this.convertToUIAcquisition(acq));
  }
}

// Create and export singleton instance
export const dicompareAPI = new DicompareAPI();
