import { extractDitavalIds } from './schedule-ditavals';

const filter = (value: unknown, type = 'file_uuid_picker') =>
  ({ name: 'args.filter', displayName: 'Ditaval', type, value });

describe('extractDitavalIds', () => {
  it('returns the DITAVAL file ids from a parameter set', () => {
    expect(extractDitavalIds([[{ name: 'transtype', type: 'string', value: 'scorm' }, filter('d1')]])).toEqual(['d1']);
  });

  it('returns each DITAVAL once across several parameter sets, in first-seen order', () => {
    expect(extractDitavalIds([[filter('d1')], [filter('d2')], [filter('d1')]])).toEqual(['d1', 'd2']);
  });

  it('accepts both file picker types', () => {
    expect(extractDitavalIds([[filter('a', 'file_picker')], [filter('b', 'file_uuid_picker')]])).toEqual(['a', 'b']);
  });

  it('recognises a DITAVAL by its display name when the parameter is not args.filter', () => {
    const p = { name: 'custom.filter', displayName: 'Product DITAVAL', type: 'file_picker', value: 'x' };
    expect(extractDitavalIds([[p]])).toEqual(['x']);
  });

  it('ignores file parameters that are not DITAVALs', () => {
    const p = { name: 'args.cssroot', displayName: 'CSS folder', type: 'file_picker', value: 'css1' };
    expect(extractDitavalIds([[p]])).toEqual([]);
  });

  it('ignores empty and non-string values', () => {
    expect(extractDitavalIds([[filter(''), filter(null), filter(undefined), filter(42)]])).toEqual([]);
  });

  it('handles the older flat single-set shape', () => {
    expect(extractDitavalIds([filter('d1')])).toEqual(['d1']);
  });

  it('returns nothing when there are no parameters', () => {
    expect(extractDitavalIds([])).toEqual([]);
    expect(extractDitavalIds(undefined)).toEqual([]);
    expect(extractDitavalIds(null)).toEqual([]);
    expect(extractDitavalIds('nope')).toEqual([]);
  });
});
