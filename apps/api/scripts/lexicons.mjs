// Pkl is the source of truth; JSON, runtime schemas, and Gleam models are outputs.
import { execFileSync } from 'node:child_process';
import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Lexicons } from '@atproto/lexicon';
import { format, resolveConfig } from 'prettier';

const root = fileURLToPath(new URL('..', import.meta.url));
const check = process.argv.includes('--check');
if (process.argv.slice(2).some((arg) => arg !== '--check'))
  throw Error('Usage: node scripts/lexicons.mjs [--check]');
const banner = 'Generated from pkl/defs by scripts/lexicons.mjs. DO NOT EDIT.';
const quote = JSON.stringify;
const snake = (value) =>
  value
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replaceAll('.', '_')
    .toLowerCase()
    .replace(/^(type|fn|case|let|pub|import|const|use|assert|as|opaque)$/, '$1_');
const pascal = (value) =>
  value
    .split(/[._]/)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join('');
const short = (id) => id.replace(/^io\.fluentci\./, '');
async function files(directory, extension) {
  const entries = await readdir(directory, { withFileTypes: true });
  const results = await Promise.all(
    entries.map((entry) =>
      entry.isDirectory()
        ? files(join(directory, entry.name), extension)
        : entry.name.endsWith(extension)
          ? [join(directory, entry.name)]
          : [],
    ),
  );
  return results.flat().sort();
}
const definitions = join(root, 'pkl/defs');
const sources = await files(definitions, '.pkl');
if (!sources.length) throw Error('No Pkl lexicons found');
const documents = sources.map((source) =>
  JSON.parse(execFileSync('pkl', ['eval', '-f', 'json', source], { encoding: 'utf8' })),
);
// Validate all schemas and duplicate IDs before writing any generated artifacts.
if (new Set(documents.map((doc) => doc.id)).size !== documents.length)
  throw Error('Duplicate lexicon ID');
new Lexicons(structuredClone(documents));

const models = [];
const refs = new Map();
const constants = [];
for (const doc of documents) {
  constants.push(`pub const ${snake(short(doc.id))} = ${quote(doc.id)}`);
  const prefix = pascal(short(doc.id).replace(/\.defs$/, ''));
  for (const [key, def] of Object.entries(doc.defs)) {
    const name = prefix + (key === 'main' ? '' : pascal(key));
    if (def.type === 'record' || def.type === 'object') {
      models.push({ name, schema: def.type === 'record' ? def.record : def, id: doc.id });
      refs.set(`${doc.id}#${key}`, name);
      if (key === 'main') refs.set(doc.id, name);
    } else if (def.type === 'query' || def.type === 'procedure') {
      if (def.parameters)
        models.push({ name: `${name}Parameters`, schema: def.parameters, id: doc.id });
      if (def.input?.schema)
        models.push({ name: `${name}Input`, schema: def.input.schema, id: doc.id });
      if (def.output?.schema)
        models.push({ name: `${name}Output`, schema: def.output.schema, id: doc.id });
    } else throw Error(`Unsupported definition type: ${def.type}`);
  }
}
const resolveRef = (ref, id) => {
  const name = refs.get(ref.startsWith('#') ? id + ref : ref);
  if (!name) throw Error(`Unresolved reference ${ref}`);
  return name;
};
function fieldType(field, id) {
  switch (field.type) {
    case 'string':
      return 'String';
    case 'integer':
      return 'Int';
    case 'ref':
      return resolveRef(field.ref, id);
    case 'array':
      return `List(${fieldType(field.items, id)})`;
    default:
      throw Error(`Unsupported field type: ${field.type}`);
  }
}
function encode(field, value, id) {
  switch (field.type) {
    case 'string':
      return `json.string(${value})`;
    case 'integer':
      return `json.int(${value})`;
    case 'ref':
      return `encode_${snake(resolveRef(field.ref, id))}(${value})`;
    case 'array':
      return `json.array(${value}, fn(item) { ${encode(field.items, 'item', id)} })`;
    default:
      throw Error(`Unsupported field type: ${field.type}`);
  }
}
const gleam = [
  `//// ${banner}`,
  'import gleam/json',
  'import gleam/list',
  'import gleam/option.{type Option, None, Some}',
  ...constants,
];
for (const { name, schema, id } of models) {
  const fields = Object.entries(schema.properties);
  const required = new Set(schema.required ?? []);
  if ([...required].some((key) => !Object.hasOwn(schema.properties, key)))
    throw Error(`Unknown required field in ${name}`);
  gleam.push(
    `pub type ${name} { ${name}(${fields
      .map(([key, field]) => {
        const type = fieldType(field, id);
        return `${snake(key)}: ${required.has(key) ? type : `Option(${type})`}`;
      })
      .join(', ')}) }`,
  );
  const mandatory = fields
    .filter(([key]) => required.has(key))
    .map(([key, field]) => `#(${quote(key)}, ${encode(field, `value.${snake(key)}`, id)})`);
  const optional = fields
    .filter(([key]) => !required.has(key))
    .map(
      ([key, field]) =>
        `let fields = list.append(fields, case value.${snake(key)} { None -> [] Some(item) -> [#(${quote(key)}, ${encode(field, 'item', id)})] })`,
    );
  gleam.push(`pub fn encode_${snake(name)}(value: ${name}) -> json.Json {
    let fields = [${mandatory.join(', ')}]
    ${optional.join('\n')}
    json.object(fields)
  }`);
}
const formatted = execFileSync('gleam', ['format', '--stdin'], {
  input: gleam.join('\n\n') + '\n',
  encoding: 'utf8',
});
const outputs = new Map();
for (const [i, source] of sources.entries()) {
  const expectedId = relative(definitions, source)
    .replaceAll('\\', '/')
    .replace(/\.pkl$/, '')
    .replaceAll('/', '.');
  if (documents[i].id !== expectedId) throw Error(`ID does not match Pkl path: ${source}`);
  outputs.set(
    join(root, 'lexicons', relative(definitions, source).replace(/\.pkl$/, '.json')),
    JSON.stringify(documents[i], null, 2) + '\n',
  );
}
outputs.set(join(root, 'src/fluentci_api/lexicon/models.gleam'), formatted);
const schemasPath = join(root, 'src/fluentci_api/lexicon/schemas.mjs');
const schemasSource = `// ${banner}\nexport const ids = ${JSON.stringify(Object.fromEntries(documents.map((doc) => [snake(short(doc.id)), doc.id])), null, 2)};\nexport const schemas = ${JSON.stringify(documents, null, 2)};\n`;
outputs.set(
  schemasPath,
  await format(schemasSource, { ...(await resolveConfig(schemasPath)), filepath: schemasPath }),
);
const stale = (await files(join(root, 'lexicons'), '.json')).filter((path) => !outputs.has(path));
if (stale.length)
  throw Error(
    `Remove lexicons without Pkl sources: ${stale.map((path) => relative(root, path)).join(', ')}`,
  );
const outdated = [];
for (const [path, contents] of outputs) {
  if (check) {
    const current = await readFile(path, 'utf8').catch((error) => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (current !== contents) outdated.push(relative(root, path));
  } else {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, contents);
  }
}
if (outdated.length)
  throw Error(
    `Generated lexicons are out of date. Run bun run lexicons:generate.\n${outdated.join('\n')}`,
  );
console.info(`${check ? 'Checked' : 'Generated'} ${documents.length} lexicons and Gleam models.`);
