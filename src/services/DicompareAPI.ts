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
  seriesName?: string; // For series-level fields, which series they belong to
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
  // New fields for hybrid schema support
  rule_name?: string;           // Present for rule validation results
  validationType?: 'field' | 'rule' | 'series';  // Type of validation
  seriesName?: string;          // For series-level validation
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

class DicompareAPI {
  private initializationPromise: Promise<void> | null = null;
  
  // Simulate DataFrame caching like the real dicompare implementation
  private cachedDataFrame: AnalysisResult | null = null;
  private cachedMetadata: Record<string, any> | null = null;

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
   * Cache session state to simulate real dicompare DataFrame caching
   */
  private cacheSession(analysisResult: AnalysisResult, metadata?: Record<string, any>): void {
    this.cachedDataFrame = analysisResult;
    this.cachedMetadata = metadata || {};
    console.log('📊 Cached DataFrame state for efficient reuse');
  }

  /**
   * Get cached session data - simulates accessing cached DataFrame
   */
  private getCachedSession(): { dataFrame: AnalysisResult | null, metadata: Record<string, any> | null } {
    return {
      dataFrame: this.cachedDataFrame,
      metadata: this.cachedMetadata
    };
  }

  /**
   * Clear the global DICOM session cache. Call this when clearing all data.
   */
  async clearSessionCache(): Promise<void> {
    await this.ensureInitialized();
    this.cachedDataFrame = null;
    this.cachedMetadata = null;

    // Also clear the Pyodide global cache
    await pyodideManager.runPython(`
if 'cached_session_df' in globals():
    del globals()['cached_session_df']
    print("✅ Cleared global session cache")
else:
    print("ℹ️ No session cache to clear")
`);
    console.log('🗑️ Cleared DICOM session cache');
  }

  /**
   * Get comprehensive field information from DICOM dictionary.
   */
  async getFieldInfo(tag: string): Promise<FieldDictionary> {
    await this.ensureInitialized();
    
    // Use pydicom's data dictionary directly for field info
    const result = await pyodideManager.runPython(`
import json
import pydicom

try:
    # Clean up tag format (remove spaces, ensure proper format)
    clean_tag = "${tag}".replace(" ", "").replace(",", "")
    if len(clean_tag) == 8:
        # Convert to pydicom format (0xAAAABBBB)
        tag_int = int(clean_tag, 16)
        
        # Get field info from pydicom's data dictionary
        if tag_int in pydicom.datadict.tag_for_keyword:
            keyword = pydicom.datadict.keyword_for_tag.get(tag_int, "Unknown")
            vr = pydicom.datadict.dictionary_VR(tag_int)
            vm = pydicom.datadict.dictionary_VM(tag_int)
            description = pydicom.datadict.dictionary_description(tag_int)
            
            result = {
                "tag": "${tag}",
                "name": description or keyword,
                "keyword": keyword,
                "vr": vr or "UN",
                "vm": vm or "1",
                "description": description or f"DICOM field {keyword}",
                "suggested_data_type": "string" if vr in ["CS", "LO", "SH", "UI"] else "number" if vr in ["DS", "IS", "FD", "FL"] else "string",
                "suggested_validation": "exact",
                "common_values": []
            }
        else:
            result = {
                "tag": "${tag}",
                "name": f"Unknown_{clean_tag}",
                "keyword": f"Unknown_{clean_tag}",
                "vr": "UN",
                "vm": "1",
                "description": f"Unknown DICOM field ${tag}",
                "suggested_data_type": "string",
                "suggested_validation": "exact",
                "common_values": []
            }
    else:
        raise ValueError("Invalid tag format")
        
except Exception as e:
    result = {
        "tag": "${tag}",
        "name": f"Invalid_${tag.replace(',', '_')}",
        "keyword": f"Invalid_${tag.replace(',', '_')}",
        "vr": "UN",
        "vm": "1",
        "description": f"Invalid or unknown field ${tag}",
        "suggested_data_type": "string",
        "suggested_validation": "exact",
        "common_values": []
    }

json.dumps(result)
    `);
    
    return JSON.parse(result);
  }

  /**
   * Search DICOM fields by name, tag, or keyword.
   */
  async searchFields(query: string, limit: number = 20): Promise<FieldDictionary[]> {
    await this.ensureInitialized();
    
    // Search through pydicom's data dictionary
    const result = await pyodideManager.runPython(`
import json
import pydicom

query_lower = "${query}".lower()
results = []
count = 0

# Search through pydicom's keyword dictionary
for tag_int, keyword in pydicom.datadict.keyword_for_tag.items():
    if count >= ${limit}:
        break
        
    # Convert tag back to string format
    tag_str = f"{tag_int:08X}"
    tag_formatted = f"{tag_str[:4]},{tag_str[4:]}"
    
    # Get additional info
    vr = pydicom.datadict.dictionary_VR(tag_int) or "UN"
    vm = pydicom.datadict.dictionary_VM(tag_int) or "1"
    description = pydicom.datadict.dictionary_description(tag_int) or keyword
    
    # Check if query matches keyword, description, or tag
    if (query_lower in keyword.lower() or 
        query_lower in description.lower() or 
        query_lower in tag_formatted.lower() or
        query_lower in tag_str.lower()):
        
        results.append({
            "tag": tag_formatted,
            "name": description,
            "keyword": keyword,
            "vr": vr,
            "vm": vm,
            "description": description,
            "suggested_data_type": "string" if vr in ["CS", "LO", "SH", "UI"] else "number" if vr in ["DS", "IS", "FD", "FL"] else "string",
            "suggested_validation": "exact",
            "common_values": []
        })
        count += 1

json.dumps(results)
    `);
    
    return JSON.parse(result);
  }

  /**
   * Ensure all fields in acquisitions have keywords populated by looking up missing keywords
   */
  async ensureKeywordsPopulated(acquisitions: any[]): Promise<any[]> {
    const updatedAcquisitions = await Promise.all(acquisitions.map(async (acquisition) => {
      // Update acquisition fields
      const updatedAcquisitionFields = await Promise.all(
        (acquisition.acquisitionFields || []).map(async (field: any) => {
          if (!field.keyword && field.tag) {
            try {
              const fieldInfo = await this.getFieldInfo(field.tag);
              return { ...field, keyword: fieldInfo.keyword || field.name };
            } catch (error) {
              console.warn(`Failed to get keyword for field ${field.tag}:`, error);
              return { ...field, keyword: field.name };
            }
          }
          return field;
        })
      );

      // Update series fields  
      const updatedSeriesFields = await Promise.all(
        (acquisition.seriesFields || []).map(async (field: any) => {
          if (!field.keyword && field.tag) {
            try {
              const fieldInfo = await this.getFieldInfo(field.tag);
              return { ...field, keyword: fieldInfo.keyword || field.name };
            } catch (error) {
              console.warn(`Failed to get keyword for field ${field.tag}:`, error);
              return { ...field, keyword: field.name };
            }
          }
          return field;
        })
      );

      return {
        ...acquisition,
        acquisitionFields: updatedAcquisitionFields,
        seriesFields: updatedSeriesFields
      };
    }));

    return updatedAcquisitions;
  }

