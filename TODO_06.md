# TODO_06.md - Focused Code Quality Improvements

## Project Context

**DICOMpare** is a React-based UI prototype for validating DICOM medical imaging files against custom schemas. The application allows users to:

1. **Generate Templates**: Upload DICOM files, extract metadata, configure validation rules
2. **Check Compliance**: Load schemas and validate DICOM data against defined rules
3. **Manage Schemas**: Upload, cache, and manage validation templates

### Current Architecture (Working Well)
- **Clean separation**: Services (`/services`), data (`/data`), UI (`/components`), types (`/types`)
- **React Context**: `AcquisitionContext` and `SchemaContext` for state management
- **Mock-first**: All functionality works with mock data for prototype validation
- **TypeScript**: Comprehensive type definitions across the codebase

### Architecture Analysis Results
After detailed code review, the current architecture is **fundamentally sound** but has some targeted improvement opportunities. Previous TODO_05.md suggested major refactoring that would be **overkill and counterproductive** for this prototype stage.

## Focused Improvement Plan

### Why This Approach?
- **Preserve working functionality** while addressing real pain points
- **Targeted fixes** rather than architectural overhaul
- **Prototype-appropriate** - focus on maintainability over scalability
- **Evidence-based** - address measured issues, not theoretical ones

---

## Phase 1: Data Layer Improvements (High Priority)

### 1.1 Consolidate Mock Data Duplication
**Problem**: Field definitions are duplicated across multiple mock files, making maintenance difficult.

**Current State**:
```
/src/data/
  ├── mockFields.ts        # 140+ lines of field definitions
  ├── mockAcquisitions.ts  # Redundant field data
  ├── mockTemplates.ts     # More field definitions
  └── mockReports.ts       # Compliance data with fields
```

**Solution**: Create single source of truth for field definitions.

**Tasks**:
- [ ] **Create `/src/data/fieldDefinitions.ts`**
  - Export `COMMON_DICOM_FIELDS` constant with all field definitions
  - Include tag, name, VR, typical values, validation hints
  - Use consistent format: `{ tag: '0018,0081', name: 'Echo Time', vr: 'DS', ... }`

- [ ] **Create `/src/data/dataFactories.ts`**
  - `createMockAcquisition(fieldTags: string[], overrides?: Partial<Acquisition>)`
  - `createMockSeries(fieldTags: string[], values?: Record<string, any>)`
  - `createMockTemplate(acquisitionSpecs: AcquisitionSpec[])`
  - Use field definitions as reference, don't duplicate data

- [ ] **Update existing mock files**
  - `mockAcquisitions.ts`: Use factory functions with field references
  - `mockTemplates.ts`: Reference shared field definitions
  - `mockReports.ts`: Generate from field definitions
  - Remove all duplicated field data

- [ ] **Update imports across codebase**
  - Components should import from factories, not direct mock data
  - Maintain backward compatibility with existing mock exports

**Estimated Impact**: Reduces ~400 lines of duplicated code, makes field management consistent.

### 1.2 Improve Field Service Caching
**Problem**: `dicomFieldService.ts` has basic caching but could be more robust.

**Current State**: Simple in-memory cache that doesn't persist or handle errors gracefully.

**Tasks**:
- [ ] **Add cache persistence**
  - Use `localStorage` to persist field list between sessions
  - Add cache expiration (24-48 hours)
  - Graceful fallback to network fetch if cache invalid

- [ ] **Improve error handling**
  - Better fallback when external DICOM standard fetch fails
  - User-friendly error messages for network issues
  - Retry logic with exponential backoff

- [ ] **Add cache management methods**
  - `clearFieldCache()` for troubleshooting
  - `getCacheInfo()` for debugging/status display
  - `refreshFieldCache()` for manual updates

**Files to modify**:
- `src/services/dicomFieldService.ts`
- Add cache management UI in settings/debug component (future)

---

## Phase 2: Component Quality Improvements (Medium Priority)

### 2.1 Consolidate Validation Input Components
**Problem**: Three similar validation components with overlapping functionality.

**Current Components**:
- `ConstraintInputWidgets.tsx` - Input widgets for constraint values
- `TypeSpecificInputs.tsx` - Type-specific input handling
- `ValidationConstraintSelector.tsx` - Constraint type selection

**Analysis**: After examining the code, these components serve **different but related purposes**:
- `ValidationConstraintSelector`: Chooses constraint type (exact, tolerance, range, etc.)
- `ConstraintInputWidgets`: Renders appropriate input for chosen constraint
- `TypeSpecificInputs`: Handles data type conversion and validation

**Refactor Approach** (Conservative):
- [ ] **Create unified `ValidationEditor.tsx`**
  - Combines constraint selection + input rendering
  - Keep `TypeSpecificInputs` separate (handles different concern)
  - Maintain same external API to avoid breaking changes

- [ ] **Implementation steps**:
  1. Create new `ValidationEditor` component
  2. Move constraint selection + input logic from separate components
  3. Update usage in `FieldEditModal` and other consumers
  4. Remove old components after verification
  5. Keep `TypeSpecificInputs` for data type handling

**Files affected**:
- New: `src/components/common/ValidationEditor.tsx`
- Update: `src/components/generate/FieldEditModal.tsx`
- Remove: `ConstraintInputWidgets.tsx`, `ValidationConstraintSelector.tsx`
- Keep: `TypeSpecificInputs.tsx` (different responsibility)

### 2.2 Extract Reusable Business Logic Hooks
**Problem**: Some business logic is embedded in components and could be reused.

**Extract These Hooks** (Conservative Selection):

- [ ] **`useFieldValidation(field: DicomField)`**
  - Validates field values against constraints
  - Returns validation status and error messages
  - Used in: Field tables, edit modals, validation summaries

