# TODO_03: Generate Template Page Refactoring

## Overview
This document outlines the refactoring plan for the Generate Template page to address code duplication, over-engineering, and improve maintainability.

## Current Issues

### 1. Code Duplication
- 20+ similar state update functions in BuildSchema
- Duplicate formatting functions (formatFieldValue vs formatSeriesFieldValue)
- Repeated update patterns across components
- Props drilling through 3-4 component levels

### 2. Over-Engineering
- SeriesFieldManager.tsx (351 lines) appears unused - duplicates SeriesTable functionality
- FieldLevelConverter has two implementations that could be one component
- Complex state management that could be simplified

### 3. Type Safety
- Extensive use of `any` type for field values
- Missing runtime validation
- Loose typing in many functions

### 4. Performance
- Full re-renders on every field update
- No memoization of expensive operations
- Deep component nesting without optimization

## Proposed Refactoring

### Phase 1: Clean Up Unused Code (Quick Win)
1. **Delete unused components:**
   - `src/components/generate/SeriesFieldManager.tsx`
   - Review and potentially remove `FieldLevelConverter.tsx` if not used

2. **Remove duplicate implementations:**
   - Merge FieldLevelConverter variants into single component with `variant` prop

### Phase 2: Consolidate State Management

#### Option A: Reducer Pattern
```typescript
// src/hooks/useAcquisitionState.ts
type AcquisitionAction = 
  | { type: 'ADD_ACQUISITION' }
  | { type: 'DELETE_ACQUISITION'; id: string }
  | { type: 'UPDATE_ACQUISITION'; id: string; field: keyof Acquisition; value: any }
  | { type: 'UPDATE_FIELD'; acquisitionId: string; fieldTag: string; updates: Partial<DicomField> }
  | { type: 'DELETE_FIELD'; acquisitionId: string; fieldTag: string }
  | { type: 'CONVERT_FIELD'; acquisitionId: string; fieldTag: string; toLevel: 'acquisition' | 'series' }
  | { type: 'ADD_FIELDS'; acquisitionId: string; fields: string[] }
  | { type: 'UPDATE_SERIES'; acquisitionId: string; seriesIndex: number; fieldTag: string; value: any }
  | { type: 'ADD_SERIES'; acquisitionId: string }
  | { type: 'DELETE_SERIES'; acquisitionId: string; seriesIndex: number }
  | { type: 'UPDATE_SERIES_NAME'; acquisitionId: string; seriesIndex: number; name: string };

const acquisitionReducer = (state: Acquisition[], action: AcquisitionAction): Acquisition[] => {
  switch (action.type) {
    // Implement all cases
  }
};

export const useAcquisitionState = () => {
  const [acquisitions, dispatch] = useReducer(acquisitionReducer, []);
  return { acquisitions, dispatch };
};
```

#### Option B: Custom Hook with Encapsulated Logic
```typescript
// src/hooks/useAcquisitions.ts
export const useAcquisitions = () => {
  const [acquisitions, setAcquisitions] = useState<Acquisition[]>([]);
  
  const updateAcquisition = useCallback((id: string, updates: Partial<Acquisition>) => {
    setAcquisitions(prev => prev.map(acq => 
      acq.id === id ? { ...acq, ...updates } : acq
    ));
  }, []);
  
  const updateField = useCallback((acquisitionId: string, fieldTag: string, updates: Partial<DicomField>) => {
    // Implementation
  }, []);
  
  // ... other methods
  
  return {
    acquisitions,
    updateAcquisition,
    updateField,
    // ... other methods
  };
};
```

### Phase 3: Unify Formatting Functions

```typescript
// src/utils/fieldFormatters.ts

// Single formatter with options
export function formatFieldDisplay(
  value: any,
  options?: {
    dataType?: FieldDataType;
    validationRule?: ValidationRule;
    showConstraint?: boolean;
  }
): string {
  // Unified formatting logic
}

// Replace both formatFieldValue and formatSeriesFieldValue
export function formatFieldWithConstraint(
  field: DicomField | SeriesFieldValue
): { value: string; constraint: string } {
  // Handle both types
}
```

### Phase 4: Improve Type Safety

```typescript
// src/types/fieldValues.ts

// Discriminated union for field values
type FieldValue = 
  | { type: 'string'; value: string }
  | { type: 'number'; value: number }
  | { type: 'list_string'; value: string[] }
  | { type: 'list_number'; value: number[] }
  | { type: 'json'; value: Record<string, any> };

// Type guards
export const isStringField = (value: FieldValue): value is { type: 'string'; value: string } => 
  value.type === 'string';

// Validation
export const validateFieldValue = (value: any, dataType: FieldDataType): FieldValue => {
  // Runtime validation and type casting
};
```

### Phase 5: Component Structure Improvements

1. **Extract common table logic:**
```typescript
// src/components/common/FieldTableBase.tsx
interface FieldTableBaseProps<T> {
  items: T[];
  columns: ColumnDef<T>[];
  onItemClick?: (item: T) => void;
  isEditMode: boolean;
}

export function FieldTableBase<T>({ items, columns, onItemClick, isEditMode }: FieldTableBaseProps<T>) {
  // Shared table implementation
}
```

2. **Reduce props drilling with context:**
```typescript
// src/contexts/AcquisitionContext.tsx
const AcquisitionContext = createContext<{
  isEditMode: boolean;
  updateField: (fieldTag: string, updates: Partial<DicomField>) => void;
  deleteField: (fieldTag: string) => void;
  convertField: (fieldTag: string, toLevel: 'acquisition' | 'series') => void;
}>(null);

// Use in child components without prop drilling
```

### Phase 6: Performance Optimizations

1. **Memoize expensive operations:**
```typescript
const memoizedFieldValue = useMemo(() => 
  formatFieldDisplay(field.value, { dataType: field.dataType }),
  [field.value, field.dataType]
);
```

2. **Optimize table rows:**
```typescript
const FieldRow = memo(({ field, onUpdate, onDelete }) => {
  // Row implementation
}, (prevProps, nextProps) => 
  prevProps.field.value === nextProps.field.value &&
  prevProps.field.validationRule === nextProps.field.validationRule
);
```

## Implementation Order

1. **Week 1**: Clean up unused code (Phase 1)
2. **Week 2**: Implement state management consolidation (Phase 2)
3. **Week 3**: Unify formatters and improve types (Phases 3-4)
4. **Week 4**: Component structure improvements (Phase 5)
5. **Week 5**: Performance optimizations (Phase 6)

## Expected Benefits

- **50% reduction** in BuildSchema component size
- **Eliminate 300+ lines** of unused code
- **Reduce props drilling** from 4 levels to 2
- **Type safety** for all field values
- **Better performance** with memoization
- **Easier testing** with consolidated logic

## Risks and Mitigation

- **Risk**: Breaking existing functionality
  - **Mitigation**: Implement changes incrementally with tests

- **Risk**: Over-abstracting during refactor
  - **Mitigation**: Focus on removing duplication, not adding layers

- **Risk**: Performance regression
  - **Mitigation**: Profile before and after each phase

## Success Metrics

- [ ] BuildSchema under 200 lines (from 350+)
- [ ] No `any` types in field value handling
- [ ] Single source of truth for each operation
- [ ] All unused components removed
- [ ] Consistent formatting across all field displays