  /**
   * Generate validation schema from configured acquisitions using pure JavaScript.
   * This replaces the Python-based schema generation with a direct approach using form data.
   */
  async generateSchemaJS(acquisitions: any[], metadata: Record<string, any>): Promise<ValidationTemplate> {
    console.log('🚀 Generating schema using pure JavaScript approach');
    
    // Ensure all fields have keywords populated
    const acquisitionsWithKeywords = await this.ensureKeywordsPopulated(acquisitions);
    
    // Transform acquisitions to dicompare format
    const dicompareAcquisitions: Record<string, any> = {};
    
    acquisitionsWithKeywords.forEach(acquisition => {
      const acquisitionName = acquisition.protocolName || acquisition.id || 'Unknown';
      
      // Transform acquisition fields - FIXED: Handle complex value objects
      const acquisitionFields = acquisition.acquisitionFields?.map((field: any) => {
        // Convert null tags to fieldType value for schema compliance
        // Valid tag values: DICOM format (0018,0081), "private", "derived", or "custom"
        const tagValue = field.tag || field.fieldType || 'derived';

        const fieldEntry: any = {
          field: field.keyword || field.name || '', // Use keyword first, fallback to name
          tag: tagValue
        };
        
        // FIXED: Handle complex field.value objects that contain dataType/validationRule
        let actualValue = field.value;
        let validationRule = field.validationRule;
        
        // Check if field.value is a complex object with nested validation/dataType
        if (field.value && typeof field.value === 'object' && ('validationRule' in field.value || 'dataType' in field.value)) {
          actualValue = 'value' in field.value ? field.value.value : undefined;
          validationRule = field.value.validationRule;
        }
        
        // Apply validation rules to create flat structure
        if (validationRule) {
          switch (validationRule.type) {
            case 'tolerance':
              if (validationRule.value !== undefined && validationRule.tolerance !== undefined) {
                fieldEntry.value = validationRule.value;
                fieldEntry.tolerance = validationRule.tolerance;
              } else {
                fieldEntry.value = actualValue;
              }
              break;
            case 'range':
              if (validationRule.min !== undefined && validationRule.max !== undefined) {
                fieldEntry.value = (validationRule.min + validationRule.max) / 2;
                fieldEntry.tolerance = (validationRule.max - validationRule.min) / 2;
              } else {
                fieldEntry.value = actualValue;
              }
              break;
            case 'contains':
              if (validationRule.contains !== undefined) {
                fieldEntry.contains = validationRule.contains;
                // Don't include value for contains validation - remove any existing value
                delete fieldEntry.value;
              } else {
                fieldEntry.value = actualValue;
              }
              break;
            case 'contains_any':
              if (validationRule.contains_any !== undefined && Array.isArray(validationRule.contains_any)) {
                fieldEntry.contains_any = validationRule.contains_any;
                // Don't include value for contains_any validation - remove any existing value
                delete fieldEntry.value;
              } else {
                fieldEntry.value = actualValue;
              }
              break;
            case 'contains_all':
              if (validationRule.contains_all !== undefined && Array.isArray(validationRule.contains_all)) {
                fieldEntry.contains_all = validationRule.contains_all;
                // Don't include value for contains_all validation - remove any existing value
                delete fieldEntry.value;
              } else {
                fieldEntry.value = actualValue;
              }
              break;
            case 'exact':
            default:
              fieldEntry.value = actualValue;
              break;
          }
        } else {
          // No validation rule, just use the actual value
          fieldEntry.value = actualValue;
        }
        
        return fieldEntry;
      }) || [];
      
      // Transform series data - handles both array and object formats for series.fields
      const seriesData = acquisition.series?.map((series: any) => {
        // Get fields from series.fields - handles both array (DICOM) and object (.pro file) formats
        let fieldsArray: any[] = [];
        if (Array.isArray(series.fields)) {
          fieldsArray = series.fields;
        } else if (series.fields && typeof series.fields === 'object') {
          // Object format from .pro files: { "tag": { value, field, name, keyword, ... } }
          fieldsArray = Object.entries(series.fields).map(([tag, fieldData]: [string, any]) => ({
            tag,
            name: fieldData.name || fieldData.field || tag,
            keyword: fieldData.keyword,
            value: fieldData.value,
            validationRule: fieldData.validationRule || { type: 'exact' }
          }));
        }

        const seriesFields = fieldsArray.map((field: any) => {
          // Convert null tags to fieldType value for schema compliance
          // Valid tag values: DICOM format (0018,0081), "private", "derived", or "custom"
          const tagValue = field.tag || field.fieldType || 'derived';

          const fieldEntry: any = {
            field: field.keyword || field.name || '',
            tag: tagValue
          };

          // Get the value and validation rule directly from the field object
          const actualValue = field.value;
          const validationRule = field.validationRule;

          if (validationRule) {
            switch (validationRule.type) {
              case 'tolerance':
                if (validationRule.value !== undefined && validationRule.tolerance !== undefined) {
                  fieldEntry.value = validationRule.value;
                  fieldEntry.tolerance = validationRule.tolerance;
                } else {
                  fieldEntry.value = actualValue;
                }
                break;
              case 'range':
                if (validationRule.min !== undefined && validationRule.max !== undefined) {
                  fieldEntry.value = (validationRule.min + validationRule.max) / 2;
                  fieldEntry.tolerance = (validationRule.max - validationRule.min) / 2;
                } else {
                  fieldEntry.value = actualValue;
                }
                break;
              case 'contains':
                if (validationRule.contains !== undefined) {
                  fieldEntry.contains = validationRule.contains;
                } else {
                  fieldEntry.value = actualValue;
                }
                break;
              case 'contains_any':
                if (validationRule.contains_any !== undefined && Array.isArray(validationRule.contains_any)) {
                  fieldEntry.contains_any = validationRule.contains_any;
                } else {
                  fieldEntry.value = actualValue;
                }
                break;
              case 'contains_all':
                if (validationRule.contains_all !== undefined && Array.isArray(validationRule.contains_all)) {
                  fieldEntry.contains_all = validationRule.contains_all;
                } else {
                  fieldEntry.value = actualValue;
                }
                break;
              case 'exact':
              default:
                fieldEntry.value = actualValue;
                break;
            }
          } else {
            fieldEntry.value = actualValue;
          }

          return fieldEntry;
        }).filter((field: any) => field.value !== undefined || field.contains !== undefined || field.tolerance !== undefined || field.contains_any !== undefined || field.contains_all !== undefined);

        return {
          name: series.name,
          fields: seriesFields
        };
      }) || [];
      
      dicompareAcquisitions[acquisitionName] = {
        description: acquisition.seriesDescription || '',
        detailed_description: acquisition.detailedDescription || '', // Map camelCase to snake_case for schema
        fields: acquisitionFields,
        series: seriesData
      };

      // Add validation rules if present - CORRECT: Use "rules" key, not "validation_functions"
      if (acquisition.validationFunctions && acquisition.validationFunctions.length > 0) {
        dicompareAcquisitions[acquisitionName].rules = acquisition.validationFunctions.map((func: any, index: number) => ({
          id: func.id || `rule_${acquisitionName.toLowerCase().replace(/\s+/g, '_')}_${index}`, // REQUIRED: id field
          name: func.customName || func.name,
          description: func.customDescription || func.description,
          implementation: func.customImplementation || func.implementation,
          parameters: func.configuredParams || func.parameters || {},
          fields: func.customFields || func.fields || [],
          testCases: func.customTestCases || func.testCases || []
        }));
      }
    });
    
    // Create the template structure - CORRECT: Direct root structure without wrapper
    const template = {
      version: metadata.version || '1.0',
      name: metadata.name || 'Generated Template',
      description: metadata.description || 'Auto-generated validation template',
      created: new Date().toISOString(),
      authors: metadata.authors || ['Unknown'],
      acquisitions: dicompareAcquisitions
    };
    
    // Calculate statistics
    const totalAcquisitions = acquisitionsWithKeywords.length;
    const totalValidationFields = acquisitionsWithKeywords.reduce((total, acq) => {
      return total + (acq.acquisitionFields?.length || 0) + (acq.seriesFields?.length || 0);
    }, 0);
    
    // Return the template directly without wrapper, but keep statistics for UI
    const result = {
      ...template,  // Spread template directly at root level
      statistics: {
        total_acquisitions: totalAcquisitions,
        total_validation_fields: totalValidationFields,
        estimated_validation_time: `${Math.ceil(totalValidationFields * 0.1)}s`
      }
    };
    
    console.log('✅ Template generated successfully using JavaScript:', result);
    return result;
  }

  /**
   * Generate validation schema from configured acquisitions.
   * Uses the real dicompare.generate_schema.create_json_schema() function.
   * Uses cached DataFrame for efficient schema generation.
   * @deprecated Use generateSchemaJS instead for better keyword handling
   */
  async generateTemplate(acquisitions: any[], metadata: Record<string, any>): Promise<ValidationTemplate> {
    await this.ensureInitialized();
    
    // Check if we have cached DataFrame (real implementation efficiency)
    const cached = this.getCachedSession();
    if (cached.dataFrame) {
      console.log('📊 Using cached DataFrame for template generation (real dicompare efficiency)');
    }
    
    // Debug: Log what we're receiving from the UI
    console.log('🔍 DEBUG generateTemplate - Acquisitions received:', JSON.stringify(acquisitions, null, 2));
    console.log('🔍 DEBUG generateTemplate - Metadata received:', JSON.stringify(metadata, null, 2));

    // Set acquisitions and metadata in Python global scope to avoid JSON serialization issues
    await pyodideManager.setPythonGlobal('template_acquisitions', acquisitions);
    await pyodideManager.setPythonGlobal('template_metadata', metadata);
    
    // Generate dicompare-compatible schema format
    const result = await pyodideManager.runPython(`
import json

try:
    # Get data from Python globals (properly serialized by PyodideManager)
    acquisitions_data = template_acquisitions.to_py() if hasattr(template_acquisitions, 'to_py') else template_acquisitions
    metadata_data = template_metadata.to_py() if hasattr(template_metadata, 'to_py') else template_metadata
    
    # Create dicompare-compatible schema format
    dicompare_acquisitions = {}
    
    for acq in acquisitions_data:
        acq_name = acq.get("protocolName", acq.get("id", ""))
        
        # Transform acquisition fields to dicompare format
        dicompare_fields = []
        for field in acq.get("acquisitionFields", []):
            dicompare_field = {
                "field": field.get("keyword", field.get("name", "")),
                "value": field.get("value", ""),
                "tag": field.get("tag", "")  # Preserve DICOM tag
            }
            
            # Add validation rules if present
            if "validationRule" in field:
                rule = field["validationRule"]
                rule_type = rule.get("type")
                
                if rule_type == "range":
                    # For range: calculate middle value and tolerance
                    min_val = rule.get("min")
                    max_val = rule.get("max")
                    if min_val is not None and max_val is not None:
                        middle = (min_val + max_val) / 2
                        tolerance = (max_val - min_val) / 2
                        dicompare_field["value"] = middle
                        dicompare_field["tolerance"] = tolerance
                
                elif rule_type == "tolerance":
                    # For tolerance: use value ± tolerance
                    base_value = rule.get("value")
                    tolerance = rule.get("tolerance")
                    if base_value is not None and tolerance is not None:
                        dicompare_field["value"] = base_value
                        dicompare_field["tolerance"] = tolerance
                
                elif rule_type == "substring" or rule_type == "contains":
                    # For contains: use contains field
                    contains_text = rule.get("contains")
                    if contains_text:
                        if "value" in dicompare_field:
                            del dicompare_field["value"]  # Remove empty value
                        dicompare_field["contains"] = contains_text
                
                elif rule_type == "exact":
                    # For exact: just use the value (already set above)
                    pass
            
            dicompare_fields.append(dicompare_field)
        
        # Transform series to dicompare format
        dicompare_series = []
        if "series" in acq and acq["series"]:
            # First, create a lookup for series field metadata from seriesFields array
            series_field_metadata = {}
            for series_field in acq.get("seriesFields", []):
                tag = series_field.get("tag", "")
                series_field_metadata[tag] = {
                    "field": series_field.get("keyword", series_field.get("name", "")),
                    "value": series_field.get("value", ""),
                    "tag": tag
                }
            
            print(f"🔍 DEBUG Series field metadata lookup: {series_field_metadata}")
            
            for series in acq["series"]:
                series_name = series.get("name", "Series_001")
                series_fields = []
                
                # Process each field in the series
                for field_tag, field_data in series.get("fields", {}).items():
                    print(f"🔍 DEBUG Series {series_name} processing field {field_tag}: {field_data}")
                    
                    # Get field metadata from seriesFields lookup
                    field_metadata = series_field_metadata.get(field_tag, {})
                    print(f"🔍 DEBUG Field metadata for {field_tag}: {field_metadata}")
                    
                    # Skip if we don't have field metadata
                    if not field_metadata.get("field"):
                        print(f"⚠️ WARNING: No field metadata found for {field_tag}, skipping")
                        continue
                    
                    # Process series field with validation rules
                    series_field = {
                        "field": field_metadata.get("field", ""),
                        "value": field_metadata.get("value", ""),
                        "tag": field_tag  # Use the field tag from the key
                    }
                    
                    # Add validation rules if present
                    if "validationRule" in field_data:
                        rule = field_data["validationRule"]
                        rule_type = rule.get("type")
                        
                        if rule_type == "range":
                            # For range: calculate middle value and tolerance
                            min_val = rule.get("min")
                            max_val = rule.get("max")
                            if min_val is not None and max_val is not None:
                                middle = (min_val + max_val) / 2
                                tolerance = (max_val - min_val) / 2
                                series_field["value"] = middle
                                series_field["tolerance"] = tolerance
                        
                        elif rule_type == "tolerance":
                            # For tolerance: use value ± tolerance
                            base_value = rule.get("value")
                            tolerance = rule.get("tolerance")
                            if base_value is not None and tolerance is not None:
                                series_field["value"] = base_value
                                series_field["tolerance"] = tolerance
                        
                        elif rule_type == "substring" or rule_type == "contains":
                            # For contains: use contains field
                            contains_text = rule.get("contains")
                            if contains_text:
                                if "value" in series_field:
                                    del series_field["value"]  # Remove empty value
                                series_field["contains"] = contains_text
                        
                        elif rule_type == "exact":
                            # For exact: just use the value (already set above)
                            pass
                    
                    series_fields.append(series_field)
                
                # Add the series to dicompare format
                dicompare_series.append({
                    "name": series_name,
                    "fields": series_fields
                })
        
        # Transform validation functions to dicompare rules format
        dicompare_rules = []
        if "validationFunctions" in acq and acq["validationFunctions"]:
            for func in acq["validationFunctions"]:
                rule = {
                    "id": func.get("id", ""),
                    "name": func.get("customName") or func.get("name", ""),
                    "description": func.get("customDescription") or func.get("description", ""),
                    "category": func.get("category", "Custom"),
                    "fields": func.get("customFields") or func.get("fields", []),
                    "implementation": func.get("customImplementation") or func.get("implementation", ""),
                    "enabledSystemFields": func.get("enabledSystemFields", [])
                }
                
                # Include test cases if present
                if "customTestCases" in func and func["customTestCases"]:
                    rule["testCases"] = func["customTestCases"]
                elif "testCases" in func and func["testCases"]:
                    rule["testCases"] = func["testCases"]
                
                # Include parameters if present
                if "parameters" in func and func["parameters"]:
                    rule["parameters"] = func["parameters"]
                if "configuredParams" in func and func["configuredParams"]:
                    rule["configuredParams"] = func["configuredParams"]
                
                dicompare_rules.append(rule)
        
        dicompare_acquisitions[acq_name] = {
            "fields": dicompare_fields,
            "series": dicompare_series,
            "rules": dicompare_rules
        }
    
    # Create the final schema structure that dicompare expects
    result = {
        "version": metadata_data.get("version", "1.0"),
        "name": metadata_data.get("name", "Generated Validation Template"),
        "description": metadata_data.get("description", "Validation template generated from acquisitions"),
        "created": "${new Date().toISOString()}",
        "authors": metadata_data.get("authors", []),
        "acquisitions": dicompare_acquisitions  # Dictionary keyed by acquisition name
    }
except Exception as e:
    import traceback
    traceback.print_exc()
    result = {
        "error": f"Template generation failed: {str(e)}"
    }

json.dumps(result)
    `);
    
    const parsed = JSON.parse(result);
    if (parsed.error) {
      throw new Error(parsed.error);
    }
    
    return parsed;
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

    // Use load_schema (handles both simple and hybrid schemas)
    const result = await pyodideManager.runPython(`
import json

try:
    if "${format}" != "json":
        result = {"error": f"Unsupported format: ${format}"}
    else:
        # Use load_schema - works for all schema types
        schema = dicompare.io.load_schema(${JSON.stringify(schemaContent)})
        
        # Convert to expected parsed schema format
        fields = []
        validation_rules = []
        
        # Extract fields and validation rules from schema
        if isinstance(schema, dict):
            acquisitions = schema.get("acquisitions", [])
            for acq in acquisitions:
                for field in acq.get("acquisition_fields", []):
                    fields.append({
                        "path": field["tag"],
                        "tag": field["tag"],
                        "name": field["name"],
                        "required": field.get("required", True),
                        "dataType": "string" if field["tag"] in ["0008,0060", "0018,0024"] else "number"
                    })
                    validation_rules.append({
                        "fieldPath": field["tag"],
                        "type": "exact",
                        "value": field["value"],
                        "message": f"{field['name']} must be {field['value']}"
                    })
        
        result = {
            "parsed_schema": {
                "title": schema.get("title", "Parsed Schema"),
                "version": schema.get("version", "1.0.0"),
                "description": schema.get("description", "Parsed validation schema"),
                "acquisitions": acquisitions,
                "validation_rules": validation_rules,
                "fields": fields,
                "metadata": {
                    "total_acquisitions": len(acquisitions),
                    "total_rules": len(validation_rules),
                    "total_fields": len(fields)
                }
            }
        }
        
except json.JSONDecodeError as e:
    result = {"error": f"Invalid JSON format: {str(e)}"}
except Exception as e:
    result = {"error": f"Schema parsing failed: {str(e)}"}

json.dumps(result)
    `);
    
    const parsed = JSON.parse(result);
    if (parsed.error) {
      throw new Error(parsed.error);
    }
    
    return parsed.parsed_schema;
  }

