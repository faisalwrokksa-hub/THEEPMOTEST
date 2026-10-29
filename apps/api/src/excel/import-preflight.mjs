/** Side-effect-free import preview: NEVER writes to the database. */
export function previewImport(parsed, schema) {
  const problems = [...parsed.problems];
  const warnings = [...parsed.notes];
  const sheets = schema.map(def => {
    const records = parsed.sheets[def.key] ?? [];
    const required = def.columns.filter(c => c.required).map(c => c.key);
    const missing = [];
    for (const [i, record] of records.entries()) {
      for (const key of required) if (record[key] == null || String(record[key]).trim() === '') missing.push({row:i+5,field:key});
    }
    if (def.shape === 'single' && records.length > 1) problems.push(`${def.name}: expected one record, found ${records.length}`);
    for (const item of missing) problems.push(`${def.name}: row ${item.row} missing required field ${item.field}`);
    return {sheet:def.key, records:records.length, requiredFields:required, missing, mappingFields:def.columns.map(c=>({target:c.key, labels:[c.header,c.headerAr,...(c.aliases??[])].filter(Boolean)}))};
  });
  const head = parsed.sheets.project ?? [];
  if (head.length === 0) problems.push('Project: a project row is required');
  const codes = new Set();
  for (const [index, record] of head.entries()) {
    const code = String(record.code ?? '').trim().toUpperCase();
    if (code && codes.has(code)) problems.push(`Project: duplicate code ${code} at row ${index+5}`);
    codes.add(code);
  }
  return {ok:problems.length===0, canImport:problems.length===0, readOnly:true, sheets, problems, warnings};
}

/** Explicit mapping validation for customer workbooks; prevents ambiguous aliases. */
export function validateMapping(mapping, allowedFields) {
  if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)) throw new Error('Mapping must be an object');
  const allowed = new Set(allowedFields);
  const used = new Set();
  const result = {};
  for (const [source, target] of Object.entries(mapping)) {
    if (!source.trim() || typeof target !== 'string' || !allowed.has(target)) throw new Error(`Invalid mapping: ${source}`);
    if (used.has(target)) throw new Error(`Duplicate target field: ${target}`);
    used.add(target);
    result[source] = target;
  }
  return result;
}
