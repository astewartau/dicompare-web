# Dicompare Data Flow Documentation

This document details the complete data flow for both the Generate Template and Check Compliance workflows, showing exactly what data enters the system, how it's transformed, what goes to the Python API, and what comes back.

## Core Data Types (Essential UI Fields Only)

### AnalysisResult
```typescript
interface AnalysisResult {
  acquisitions: Acquisition[];
}
```

### Acquisition  
```typescript
interface Acquisition {
  id: string;                        // Unique identifier
  protocolName: string;              // Displayed/editable in header
  seriesDescription: string;         // Displayed/editable in header
  totalFiles: number;                // Displayed in stats
  acquisitionFields: DicomField[];   // Fields constant across series
  seriesFields: DicomField[];        // Fields that vary per series
  series: Series[];                  // Individual series data
}
```

### DicomField
```typescript
interface DicomField {
  tag: string;                       // DICOM tag (e.g., "0008,0060")
  name: string;                      // Human-readable name
  value: any;                        // Field value
  vr: string;                        // Value Representation
  level: 'acquisition' | 'series';   // Field placement
  dataType: string;                  // Data type for formatting
  validationRule: ValidationRule;    // Validation configuration
}
```

### ValidationRule
```typescript
interface ValidationRule {
  type: 'exact' | 'tolerance' | 'range' | 'contains';
  value?: any;           // For exact matches and tolerance expected value
  tolerance?: number;    // For tolerance validation (±range)
  min?: number;          // For range validation (minimum)
  max?: number;          // For range validation (maximum)
  contains?: string;     // For substring matching
}
```

### Series
```typescript
interface Series {
  name: string;                      // Series identifier
  fields: Record<string, any>;       // Field values for this series
}
```

---

# Generate Template Data Flow

## Step 1: Build Schema (Upload/Load Data)

### User Input
- **File Upload**: User drags/drops DICOM files or clicks browse
- **Example Data**: User clicks "Load Example Data" button

### Frontend Processing
```typescript
// File upload - convert files to bytes
const files = [];

for (const file of Array.from(fileList)) {
  const content = await file.arrayBuffer();
  files.push({
    name: file.name,
    content: new Uint8Array(content)
  });
}

// OR example data (no file processing needed)
```

### Python API Call
```python
# Function: analyze_dicom_files
# Input: List of file objects with bytes
file_data = [
  {"name": "img001.dcm", "content": dicom_bytes_1},
  {"name": "img002.dcm", "content": dicom_bytes_2}
]

# API Call
result = dicompare.analyze_dicom_files(file_data)

# Output: AnalysisResult structure
{
  "acquisitions": [
    {
      "id": "t1_mprage_001",
      "protocol_name": "T1 MPRAGE", 
      "series_description": "T1_MPR_1mm_Sagittal",
      "total_files": 176,
      "acquisition_fields": [
        {
          "tag": "0008,0060",
          "name": "Modality", 
          "value": "MR",
          "vr": "CS",
          "level": "acquisition",
          "data_type": "string"
        }
      ],
      "series_fields": [
        {
          "tag": "0020,0013",
          "name": "Instance Number",
          "values": [1, 2, 3],  # Multiple values across series
          "vr": "IS", 
          "level": "series",
          "data_type": "number"
        }
      ],
      "series": [
        {
          "name": "Series 1",
          "field_values": {
            "0020,0013": 1
          }
        },
        {
          "name": "Series 2", 
          "field_values": {
            "0020,0013": 2
          }
        }
      ]
    }
  ]
}
```

### Frontend Transformation
```typescript
// Convert API format to UI format
const contextAcquisitions = acquisitions.map(acq => ({
  id: acq.id,
  protocolName: acq.protocol_name,
  seriesDescription: acq.series_description, 
  totalFiles: acq.total_files,
  acquisitionFields: acq.acquisition_fields.map(field => ({
    ...field,
    validationRule: { type: 'exact' }  // Default validation
  })),
  seriesFields: acq.series_fields.map(field => ({
    ...field,
    value: field.values?.[0] || field.value,  // Take first value as default
    validationRule: { type: 'exact' }
  })),
  series: acq.series.map(series => ({
    name: series.name,
    fields: series.field_values  // Direct mapping
  }))
}));

// Store in AcquisitionContext
setAcquisitions(contextAcquisitions);
```

### User Configuration Phase
- User edits acquisition names and descriptions
- User configures validation rules for each field:
  - Exact match: `{ type: 'exact', value: 'MR' }`
  - Range: `{ type: 'range', min: 1.5, max: 3.0 }`
  - Tolerance: `{ type: 'tolerance', value: 2000, tolerance: 50 }`
  - Contains: `{ type: 'contains', contains: 'MPRAGE' }`
