import { lintField } from './schemaLint';

describe('lintField', () => {
  test('warns on exact match on a floating-point value', () => {
    const w = lintField({
      keyword: 'SliceThickness',
      value: 2.5,
      validationRule: { type: 'exact', value: 2.5 },
    });
    expect(w.some(x => x.code === 'exact-float')).toBe(true);
  });

  test('warns on exact match on a continuous field even when integer-valued', () => {
    const w = lintField({
      keyword: 'EchoTime',
      value: 66,
      validationRule: { type: 'exact', value: 66 },
    });
    expect(w.some(x => x.code === 'exact-float')).toBe(true);
  });

  test('does not warn on exact match on a discrete integer field', () => {
    const w = lintField({
      keyword: 'Rows',
      value: 88,
      validationRule: { type: 'exact', value: 88 },
    });
    expect(w.some(x => x.code === 'exact-float')).toBe(false);
  });

  test('does not warn when a tolerance is already set', () => {
    const w = lintField({
      keyword: 'SliceThickness',
      value: 2.5,
      validationRule: { type: 'tolerance', value: 2.5, tolerance: 0.1 },
    });
    expect(w.some(x => x.code === 'exact-float')).toBe(false);
  });

  test('flags a value outside an enumerated CS set', () => {
    const w = lintField({
      keyword: 'InPlanePhaseEncodingDirection',
      value: 'A >> P',
      validationRule: { type: 'exact', value: 'A >> P' },
    });
    expect(w.some(x => x.code === 'enum-mismatch')).toBe(true);
    // "A >> P" also trips the console-display-string heuristic
    expect(w.some(x => x.code === 'display-string')).toBe(true);
  });

  test('accepts a valid enumerated value', () => {
    const w = lintField({
      keyword: 'InPlanePhaseEncodingDirection',
      value: 'COL',
      validationRule: { type: 'exact', value: 'COL' },
    });
    expect(w.length).toBe(0);
  });
});
