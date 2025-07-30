# DICOMpare Mock Data and UI Improvements - Analysis & TODO

This repository is an initial 'darft' implementation of a React frontend for DICOM validation and benefits from the underlying dicompare pip package in ../dicompare-pip.

This draft repository was built in one shot based on a request that described only the functionality of the site and nothing about the underlying pip package. It is a great start, but because the functionality of the underlying package was not described or provided, it is missing some key pieces of understanding. 

This file contains insights and TODOs to fix the current draft implementation. Importantly, the draft should STILL not try to actually build functionality or integrate with the underlying pip package, instead merely demonstrating the interface and interactions using mock data. The mock components should be kept nicely separated from the UI in a way that makes it easy to swap out later with real interactions with dicompare.

Of upmost importance is that you do NOT attempt to implement logic that would be handled by the dicompare pip package. It is important that this repository still represents a mock UI. Specifically, do NOT implement ANY code that attempts to do anything such as:

 - Identify DICOM acquisitions
 - Upload DICOM files
 - Compare DICOM fields against a schema
 - Produce compliance reports
 - etc.

## Key Insights from Python Package Analysis

### 1. Acquisition vs Series Field Classification (Current Understanding WRONG)

**What I learned from the real implementation:**

- **Acquisition-Level Fields**: Fields that have **exactly one unique value** across all DICOM files within an acquisition
  - Examples: `Manufacturer`, `MagneticFieldStrength`, `RepetitionTime` (when constant), `SequenceName`, `SliceThickness`
  - Stored in acquisition's `"fields"` array in JSON schema
  
- **Series-Level Fields**: Fields that have **multiple unique values** within the same acquisition 
  - Most important: `ImageType` (e.g., `["ORIGINAL", "PRIMARY", "M", "ND"]` vs `["ORIGINAL", "PRIMARY", "P", "ND"]`)
  - Also: `SeriesNumber`, sometimes `EchoTime` (in multi-echo sequences)
  - Stored in `"series"` array, where each series represents a unique combination of varying field values

**My Mock Data Mistakes:**
- Arbitrarily assigned fields to acquisition vs series levels
- Didn't understand that classification depends on whether values are constant or variable
- Oversimplified series structure - real differentiation is much more nuanced

### 2. Real Schema Structure Patterns

From HCP example schemas:
- Most fields (60+) are acquisition-level (constant)
- Series-level variations are minimal - usually 1-3 fields max
- Typical series count: 1-2 per acquisition
- Each series has only the fields that actually vary

### 3. Acquisition Detection Logic

- Primary grouping by `ProtocolName`
- Secondary grouping by 60+ technical parameters from `DEFAULT_SETTINGS_FIELDS`
- System creates "acquisition signatures" combining protocol + settings
- Different settings of same protocol → separate acquisitions

### 4. Field Categories & Priorities

- **Core ID**: `ProtocolName`, `SeriesDescription`, `SequenceName`
- **Critical params**: `RepetitionTime`, `EchoTime`, `FlipAngle`, `SliceThickness`  
- **Hardware**: `Manufacturer`, `MagneticFieldStrength`, `ReceiveCoilName`
- **Advanced**: `DiffusionBValue`, `MultibandFactor`, `ParallelReductionFactorInPlane`

## Interactive Schema Creation Requirements

### 5. Manual Field Entry & Search

**Current Problem**: Scrolling through long DICOM field lists is impractical

**Requirements**:
- **Search/filter functionality** for DICOM field selection
- **Manual text entry** for field names (with validation)
- **Comprehensive field list** from: https://raw.githubusercontent.com/astewartau/dcm-check/refs/heads/main/valid_fields.json
- **Auto-complete/suggestions** as user types

### 6. Custom Data Types & Validation Constraints

**Field value types needed**:
- `number` (integer or float)
- `string` 
- `list of strings` (e.g., `["ORIGINAL", "PRIMARY", "M", "ND"]`)
- `list of numbers` (e.g., `[1.25, 1.25]` for PixelSpacing)
- `raw JSON` (for complex nested structures)

