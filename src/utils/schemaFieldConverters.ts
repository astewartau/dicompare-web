import type { DicomField, SeriesField } from '../types';

/**
 * Schema field format used by the Python dicompare library.
 * This is the format expected when building schema JSON for validation.
 */
export interface SchemaFieldOutput {
  field: string;
  tag?: string;
  value?: any;
  tolerance?: number;
  contains?: string;
  contains_any?: any[];
  contains_all?: any[];
  severity?: 'error' | 'warning';
  notes?: string;
}

/**
 * Convert a DicomField or SeriesField to schema field format.
 *
 * Schema field format: { field: string, tag?: string, value?: any, tolerance?: number, ... }
 *
 * This unified function handles both acquisition-level (DicomField) and series-level (SeriesField)
 * fields since they share the same relevant properties for schema conversion.
 */
export function fieldToSchemaField(
  field: DicomField | SeriesField,
  options: { includeNotes?: boolean } = {}
): SchemaFieldOutput {
  const { includeNotes = true } = options;
  const schemaField: SchemaFieldOutput = {
    field: field.name || field.keyword || field.tag || ''
  };

  if (field.tag) {
    schemaField.tag = field.tag;
  }

  if (field.value !== undefined && field.value !== null && field.value !== '') {
    schemaField.value = field.value;
  }

  if (field.validationRule) {
    if (field.validationRule.type === 'tolerance' && field.validationRule.tolerance !== undefined) {
      schemaField.tolerance = field.validationRule.tolerance;
    }
    if (field.validationRule.type === 'contains' && field.validationRule.contains) {
      schemaField.contains = field.validationRule.contains;
    }
    if (field.validationRule.type === 'contains_any' && field.validationRule.contains_any) {
      schemaField.contains_any = field.validationRule.contains_any;
    }
    if (field.validationRule.type === 'contains_all' && field.validationRule.contains_all) {
      schemaField.contains_all = field.validationRule.contains_all;
    }
  }

  // Only the non-default severity is serialized (omitted = 'error').
  if (field.severity === 'warning') {
    schemaField.severity = 'warning';
  }

  // Series fields pass includeNotes: false. Dropping it here rather than
  // relying on SeriesField's type not declaring it, because a note can still
  // reach this at runtime from a hand-edited schema — and the metaschema
  // rejects the key on a series field, so writing it would emit invalid JSON.
  const notes = includeNotes && 'notes' in field ? field.notes : undefined;
  if (notes && notes.trim()) {
    schemaField.notes = notes.trim();
  }

  return schemaField;
}

/**
 * Convert an acquisition-level DicomField to schema field format.
 * Alias for fieldToSchemaField for semantic clarity.
 */
export function acquisitionFieldToSchemaField(field: DicomField): SchemaFieldOutput {
  return fieldToSchemaField(field);
}

/**
 * Convert a series-level SeriesField to schema field format.
 *
 * Same as fieldToSchemaField except notes are dropped — a series records its
 * rationale once, on the series, not per field.
 */
export function seriesFieldToSchemaField(field: SeriesField): SchemaFieldOutput {
  return fieldToSchemaField(field, { includeNotes: false });
}
