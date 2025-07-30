# TODO_02: Unified Tabular Layout Design for Acquisitions and Schemas

## Overview

The current card-based interface for managing acquisitions is cumbersome and requires excessive clicking through nested modals. A tabular layout approach would provide a much more efficient and scannable interface that can be reused across multiple contexts - from editing acquisitions in the template generator to viewing incoming data and schemas in the compliance checker.

## Current Interface Problems

1. **Space Inefficiency**: Each acquisition takes up an entire card with wasted whitespace
2. **Poor Scannability**: Cannot quickly compare fields across acquisitions
3. **Hidden Information**: Must expand cards to see field details
4. **Tedious Navigation**: Multiple clicks required for simple operations
5. **Inconsistent Experience**: Different layouts for similar data types

## Tabular Layout Vision

### Acquisition Display as Compact Tables

Each acquisition should be presented as a **compact, bordered box** containing:

**Header Bar:**
- Acquisition title (editable inline when in edit mode)
- Status indicators (edit mode, validation status)
- Action buttons (Edit, Delete, Expand/Collapse) aligned to the right
- Optional description text below title

**Body Content - Two Distinct Table Sections:**

1. **Acquisition-Level Fields Table**
   - Column headers: "Field Name" | "Value" | "Actions" (when editing)
   - Each row shows one constant field
   - Values displayed with appropriate formatting (arrays as comma-separated, etc.)
   - In edit mode: small icon buttons for "Edit", "Convert to Series", "Delete"
   - Compact row height to maximize data density

2. **Series-Level Fields Table** (when present)
   - Dynamic columns based on varying fields
   - First column always "Series" (Series 1, Series 2, etc.)
   - Subsequent columns for each varying field
   - Matrix-style layout showing all series variations at once
   - In edit mode: row actions for editing/deleting series

### Visual Characteristics

**Compactness:**
- Minimal padding (4-8px) in cells
- Tight line height for maximum data density
- No unnecessary decorative elements
- Borders only where needed for clarity

**Scannability:**
- Zebra striping for long field lists
- Clear visual separation between acquisition and series sections
- Consistent column widths within sections
- Field names in slightly muted color, values in full black

**Interactive Elements:**
- Hover effects on editable rows
- Clear focus states for keyboard navigation
- Action buttons appear on row hover (or always visible in edit mode)
- Smooth expand/collapse animations

### Data Type Integration

**Supported Data Types:**
- **String** - Text values (default)
- **Number** - Numeric values (integers or floats)
- **List** - Arrays with two subtypes:
  - List (string) - Array of text values
  - List (number) - Array of numeric values
- **Raw JSON** - Complex nested objects

**Data Type Display in Tables:**

1. **In Table Cells:**
   - Primary display: The actual value (large, black text)
   - Secondary display: Data type shown as small gray text below value (only in edit mode)
   - List formatting: Arrays displayed as comma-separated values
   - Type indicators: "string", "number", "list (string)", "list (number)", "Raw JSON"

2. **Constraint-Based Formatting:**
   - Values formatted according to their constraint type:
     - **Exact value**: `"SIEMENS"` or `2000`
     - **Tolerance**: `2000 +/- 50`
     - **Range**: `range: [8, 12]`
     - **Contains**: `contains: "BOLD"`
   - Different data types allow different constraints:
     - Number: exact, range, tolerance
     - String/List: exact, contains
     - Raw JSON: exact only

3. **Automatic Type Detection:**
   - When importing DICOM data, types are inferred:
     - Numeric values → number type
     - Arrays → list type with subtype detection
     - Objects → raw JSON type
     - Everything else → string type
   - Types can be manually changed in edit mode

### Modal Design for Field Editing

When editing a field, a focused modal appears with:

**For Constant Fields:**
- **Field name input** with autocomplete from comprehensive DICOM field list
- **Data type selector dropdown**:
  - Options: "String", "Number", "List", "Raw JSON"
  - When "List" selected, additional dropdown appears for subtype (String List/Number List)
- **Dynamic constraint selector** that updates based on data type:
  - Number fields: "value", "range", "value+tolerance"
  - String/List fields: "value", "contains"
  - Raw JSON fields: "value" only
- **Adaptive value inputs**:
  - Text input for strings
  - Number input with validation for numbers
  - Tag-style input (Tagify) for lists allowing multiple entries
  - JSON editor with syntax highlighting for raw JSON
  - Range inputs show min/max fields
  - Tolerance inputs show value ± tolerance fields
- **Live preview** showing how the constraint will display in the table

**For Series Editing:**
- Table-like layout within the modal showing all fields vertically
- Each field has its own data type and constraint controls
- Series name editable at the top
- Same data type flexibility as constant fields
- Visual grouping of related controls per field
- Option to add new fields to the series with type selection

### Reusability Across Contexts

This tabular layout serves multiple purposes:

**1. Generate Template (Build Schema)**
- Full editing capabilities
- Field selection from uploaded DICOMs
- Manual field addition
- Conversion between acquisition/series levels
- Constraint configuration

**2. Check Compliance (View & Compare)**
- Read-only display of incoming DICOM data
- Side-by-side with schema requirements
- Compliance indicators in-line with values
- Highlighting of mismatches
- Expandable to show detailed validation messages

**3. Schema Library Display**
- Compact preview of schema structure
- Quick scanning of included fields
- Expansion to see full constraint details
- Same visual language as acquisition display

### Layout Benefits

**Information Density:**
- See 3-4 acquisitions on screen simultaneously
- 40-60 fields visible without scrolling
- All series variations visible at once
- No wasted space on decorative elements

**Quick Operations:**
- Single click to edit a field
- Drag to reorder fields (in edit mode)
- Keyboard shortcuts for common actions
- Bulk selection for operations on multiple fields

**Visual Consistency:**
- Same table structure everywhere
- Predictable placement of controls
- Unified color scheme for status indicators
- Consistent spacing and typography

### Responsive Behavior

**On Smaller Screens:**
- Tables become horizontally scrollable
- Key columns (field names) remain sticky
- Action buttons consolidate into dropdown menu
- Modal takes full screen width

**Print/Export View:**
- Clean table layout without interactive elements
- Proper page breaks between acquisitions
- Headers repeated on new pages
- Compliance status clearly indicated

This tabular approach transforms the interface from a series of nested cards and modals into a efficient, scannable workspace where users can quickly understand and manipulate complex DICOM metadata structures.