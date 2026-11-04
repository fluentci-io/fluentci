export function parse_json(text, ok, error) {
  let data;
  try { data = JSON.parse(text); } catch { return error(); }
  return ok(data);
}

export function parse_lines(text, ok, error) {
  if (text !== '' && !text.endsWith('\n')) return error();
  let records;
  try {
    records = text === '' ? [] : text.slice(0, -1).split('\n').map(line => JSON.parse(line));
  } catch { return error(); }
  return ok(records);
}