**Validation constraint types** (from pytest analysis):
- `exact`: Field must match exactly (case-insensitive, whitespace-trimmed)
- `tolerance`: Numeric fields allow ±tolerance difference (e.g., `2000 ± 50`)
- `contains`: String fields must contain substring (e.g., "BOLD" in "BOLD_task")
- `range`: Numeric fields within min/max bounds
- `custom`: Python-based validation logic for complex rules

**UI Requirements**:
- **Data type selector** for each field
- **Validation constraint selector** (exact/tolerance/contains/range/custom)
- **Constraint value inputs** (tolerance amount, substring, min/max, etc.)
- **Appropriate input widgets** based on selected type and constraint
- **Multi-level validation status**: OK/ERROR/WARNING/NA (not just pass/fail)
- **JSON editor** for raw JSON type and custom constraints

### 7. Series-Level Field Conversion Workflow

**Key Insight**: Series exist ONLY to separate multiple value combinations - a single series is invalid.

**User Workflow**:

1. **Start with acquisition-level field**:
   - User adds `EchoTime` as acquisition field with value `3.25`

2. **Convert to series when multiple values needed**:
   - User clicks "Convert to Series" on `EchoTime`
   - System creates Series 1 with `EchoTime: 3.25`
   - "Add Series" button appears

3. **Add additional series**:
   - User clicks "Add Series" → Series 2 created
   - Both series have `EchoTime` field, user can set different values

4. **Add related varying fields**:
   - User realizes `ImageType` also varies with `EchoTime`
   - Converts `ImageType` to series-level
   - Current `ImageType` value appears in all existing series
   - User can customize `ImageType` for each series individually

**UI Components Needed**:
- "Convert to Series" button on acquisition-level fields
- "Add Series" button when series-level fields exist
- "Remove Series" functionality
- Clear visual distinction between acquisition and series sections
- Ability to convert series-level fields back to acquisition-level

### 8. Series Management Rules

**Validation Rules**:
- Must have at least 2 series if any series-level fields exist
- All series must have values for all series-level fields
- Series combinations should be unique (no duplicate combinations)

**UI Behavior**:
- When last series is deleted, convert remaining series-level fields back to acquisition-level
- When converting field to series-level, show in all existing series
- Warn when creating duplicate series combinations

## Implementation TODOs

### Architecture & Data Separation

1. **Maintain Clean Data Layer Separation**:
   - [x] Keep all mock data isolated in `src/data/` directory
   - [x] Create separate modules for different data types (fields, templates, reports)
   - [x] Use lightweight data services/hooks to access mock data
   - [x] Create data factories for generating test data on-demand

2. **Prevent File Size Bloat**:
   - [x] Split large mock data files into focused, smaller modules
   - [x] Cache fetched external data (DICOM field list) efficiently
   - [x] Avoid duplicating data structures across files

3. **Don't Over-Engineer**:
   - [x] Start with simple data structures, refactor when needed
   - [x] Use existing patterns rather than creating new abstractions
   - [x] Keep mock data realistic but not overly complex
   - [x] Prioritize readable code over premature optimization

### Immediate Fixes Needed

4. **Update Mock Data Structure** (Based on Pytest Analysis):
   - [x] Fix acquisition vs series field classification using real logic from tests:
     - Most fields (40+) should be acquisition-level (constant within acquisition)
     - Only 1-3 fields typically vary per acquisition (series-level)
     - `ImageType` is primary series differentiator in most cases
   - [x] Add realistic field distributions:
     - T1 MPRAGE: ~50 acquisition fields, `ImageType` + `SeriesNumber` series fields
     - BOLD: ~45 acquisition fields, `EchoTime` + `ImageType` series fields  
     - DTI: ~40 acquisition fields, `DiffusionBValue` + `ImageType` series fields
   - [x] Include proper constraint examples:
     - Exact matches: `Manufacturer = "SIEMENS"`
     - Tolerance: `RepetitionTime = 2000 ± 50`
     - Contains: `ProtocolName contains "BOLD"`
     - Range: `FlipAngle between 8-12°`
   - [x] Add medical realism to mock data:
     - Proper TR/TE/FA combinations for different sequences
     - Realistic scanner parameters (3T field strength, proper bandwidth values)
     - Multi-echo patterns (10ms, 20ms, 30ms spacing)
   - [x] Split into focused files with realistic data volumes

