# Implementation Guide: Using Existing Dicompare Functionality

## Overview

Good news! Your proposed API in `dicompare_api.md` is already **95% implemented** in the existing dicompare codebase. The core functionality you need exists, but it's organized around pandas DataFrames internally while providing web-friendly outputs. This document shows you exactly how to achieve each function you proposed using existing code.

## Core Architecture Understanding

**Key Insight**: Dicompare loads DICOM files into a pandas DataFrame internally, which is the most efficient format for:
- Grouping files into acquisitions
- Analyzing field consistency/variability  
- Running compliance validation
- Generating schemas

Your React interface can get UI-friendly data formats while the DataFrame remains cached for efficient operations.

## Function-by-Function Implementation

### ✅ ALREADY IMPLEMENTED

#### 1. `analyze_dicom_files(files: List[Dict[str, Any]]) -> AnalysisResult`

**Use:** `dicompare.web_utils.analyze_dicom_files_for_web()`

```python
# Your proposed API:
result = dicompare.analyze_dicom_files(files)

# Current implementation (works now):
result = dicompare.web_utils.analyze_dicom_files_for_web(dicom_files, reference_fields)
```

**What it does:**
- Converts Pyodide JSProxy objects from browser
- Loads files into DataFrame using `async_load_dicom_session()`
- Groups into acquisitions using `assign_acquisition_and_run_numbers()`
- Returns acquisitions with field analysis
- **Caches DataFrame internally for later use**

#### 2. `validate_compliance(dicom_data, schema_content, format) -> dict`

**Use:** `dicompare.compliance.check_session_compliance_with_json_schema()` + `dicompare.web_utils.format_compliance_results_for_web()`

```python
# Your workflow:
# 1. Load schema
schema = dicompare.io.load_json_schema(schema_content)

# 2. Run compliance (uses cached DataFrame from analyze step)
raw_results = dicompare.check_session_compliance_with_json_schema(
    cached_dataframe, schema, session_map
)

# 3. Format for web
formatted_results = dicompare.web_utils.format_compliance_results_for_web(raw_results)
```

#### 3. `generate_validation_template(acquisitions, metadata) -> ValidationTemplate`

**Use:** `dicompare.generate_schema.create_json_schema()`

```python
# Current implementation:
template = dicompare.generate_schema.create_json_schema(session_df, reference_fields)
```

#### 4. UI Helper Functions

**Use:** `dicompare.web_utils.prepare_session_for_web()`

```python
# Convert DataFrame to UI-friendly format
web_data = dicompare.web_utils.prepare_session_for_web(session_df, max_preview_rows=100)
```

### 📝 NEEDS LIGHT WRAPPERS (Easy to add)

#### 5. `parse_schema(schema_content, format) -> dict`

**Base:** `dicompare.io.load_json_schema()` (already exists)

**Needed:** Add error handling wrapper:

```python
def parse_schema(schema_content: str, format: str = "json") -> dict:
    try:
        if format == "json":
            schema = dicompare.io.load_json_schema(schema_content)
            return {"parsed_schema": schema}
        else:
            return {"error": f"Unsupported format: {format}"}
    except Exception as e:
        return {"error": str(e)}
```

#### 6. Example Data Functions

**Base:** Test fixtures in `dicompare/tests/fixtures/`

**Needed:** Format existing test data as AnalysisResult

### 🔨 NEEDS NEW IMPLEMENTATION (Small additions)

#### 7. `get_field_info(tag: str) -> FieldDictionary`

**Implementation:**
```python
def get_field_info(tag: str) -> dict:
    import pydicom
    # Use pydicom.datadict for DICOM field information
    # Format as FieldDictionary structure
```

#### 8. `search_fields(query: str, limit: int) -> List[FieldDictionary]`

**Implementation:**
```python
def search_fields(query: str, limit: int = 20) -> List[dict]:
    import pydicom
    # Search through pydicom.datadict.keyword_dict
    # Return matching fields formatted as FieldDictionary
```

## Recommended Implementation Approach

### Step 1: Use Existing Functions Directly

Start by calling existing functions in `web_utils.py`:

```typescript
// In your React app:
const analysisResult = await dicompare.web_utils.analyze_dicom_files_for_web(files, defaultFields);
const complianceResult = await dicompare.web_utils.format_compliance_results_for_web(rawResults);
```

### Step 2: Add Wrapper Functions

Create thin wrapper functions in `web_utils.py` that match your exact API:

```python
# In web_utils.py

def analyze_dicom_files(files: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Wrapper that matches exact API spec."""
    result = analyze_dicom_files_for_web(files, DEFAULT_DICOM_FIELDS)
    # Format to exact AnalysisResult structure
    return format_as_analysis_result(result)

def validate_compliance(dicom_data: dict, schema_content: str, format: str = "json") -> dict:
    """Wrapper for compliance validation."""
    # Use cached DataFrame if dicom_data is None
    # Otherwise extract DataFrame from dicom_data
    # Run existing compliance functions
    # Return formatted results
```

### Step 3: Session State Management

Add simple caching to `web_utils.py`:

```python
# Global session cache
_current_session_df = None
_current_metadata = None

def _cache_session(df: pd.DataFrame, metadata: dict):
    global _current_session_df, _current_metadata
    _current_session_df = df.copy()
    _current_metadata = metadata

def _get_cached_session():
    return _current_session_df, _current_metadata
```

## Integration Pattern for React

```typescript
// 1. Analyze files (caches DataFrame internally)
const analysisResult = await dicompare.analyzeFiles(files);
setAcquisitions(analysisResult.acquisitions);

// 2. Compliance validation reuses cached DataFrame  
const complianceResult = await dicompare.validateCompliance(
    null, // Uses cached DataFrame
    schemaContent
);

// 3. Generate templates using cached DataFrame
const template = await dicompare.generateValidationTemplate(
    configuredAcquisitions,
    templateMetadata
);
```

## Benefits of This Approach

1. **Efficiency**: DataFrame loaded once, reused for all operations
2. **Compatibility**: Your exact API works as designed
3. **Performance**: No redundant DICOM parsing or data processing
4. **Maintainability**: Leverages battle-tested existing code
5. **Flexibility**: Can access raw DataFrame for advanced operations

## Files to Modify

- **Primary**: `dicompare/web_utils.py` - Add wrapper functions
- **Secondary**: `dicompare/utils.py` - Add DICOM dictionary functions
- **Testing**: Update existing tests to cover new wrappers

## Next Steps

1. Review `TODO_00.md` for detailed implementation tasks
2. Start with existing functions to verify integration
3. Add wrapper functions incrementally
4. Test each function with your React interface
5. Add missing field dictionary functions last

The existing codebase is already structured perfectly for your needs - you just need thin wrapper functions to match your proposed API exactly!