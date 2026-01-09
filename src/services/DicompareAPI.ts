import { pyodideManager } from './PyodideManager';
import { ParsedSchema, ComplianceReport, SchemaTemplate } from '../types/schema';
import { Acquisition as UIAcquisition, DicomField, Series as UISeries } from '../types';
import { FileObject } from '../utils/fileUploadUtils';

// ============================================================================
// Type Definitions
// ============================================================================

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
  keyword?: string;
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
  seriesName?: string;
}

export interface SeriesInfo {
  name: string;
  instance_count: number;
  field_values: Record<string, any>;
}

export interface ValidationResult {
  fieldPath: string;
  fieldName: string;
  status: 'pass' | 'fail' | 'warning' | 'na' | 'unknown';
  message: string;
  actualValue: any;
  expectedValue?: any;
  rule_name?: string;
  validationType?: 'field' | 'rule' | 'series';
  seriesName?: string;
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
  };
  statistics: {
    total_acquisitions: number;
    total_validation_fields: number;
    estimated_validation_time: string;
  };
}

// ============================================================================
// DicompareAPI Class - Thin wrapper around dicompare-pip Python functions
// ============================================================================

class DicompareAPI {
  private initializationPromise: Promise<void> | null = null;

  /**
   * Ensure Pyodide and dicompare are initialized
   */
  async ensureInitialized(): Promise<void> {
    if (!this.initializationPromise) {
      this.initializationPromise = pyodideManager.initialize();
    }
    await this.initializationPromise;
  }

  /**
   * Check if initialized
   */
  isInitialized(): boolean {
    return pyodideManager.isInitialized();
  }

  /**
   * Clear cached session data
   */
  async clearSessionCache(): Promise<void> {
    await this.ensureInitialized();
    await pyodideManager.runPython(`
from dicompare.interface.web_utils import _cache_session
_cache_session(None, {}, {})
print("Session cache cleared")
    `);
  }

  // ==========================================================================
  // DICOM Analysis
  // ==========================================================================

  /**
   * Analyze DICOM files and return UI-ready acquisition format.
   * Calls dicompare.interface.analyze_dicom_files_for_ui()
   */
  async analyzeFilesForUI(
    files: FileObject[],
    onProgress?: (progress: { currentFile: number; totalFiles: number; currentOperation: string; percentage: number }) => void
  ): Promise<UIAcquisition[]> {
    await this.ensureInitialized();

    console.log(`Analyzing ${files.length} DICOM files...`);

    // Convert FileObject[] to bytes dictionary
    const dicomBytes: Record<string, Uint8Array> = {};
    for (const file of files) {
      dicomBytes[file.name] = file.content;
    }

    // Set up progress callback
    if (onProgress) {
      await pyodideManager.setGlobal('_progress_callback', (progress: any) => {
        onProgress({
          currentFile: progress.totalProcessed || 0,
          totalFiles: progress.totalFiles || files.length,
          currentOperation: progress.currentOperation || 'Processing...',
          percentage: progress.percentage || 0
        });
      });
    }

    // Pass data to Python
    await pyodideManager.setPythonGlobal('dicom_bytes', dicomBytes);

    // Call the new Python function
    const result = await pyodideManager.runPythonAsync(`
import json
from dicompare.interface import analyze_dicom_files_for_ui

# Get progress callback if available
progress_cb = _progress_callback if '_progress_callback' in dir() else None

# Convert JSProxy to Python dict
files_dict = dicom_bytes.to_py() if hasattr(dicom_bytes, 'to_py') else dicom_bytes

# Ensure bytes are proper Python bytes
converted = {}
for name, data in files_dict.items():
    if hasattr(data, 'to_py'):
        converted[name] = bytes(data.to_py())
    else:
        converted[name] = bytes(data)

# Call the analysis function
acquisitions = await analyze_dicom_files_for_ui(converted, progress_cb)

result_json = json.dumps(acquisitions, default=str)
return result_json
    `);

    const acquisitions = JSON.parse(result as string);
    return acquisitions;
  }

  // ==========================================================================
  // Validation
  // ==========================================================================

