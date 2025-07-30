# TODO_04.md - Data Architecture Restructuring

## Overview
Restructure the data architecture to have a clean separation between UI metadata management and Python domain logic. This implements a realistic workflow where schemas are uploaded/cached in the browser, while DICOM analysis and compliance checking happens via the Python mock API.

## Current Issues
- ❌ CheckCompliance and Generate Template use different DICOM data sources
- ❌ Compliance validation logic is split between TypeScript and Python
- ❌ Schema templates are hardcoded in TypeScript instead of being user-uploadable
- ❌ Inconsistent data flow makes real implementation harder to replace

## Target Architecture

### Data Source Responsibility
- **TypeScript (Web Layer)**: Schema metadata, UI state, file management, caching
- **Python Mock API**: DICOM domain knowledge, schema parsing, compliance analysis, example data

### New Data Flow
```
User uploads schema → Browser cache (metadata + file)
↓
Select schema → Send to Python API for parsing
↓
Load DICOM data → Python API (same source as Generate Template)
↓
Perform compliance → Python API using schema rules
↓
Display results → TypeScript UI with Python results
```

## Implementation Plan

### Phase 1: Schema Cache Management
#### 1.1 Create Schema Cache Infrastructure
- [ ] **Create `SchemaCacheManager` class** (`src/services/SchemaCacheManager.ts`)
  - [ ] Use IndexedDB for large schema files
  - [ ] Store metadata separately for fast access
  - [ ] Handle schema CRUD operations
  - [ ] Add schema validation (basic JSON/syntax checking)

- [ ] **Define Schema Metadata Interface**
  ```typescript
  interface SchemaMetadata {
    id: string;
    filename: string;
    title: string;
    version: string;
    authors: string[];
    uploadDate: string;
    fileSize: number;
    format: 'json' | 'python';
    isValid: boolean;
    description?: string;
    acquisitionCount?: number; // extracted from basic parsing
  }
  ```

- [ ] **Create Schema Context** (`src/contexts/SchemaContext.tsx`)
  - [ ] Manage cached schema metadata
  - [ ] Handle schema selection state
  - [ ] Provide schema upload/delete operations
  - [ ] Cache invalidation and refresh

#### 1.2 Schema Upload & Management UI
- [ ] **Create Schema Upload Component** (`src/components/schema/SchemaUploadModal.tsx`)
  - [ ] File drop zone for JSON/Python schema files
  - [ ] Extract metadata from uploaded files
  - [ ] Basic validation before caching
  - [ ] Progress indication for large files

- [ ] **Create Schema Management Interface** (`src/components/schema/SchemaManager.tsx`)
  - [ ] List all cached schemas with metadata
  - [ ] Delete/rename operations
  - [ ] Import/export functionality
  - [ ] Schema validation status indicators

### Phase 2: Python API Extensions
#### 2.1 Extend Python Mock API
- [ ] **Add Schema Parsing** (update `PyodideManager.ts`)
  ```python
  def parse_schema(self, schema_content: str, format: str = 'json') -> Dict:
      """Parse uploaded schema file and extract detailed validation rules"""
      # Parse JSON or Python schema format
      # Extract field requirements, validation rules, constraints
      # Return structured schema definition
  ```

- [ ] **Add Compliance Analysis**
  ```python
  def validate_compliance(self, dicom_data: Dict, schema_content: str) -> Dict:
      """Perform real compliance checking using schema rules vs DICOM data"""
      # Parse both DICOM data and schema
      # Apply validation rules to each field
      # Return detailed compliance report with pass/fail/warning status
  ```

- [ ] **Add Example Schemas**
  ```python
  def get_example_schemas(self) -> List[Dict]:
      """Return pre-loaded example schemas for demo purposes"""
      # Return realistic validation templates
      # Include various types: structural MRI, fMRI, DTI, etc.
  ```

- [ ] **Unify DICOM Data Source**
  ```python
  def get_example_dicom_data(self) -> Dict:
      """Return example DICOM data (same as Generate Template)"""
      # Ensure CheckCompliance uses same rich data as Generate Template
  ```

#### 2.2 Update DicompareAPI TypeScript Wrapper
- [ ] **Add new API methods** (`src/services/DicompareAPI.ts`)
  ```typescript
  async parseSchema(schemaContent: string, format: string): Promise<ParsedSchema>
  async validateCompliance(dicomData: any, schemaContent: string): Promise<ComplianceReport>
  async getExampleSchemas(): Promise<SchemaTemplate[]>
  async getExampleDicomData(): Promise<AnalysisResult>
  ```

### Phase 3: Data Migration
#### 3.1 Move DICOM Data to Python API
- [ ] **Update CheckCompliance DICOM Source**
  - [ ] Change `DataLoadingAndMatching.tsx` to use `dicompareAPI.getExampleDicomData()`
  - [ ] Remove dependency on `mockAcquisitions.ts`
  - [ ] Ensure consistent data structure with Generate Template

- [ ] **Add Python DICOM Field Dictionary**
  - [ ] Expand field dictionary in Python API with validation hints
  - [ ] Include common values, typical ranges, tolerance levels
  - [ ] Add field relationships and dependencies