- [ ] **`useFieldSearch(query: string)`**
  - Debounced search with caching
  - Handles loading states and errors
  - Used in: `DicomFieldSelector`, any future field selection

- [ ] **`useLocalStorage<T>(key: string, defaultValue: T)`**
  - Generic hook for localStorage with JSON serialization
  - Type-safe and handles serialization errors
  - Used in: Schema caching, user preferences, field cache

**Implementation**:
- [ ] Create `/src/hooks/` directory
- [ ] Implement hooks with proper TypeScript types
- [ ] Add basic tests for hooks (Jest + React Testing Library)
- [ ] Update components to use hooks gradually (non-breaking)

**Files to create**:
- `src/hooks/useFieldValidation.ts`
- `src/hooks/useFieldSearch.ts`
- `src/hooks/useLocalStorage.ts`
- `src/hooks/index.ts` (exports)

---

## Phase 3: Error Handling & User Experience (Low Priority)

### 3.1 Improve Error Boundaries and Error States
**Problem**: Limited error handling for component failures and network issues.

**Current State**: Basic try/catch in some places, but no user-friendly error recovery.

**Tasks**:
- [ ] **Create `ErrorBoundary` component**
  - Catches React component errors
  - Shows user-friendly error message with recovery options
  - Logs errors for debugging (console in development)

- [ ] **Add error states to key components**
  - File upload failures in `BuildSchema`
  - Network errors in `DicomFieldSelector`
  - Schema parsing errors in compliance checking

- [ ] **Create `ErrorDisplay` component**
  - Consistent error message styling
  - Action buttons (retry, dismiss, report)
  - Different severity levels (error, warning, info)

**Files to create**:
- `src/components/common/ErrorBoundary.tsx`
- `src/components/common/ErrorDisplay.tsx`

**Files to update**:
- `src/components/generate/BuildSchema.tsx` (file upload errors)
- `src/components/common/DicomFieldSelector.tsx` (search errors)
- `src/contexts/SchemaContext.tsx` (schema operations)

### 3.2 Add Loading States and Progress Indicators
**Problem**: Some operations (file upload, field search) need better loading feedback.

**Tasks**:
- [ ] **Standardize loading states**
  - Consistent spinner/skeleton components
  - Progress bars for multi-step operations
  - Disable interactions during loading

- [ ] **Create `LoadingSpinner` and `ProgressBar` components**
  - Reusable, themed loading indicators
  - Support different sizes and styles
  - Accessibility compliant (ARIA labels)

**Files affected**:
- `src/components/generate/BuildSchema.tsx` (file upload progress)
- `src/components/common/DicomFieldSelector.tsx` (search loading)
- `src/contexts/SchemaContext.tsx` (schema operations)

---

## Implementation Guidelines

### Development Principles
1. **Backward Compatibility**: All changes should maintain existing APIs
2. **Incremental Updates**: Implement and test each improvement separately
3. **Evidence-Based**: Only fix measured problems, not theoretical ones
4. **Prototype-Appropriate**: Focus on maintainability over enterprise-scale patterns

### Testing Strategy
- **Unit tests** for new hooks and utility functions
- **Integration tests** for critical user flows
- **Manual testing** for UI changes and error scenarios
- **NO over-testing** - focus on business-critical paths

### Code Style
- Follow existing TypeScript and React patterns
- Use existing component naming conventions
- Maintain current file organization structure
- Add JSDoc comments for new public APIs

---

## Implementation Priority & Timeline

### Week 1-2: Data Layer (Phase 1)
- **High impact, low risk** improvements
- Consolidate mock data and improve caching
- Immediate reduction in code duplication

### Week 3: Component Improvements (Phase 2.1)
- **Medium impact, medium risk**
- Validation component consolidation
- Careful testing required

### Week 4: Business Logic Hooks (Phase 2.2)
- **Medium impact, low risk**
- Extract reusable logic without breaking changes
- Good foundation for future development

### Week 5+: Error Handling (Phase 3)
- **Low impact, low risk** polish improvements
- Better user experience for edge cases
- Can be deferred if other priorities emerge

---

## Success Metrics

### Code Quality
- [ ] **Reduce code duplication**: ~400 lines of duplicate field definitions eliminated
- [ ] **Improve maintainability**: Single source of truth for all field data
- [ ] **Better error handling**: All major user flows have error states

### Developer Experience
- [ ] **Easier testing**: Business logic extracted to testable hooks
- [ ] **Clearer responsibilities**: Validation components have single purpose
- [ ] **Better debugging**: Improved error messages and logging

### User Experience
- [ ] **Faster field search**: Better caching and loading states
- [ ] **Clearer error messages**: Users understand what went wrong
- [ ] **Better feedback**: Loading states for all async operations

---

## Notes & Context

### Why Not Bigger Changes?
This TODO deliberately avoids major architectural changes suggested in TODO_05.md because:
- **Current architecture works well** for the prototype's needs
- **Domain complexity is appropriate** - DICOM validation is inherently complex
- **Component boundaries are logical** - they reflect real user workflows
- **Context API usage is reasonable** - 11 methods for complex domain operations is fine

### Future Considerations
- **Performance optimization**: Only needed if real performance issues emerge
- **Scalability patterns**: Can be added when moving beyond prototype stage
- **Advanced testing**: Integration and E2E tests when stabilizing for production

### Technical Debt Assessment
- **Low debt**: Well-structured codebase with good separation of concerns
- **Targeted improvements**: Focus on data consistency and error handling
- **Avoid over-engineering**: Resist temptation to optimize theoretical problems

This focused approach preserves the working prototype while addressing real pain points and setting up for sustainable development.