  /**
   * Validate an acquisition against a schema.
   * Calls dicompare.interface.validate_acquisition_for_ui()
   */
  async validateAcquisitionAgainstSchema(
    acquisition: UIAcquisition,
    schemaId: string,
    getSchemaContent?: (id: string) => Promise<string | null>,
    acquisitionIndex?: string
  ): Promise<ValidationResult[]> {
    await this.ensureInitialized();

    // Get schema content
    let schemaContent: string;
    if (getSchemaContent) {
      const content = await getSchemaContent(schemaId);
      if (!content) {
        throw new Error(`Schema content not found for ${schemaId}`);
      }
      schemaContent = content;
    } else {
      const response = await fetch(`/schemas/${schemaId}.json`);
      if (!response.ok) {
        throw new Error(`Failed to fetch schema ${schemaId}: ${response.statusText}`);
      }
      schemaContent = await response.text();
    }

    // Pass data to Python
    await pyodideManager.setPythonGlobal('acquisition_name', acquisition.protocolName);
    await pyodideManager.setPythonGlobal('schema_content', schemaContent);
    await pyodideManager.setPythonGlobal('schema_acquisition_index', acquisitionIndex ? parseInt(acquisitionIndex) : null);

    const result = await pyodideManager.runPython(`
import json
from dicompare.interface import validate_acquisition_for_ui

acq_name = acquisition_name if not hasattr(acquisition_name, 'to_py') else acquisition_name.to_py()
schema_str = schema_content if not hasattr(schema_content, 'to_py') else schema_content.to_py()
acq_index = schema_acquisition_index if not hasattr(schema_acquisition_index, 'to_py') else schema_acquisition_index.to_py()

results = validate_acquisition_for_ui(acq_name, schema_str, acq_index)
json.dumps(results, default=str)
    `);

    return JSON.parse(result as string);
  }

  // ==========================================================================
  // Protocol File Loading
  // ==========================================================================

  /**
   * Load a Siemens .pro protocol file.
   * Calls dicompare.interface.load_protocol_for_ui()
   */
  async loadProFile(fileContent: Uint8Array, fileName: string): Promise<UIAcquisition> {
    const acquisitions = await this._loadProtocolFile(fileContent, fileName, 'pro');
    return acquisitions[0];
  }

  /**
   * Load a Siemens .exar1 exam archive file.
   * Calls dicompare.interface.load_protocol_for_ui()
   */
  async loadExarFile(fileContent: Uint8Array, fileName: string): Promise<UIAcquisition[]> {
    return this._loadProtocolFile(fileContent, fileName, 'exar1');
  }

  /**
   * Load a Philips ExamCard file.
   * Calls dicompare.interface.load_protocol_for_ui()
   */
  async loadExamCardFile(fileContent: Uint8Array, fileName: string): Promise<UIAcquisition[]> {
    return this._loadProtocolFile(fileContent, fileName, 'examcard');
  }

  /**
   * Load a GE LxProtocol file.
   * Calls dicompare.interface.load_protocol_for_ui()
   */
  async loadLxProtocolFile(fileContent: Uint8Array, fileName: string): Promise<UIAcquisition[]> {
    return this._loadProtocolFile(fileContent, fileName, 'lxprotocol');
  }

  /**
   * Internal helper to load any protocol file type.
   */
  private async _loadProtocolFile(fileContent: Uint8Array, fileName: string, fileType: string): Promise<UIAcquisition[]> {
    await this.ensureInitialized();

    console.log(`Loading ${fileType} protocol file: ${fileName}`);

    // Convert to base64 for transfer
    let binary = '';
    const chunkSize = 8192;
    for (let i = 0; i < fileContent.length; i += chunkSize) {
      const chunk = fileContent.subarray(i, i + chunkSize);
      binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
    }
    const base64Content = btoa(binary);

    await pyodideManager.setGlobal('_protocol_base64', base64Content);
    await pyodideManager.setGlobal('_protocol_filename', fileName);
    await pyodideManager.setGlobal('_protocol_type', fileType);

    const result = await pyodideManager.runPython(`
import json
import base64
from dicompare.interface import load_protocol_for_ui

# Decode base64 to bytes
file_bytes = base64.b64decode(_protocol_base64)
file_name = _protocol_filename
file_type = _protocol_type

acquisitions = load_protocol_for_ui(file_bytes, file_name, file_type)
json.dumps(acquisitions, default=str)
    `);

    const acquisitions = JSON.parse(result as string);
    console.log(`Loaded ${acquisitions.length} acquisition(s) from ${fileName}`);
    return acquisitions;
  }

  // ==========================================================================
  // Field Search & Info
  // ==========================================================================

  /**
   * Search DICOM dictionary for fields matching the query.
   * Calls dicompare.interface.search_dicom_dictionary()
   */
  async searchFields(query: string, limit: number = 20): Promise<FieldDictionary[]> {
    await this.ensureInitialized();

    await pyodideManager.setGlobal('_search_query', query);
    await pyodideManager.setGlobal('_search_limit', limit);

    const result = await pyodideManager.runPython(`
import json
from dicompare.interface import search_dicom_dictionary

results = search_dicom_dictionary(_search_query, _search_limit)
json.dumps(results, default=str)
    `);

    return JSON.parse(result as string);
  }

