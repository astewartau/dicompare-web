# TODO_05.md - Code Architecture Refactoring

## Overview
Refactor the React UI prototype to address over-engineering patterns, code duplication, and component complexity issues identified during architecture analysis.

## Current Architecture Assessment

### ✅ Strengths
- **Good Separation of Concerns**: Services, data layer, and UI are properly separated
- **Clean Service Layer**: `dicomFieldService.ts`, `DicompareAPI.ts`, `SchemaCacheManager.ts` are well-structured
- **Comprehensive Types**: Strong TypeScript definitions in `/types`
- **Context Usage**: Proper React Context implementation for state management

### ⚠️ Issues Identified

#### 1. Over-Engineering Patterns
- **Complex Context API**: `AcquisitionContext` has 23+ methods (excessive)
- **Props Drilling**: Components like `AcquisitionTable` receive 11+ props
- **Over-Abstraction**: Multiple overlapping field selector components

#### 2. Code Duplication
- **Field Rendering**: Similar patterns in `FieldTable`, `SeriesTable`, `AcquisitionTable`
- **Validation Components**: Redundant validation constraint widgets
- **Mock Data**: Duplicate field definitions across mock files

#### 3. Component Complexity
- **Monolithic Components**: 
  - `BuildSchema.tsx` (313 lines) - handles upload, validation, and display
  - `DicomFieldSelector.tsx` (391 lines) - search, display, validation, and modals
- **Mixed Responsibilities**: UI components handling business logic and data transformation

## Refactoring Plan

### Phase 1: State Management Simplification

#### 1.1 Replace Complex Context with Reducer Pattern
**File**: `src/contexts/AcquisitionContext.tsx`

**Current Issues**:
- 23 different methods for managing acquisitions
- Complex nested state updates
- Difficult to test and debug

**Solution**:
```typescript
// Replace multiple methods with reducer pattern
const [acquisitions, dispatch] = useReducer(acquisitionReducer, initialState);

// Actions:
// - ADD_ACQUISITION
// - UPDATE_ACQUISITION
// - DELETE_ACQUISITION
// - UPDATE_FIELD
// - CONVERT_FIELD_LEVEL
// - ADD_SERIES
// - UPDATE_SERIES
```

**Tasks**:
- [ ] Create `acquisitionReducer.ts` with action types
- [ ] Implement reducer functions for all current operations
- [ ] Replace context methods with dispatch calls
- [ ] Update all components using the context
- [ ] Add unit tests for reducer functions

#### 1.2 Normalize Props Interfaces
**Problem**: Components receiving 8-11+ props indicate poor abstraction

**Solution**:
```typescript
// Instead of many individual props
interface AcquisitionTableProps {
  acquisition: Acquisition;
  operations: AcquisitionOperations; // grouped operations
  validationState: ValidationState;  // grouped validation
  uiState: UIState;                 // grouped UI state
}
```

**Tasks**:
- [ ] Group related props into logical interfaces
- [ ] Create operation objects for related functions
- [ ] Update component prop interfaces
- [ ] Refactor component implementations

### Phase 2: Component Decomposition

#### 2.1 Break Down Monolithic Components

**`BuildSchema.tsx` → Multiple Components**:
- [ ] Extract `FileUploadArea.tsx` (upload UI and drag/drop)
- [ ] Extract `AcquisitionGrid.tsx` (grid layout and management)
- [ ] Extract `ValidationSummary.tsx` (incomplete fields display)
- [ ] Create `BuildSchemaContainer.tsx` (orchestrates child components)
- [ ] Update routing and parent components

**`DicomFieldSelector.tsx` → Focused Components**:
- [ ] Extract `FieldSearchInput.tsx` (search and dropdown)
- [ ] Extract `SelectedFieldTags.tsx` (selected fields display)
- [ ] Extract `FieldSuggestionList.tsx` (suggestions dropdown)
- [ ] Extract `ManualFieldEntry.tsx` (manual entry modal)
- [ ] Create `DicomFieldSelectorContainer.tsx` (orchestrates children)

#### 2.2 Create Reusable Field Components

**Problem**: Field rendering logic duplicated across multiple tables