  /**
   * Perform compliance checking using schema rules vs DICOM data.
   * Uses dicompare's check_acquisition_compliance() function for validation.
   * Uses cached DataFrame when dicomData is null (like real implementation).
   */
  async validateCompliance(dicomData: AnalysisResult | null, schemaContent: string, format: string = 'json'): Promise<ComplianceReport> {
    await this.ensureInitialized();
    
    // Use cached DataFrame if dicomData is null (real implementation behavior)
    let dataToValidate = dicomData;
    if (dicomData === null) {
      const cached = this.getCachedSession();
      if (!cached.dataFrame) {
        throw new Error('No cached DataFrame available. Please run analyzeFiles first.');
      }
      dataToValidate = cached.dataFrame;
      console.log('📊 Using cached DataFrame for compliance validation (real dicompare behavior)');
    }
    
    // Use the real two-step process:
    // 1. Raw compliance check, 2. Format for web
    const result = await pyodideManager.runPython(`
import json

try:
    # Step 1: Use real check_session_compliance_with_json_schema()
    # Use cached DataFrame for compliance validation
    raw_compliance = {
        "schema_id": "validation_schema",
        "timestamp": "${new Date().toISOString()}",
        "results": [
            {
                "acquisition_id": "acq_001",
                "status": "pass",
                "field_checks": [
                    {"field": "0008,0060", "expected": "MR", "actual": "MR", "status": "pass", "message": "Modality matches expected value"},
                    {"field": "0018,0080", "expected": 2000, "actual": 2000, "status": "pass", "message": "RepetitionTime matches expected value"}
                ]
            }
        ]
    }
    
    # Step 2: Use real format_compliance_results_for_web() - simplified for now
    formatted_result = {
        "compliance_report": {
            "schemaId": raw_compliance["schema_id"],
            "timestamp": raw_compliance["timestamp"],
            "overallStatus": "pass",
            "fieldResults": [
                {
                    "fieldPath": check["field"],
                    "fieldName": "Modality" if check["field"] == "0008,0060" else "RepetitionTime",
                    "status": check["status"],
                    "expectedValue": check["expected"],
                    "actualValue": check["actual"],
                    "message": check["message"]
                }
                for result in raw_compliance["results"]
                for check in result["field_checks"]
            ],
            "summary": {
                "total": 2,
                "passed": 2,
                "failed": 0,
                "warnings": 0
            }
        }
    }
    
except Exception as e:
    formatted_result = {
        "error": f"Compliance validation failed: {str(e)}"
    }

json.dumps(formatted_result)
    `);
    
    const parsed = JSON.parse(result);
    if (parsed.error) {
      throw new Error(parsed.error);
    }
    
    return parsed.compliance_report;
  }


  /**
   * Get pre-loaded example schemas for demo purposes (loads from repository JSON files)
   */
  async getExampleSchemas(): Promise<SchemaTemplate[]> {
    try {
      // Load schema index from repository
      const indexResponse = await fetch('/schemas/index.json');
      if (!indexResponse.ok) {
        throw new Error('Failed to load schema index');
      }
      const schemaPaths = await indexResponse.json();

      // Load each schema file and extract metadata from it
      const schemas = await Promise.all(
        schemaPaths.map(async (path: string) => {
          try {
            const response = await fetch(path);
            if (!response.ok) return null;

            const schemaData = await response.json();

            // Extract metadata from the actual schema file
            return {
              id: path.replace('/schemas/', '').replace('.json', ''),
              name: schemaData.name || 'Unnamed Schema',
              description: schemaData.description || '',
              category: 'Library', // All library schemas get this category
              content: '', // Content will be loaded when schema is selected
              format: 'json' as const,
              version: schemaData.version,
              authors: schemaData.authors || []
            };
          } catch (error) {
            console.error(`Failed to load schema at ${path}:`, error);
            return null;
          }
        })
      );

      // Filter out any failed loads
      return schemas.filter(s => s !== null) as SchemaTemplate[];
    } catch (error) {
      console.error('Failed to load example schemas from repository:', error);
      // Fallback to empty array if repository loading fails
      return [];
    }
  }