  /**
   * Get DICOM tag information for a field name or tag.
   * Calls dicompare.get_tag_info()
   */
  async getFieldInfo(fieldOrTag: string): Promise<{ tag: string | null; name: string; type: string; fieldType: string } | null> {
    await this.ensureInitialized();

    await pyodideManager.setGlobal('_field_or_tag', fieldOrTag);

    const result = await pyodideManager.runPython(`
import json
from dicompare import get_tag_info

info = get_tag_info(_field_or_tag)
json.dumps(info, default=str)
    `);

    return JSON.parse(result as string);
  }

  /**
   * Get DICOM tag from keyword/field name.
   */
  async getDicomTag(keyword: string): Promise<{ tag: string; name: string; vr: string; keyword: string } | null> {
    const info = await this.getFieldInfo(keyword);
    if (info && info.tag) {
      return {
        tag: info.tag,
        name: info.name,
        vr: 'LO', // Default, could be enhanced
        keyword: keyword
      };
    }
    return null;
  }

  // ==========================================================================
  // Schema Generation & Parsing
  // ==========================================================================

  /**
   * Generate a dicompare schema from UI acquisitions.
   * Calls dicompare.interface.build_schema_from_ui_acquisitions()
   */
  async generateSchemaJS(
    acquisitions: UIAcquisition[],
    metadata: { name: string; description?: string; version?: string; authors?: string[]; tags?: string[] }
  ): Promise<any> {
    await this.ensureInitialized();

    await pyodideManager.setPythonGlobal('_ui_acquisitions', acquisitions);
    await pyodideManager.setPythonGlobal('_schema_metadata', metadata);

    const result = await pyodideManager.runPython(`
import json
from dicompare.interface import build_schema_from_ui_acquisitions

acqs = _ui_acquisitions.to_py() if hasattr(_ui_acquisitions, 'to_py') else _ui_acquisitions
meta = _schema_metadata.to_py() if hasattr(_schema_metadata, 'to_py') else _schema_metadata

schema = build_schema_from_ui_acquisitions(acqs, meta)
json.dumps(schema, default=str)
    `);

    return JSON.parse(result as string);
  }

  /**
   * Get example schemas available in the public directory.
   * Reads paths from index.json and extracts metadata from each schema file.
   */
  async getExampleSchemas(): Promise<SchemaTemplate[]> {
    try {
      const response = await fetch('/schemas/index.json');
      if (!response.ok) {
        console.warn('Could not fetch schema index');
        return [];
      }

      const paths: string[] = await response.json();

      // Fetch each schema and extract metadata
      const schemas = await Promise.all(
        paths.map(async (path) => {
          try {
            // Derive id from path: "/schemas/UK_Biobank_v1.0.json" -> "UK_Biobank_v1.0"
            const id = path.replace('/schemas/', '').replace('.json', '');

            const schemaResponse = await fetch(path);
            if (!schemaResponse.ok) {
              console.warn(`Could not fetch schema at ${path}: ${schemaResponse.status}`);
              return null;
            }

            const schemaText = await schemaResponse.text();
            const schemaData = JSON.parse(schemaText);

            // Collect tags from all acquisitions
            const allTags: string[] = [];
            if (schemaData.acquisitions) {
              for (const acq of Object.values(schemaData.acquisitions) as any[]) {
                if (acq.tags && Array.isArray(acq.tags)) {
                  allTags.push(...acq.tags);
                }
              }
            }
            // Deduplicate tags
            const uniqueTags = [...new Set(allTags)];

            return {
              id,
              name: schemaData.name || id,
              description: schemaData.description || '',
              category: 'Library',
              content: schemaText,
              format: 'json' as const,
              tags: uniqueTags,
              version: schemaData.version,
              authors: schemaData.authors
            };
          } catch (error) {
            console.warn(`Failed to load schema from ${path}:`, error);
            return null;
          }
        })
      );

      // Filter out any failed loads
      return schemas.filter((s): s is NonNullable<typeof s> => s !== null);
    } catch (error) {
      console.warn('Failed to fetch example schemas:', error);
      return [];
    }
  }