#### 3.2 Move Schema Templates to Python API
- [ ] **Convert mockTemplates to Python**
  - [ ] Move template definitions from `mockTemplates.ts` to Python API
  - [ ] Convert to realistic schema file format
  - [ ] Add comprehensive validation rules

- [ ] **Create Schema Examples in Python**
  - [ ] T1 MPRAGE validation schema
  - [ ] BOLD fMRI validation schema
  - [ ] DTI validation schema
  - [ ] Multi-modal protocol schema

#### 3.3 Move Compliance Logic to Python API
- [ ] **Implement Real Compliance Checking**
  - [ ] Replace `mockComplianceService.ts` logic with Python API calls
  - [ ] Use actual schema validation rules instead of hardcoded logic
  - [ ] Support exact match, range, tolerance, contains validation types

- [ ] **Update Compliance Results**
  - [ ] Modify `ComplianceFieldTable.tsx` to use Python API results
  - [ ] Handle loading states for API calls
  - [ ] Maintain same UI but with real data

### Phase 4: UI Integration & Updates
#### 4.1 Update CheckCompliance Workflow
- [ ] **Modify DataLoadingAndMatching** (`src/components/compliance/DataLoadingAndMatching.tsx`)
  - [ ] Use Python API for DICOM data loading
  - [ ] Show schema selection from cached metadata
  - [ ] Send selected schema to Python API for detailed parsing
  - [ ] Display compliance results from Python API

- [ ] **Update Schema Selection UI**
  - [ ] Show cached schema metadata in selection interface
  - [ ] Add "Upload New Schema" option
  - [ ] Display schema details when selected (from Python API)
  - [ ] Handle schema loading states

#### 4.2 Add Schema Management Features
- [ ] **Add Schema Upload to CheckCompliance**
  - [ ] Upload button in header/navigation
  - [ ] Integration with schema cache manager
  - [ ] Immediate availability after upload

- [ ] **Create Schema Library Page** (optional enhancement)
  - [ ] Dedicated page for managing schemas
  - [ ] Import/export functionality
  - [ ] Schema sharing features

### Phase 5: State Management & Performance
#### 5.1 Optimize Data Flow
- [ ] **Add Smart Caching**
  - [ ] Cache parsed schema results from Python API
  - [ ] Invalidate when schema is updated
  - [ ] Background loading for frequently used schemas

- [ ] **Add Loading States**
  - [ ] Schema parsing indicators
  - [ ] Compliance analysis progress
  - [ ] Graceful error handling

#### 5.2 Context Integration
- [ ] **Update CheckCompliance Page** (`src/pages/CheckCompliance.tsx`)
  - [ ] Wrap with SchemaContext provider
  - [ ] Handle schema state across navigation
  - [ ] Maintain schema selection persistence

- [ ] **Add Schema Context to App**
  - [ ] Global schema management
  - [ ] Cross-page schema availability
  - [ ] Schema synchronization

### Phase 6: Testing & Cleanup
#### 6.1 Update Components
- [ ] **Remove Deprecated Mock Data**
  - [ ] Delete unused files: `mockAcquisitions.ts`, parts of `mockData.ts`
  - [ ] Clean up imports across components
  - [ ] Update component props/interfaces

- [ ] **Add Error Handling**
  - [ ] Schema parsing errors
  - [ ] Python API failures
  - [ ] Cache corruption recovery

#### 6.2 Documentation & Types
- [ ] **Update Type Definitions**
  - [ ] Add schema-related types
  - [ ] Update compliance result types
  - [ ] Add API response types

- [ ] **Add Code Documentation**
  - [ ] Document new data flow
  - [ ] Add JSDoc comments
  - [ ] Update README with architecture changes

## File Changes Summary

### New Files
- `src/services/SchemaCacheManager.ts` - Browser schema storage
- `src/contexts/SchemaContext.tsx` - Schema state management
- `src/components/schema/SchemaUploadModal.tsx` - Upload interface
- `src/components/schema/SchemaManager.tsx` - Schema management UI
- `src/types/schema.ts` - Schema-related type definitions

### Major Updates
- `src/services/PyodideManager.ts` - Add schema parsing and compliance methods
- `src/services/DicompareAPI.ts` - Add new API wrapper methods
- `src/components/compliance/DataLoadingAndMatching.tsx` - Use Python API data
- `src/components/compliance/ComplianceFieldTable.tsx` - Use Python compliance results
- `src/pages/CheckCompliance.tsx` - Add schema context integration

### Files to Remove/Simplify
- `src/data/mockAcquisitions.ts` - Move data to Python API
- `src/services/mockComplianceService.ts` - Replace with Python API
- Parts of `src/data/mockTemplates.ts` - Move to Python API

## Success Criteria
- [ ] CheckCompliance uses same DICOM data source as Generate Template
- [ ] Users can upload and manage their own validation schemas
- [ ] Compliance analysis happens via Python API with real schema rules
- [ ] UI remains responsive with proper loading states
- [ ] Data flow is consistent and easy to replace with real implementation
- [ ] No hardcoded validation logic in TypeScript layer

## Migration Strategy
1. **Phase 1-2**: Can be developed in parallel (cache + Python API)
2. **Phase 3**: Sequential migration of data sources
3. **Phase 4-5**: UI integration and optimization
4. **Phase 6**: Cleanup and documentation

Each phase should be completable and testable independently, allowing for iterative development and testing.