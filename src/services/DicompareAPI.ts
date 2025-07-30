import { pyodideManager } from './PyodideManager';

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
   * Mock simulate file upload processing time
   */
  async simulateFileProcessing(fileCount: number): Promise<void> {
    // Simulate processing time based on file count
    const processingTime = Math.min(fileCount * 50, 2000); // Max 2 seconds
    await new Promise(resolve => setTimeout(resolve, processingTime));
  }
}

// Create and export singleton instance
export const dicompareAPI = new DicompareAPI();