5. **Fetch DICOM Field List**:
   - [x] Create lightweight service to fetch from https://raw.githubusercontent.com/astewartau/dcm-check/refs/heads/main/valid_fields.json
   - [x] Cache field list locally to avoid repeated fetches
   - [x] Parse and structure field list for UI components
   - [x] Add field descriptions/metadata if available
   - [x] Implement search/filter logic in data layer, not components

### New UI Components Needed

6. **Enhanced Field Selection**:
   - [x] `DicomFieldSelector` component with search/filter
   - [x] Auto-complete functionality
   - [x] Manual text entry with validation
   - [x] Field type detection/suggestion

7. **Data Type & Constraint Management**:
   - [x] `DataTypeSelector` component (number/string/list_string/list_number/json)
   - [x] `ValidationConstraintSelector` component (exact/tolerance/contains/range/custom)
   - [x] Dynamic constraint input widgets:
     - Tolerance: number input for ±value
     - Contains: text input for substring
     - Range: min/max number inputs
     - Custom: code editor for Python logic
   - [x] Type-specific input widgets based on data type

8. **Advanced Validation Display**:
   - [x] `ComplianceStatusBadge` component (OK/ERROR/WARNING/NA with colors)
   - [ ] Validation result details with constraint-specific messaging
   - [ ] Multi-level error reporting (acquisition vs series vs field level)
   - [ ] Case-insensitive match indicators
   - [ ] Tolerance range visualization (e.g., "2000 ± 50 = 1950-2050")

9. **Series Management Components**:
   - [x] `SeriesFieldManager` component
   - [x] "Convert to Series" functionality
   - [x] "Add/Remove Series" controls
   - [x] Series validation logic
   - [x] Visual separation of acquisition vs series fields
   - [ ] Series constraint inheritance (when converting acquisition field to series)

### Enhanced BuildSchema Component

10. **Restructure BuildSchema Workflow**:
   - [x] Separate acquisition-level and series-level field sections clearly
   - [x] Add field conversion functionality with constraint preservation
   - [x] Implement realistic series management (based on pytest patterns):
     - Most acquisitions have 0-2 series only
     - Series differentiated primarily by `ImageType` variations
     - Series naming: "Series 1", "Series 2", etc.
   - [x] Add sophisticated validation constraint setting per field
   - [x] Show field data types and constraints clearly in UI

### Data Layer Updates

7. **Restructure Mock Data for Maintainability**:
   - [x] Split `mockData.ts` into focused modules:
     - `mockFields.ts` - DICOM field definitions and metadata
     - `mockAcquisitions.ts` - Sample acquisition data
     - `mockTemplates.ts` - Example templates/schemas
     - `mockReports.ts` - Compliance reports and public data
   - [x] Create lightweight data access services in `src/services/`
   - [x] Use data factories for generating variations on-demand
   - [x] Keep individual files under reasonable size limits (~200-300 lines)

8. **Enhanced Types (Keep Minimal)**:
   - [x] Update TypeScript interfaces for new field structures
   - [x] Add validation constraint types:
     ```typescript
     type ValidationConstraint = 'exact' | 'tolerance' | 'contains' | 'range' | 'custom'
     type ComplianceStatus = 'OK' | 'ERROR' | 'WARNING' | 'NA'
     ```
   - [x] Include proper data type enums:
     ```typescript
     type FieldDataType = 'number' | 'string' | 'list_string' | 'list_number' | 'json'
     ```
   - [x] Add field constraint interface:
     ```typescript
     interface FieldConstraint {
       type: ValidationConstraint
       value?: any
       tolerance?: number
       min?: number
       max?: number
       contains?: string
       customLogic?: string
     }
     ```
   - [x] Avoid complex type hierarchies - prefer simple, flat structures

## User Experience Flow

### Ideal Schema Creation Flow:
1. Upload DICOM files → Auto-detect acquisitions and field classifications
2. Review detected fields → Manually adjust acquisition/series classifications
3. Add custom fields → Search/select from comprehensive field list
4. Configure field types → Set appropriate data types
5. Manage series → Convert fields and create multiple series as needed
6. Validate schema → Ensure logical consistency
7. Export schema → Download in JSON/Python formats

This comprehensive approach will make the schema creation process much more flexible and aligned with real DICOM data structures while providing an intuitive user interface for complex field management.