- User converts fields between acquisition/series levels
- User adds/removes fields and series
- All changes stored in React AcquisitionContext

## Step 2: Enter Metadata

### User Input
```typescript
interface TemplateMetadata {
  name: string;          // "Clinical Research Template"
  description: string;   // Optional description
  authors: string[];     // ["Dr. Smith", "Dr. Jones"]  
  version: string;       // "1.0"
}
```

### Processing
- All data stored in local React state
- No API calls required
- Form validation ensures required fields are filled

## Step 3: Download Schema (Generate Template)

### Data Preparation
```typescript
// Combine acquisition configuration + metadata
const acquisitionsForAPI = acquisitions.map(acq => ({
  id: acq.id,
  name: acq.protocolName,
  acquisition_fields: acq.acquisitionFields.map(field => ({
    tag: field.tag,
    name: field.name,
    validation_rule: field.validationRule,
    level: field.level,
    data_type: field.dataType
  })),
  series_fields: acq.seriesFields.map(field => ({
    tag: field.tag, 
    name: field.name,
    validation_rule: field.validationRule,
    level: field.level,
    data_type: field.dataType
  })),
  series: acq.series
}));

const metadata = {
  name: templateName,
  version: templateVersion,
  description: templateDescription,
  authors: templateAuthors,
  created: new Date().toISOString()
};
```

### Python API Call
```python
# Function: generate_validation_template
# Input: Configured acquisitions + metadata
result = dicompare.generate_validation_template(acquisitionsForAPI, metadata)

# Output: Complete validation template
{
  "template": {
    "version": "1.0",
    "name": "Clinical Research Template",
    "description": "Standard validation template",
    "created": "2024-01-15T10:30:00Z",
    "acquisitions": {
      "t1_mprage": {
        "name": "T1 MPRAGE",
        "fields": [
          {
            "tag": "0008,0060",
            "name": "Modality",
            "required": true,
            "validation_rule": {
              "type": "exact",
              "value": "MR"
            }
          },
          {
            "tag": "0018,0087",
            "name": "Magnetic Field Strength", 
            "required": true,
            "validation_rule": {
              "type": "tolerance",
              "value": 3.0,
              "tolerance": 0.1
            }
          },
          {
            "tag": "0008,103E",
            "name": "Series Description",
            "required": false,
            "validation_rule": {
              "type": "contains", 
              "contains": "MPRAGE"
            }
          }
        ]
      }
    }
  }
}
```

### Frontend Output
```typescript
// Convert Python API response to downloadable files
const templateObj = await dicompareAPI.generateTemplate(acquisitionsForAPI, metadata);

// Create JSON download
const jsonContent = JSON.stringify(templateObj.template, null, 2);
const jsonBlob = new Blob([jsonContent], { type: 'application/json' });
const jsonUrl = URL.createObjectURL(jsonBlob);

// Create Python script download  
const pythonContent = generatePythonScript(templateObj);
const pythonBlob = new Blob([pythonContent], { type: 'text/python' });
const pythonUrl = URL.createObjectURL(pythonBlob);

// Trigger downloads
downloadFile(jsonUrl, `${templateName}.json`);
downloadFile(pythonUrl, `${templateName}.py`);
```

- Frontend converts API objects to downloadable files
- User can create multiple templates
- No file creation in Python - just object generation

---

# Check Compliance Data Flow

## Step 1: Load & Match DICOM Data

### Phase 1: Load DICOM Data
**Same as Generate Template Step 1** - identical `analyze_dicom_files` call and transformation.

### Phase 2: Load Schema Options

#### Repository Schemas (from JSON Files)
```typescript
// Load schema index from repository
const schemaIndex = await fetch('/schemas/index.json');
const availableSchemas = await schemaIndex.json();

// Schema index structure
[
  {
    "id": "brain_mri_basic",
    "name": "Brain MRI Basic Protocol", 
    "description": "Standard brain MRI validation",
    "category": "Neuroimaging",
    "filename": "brain_mri_basic.json"
  }
]

// Load specific schema content when needed
const schemaResponse = await fetch(`/schemas/${schemaId}.json`);
const schemaContent = await schemaResponse.text();
```

#### Uploaded Schemas (from Browser Storage)
```typescript
// From SchemaContext/SchemaCacheManager
interface SchemaMetadata {
  id: string;
  title: string;        // Display name
  version: string;
  authors: string[];
  format: 'json' | 'python';
  description?: string;
  // File content stored separately in IndexedDB
}

// Load uploaded schema content
const schemaContent = await schemaContext.getSchemaContent(schemaId);
```