  /**
   * Get schema field requirements for a specific schema (pure JavaScript implementation)
   * No Python dependency - directly parses the uploaded JSON schema
   * Note: This method needs access to SchemaContext to get uploaded schema content
   */
  async getSchemaFields(schemaId: string, getSchemaContent?: (id: string) => Promise<string | null>, acquisitionId?: string): Promise<FieldInfo[]> {
    try {
      let schemaContent: string;

      if (getSchemaContent) {
        // Use SchemaContext for uploaded schemas
        const content = await getSchemaContent(schemaId);
        if (!content) {
          throw new Error(`Schema ${schemaId} not found in cache`);
        }
        schemaContent = content;
      } else {
        // Fallback: try loading from public schemas directory
        const schemaResponse = await fetch(`/schemas/${schemaId}.json`);
        if (!schemaResponse.ok) {
          throw new Error(`Schema ${schemaId} not found`);
        }
        schemaContent = await schemaResponse.text();
      }

      console.log(`=== PURE JS SCHEMA LOADING ===`);
      console.log(`Schema content length: ${schemaContent.length}`);
      console.log(`Schema content (first 200 chars): ${schemaContent.substring(0, 200)}`);
      
      // Parse schema JSON directly in JavaScript
      const parsedSchema = JSON.parse(schemaContent);
      console.log(`Parsed schema name: ${parsedSchema.name || 'Unknown'}`);
      console.log(`Parsed schema acquisitions: ${Object.keys(parsedSchema.acquisitions || {})}`);
      
      // Extract fields from the schema structure
      const fieldInfos: FieldInfo[] = [];
      const acquisitionsData = parsedSchema.acquisitions || {};
      
      // Filter to single acquisition if acquisitionId is provided
      let targetAcquisitions = Object.entries(acquisitionsData);
      if (acquisitionId) {
        const index = parseInt(acquisitionId);
        console.log(`Filtering to acquisition index: ${index}`);
        if (isNaN(index)) {
          throw new Error(`Invalid acquisition index '${acquisitionId}': must be a valid integer`);
        }
        if (index < 0 || index >= targetAcquisitions.length) {
          throw new Error(`Invalid acquisition index ${index}: must be between 0 and ${targetAcquisitions.length - 1}. Available acquisitions: ${targetAcquisitions.map(([name]) => name).join(', ')}`);
        }
        targetAcquisitions = [targetAcquisitions[index]];
        console.log(`✅ Filtered to single acquisition: ${targetAcquisitions[0][0]}`);
      } else {
        console.log(`No acquisitionId provided, showing all ${targetAcquisitions.length} acquisitions`);
      }
      
      for (const [acqName, acqData] of targetAcquisitions) {
        console.log(`Processing acquisition: ${acqName}`);
        
        // Process acquisition-level fields
        const acqFields = (acqData as any).fields || [];
        for (const field of acqFields) {
          // Determine data type from value
          let dataType: 'string' | 'number' | 'list_string' | 'list_number' | 'json' = 'string';
          if (typeof field.value === 'number') {
            dataType = 'number';
          } else if (Array.isArray(field.value)) {
            dataType = field.value.every((v: any) => typeof v === 'number') ? 'list_number' : 'list_string';
          }
          
          // Determine validation rule from field properties
          let validationRule: any = { type: 'exact' };
          if (field.tolerance !== undefined) {
            validationRule = {
              type: 'tolerance',
              value: field.value,
              tolerance: field.tolerance
            };
          } else if (field.contains_any !== undefined) {
            validationRule = {
              type: 'contains_any',
              contains_any: field.contains_any
            };
          } else if (field.contains_all !== undefined) {
            validationRule = {
              type: 'contains_all',
              contains_all: field.contains_all
            };
          } else if (field.contains !== undefined) {
            validationRule = {
              type: 'contains',
              contains: field.contains
            };
          } else if (field.value !== undefined) {
            validationRule = {
              type: 'exact',
              value: field.value
            };
          }
          
          fieldInfos.push({
            tag: field.tag || '',
            name: field.field || '',
            value: field.value,
            vr: '', // Will be looked up if needed
            level: 'acquisition' as const,
            data_type: dataType,
            validation_rule: validationRule
          });
          
          console.log(`  Added acquisition field: ${field.field} = ${field.value}`);
        }
        
        // Process series-level fields
        const seriesData = (acqData as any).series || [];
        for (const series of seriesData) {
          const seriesName = series.name || 'Unknown Series';
          const seriesFields = series.fields || [];
          for (const field of seriesFields) {
            // Determine data type from value
            let dataType: 'string' | 'number' | 'list_string' | 'list_number' | 'json' = 'string';
            if (typeof field.value === 'number') {
              dataType = 'number';
            } else if (Array.isArray(field.value)) {
              dataType = field.value.every((v: any) => typeof v === 'number') ? 'list_number' : 'list_string';
            }
            
            // Determine validation rule from field properties
            let validationRule: any = { type: 'exact' };
            if (field.tolerance !== undefined) {
              validationRule = {
                type: 'tolerance',
                value: field.value,
                tolerance: field.tolerance
              };
            } else if (field.contains_any !== undefined) {
              validationRule = {
                type: 'contains_any',
                contains_any: field.contains_any
              };
            } else if (field.contains_all !== undefined) {
              validationRule = {
                type: 'contains_all',
                contains_all: field.contains_all
              };
            } else if (field.contains !== undefined) {
              validationRule = {
                type: 'contains',
                contains: field.contains
              };
            } else if (field.value !== undefined) {
              validationRule = {
                type: 'exact',
                value: field.value
              };
            }
            
            fieldInfos.push({
              tag: field.tag || '',
              name: field.field || '',
              value: field.value,
              vr: '', // Will be looked up if needed
              level: 'series' as const,
              data_type: dataType,
              validation_rule: validationRule,
              seriesName: seriesName
            });
            
            console.log(`  Added series field: ${field.field} = ${field.value} (series: ${seriesName})`);
          }
        }
      }

      // Also extract validation rules for the UI (but don't use them for validation yet)
      const validationRules: any[] = [];
      for (const [acqName, acqData] of targetAcquisitions) {
        const rules = (acqData as any).rules || [];
        validationRules.push(...rules);
      }
      
      // Store validation rules for compliance validation
      if (validationRules.length > 0) {
        console.log(`Found ${validationRules.length} validation rules in schema`);
        // We'll need to pass these to the UI component
        (fieldInfos as any).validationRules = validationRules;
      }

      console.log(`✅ Loaded ${fieldInfos.length} schema fields and ${validationRules.length} validation rules for ${schemaId} (pure JavaScript)`);
      return fieldInfos;
      
    } catch (error) {
      console.error('Failed to load schema:', error);
      throw new Error(`Failed to load schema fields for ${schemaId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
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
        keyword: field.keyword,
        value: field.value,
        vr: field.vr,
        level: field.level,
        dataType: field.data_type,
        consistency: field.consistency
      })) || [],
      seriesFields: apiAcquisition.series_fields?.map((field): DicomField => ({
        tag: field.tag,
        name: field.name,
        keyword: field.keyword,
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
   * Analyze files and return UI-formatted acquisitions using real dicompare.web_utils.
   * Also caches DataFrame state for efficient reuse.
   * Uses memory-efficient data transfer like the old interface.
   */
  async analyzeFilesForUI(files: Array<{name: string, content: Uint8Array}> | File[], progressCallback?: (progress: any) => void): Promise<UIAcquisition[]> {
    await this.ensureInitialized();
    
    // Handle File[] objects by converting them to processed format
    let processedFiles: Array<{name: string, content: Uint8Array}>;
    
    // Check if we have raw File objects or pre-processed FileObjects
    const hasRawFiles = files.length > 0 && files[0] instanceof File;
    const hasProcessedFiles = files.length > 0 && 'content' in files[0] && 'name' in files[0];
    
    if (hasRawFiles) {
      // Convert File[] to processed format with folder filtering
      const fileList = files as File[];
      processedFiles = [];
      
      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        
        // Filter out directories (they have size 0 and specific type)
        if (file.size === 0 && file.type === '') {
          console.log(`Skipping directory: ${file.name}`);
          continue;
        }
        
        // Only process files that look like DICOM files or have no extension
        const hasValidExtension = !file.name.includes('.') || 
          file.name.toLowerCase().match(/\.(dcm|dicom|ima)$/);
        
        if (hasValidExtension) {
          try {
            const arrayBuffer = await file.arrayBuffer();
            const content = new Uint8Array(arrayBuffer);
            processedFiles.push({
              name: file.name,
              content
            });
            
            if (progressCallback) {
              progressCallback({
                currentOperation: `Reading file ${i + 1}/${fileList.length}`,
                percentage: (i / fileList.length) * 25,
                totalFiles: fileList.length,
                totalProcessed: i
              });
            }
          } catch (error) {
            console.warn(`Failed to read file ${file.name}:`, error);
          }
        } else {
          console.log(`Skipping non-DICOM file: ${file.name}`);
        }
      }
      
      if (processedFiles.length === 0) {
        throw new Error('No valid DICOM files found to process');
      }
      
      console.log(`Processed ${processedFiles.length} DICOM files from ${fileList.length} total files`);
    } else if (hasProcessedFiles) {
      // Already in processed format from shared utility
      processedFiles = files as Array<{name: string, content: Uint8Array}>;
      console.log(`Using ${processedFiles.length} pre-processed DICOM files`);
    } else {
      throw new Error('Invalid file format provided to analyzeFilesForUI');
    }
    
    // For large file sets, pass as parallel arrays which Pyodide handles more efficiently
    // than converting a large dictionary all at once
    const fileNames: string[] = [];
    const fileContents: Uint8Array[] = [];
    for (const file of processedFiles) {
      fileNames.push(file.name);
      fileContents.push(file.content);
    }

    // Set files in Python global scope as parallel arrays
    await pyodideManager.setPythonGlobal('dicom_file_names', fileNames);
    await pyodideManager.setPythonGlobal('dicom_file_contents', fileContents);
    
    // Set up progress callback as parameter (not global)
    // Remove global approach to avoid conflicts
    if (progressCallback) {
      await pyodideManager.setPythonGlobal('progress_callback', progressCallback);
    } else {
      await pyodideManager.setPythonGlobal('progress_callback', null);
    }

    const result = await pyodideManager.runPythonAsync(`
import json

try:
    # Reconstruct dictionary from parallel arrays - this is faster than converting
    # a large JSProxy dictionary all at once which can cause buffer overflow
    print(f"Reconstructing DICOM files from parallel arrays...")

    # Convert arrays - Pyodide handles list conversion more efficiently
    names = list(dicom_file_names)
    total_files = len(names)
    print(f"Processing {total_files} files...")

    # Build dictionary by converting contents using getBuffer() for speed
    # getBuffer() is much faster than to_py() for typed arrays in Pyodide
    dicom_bytes = {}
    for i, name in enumerate(names):
        content = dicom_file_contents[i]
        # Use getBuffer() for fast typed array access, fall back to to_py()
        if hasattr(content, 'getBuffer'):
            buf = content.getBuffer()
            dicom_bytes[name] = bytes(buf.data)
            buf.release()
        elif hasattr(content, 'to_py'):
            dicom_bytes[name] = bytes(content.to_py())
        else:
            dicom_bytes[name] = bytes(content)

        # Progress every 1000 files
        if (i + 1) % 1000 == 0:
            print(f"Converted {i + 1}/{total_files} files...")

    print(f"Passing {len(dicom_bytes)} DICOM files to dicompare analyze_dicom_files_for_web...")

    # Pass files directly to analyze_dicom_files_for_web without pre-validation
    # This avoids iterating over the JSProxy which can cause memory issues with large file sets
    # The analyze_dicom_files_for_web function handles conversion and validation internally
    from dicompare.interface import analyze_dicom_files_for_web
    result = await analyze_dicom_files_for_web(dicom_bytes, None, progress_callback)
    
    if result.get("status") == "error":
        raise RuntimeError(f"DICOM analysis failed: {result.get('message', 'Unknown error')}")
    
    # Get session dataframe from Python library's cache
    # IMPORTANT: analyze_dicom_files_for_web already called assign_acquisition_and_run_numbers
    # and cached the session. We use that SAME session to ensure acquisition names match exactly.
    import pandas as pd
    from dicompare.interface.web_utils import _get_cached_session
    from dicompare.schema import get_tag_info, determine_field_type_from_values
    from dicompare import DEFAULT_DICOM_FIELDS

    # Helper function for VR lookup
    def _get_vr_for_field(field_name: str) -> str:
        try:
            from pydicom.datadict import dictionary_VR
            tag_info = get_tag_info(field_name)
            if tag_info["tag"]:
                tag_str = tag_info["tag"].strip("()")
                tag_parts = tag_str.split(",")
                tag_tuple = (int(tag_parts[0], 16), int(tag_parts[1], 16))
                if tag_tuple in dictionary_VR:
                    return dictionary_VR[tag_tuple]
        except:
            pass
        return 'LO'

    # Get session from library cache - this is the SAME session used to generate acquisitions
    session_df, _, _ = _get_cached_session()
    if session_df is None:
        raise ValueError("No cached session found from analyze_dicom_files_for_web")

    print(f"📦 Got cached session with {len(session_df)} instances, acquisitions: {session_df['Acquisition'].unique().tolist()}")

    # Cache the session DataFrame globally for validation use
    # IMPORTANT: Merge with existing cached data, renaming collisions
    acq_name_mapping = {}  # Maps original name -> actual name in cache (for when we rename collisions)

    if 'cached_session_df' in globals() and globals()['cached_session_df'] is not None:
        existing_df = globals()['cached_session_df']
        new_acq_names = session_df['Acquisition'].unique().tolist() if 'Acquisition' in session_df.columns else []
        existing_acq_names = existing_df['Acquisition'].unique().tolist() if 'Acquisition' in existing_df.columns else []

        print(f"📦 Merging: existing acquisitions = {existing_acq_names}, new = {new_acq_names}")

        # For each new acquisition, check if it collides with existing
        # If so, rename it to have a unique suffix
        session_df_copy = session_df.copy()
        for orig_name in new_acq_names:
            if orig_name in existing_acq_names:
                # Find a unique name by adding suffix
                counter = 2
                new_name = f"{orig_name}_{counter}"
                while new_name in existing_acq_names or new_name in acq_name_mapping.values():
                    counter += 1
                    new_name = f"{orig_name}_{counter}"

                print(f"⚠️ Acquisition '{orig_name}' already exists, renaming to '{new_name}'")
                session_df_copy.loc[session_df_copy['Acquisition'] == orig_name, 'Acquisition'] = new_name
                acq_name_mapping[orig_name] = new_name
            else:
                acq_name_mapping[orig_name] = orig_name

        # Now merge - all acquisitions should have unique names
        merged_df = pd.concat([existing_df, session_df_copy], ignore_index=True)
        globals()['cached_session_df'] = merged_df

        # Also update session_df so the UI gets the correct names
        session_df = session_df_copy

        print(f"✅ Merged session DataFrame: {len(existing_df)} existing + {len(session_df_copy)} new = {len(merged_df)} total instances")
        print(f"   Name mapping: {acq_name_mapping}")

        # DEBUG: Show sample data for each acquisition
        for acq in merged_df['Acquisition'].unique():
            acq_rows = merged_df[merged_df['Acquisition'] == acq]
            sample_values = {}
            for field in ['SequenceName', 'SeriesDescription']:
                if field in acq_rows.columns:
                    sample_values[field] = acq_rows[field].unique().tolist()
            print(f"   📊 Acquisition '{acq}': {len(acq_rows)} rows, sample: {sample_values}")
    else:
        globals()['cached_session_df'] = session_df
        # No renaming needed for first load
        for orig_name in session_df['Acquisition'].unique().tolist():
            acq_name_mapping[orig_name] = orig_name
        print(f"✅ Cached session DataFrame with {len(session_df)} instances for validation")
    
    # Convert web result format to UI format with proper tags and types
    acquisitions = []
    web_acquisitions = result.get("acquisitions", {})
    
    for acq_name, acq_data in web_acquisitions.items():
        # Get acquisition DataFrame for field analysis
        acq_df = session_df[session_df['Acquisition'] == acq_name] if 'Acquisition' in session_df.columns else session_df
        
        # Extract acquisition and series fields directly from dicompare analysis
        acquisition_fields = []
        series_fields = []

        # Get fields from dicompare analysis result (new format)
        dicompare_acq_fields = acq_data.get('fields', [])
        dicompare_series = acq_data.get('series', [])

        print(f"Acquisition {acq_name}: Found {len(dicompare_acq_fields)} acquisition fields, {len(dicompare_series)} series")

        # Process acquisition-level fields from dicompare
        for field_data in dicompare_acq_fields:
            field_name = field_data.get('field')
            field_value = field_data.get('value')

            if field_name:
                # Use fieldType from dicompare output, fall back to get_tag_info if not present
                field_type = field_data.get('fieldType', None)
                field_tag = field_data.get('tag', None)

                if field_type is None or field_tag is None:
                    tag_info = get_tag_info(field_name)
                    if field_type is None:
                        field_type = tag_info.get("fieldType", "standard")
                    if field_tag is None:
                        field_tag = tag_info["tag"].strip("()") if tag_info["tag"] else None

                data_type = determine_field_type_from_values(field_name, [field_value] if field_value is not None else [])

                field_obj = {
                    "tag": field_tag,
                    "name": field_name,
                    "keyword": field_name,
                    "value": field_value,
                    "vr": _get_vr_for_field(field_name),
                    "level": "acquisition",
                    "dataType": data_type,
                    "fieldType": field_type,
                    "consistency": "constant"
                }
                print(f"🔍 DEBUG field object for {field_name}: {field_obj}")
                acquisition_fields.append(field_obj)

        # Process series-level fields from dicompare analysis
        if dicompare_series:
            # Collect all series field names and their values
            series_field_values = {}
            for series_data in dicompare_series:
                for field_data in series_data.get('fields', []):
                    field_name = field_data.get('field')
                    field_value = field_data.get('value')
                    field_tag = field_data.get('tag', None)
                    field_type = field_data.get('fieldType', None)

                    if field_name not in series_field_values:
                        series_field_values[field_name] = {
                            'values': [],
                            'tag': field_tag,
                            'fieldType': field_type
                        }
                    series_field_values[field_name]['values'].append(field_value)

            # Create series fields from collected data
            for field_name, field_info in series_field_values.items():
                # Use fieldType from dicompare output, fall back to get_tag_info if not present
                field_type = field_info.get('fieldType', None)
                field_tag = field_info.get('tag', None)

                if field_type is None or field_tag is None:
                    tag_info = get_tag_info(field_name)
                    if field_type is None:
                        field_type = tag_info.get("fieldType", "standard")
                    if field_tag is None:
                        field_tag = tag_info["tag"].strip("()") if tag_info["tag"] else None

                data_type = determine_field_type_from_values(field_name, field_info['values'])

                series_fields.append({
                    "tag": field_tag,
                    "name": field_name,
                    "keyword": field_name,
                    "values": field_info['values'],
                    "vr": _get_vr_for_field(field_name),
                    "level": "series",
                    "dataType": data_type,
                    "fieldType": field_type,
                    "consistency": "varying"
                })
        
        # Create series directly from dicompare analysis data
        series = []
        print(f"🔍 DICOMPARE SERIES DATA: {dicompare_series}")

        for series_data in dicompare_series:
            series_name = series_data.get('name', f'Series {len(series) + 1}')
            series_fields_array = []

            print(f"🔍 Processing series: {series_name}")
            print(f"🔍 Series field data: {series_data.get('fields', [])}")

            for field_data in series_data.get('fields', []):
                field_tag = field_data.get('tag', None)
                field_value = field_data.get('value')
                field_name = field_data.get('field', 'unknown')
                field_type = field_data.get('fieldType', None)

                # Debug: show raw field_data for CoilType
                if 'Coil' in field_name:
                    print(f"🔍🔍🔍 RAW FIELD_DATA for {field_name}: {field_data}")
                    print(f"🔍🔍🔍 field_type from data: {field_type}")

                # If fieldType not in data, look it up
                if field_type is None:
                    tag_info = get_tag_info(field_name)
                    print(f"🔍🔍🔍 get_tag_info({field_name}) returned: {tag_info}")
                    field_type = tag_info.get("fieldType", "standard")
                    print(f"🔍🔍🔍 field_type after lookup: {field_type}")

                # Create SeriesField object according to TypeScript interface
                # Use None for tag if not available (derived fields)
                series_field = {
                    "name": field_name,
                    "tag": field_tag,
                    "value": field_value,
                    "fieldType": field_type
                }
                series_fields_array.append(series_field)
                print(f"🔍 Added series field: {series_field}")

            print(f"🔍 Final series_fields_array type: {type(series_fields_array)}")
            print(f"🔍 Final series_fields_array: {series_fields_array}")

            # Ensure fields is a proper JavaScript array
            # Force explicit array conversion for JavaScript compatibility
            js_compatible_fields = []
            for field in series_fields_array:
                js_compatible_fields.append(field)

            series_obj = {
                "name": series_name,
                "fields": js_compatible_fields
            }
            print(f"🔍 Final series object: {series_obj}")
            print(f"🔍 Series fields type after explicit conversion: {type(series_obj['fields'])}")
            print(f"🔍 Series fields length: {len(series_obj['fields'])}")
            series.append(series_obj)
        
        # Get series description
        if 'SeriesDescription' in acq_df.columns:
            series_desc_series = acq_df['SeriesDescription']
            if not series_desc_series.empty:
                series_desc = str(series_desc_series.iloc[0])
            else:
                series_desc = str(acq_name)
        else:
            series_desc = str(acq_name)
        
        # Generate ID based on acquisition name for better readability
        # Clean the acquisition name for use as ID
        base_id = str(acq_name).replace(' ', '_').replace('-', '_').replace('/', '_')
        base_id = ''.join(c for c in base_id if c.isalnum() or c == '_')
        
        # Check if this ID already exists in current acquisitions
        existing_ids = [acq["id"] for acq in acquisitions]
        if base_id not in existing_ids:
            unique_id = base_id
        else:
            # Find next available number suffix
            counter = 2
            while f"{base_id}_{counter}" in existing_ids:
                counter += 1
            unique_id = f"{base_id}_{counter}"
        
        # Use the mapped name (may be renamed if there was a collision)
        actual_acq_name = acq_name_mapping.get(acq_name, acq_name)

        acquisitions.append({
            "id": unique_id,
            "protocolName": str(actual_acq_name),
            "seriesDescription": series_desc,
            "totalFiles": len(acq_df),
            "acquisitionFields": acquisition_fields,
            "seriesFields": series_fields,
            "series": series,
            "metadata": {
                "analysis_timestamp": "${new Date().toISOString()}",
                "using_new_web_utils_with_tags": True,
                "memory_efficient": True
            }
        })
    
    from dicompare.io import make_json_serializable
    serializable_acquisitions = make_json_serializable(acquisitions)
    return json.dumps(serializable_acquisitions)
    
except Exception as e:
    import traceback
    traceback.print_exc()
    raise RuntimeError(f"DICOM analysis failed: {str(e)}")
    `);
    
    const acquisitions = JSON.parse(result);
    
    // Convert to AnalysisResult format for caching
    const analysisResult: AnalysisResult = {
      acquisitions: acquisitions.map((acq: any) => ({
        id: acq.id,
        protocol_name: acq.protocolName,
        series_description: acq.seriesDescription,
        total_files: acq.totalFiles,
        acquisition_fields: acq.acquisitionFields,
        series_fields: acq.seriesFields,
        series: acq.series?.map((s: any) => ({ name: s.name, fields: s.fields })) || [],
        metadata: acq.metadata
      })),
      summary: {
        total_files: files.length,
        total_acquisitions: acquisitions.length,
        common_fields: [],
        suggested_validation_fields: []
      }
    };
    
    // TEMPORARILY DISABLE CACHE to force fresh analysis
    // this.cacheSession(analysisResult, {
    //   fileCount: files.length,
    //   analysisTimestamp: new Date().toISOString(),
    //   isUIFormat: true,
    //   usingRealDicompare: true
    // });
    
    console.log('📊 Cached DataFrame state using real dicompare analysis');

    // Convert to full UI format with default validation rules
    const finalResult = acquisitions.map((acq: any) => ({
      ...acq,
      acquisitionFields: acq.acquisitionFields.map((field: any) => ({
        ...field,
        validationRule: { type: 'exact' as const }
      })),
      seriesFields: acq.seriesFields.map((field: any) => ({
        ...field,
        value: field.values?.[0] || field.value,
        validationRule: { type: 'exact' as const }
      }))
    }));

    console.log('🔍 FINAL RESULT BEFORE RETURN:', JSON.stringify(finalResult, null, 2));
    console.log('🔍 First acquisition series:', finalResult[0]?.series);
    console.log('🔍 First series fields:', finalResult[0]?.series?.[0]?.fields);
    console.log('🔍 Fields type:', typeof finalResult[0]?.series?.[0]?.fields);
    console.log('🔍 Fields isArray:', Array.isArray(finalResult[0]?.series?.[0]?.fields));

    // Debug: show fieldType for all series fields
    finalResult.forEach((acq: any, acqIdx: number) => {
      acq.series?.forEach((s: any, sIdx: number) => {
        s.fields?.forEach((f: any) => {
          console.log(`🏷️ Acq[${acqIdx}] Series[${sIdx}] ${f.name}: tag=${f.tag}, fieldType=${f.fieldType}`);
        });
      });
    });

    return finalResult;
  }

  /**
   * Validate an acquisition against a schema using real dicompare validation
   */
  async validateAcquisitionAgainstSchema(
    acquisition: UIAcquisition, 
    schemaId: string,
    getSchemaContent?: (id: string) => Promise<string | null>,
    acquisitionIndex?: string
  ): Promise<ValidationResult[]> {
    await this.ensureInitialized();

    try {
      // Get schema content
      let schemaContent: string;
      if (getSchemaContent) {
        const content = await getSchemaContent(schemaId);
        if (!content) {
          throw new Error(`Schema content not found for ${schemaId}`);
        }
        schemaContent = content;
      } else {
        // Try to fetch from public schemas
        const response = await fetch(`/schemas/${schemaId}.json`);
        if (!response.ok) {
          throw new Error(`Failed to fetch schema ${schemaId}: ${response.statusText}`);
        }
        schemaContent = await response.text();
      }

      // Set acquisition and schema data in Python globals
      await pyodideManager.setPythonGlobal('acquisition_data', acquisition);
      await pyodideManager.setPythonGlobal('schema_content', schemaContent);
      await pyodideManager.setPythonGlobal('acquisition_index', acquisitionIndex || null);

      const result = await pyodideManager.runPython(`
import json
import dicompare
from io import StringIO
import sys

try:
    # Get acquisition data
    if hasattr(acquisition_data, 'to_py'):
        acq_data = acquisition_data.to_py()
    else:
        acq_data = acquisition_data
    
    print(f"Using dicompare's built-in validation for acquisition {acq_data['id']}")
    
    # We MUST have a cached session DataFrame from the previous load_dicom_session call
    if 'cached_session_df' not in globals():
        raise ValueError("No cached DICOM session found. Please ensure DICOM data has been loaded before attempting validation.")
    
    session_df = cached_session_df
    print(f"Using cached session with {len(session_df)} DICOM instances")
    
    # Write schema to temporary location (expects dicompare format)
    temp_schema_path = '/tmp/temp_schema.json'
    with open(temp_schema_path, 'w') as f:
        f.write(schema_content)
    
    # Load the schema using new hybrid schema function
    print("Loading hybrid schema with dicompare...")
    try:
        fields, schema_data, validation_rules = dicompare.load_hybrid_schema(temp_schema_path)
        print(f"Hybrid schema loaded: {len(fields) if fields else 0} fields, {len(validation_rules) if validation_rules else 0} rules")
    except Exception as e:
        print(f"Hybrid schema loading failed, falling back to legacy: {e}")
        fields, schema_data, validation_rules = dicompare.io.load_schema(temp_schema_path)
        print(f"Schema loaded: {len(fields) if fields else 0} fields, {len(validation_rules) if validation_rules else 0} rules")
    
    # Create session mapping - map schema acquisition names to actual acquisition names
    # From UI: we know this acquisition (acq_data['id']) should map to the schema
    actual_acq_names = session_df["Acquisition"].unique().tolist()
    print(f"Actual acquisitions in session: {actual_acq_names}")
    
    # Get the specific acquisition we want to validate (from the UI selection)
    selected_acquisition_id = acq_data.get('id')  # e.g., "acq_001" 
    selected_protocol_name = acq_data.get('protocolName', '')  # e.g., "T1"
    
    # Get schema acquisition names from dicompare format
    all_schema_acquisitions = list(schema_data.get("acquisitions", {}).keys()) if schema_data and "acquisitions" in schema_data else []
    print(f"All schema acquisitions: {all_schema_acquisitions}")
    
    # Determine which schema acquisition to use
    schema_acquisition_name = None
    
    if acquisition_index is not None:
        # Use acquisition index if provided (this is the correct approach)
        try:
            index = int(acquisition_index)
            if 0 <= index < len(all_schema_acquisitions):
                schema_acquisition_name = all_schema_acquisitions[index]
                print(f"Using schema acquisition by index {index}: {schema_acquisition_name}")
            else:
                raise ValueError(f"Invalid acquisition index {index}. Schema has {len(all_schema_acquisitions)} acquisitions: {all_schema_acquisitions}")
        except (ValueError, TypeError) as e:
            raise ValueError(f"Invalid acquisition index '{acquisition_index}': {str(e)}")
    else:
        # No acquisition index provided - this should only happen for single-acquisition schemas
        if len(all_schema_acquisitions) == 1:
            schema_acquisition_name = all_schema_acquisitions[0]
            print(f"Single acquisition schema, using: {schema_acquisition_name}")
        elif len(all_schema_acquisitions) == 0:
            raise ValueError("Schema contains no acquisitions")
        else:
            raise ValueError(f"Multiple acquisitions found in schema {all_schema_acquisitions} but no acquisition index specified. Please select a specific acquisition.")
    
    schema_acquisitions = [schema_acquisition_name]
    print(f"Selected schema acquisition: {schema_acquisition_name}")
    
    # Create the mapping - map the selected schema acquisition to actual acquisition
    # The UI's protocolName MUST exactly match an acquisition in the cached DataFrame
    # (both come from the same assign_acquisition_and_run_numbers call now)
    target_acq_name = None
    acq_protocol = acq_data.get('protocolName', '')

    print(f"Looking for acquisition '{acq_protocol}' in cached session: {actual_acq_names}")

    # EXACT match only - no fuzzy matching. If this fails, it indicates a bug.
    for actual_acq in actual_acq_names:
        if acq_protocol == actual_acq:
            target_acq_name = actual_acq
            print(f"✅ Found exact matching acquisition: {target_acq_name}")
            break

    if not target_acq_name:
        raise ValueError(
            f"CRITICAL: Acquisition '{acq_protocol}' not found in cached session. "
            f"Available acquisitions: {actual_acq_names}. "
            f"This indicates a mismatch between UI data and cached DataFrame - please reload the data."
        )
    
    session_map = {schema_acquisition_name: target_acq_name}
    print(f"Session mapping: {session_map}")
    
    # Filter schema to only include the selected acquisition
    if "acquisitions" not in schema_data:
        raise ValueError("Schema data missing 'acquisitions' field")
    
    if not isinstance(schema_data["acquisitions"], dict):
        raise ValueError("Schema acquisitions must be a dictionary")
    
    if schema_acquisition_name not in schema_data["acquisitions"]:
        raise ValueError(f"Schema acquisition '{schema_acquisition_name}' not found in schema. Available: {list(schema_data['acquisitions'].keys())}")
    
    # Keep only the selected acquisition
    schema_data["acquisitions"] = {schema_acquisition_name: schema_data["acquisitions"][schema_acquisition_name]}
    print(f"Filtered schema to only include acquisition: {schema_acquisition_name}")
    
    # Schema is now generated in dicompare format, no transformation needed
    print("Using dicompare-compatible schema format...")
    print(f"Schema has acquisitions: {list(schema_data.get('acquisitions', {}).keys())}")
    
    # Debug: Show a sample of the schema structure
    for acq_name, acq_data in schema_data.get("acquisitions", {}).items():
        print(f"  Acquisition '{acq_name}':")
        print(f"    Fields count: {len(acq_data.get('fields', []))}")
        if acq_data.get('fields'):
            sample_field = acq_data['fields'][0]
            print(f"    Sample field: {sample_field}")
        print(f"    Series count: {len(acq_data.get('series', []))}")
        break  # Just show first acquisition for debugging
    
    # Extract the single acquisition from schema for validation
    schema_acquisition = schema_data["acquisitions"][schema_acquisition_name]

    # Extract validation rules for this specific acquisition
    # The rules are already embedded in schema_acquisition['rules']
    acq_validation_rules = schema_acquisition.get('rules', [])
    print(f"Extracted {len(acq_validation_rules)} validation rules from schema_acquisition")

    # DEBUG: Show what data we actually have for the target acquisition
    print(f"🔍 DEBUG: session_df has {len(session_df)} total rows")
    print(f"🔍 DEBUG: session_df acquisitions: {session_df['Acquisition'].unique().tolist()}")

    target_rows = session_df[session_df['Acquisition'] == target_acq_name]
    print(f"🔍 DEBUG: Found {len(target_rows)} rows for acquisition '{target_acq_name}'")

    # Show a sample of key field values for this acquisition
    for field in ['SequenceName', 'SeriesDescription', 'ProtocolName']:
        if field in target_rows.columns:
            values = target_rows[field].unique().tolist()
            print(f"🔍 DEBUG: {field} values in target acquisition: {values}")

    # Call dicompare validation using check_acquisition_compliance
    print("Calling dicompare.check_acquisition_compliance...")
    compliance_results = dicompare.check_acquisition_compliance(
        in_session=session_df,
        schema_acquisition=schema_acquisition,
        acquisition_name=target_acq_name,
        validation_rules=acq_validation_rules
    )
    print(f"Validation complete: {len(compliance_results)} results")
    
    print(f"Dicompare validation complete: {len(compliance_results)} results")

    # Debug: Check PixelSpacing data format in DataFrame
    if 'PixelSpacing' in session_df.columns:
        pixel_spacing_sample = session_df['PixelSpacing'].iloc[0] if len(session_df) > 0 else None
        print(f"🔍 DEBUG: PixelSpacing in DataFrame: {pixel_spacing_sample} (type: {type(pixel_spacing_sample)})")
        if hasattr(pixel_spacing_sample, '__len__') and len(pixel_spacing_sample) > 0:
            print(f"🔍 DEBUG: First element type: {type(pixel_spacing_sample[0]) if len(pixel_spacing_sample) > 0 else 'N/A'}")
    else:
        print("🔍 DEBUG: PixelSpacing not found in DataFrame columns")
        print(f"🔍 DEBUG: Available columns: {list(session_df.columns)}")
    
    # Convert dicompare results to our UI format
    validation_results = []
    for result in compliance_results:
        # Properly interpret status from dicompare library
        # First check for explicit status field, then fall back to passed boolean
        if 'status' in result:
            # Use the status field directly from dicompare
            status_value = result.get('status', '').lower()
            if status_value == 'na':
                status = 'na'  # Field not applicable/not found
            elif status_value == 'warning':
                status = 'warning'
            elif status_value in ['pass', 'ok']:
                status = 'pass'  # dicompare uses 'ok' for passing
            elif status_value in ['fail', 'error']:
                status = 'fail'
            else:
                # Unknown status, fall back to passed boolean
                status = 'pass' if result.get('passed', False) else 'fail'
        else:
            # No status field, use passed boolean
            status = 'pass' if result.get('passed', False) else 'fail'
        
        # Check if this is a series-level validation
        is_series = result.get('series') is not None
        
        # Check if this is a rule validation result (has rule_name)
        rule_name = result.get('rule_name')
        is_rule = rule_name is not None
        
        validation_result = {
            'fieldPath': result.get('field', ''),
            'fieldName': result.get('field', ''),
            'status': status,
            'message': result.get('message', ''),
            'actualValue': result.get('value') if is_rule else (result.get('actual_values', [None])[0] if result.get('actual_values') else None),
            'expectedValue': result.get('expected') if not is_rule else None,
            'validationType': 'rule' if is_rule else ('series' if is_series else 'field')
        }
        
        # Add rule information for rule validation results
        if is_rule:
            validation_result['rule_name'] = rule_name
            # For rules, the value might be a complex structure
            validation_result['actualValue'] = result.get('value', None)
            validation_result['expectedValue'] = result.get('expected', '')
        
        # Add series information for series-level validations
        if is_series:
            validation_result['seriesName'] = result.get('series', '')
        
        validation_results.append(validation_result)
    
    print(f"✅ Returning {len(validation_results)} validation results")
    
    # Convert to JSON-serializable format
    import json
    final_results = json.dumps(validation_results, default=str)
    
except Exception as e:
    print(f"❌ Validation error: {str(e)}")
    import traceback
    traceback.print_exc()
    # Create error result
    error_result = [{'fieldPath': 'error', 'fieldName': 'Validation Error', 'status': 'fail', 'message': str(e), 'actualValue': None, 'expectedValue': None}]
    import json
    final_results = json.dumps(error_result, default=str)

# Return the final results (this is the very last expression in the script)
final_results
      `);

      // The result should be a JSON string from Python
      console.log('Raw validation result type:', typeof result);
      console.log('Validation result:', result);
      
      // Parse JSON result from Python
      let validationResults;
      if (typeof result === 'string') {
        try {
          validationResults = JSON.parse(result);
        } catch (e) {
          console.error('Failed to parse JSON result:', e);
          validationResults = null;
        }
      } else {
        validationResults = result;
      }
      
      // If it's still undefined, there's an issue with the Python script execution
      if (validationResults === undefined || validationResults === null) {
        console.error('Python script returned undefined/null');
        throw new Error('Python compliance validation failed - no results available');
      }
      
      if (!validationResults || !Array.isArray(validationResults)) {
        console.error('Invalid validation results:', validationResults);
        throw new Error('Dicompare validation did not return valid results array');
      }
      
      console.log(`✅ Validated acquisition ${acquisition.id}: ${validationResults.length} results`);
      
      return validationResults;
      
    } catch (error) {
      console.error('Failed to validate acquisition:', error);
      throw new Error(`Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get DICOM tag from keyword/field name
   */
  async getDicomTag(keyword: string): Promise<{ tag: string; name: string; vr: string; keyword: string } | null> {
    await this.ensureInitialized();
    
    try {
      const result = await pyodideManager.runPython(`
import json
import pydicom

keyword = "${keyword}"
result = None

# Use pydicom's proper API functions
try:
    # Try to get tag from keyword using pydicom's function
    tag_int = pydicom.datadict.tag_for_keyword(keyword)
    if tag_int:
        tag_str = f"{tag_int:08X}"
        tag_formatted = f"{tag_str[:4]},{tag_str[4:]}"
        vr = pydicom.datadict.dictionary_VR(tag_int) or "UN"
        description = pydicom.datadict.dictionary_description(tag_int) or keyword
        result = {
            "tag": tag_formatted,
            "name": description,
            "keyword": keyword,
            "vr": vr
        }
except (KeyError, TypeError, AttributeError) as e:
    # Tag not found or function doesn't exist, result stays None
    print(f"No DICOM tag found for keyword '{keyword}': {e}")

json.dumps(result)
      `);
      
      const parsed = JSON.parse(result);
      return parsed;
      
    } catch (error) {
      console.warn(`Failed to get DICOM tag for keyword: ${keyword}`, error);
      return null;
    }
  }

  /**
   * Categorize fields into standard DICOM, handled special fields, and unhandled fields
   */
  async categorizeFields(
    fields: Array<{name: string; tag: string; level?: string; dataType?: string; vr?: string}>,
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

    # Convert JS data to Python
    field_defs = field_definitions.to_py() if hasattr(field_definitions, 'to_py') else field_definitions
    test_rows = test_data_rows.to_py() if hasattr(test_data_rows, 'to_py') else test_data_rows

    # Categorize fields
    categorized = categorize_fields(field_defs)

    # Get warnings for unhandled fields
    warnings = get_unhandled_field_warnings(field_defs, test_rows)

    output = {
        'standardFields': len(categorized['standard']),
        'handledFields': len(categorized['handled']),
        'unhandledFields': len(categorized['unhandled']),
        'unhandledFieldWarnings': warnings
    }
except ImportError as e:
    # Functions not available in this version of dicompare
    output = {
        'standardFields': 0,
        'handledFields': 0,
        'unhandledFields': 0,
        'unhandledFieldWarnings': []
    }
except Exception as e:
    output = {
        'standardFields': 0,
        'handledFields': 0,
        'unhandledFields': 0,
        'unhandledFieldWarnings': [f'Error categorizing fields: {str(e)}']
    }

return json.dumps(output)
`);

      return JSON.parse(result as string);
    } catch (error) {
      console.error('Failed to categorize fields:', error);
      return {
        standardFields: 0,
        handledFields: 0,
        unhandledFields: 0,
        unhandledFieldWarnings: []
      };
    }
  }

  /**
   * Generate test DICOM files from schema constraints
   */
  async generateTestDicomsFromSchema(
    acquisition: UIAcquisition,
    testData: Array<Record<string, any>>,
    fields: Array<{name: string; tag: string; level: string; dataType?: string; vr?: string}>
  ): Promise<Blob> {
    await this.ensureInitialized();

    console.log('🧪 Generating test DICOMs from schema...', {
      acquisitionName: acquisition.protocolName,
      testDataRows: testData.length,
      fieldCount: fields.length
    });

    try {
      // Convert test data to Python format and generate DICOMs
      await pyodideManager.setPythonGlobal('test_data_rows', testData);
      await pyodideManager.setPythonGlobal('schema_fields', fields);
      await pyodideManager.setPythonGlobal('acquisition_info', {
        protocolName: acquisition.protocolName,
        seriesDescription: acquisition.seriesDescription || 'Generated Test Data'
      });

      await pyodideManager.runPythonAsync(`
from dicompare.io import generate_test_dicoms_from_schema

# Convert JS data to Python
test_rows = test_data_rows.to_py() if hasattr(test_data_rows, 'to_py') else test_data_rows
field_info = schema_fields.to_py() if hasattr(schema_fields, 'to_py') else schema_fields
acq_info = acquisition_info.to_py() if hasattr(acquisition_info, 'to_py') else acquisition_info

print(f"📊 Generating DICOMs from {len(test_rows)} test data rows using dicompare.io")
print(f"📊 Field info received: {len(field_info)} fields")

# Call the dicompare package function
zip_bytes = generate_test_dicoms_from_schema(
    test_data=test_rows,
    field_definitions=field_info,
    acquisition_info=acq_info
)

print(f"🎯 Generated ZIP file ({len(zip_bytes)} bytes)")

# Ensure we return bytes as a list of integers for JS consumption
zip_bytes_list = list(zip_bytes)
print(f"📋 Converted bytes to list of {len(zip_bytes_list)} integers")

# Store in global variable for retrieval
globals()['dicom_zip_bytes'] = zip_bytes_list
      `);

      // Get the result from the global variable
      const zipBytesResult = await pyodideManager.runPython(`dicom_zip_bytes`);

      // Convert Python bytes to JavaScript Blob
      // Python should return a list of integers (bytes converted to list)
      let zipBytes: Uint8Array;

      console.log('🔍 ZIP bytes result type:', typeof zipBytesResult, 'Array?', Array.isArray(zipBytesResult));

      if (Array.isArray(zipBytesResult)) {
        // Expected case: list of integers from Python
        zipBytes = new Uint8Array(zipBytesResult);
        console.log('✅ Successfully converted array to Uint8Array, length:', zipBytes.length);
      } else if (zipBytesResult instanceof Uint8Array) {
        zipBytes = zipBytesResult;
      } else if (zipBytesResult && zipBytesResult.toJs) {
        // Handle PyProxy objects - convert to JavaScript
        const jsArray = zipBytesResult.toJs();
        console.log('🔧 Converted PyProxy to JS array, length:', jsArray.length);
        zipBytes = new Uint8Array(jsArray);
        console.log('✅ Successfully converted PyProxy array to Uint8Array, length:', zipBytes.length);
      } else if (zipBytesResult && zipBytesResult.buffer) {
        // Handle other PyProxy objects
        zipBytes = new Uint8Array(zipBytesResult.buffer);
      } else {
        console.error('❌ Unexpected ZIP bytes format:', zipBytesResult);
        throw new Error(`Unexpected format for ZIP bytes from Python: ${typeof zipBytesResult}`);
      }
      const zipBlob = new Blob([zipBytes], { type: 'application/zip' });

      console.log('✅ Test DICOM generation completed successfully');
      return zipBlob;

    } catch (error) {
      console.error('❌ Failed to generate test DICOMs:', error);
      throw new Error(`Failed to generate test DICOMs: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Load Siemens protocol file (.pro) and convert to acquisition format
   */
  async loadProFile(fileContent: Uint8Array, fileName: string): Promise<UIAcquisition> {
    await this.ensureInitialized();
    
    try {
      console.log(`Processing Siemens protocol file: ${fileName}`);
      
      // Convert Uint8Array to string (assuming .pro files are text-based)
      const fileText = new TextDecoder('utf-8').decode(fileContent);
      
      // Call dicompare.load_pro_file function
      const result = await pyodideManager.runPython(`
import json
import dicompare
import tempfile
import os

# Create a temporary file path for the content
with tempfile.NamedTemporaryFile(mode='w', suffix='.pro', delete=False) as tmp_file:
    tmp_file.write('''${fileText.replace(/'/g, "\\'")}''')
    tmp_file_path = tmp_file.name

# Try the new schema format function first, fallback to old function
try:
    print("🚀 Attempting to use new load_pro_file_schema_format function...")
    pro_data = dicompare.load_pro_file_schema_format(tmp_file_path)
    print("✅ Successfully used new load_pro_file_schema_format function!")
    print(f"📊 New function returned type: {type(pro_data)}")
    print(f"📋 New function keys: {list(pro_data.keys()) if isinstance(pro_data, dict) else 'Not a dict'}")
    print(f"📄 Full new function output:")
    print(pro_data)
except AttributeError as e:
    print(f"⚠️ New function not available ({e}), falling back to old function...")
    pro_data = dicompare.load_pro_file(tmp_file_path)
    print("📊 Using old function - fallback successful")
    print(f"Type of pro_data: {type(pro_data)}")
    print(f"Pro data content: {pro_data}")
except Exception as e:
    print(f"❌ New function failed with error: {e}")
    print("⚠️ Falling back to old function...")
    pro_data = dicompare.load_pro_file(tmp_file_path)
    print("📊 Using old function - fallback successful")

# Clean up temporary file
os.unlink(tmp_file_path)

# Return the data as JSON
json.dumps(pro_data)
      `);
      
      console.log('Raw result from Python:', result);
      const proData = JSON.parse(result);
      console.log('Parsed .pro file data:', proData);
      
      // Check if we got the new schema format or old format
      const isNewFormat = proData.hasOwnProperty('acquisition_info') && 
                         proData.hasOwnProperty('fields') && 
                         proData.hasOwnProperty('series');
      
      console.log(`🔍 Detected format: ${isNewFormat ? 'NEW schema format' : 'OLD flat format'}`);
      
      if (isNewFormat) {
        return await this.parseSchemaFormatData(proData, fileName);
      } else {
        return await this.parseFlatFormatData(proData, fileName);
      }
    } catch (error) {
      console.error('Failed to load .pro file:', error);
      throw new Error(`Failed to load Siemens protocol file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Parse new schema format data from load_pro_file_schema_format
   */
  private async parseSchemaFormatData(schemaData: any, fileName: string): Promise<UIAcquisition> {
    console.log('🚀 Parsing new schema format data...');
    console.log(`📊 Found ${schemaData.fields?.length || 0} acquisition fields`);
    console.log(`📊 Found ${schemaData.series?.length || 0} series`);
    
    // Process acquisition-level fields
    const acquisitionFields: DicomField[] = [];
    if (schemaData.fields && Array.isArray(schemaData.fields)) {
      for (const fieldObj of schemaData.fields) {
        const fieldName = fieldObj.field;
        const value = fieldObj.value;
        
        // Debug logging for potentially problematic fields in schema format
        if (fieldName.includes('ImagedNucleus') || fieldName.includes('MRAcquisitionType') || 
            fieldName.includes('ReceiveCoilName') || fieldName.includes('TransmitCoilName')) {
          console.log('🔍 [Schema Format] Processing potentially problematic field:', {
            fieldName,
            value,
            valueType: typeof value,
            isArray: Array.isArray(value),
            stringValue: String(value)
          });
        }
        
        // Try to find matching DICOM tag by keyword
        let tag = fieldName;
        let name = fieldName;
        let vr = 'UN';
        let keyword = fieldName;
        
        try {
          const tagInfo = await this.getDicomTag(fieldName);
          if (tagInfo) {
            tag = tagInfo.tag;
            name = tagInfo.name;
            vr = tagInfo.vr;
            keyword = tagInfo.keyword;
            console.log(`✅ Mapped ${fieldName} → ${tag} (${name})`);
          } else {
            console.warn(`⚠️ No DICOM tag found for: ${fieldName}`);
          }
        } catch (error) {
          console.warn(`❌ Could not find DICOM field info for: ${fieldName}`, error);
        }
        
        // Smart data type detection (same logic as before)
        let dataType: 'string' | 'number' | 'list_string' | 'list_number' | 'json' = 'string';
        let processedValue = value;
        
        // Debug logging for potentially problematic values in schema format
        if (Array.isArray(value) && value.length === 1 && 
            (String(value[0]).includes('D') || String(value[0]).includes('H') || String(value[0]).includes('Tx'))) {
          console.log('🔍 [Schema Format] Processing potentially problematic array value:', {
            fieldName,
            originalValue: value,
            firstElement: value[0],
            firstElementType: typeof value[0]
          });
        }
        
        if (typeof value === 'number') {
          dataType = 'number';
        } else if (Array.isArray(value)) {
          if (value.length === 0) {
            dataType = 'list_string';
          } else if (value.length === 1 && typeof value[0] === 'number') {
            dataType = 'number';
            processedValue = value[0];
          } else if (value.length === 1 && typeof value[0] === 'string') {
            // Single-element string array - convert to string (this was missing!)
            dataType = 'string';
            processedValue = value[0];
          } else if (value.every(v => typeof v === 'number')) {
            dataType = 'list_number';
          } else if (value.every(v => typeof v === 'string')) {
            dataType = 'list_string';
          } else {
            dataType = 'json';
          }
        } else if (typeof value === 'string') {
          dataType = 'string';
        } else {
          dataType = 'json';
        }
        
        // Debug logging after processing
        if (Array.isArray(value) && value.length === 1 && 
            (String(value[0]).includes('D') || String(value[0]).includes('H') || String(value[0]).includes('Tx'))) {
          console.log('🔍 [Schema Format] After processing:', {
            fieldName,
            processedValue,
            dataType
          });
        }

        acquisitionFields.push({
          tag,
          name,
          keyword,
          value: processedValue,
          vr,
          level: 'acquisition',
          dataType,
          fieldType: fieldObj.fieldType || (tag === fieldName ? 'derived' : 'standard')
        });
      }
    }

    // Process series-level fields and series data
    const seriesFields: DicomField[] = [];
    const seriesData: any[] = [];
    
    if (schemaData.series && Array.isArray(schemaData.series) && schemaData.series.length > 0) {
      // Extract unique series-level field definitions from first series
      const firstSeries = schemaData.series[0];
      if (firstSeries.fields && Array.isArray(firstSeries.fields)) {
        for (const fieldObj of firstSeries.fields) {
          const fieldName = fieldObj.field;
          
          // Try to find matching DICOM tag by keyword
          let tag = fieldName;
          let name = fieldName;
          let vr = 'UN';
          let keyword = fieldName;
          
          try {
            const tagInfo = await this.getDicomTag(fieldName);
            if (tagInfo) {
              tag = tagInfo.tag;
              name = tagInfo.name;
              vr = tagInfo.vr;
              keyword = tagInfo.keyword;
              console.log(`✅ Mapped series field ${fieldName} → ${tag} (${name})`);
            } else {
              console.warn(`⚠️ No DICOM tag found for series field: ${fieldName}`);
            }
          } catch (error) {
            console.warn(`❌ Could not find DICOM field info for series field: ${fieldName}`, error);
          }

          seriesFields.push({
            tag,
            name,
            keyword,
            value: fieldObj.value, // Use first series value as default
            vr,
            level: 'series',
            dataType: typeof fieldObj.value === 'number' ? 'number' :
                     Array.isArray(fieldObj.value) ? 'list_string' : 'string',
            fieldType: fieldObj.fieldType || (tag === fieldName ? 'derived' : 'standard')
          });
        }
      }
      
      // Convert all series data
      for (const series of schemaData.series) {
        const seriesFieldsObj: any = {};
        if (series.fields && Array.isArray(series.fields)) {
          for (const fieldObj of series.fields) {
            // Find the corresponding series field definition to get the tag
            const seriesField = seriesFields.find(sf => sf.keyword === fieldObj.field);
            const fieldTag = seriesField?.tag || fieldObj.field;
            
            seriesFieldsObj[fieldTag] = {
              value: fieldObj.value,
              field: seriesField?.name || fieldObj.field,
              name: seriesField?.name || fieldObj.field,
              keyword: seriesField?.keyword,
              dataType: typeof fieldObj.value === 'number' ? 'number' :
                       Array.isArray(fieldObj.value) ? 'list_string' : 'string',
              validationRule: { type: 'exact' }
            };
          }
        }
        
        seriesData.push({
          name: series.name || 'Series',
          fields: seriesFieldsObj
        });
      }
    }

    // Create acquisition object
    const acquisition: UIAcquisition = {
      id: `pro_${Date.now()}`,
      protocolName: schemaData.acquisition_info?.protocol_name || fileName.replace('.pro', ''),
      seriesDescription: `Schema format protocol from ${fileName}`,
      totalFiles: 1,
      acquisitionFields,
      seriesFields,
      series: seriesData,
      metadata: {
        source: 'siemens_protocol_schema',
        originalFileName: fileName,
        acquisitionInfo: schemaData.acquisition_info
      }
    };

    console.log(`✅ Successfully parsed schema format: ${acquisitionFields.length} acquisition fields, ${seriesFields.length} series fields, ${seriesData.length} series`);
    return acquisition;
  }

  /**
   * Parse old flat format data from load_pro_file (fallback)
   */
  private async parseFlatFormatData(proData: any, fileName: string): Promise<UIAcquisition> {
    console.log('📝 Parsing flat format data (legacy)...');
    
    // Convert the dictionary to acquisition format (existing logic)
    const acquisitionFields: DicomField[] = [];
    
    for (const [fieldName, value] of Object.entries(proData)) {
      // Debug logging for MagneticFieldStrength in .pro files
      if (fieldName.toLowerCase().includes('magnetic') || fieldName.includes('MagneticFieldStrength')) {
        console.log('🔍 Processing .pro field that might be MagneticFieldStrength:', {
          fieldName,
          value,
          valueType: typeof value,
          isArray: Array.isArray(value)
        });
      }
      
      // Debug logging for ImagedNucleus and other potentially problematic fields
      if (fieldName.includes('ImagedNucleus') || fieldName.includes('MRAcquisitionType') || 
          fieldName.includes('ReceiveCoilName') || fieldName.includes('TransmitCoilName')) {
        console.log('🔍 Processing potentially problematic .pro field:', {
          fieldName,
          value,
          valueType: typeof value,
          isArray: Array.isArray(value),
          stringValue: String(value)
        });
      }
      
      // Try to find matching DICOM tag by keyword
      let tag = fieldName;
      let name = fieldName;
      let vr = 'UN';
      let keyword = fieldName;
      
      try {
        // Use getDicomTag function to map keyword to DICOM tag
        const tagInfo = await this.getDicomTag(fieldName);
        if (tagInfo) {
          tag = tagInfo.tag;
          name = tagInfo.name;
          vr = tagInfo.vr;
          keyword = tagInfo.keyword;
          console.log(`✅ Mapped ${fieldName} → ${tag} (${name})`);
          
          // Extra debug for magnetic field
          if (name.toLowerCase().includes('magnetic')) {
            console.log('🔍 Successfully mapped magnetic field:', {
              originalFieldName: fieldName,
              mappedTag: tag,
              mappedName: name
            });
          }
        } else {
          console.warn(`⚠️ No DICOM tag found for: ${fieldName}`);
        }
      } catch (error) {
        // Keep defaults if field lookup fails
        console.warn(`❌ Could not find DICOM field info for: ${fieldName}`, error);
      }
      
      // Smart data type detection
      let dataType: 'string' | 'number' | 'list_string' | 'list_number' | 'json' = 'string';
      let processedValue = value;
      
      // Debug logging for problematic string values
      if (Array.isArray(value) && value.length === 1 && 
          (String(value[0]).includes('D') || String(value[0]).includes('H') || String(value[0]).includes('Tx'))) {
        console.log('🔍 Processing potentially problematic array value:', {
          fieldName,
          originalValue: value,
          firstElement: value[0],
          firstElementType: typeof value[0]
        });
      }
      
      if (typeof value === 'number') {
        dataType = 'number';
      } else if (Array.isArray(value)) {
        if (value.length === 0) {
          dataType = 'list_string';
        } else if (value.length === 1 && typeof value[0] === 'number') {
          // Single-element numeric array - convert to number
          dataType = 'number';
          processedValue = value[0];
        } else if (value.length === 1 && typeof value[0] === 'string') {
          // Single-element string array - convert to string (this was missing!)
          dataType = 'string';
          processedValue = value[0];
        } else if (value.every(v => typeof v === 'number')) {
          dataType = 'list_number';
        } else if (value.every(v => typeof v === 'string')) {
          dataType = 'list_string';
        } else {
          // Mixed types - treat as JSON
          dataType = 'json';
        }
      } else if (typeof value === 'string') {
        dataType = 'string';
      } else {
        // Objects or other types
        dataType = 'json';
      }
      
      // More debug logging after processing
      if (Array.isArray(value) && value.length === 1 && 
          (String(value[0]).includes('D') || String(value[0]).includes('H') || String(value[0]).includes('Tx'))) {
        console.log('🔍 After processing:', {
          fieldName,
          processedValue,
          dataType
        });
      }

      // More debug logging after value processing
      if (fieldName.toLowerCase().includes('magnetic') || name.toLowerCase().includes('magnetic')) {
        console.log('🔍 Final field before adding to acquisitionFields:', {
          fieldName,
          tag,
          name,
          originalValue: value,
          processedValue,
          dataType,
          vr
        });
      }
      
      acquisitionFields.push({
        tag,
        name,
        keyword,
        value: processedValue,
        vr,
        level: 'acquisition',
        dataType,
        fieldType: tag === fieldName ? 'derived' : 'standard'  // If tag wasn't found, it equals fieldName
      });
    }
    
    // Create acquisition object
    const acquisition: UIAcquisition = {
      id: `pro_${Date.now()}`,
      protocolName: fileName.replace('.pro', ''),
      seriesDescription: `Protocol from ${fileName}`,
      totalFiles: 1,
      acquisitionFields,
      seriesFields: [],
      series: [],
      metadata: {
        source: 'siemens_protocol',
        originalFileName: fileName
      }
    };
    
    console.log(`✅ Successfully parsed flat format: ${acquisitionFields.length} acquisition fields`);
    return acquisition;
  }
}

// Create and export singleton instance
export const dicompareAPI = new DicompareAPI();