**Solution**: Create unified field rendering system
- [ ] Create `FieldRenderer.tsx` - renders any field type consistently
- [ ] Create `FieldEditor.tsx` - handles field editing logic
- [ ] Create `ValidationDisplay.tsx` - shows validation status
- [ ] Update `FieldTable`, `SeriesTable`, `AcquisitionTable` to use new components

#### 2.3 Consolidate Validation Components

**Current State**: Multiple similar validation widgets
- `ConstraintInputWidgets.tsx`
- `TypeSpecificInputs.tsx` 
- `ValidationConstraintSelector.tsx`

**Solution**:
- [ ] Create unified `ValidationInputWidget.tsx`
- [ ] Support all validation types through props configuration
- [ ] Remove duplicate components
- [ ] Update all usage sites

### Phase 3: Custom Hooks Extraction

#### 3.1 Business Logic Hooks
Extract complex logic from components into reusable hooks:

- [ ] `useFieldValidation()` - field validation logic
- [ ] `useFieldSearch()` - DICOM field search and filtering
- [ ] `useFileUpload()` - file upload and processing logic
- [ ] `useAcquisitionManagement()` - acquisition CRUD operations
- [ ] `useSeriesManagement()` - series-level operations

#### 3.2 UI State Hooks
- [ ] `useExpandableTable()` - table expand/collapse logic
- [ ] `useFieldSelection()` - multi-field selection logic
- [ ] `useValidationSummary()` - validation status aggregation

### Phase 4: Data Structure Optimization

#### 4.1 Normalize Mock Data
**Problem**: Redundant field definitions across mock files

**Tasks**:
- [ ] Create single source of truth for field definitions
- [ ] Implement field reference system instead of duplication
- [ ] Update mock data generation to reference shared definitions
- [ ] Create data factory functions for consistent mock generation

#### 4.2 Optimize Data Transformations
- [ ] Create consistent transformation utilities
- [ ] Implement proper data normalization patterns
- [ ] Add caching for expensive transformations
- [ ] Create data validation utilities

### Phase 5: Performance & Maintainability

#### 5.1 Implement Generic Table Component
**Problem**: Similar table patterns repeated

**Solution**:
- [ ] Create `GenericDataTable.tsx` with configurable columns
- [ ] Support sorting, filtering, and editing modes
- [ ] Replace custom table implementations
- [ ] Add virtualization for large datasets

#### 5.2 Error Handling Improvements
- [ ] Create centralized error handling patterns
- [ ] Implement error boundaries for component isolation
- [ ] Add user-friendly error messages
- [ ] Create error recovery mechanisms

#### 5.3 Testing Infrastructure
- [ ] Add unit tests for all new hooks
- [ ] Create integration tests for component interactions
- [ ] Add visual regression tests for UI components
- [ ] Implement mock data factories for testing

## Implementation Priority

### High Priority (Immediate Impact)
1. **Context Reducer Refactoring** - Reduces complexity significantly
2. **Component Decomposition** - Makes code more maintainable
3. **Field Component Unification** - Eliminates major duplication

### Medium Priority (Quality Improvements)
4. **Custom Hooks Extraction** - Improves reusability
5. **Data Structure Optimization** - Reduces memory usage
6. **Generic Table Implementation** - Future-proofs architecture

### Low Priority (Polish)
7. **Error Handling Enhancement** - Improves user experience
8. **Testing Infrastructure** - Ensures code quality
9. **Performance Optimizations** - Handles scale

## Success Metrics

### Code Quality
- [ ] Reduce average component size from 200+ to <100 lines
- [ ] Reduce prop interfaces from 8+ to <5 props per component
- [ ] Eliminate code duplication in field rendering (currently ~40% duplicate)

### Maintainability
- [ ] All business logic extracted to testable hooks
- [ ] Context API simplified to <5 methods
- [ ] Single source of truth for all data structures

### Performance
- [ ] Component re-render frequency reduced by 50%
- [ ] Memory usage optimization through data normalization
- [ ] Faster development iteration through better abstractions

## Notes
- Maintain backward compatibility during refactoring
- Update documentation as components are refactored
- Consider incremental migration strategy for production systems
- Focus on preserving existing functionality while improving structure