  /**
   * Get schema fields from a schema file (pure JS parsing)
   */
  async getSchemaFields(schemaId: string, schemaContent?: string): Promise<{ acquisitionName: string; fields: any[] }[]> {
    let content: string;

    if (schemaContent) {
      content = schemaContent;
    } else {
      const response = await fetch(`/schemas/${schemaId}.json`);
      if (!response.ok) {
        throw new Error(`Failed to fetch schema ${schemaId}`);
      }
      content = await response.text();
    }

    const schema = JSON.parse(content);
    const result: { acquisitionName: string; fields: any[] }[] = [];

    const acquisitions = schema.acquisitions || {};
    for (const [acqName, acqData] of Object.entries(acquisitions)) {
      const acq = acqData as any;
      const fields: any[] = [];

      // Add acquisition-level fields
      if (acq.fields && Array.isArray(acq.fields)) {
        for (const field of acq.fields) {
          fields.push({
            name: field.field,
            tag: field.tag,
            value: field.value,
            level: 'acquisition',
            fieldType: field.fieldType || 'standard'
          });
        }
      }

      // Add series-level fields
      if (acq.series && Array.isArray(acq.series)) {
        for (const series of acq.series) {
          if (series.fields && Array.isArray(series.fields)) {
            for (const field of series.fields) {
              fields.push({
                name: field.field,
                tag: field.tag,
                value: field.value,
                level: 'series',
                seriesName: series.name,
                fieldType: field.fieldType || 'standard'
              });
            }
          }
        }
      }

      result.push({ acquisitionName: acqName, fields });
    }

    return result;
  }

  // ==========================================================================
  // Test DICOM Generation
  // ==========================================================================

  /**
   * Generate test DICOM files from schema constraints.
   * Calls dicompare.io.generate_test_dicoms_from_schema()
   */
  async generateTestDicomsFromSchema(
    acquisition: UIAcquisition,
    testData: Array<Record<string, any>>,
    fields: Array<{ name: string; tag: string; level: string; dataType?: string; vr?: string }>
  ): Promise<Blob> {
    await this.ensureInitialized();

    await pyodideManager.setPythonGlobal('test_data_rows', testData);
    await pyodideManager.setPythonGlobal('schema_fields', fields);
    await pyodideManager.setPythonGlobal('acquisition_info', {
      protocolName: acquisition.protocolName,
      seriesDescription: acquisition.seriesDescription || 'Generated Test Data'
    });

    await pyodideManager.runPythonAsync(`
from dicompare.io import generate_test_dicoms_from_schema

test_rows = test_data_rows.to_py() if hasattr(test_data_rows, 'to_py') else test_data_rows
field_info = schema_fields.to_py() if hasattr(schema_fields, 'to_py') else schema_fields
acq_info = acquisition_info.to_py() if hasattr(acquisition_info, 'to_py') else acquisition_info

zip_bytes = generate_test_dicoms_from_schema(
    test_data=test_rows,
    field_definitions=field_info,
    acquisition_info=acq_info
)

globals()['dicom_zip_bytes'] = list(zip_bytes)
    `);

    const zipBytesResult = await pyodideManager.runPython(`dicom_zip_bytes`);

    let zipBytes: Uint8Array;
    if (Array.isArray(zipBytesResult)) {
      zipBytes = new Uint8Array(zipBytesResult);
    } else if (zipBytesResult && (zipBytesResult as any).toJs) {
      const jsArray = (zipBytesResult as any).toJs();
      zipBytes = new Uint8Array(jsArray);
    } else {
      throw new Error(`Unexpected format for ZIP bytes from Python`);
    }

    return new Blob([zipBytes], { type: 'application/zip' });
  }

  /**
   * Categorize fields into standard DICOM, handled special fields, and unhandled fields.
   */
  async categorizeFields(
    fields: Array<{ name: string; tag: string; level?: string; dataType?: string; vr?: string }>,
    testData: Array<Record<string, any>>
  ): Promise<{
    standardFields: number;
    handledFields: number;
    unhandledFields: number;
    unhandledFieldWarnings: string[];
  }> {
    await this.ensureInitialized();

    try {
      await pyodideManager.setPythonGlobal('field_definitions', fields);
      await pyodideManager.setPythonGlobal('test_data_rows', testData);

      const result = await pyodideManager.runPythonAsync(`
import json

try:
    from dicompare.io import categorize_fields, get_unhandled_field_warnings

    field_defs = field_definitions.to_py() if hasattr(field_definitions, 'to_py') else field_definitions
    test_rows = test_data_rows.to_py() if hasattr(test_data_rows, 'to_py') else test_data_rows

    categorized = categorize_fields(field_defs)
    warnings = get_unhandled_field_warnings(field_defs, test_rows)

    output = {
        'standardFields': len(categorized['standard']),
        'handledFields': len(categorized['handled']),
        'unhandledFields': len(categorized['unhandled']),
        'unhandledFieldWarnings': warnings
    }
except ImportError:
    output = {
        'standardFields': 0,
        'handledFields': 0,
        'unhandledFields': 0,
        'unhandledFieldWarnings': []
    }

json.dumps(output)
      `);

      return JSON.parse(result as string);
    } catch {
      return {
        standardFields: 0,
        handledFields: 0,
        unhandledFields: 0,
        unhandledFieldWarnings: []
      };
    }
  }
}

// Create and export singleton instance
export const dicompareAPI = new DicompareAPI();
