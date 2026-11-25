/** Scenario parameter types that hold a picked file rather than a plain value. */
const FILE_PARAM_TYPES = new Set(['file_picker', 'file_uuid_picker']);

/** Whether a stored publish parameter is a DITAVAL filter file. */
function isDitavalParam(p: Record<string, unknown>): boolean {
  if (!FILE_PARAM_TYPES.has(String(p['type'] ?? ''))) return false;
  return p['name'] === 'args.filter' || /ditaval/i.test(String(p['displayName'] ?? ''));
}

/**
 * File IDs of every DITAVAL a schedule publishes with, in first-seen order.
 *
 * `publish_parameters` holds one parameter set per generated publish, so the same
 * DITAVAL can appear in several sets; each is returned once. Tolerates the older
 * single-set shape (a flat list of parameters) and empty or unset values.
 */
export function extractDitavalIds(publishParameters: unknown): string[] {
  if (!Array.isArray(publishParameters)) return [];
  const sets = publishParameters.length > 0 && Array.isArray(publishParameters[0])
    ? publishParameters as unknown[][]
    : [publishParameters as unknown[]];
  const ids = new Set<string>();
  for (const set of sets) {
    for (const p of set) {
      if (!p || typeof p !== 'object') continue;
      const param = p as Record<string, unknown>;
      const value = param['value'];
      if (isDitavalParam(param) && typeof value === 'string' && value !== '') ids.add(value);
    }
  }
  return [...ids];
}
