import { fieldToSchemaField } from './schemaFieldConverters';
import type { DicomField } from '../types';

const baseField = (overrides: Partial<DicomField>): DicomField => ({
  tag: '0018,0081',
  name: 'EchoTime',
  keyword: 'EchoTime',
  value: 3,
  vr: 'DS',
  level: 'acquisition',
  ...overrides,
});

describe('fieldToSchemaField severity', () => {
  test('serializes warning severity', () => {
    const out = fieldToSchemaField(baseField({ severity: 'warning' }));
    expect(out.severity).toBe('warning');
  });

  test('omits default error severity', () => {
    expect(fieldToSchemaField(baseField({ severity: 'error' })).severity).toBeUndefined();
    expect(fieldToSchemaField(baseField({})).severity).toBeUndefined();
  });

  test('carries the constraint value alongside severity', () => {
    const out = fieldToSchemaField(baseField({
      value: 66,
      severity: 'warning',
      validationRule: { type: 'exact', value: 66 },
    }));
    expect(out.value).toBe(66);
    expect(out.severity).toBe('warning');
  });
});