### Phase 3: Schema-Acquisition Pairing
```typescript
// User pairs each acquisition with a schema
const pairings: Record<string, string> = {
  "acquisition_id_1": "schema_id_1",
  "acquisition_id_2": "schema_id_2"
};
```

## Step 2: Compliance Validation (Export Report)

### Data Preparation
```typescript
// For each paired acquisition-schema combination
const dicomData = {
  acquisitions: [selectedAcquisition],  // Single acquisition
  // Other summary data not needed for validation
};

const schemaContent = await getSchemaContent(schemaId);  // JSON string
const format = "json";
```

### Python API Call (Per Pairing)
```python
# Function: validate_compliance  
# Input: DICOM analysis result + schema content string
dicom_data = {
  "acquisitions": [selectedAcquisition],  # Single acquisition
}

schema_content = '''
{
  "metadata": {"name": "Brain MRI Protocol"},
  "acquisitions": {
    "t1_weighted": {
      "fields": [
        {"tag": "0008,0060", "validation_rule": {"type": "exact", "value": "MR"}}
      ]
    }
  }
}
'''

result = dicompare.validate_compliance(dicom_data, schema_content, "json")

# Output: Detailed compliance report
{
  "compliance_report": {
    "overallStatus": "fail",
    "fieldResults": [
      {
        "fieldPath": "0008,0060",
        "fieldName": "Modality", 
        "status": "pass",
        "expectedValue": "MR",
        "actualValue": "MR",
        "message": "Field validation passed"
      },
      {
        "fieldPath": "0018,0087", 
        "fieldName": "Magnetic Field Strength",
        "status": "fail", 
        "expectedValue": "3.0 ±0.1",
        "actualValue": "1.5",
        "message": "Value 1.5 outside tolerance range [2.9, 3.1]"
      },
      {
        "fieldPath": "0008,103E", 
        "fieldName": "Series Description",
        "status": "pass",
        "expectedValue": "contains 'MPRAGE'",
        "actualValue": "T1_MPRAGE_1mm",
        "message": "Field contains required substring"
      }
    ],
    "summary": {
      "total": 25,
      "passed": 22, 
      "failed": 3
    }
  }
}
```

### Frontend Processing
```typescript
// Aggregate all compliance reports
const allComplianceResults = await Promise.all(
  pairedAcquisitions.map(async (pairing) => {
    const report = await dicompareAPI.validateCompliance(
      pairing.dicomData, 
      pairing.schemaContent, 
      "json"
    );
    return {
      acquisitionId: pairing.acquisitionId,
      schemaName: pairing.schemaName,
      report: report.compliance_report
    };
  })
);

// Display results in UI tables
// Export comprehensive compliance report
```

---

# Key Data Transformation Points

## 1. File Upload → Python Analysis
- **Input**: Raw DICOM files or file paths
- **Transformation**: DICOM parsing and metadata extraction
- **Output**: Structured acquisition data with field analysis

## 2. Python API → UI Format  
- **Input**: Snake_case API response with nested structures
- **Transformation**: Convert to camelCase, flatten some structures, add UI defaults
- **Output**: React-friendly data structures

## 3. UI Configuration → Python Template
- **Input**: User-configured acquisitions with validation rules
- **Transformation**: Combine acquisition config + metadata into template structure
- **Output**: Complete validation template

## 4. Schema + DICOM → Compliance
- **Input**: DICOM analysis result + validation schema (JSON string)
- **Transformation**: Field-by-field validation against schema rules
- **Output**: Detailed compliance report with pass/fail status

## 5. React Context State Management
- **AcquisitionContext**: Manages acquisition list and field configurations (Generate Template)
- **SchemaContext**: Manages uploaded schema files and metadata (Check Compliance)
- **Local State**: Manages UI interactions, form data, and temporary state

## API Dependencies Summary

**Essential Functions:**
- `analyzeFiles()` - Core DICOM analysis (both workflows) - **Updated to use bytes**
- `generateTemplate()` - Template creation (Generate Template only)
- `validateCompliance()` - Compliance checking (Check Compliance only)
- `getExampleDicomData()` - Demo DICOM data (both workflows)
- `getExampleDicomDataForUI()` - UI-formatted demo data (both workflows)

**Removed Functions:**
- `getExampleSchemas()` - Replaced by repository JSON files + fetch()

**Data Flow Characteristics:**
- **Stateful Frontend**: React contexts maintain user configurations
- **Stateless Backend**: Python API functions are pure, no session state
- **Batch Operations**: Multiple acquisitions/schemas processed independently
- **Progressive Enhancement**: User can configure default API responses before final processing