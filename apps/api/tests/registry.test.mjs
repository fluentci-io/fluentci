import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { Secp256k1Keypair } from '@atproto/crypto';
import { createServiceJwt } from '@atproto/xrpc-server';
import { WebSocketServer } from 'ws';
process.env.FLUENTCI_API_ROOT = fileURLToPath(new URL('..', import.meta.url));
const db = await import('../build/dev/javascript/fluentci_api/fluentci_api/db/client.mjs');
const nativeDb =
  await import('../build/dev/javascript/fluentci_api/fluentci_api/db/client_ffi.mjs');
const runtime =
  await import('../build/dev/javascript/fluentci_api/fluentci_api/node/runtime_ffi.mjs');
const { register } =
  await import('../build/dev/javascript/fluentci_api/fluentci_api/xrpc/routes.mjs');
const { ingest } =
  await import('../build/dev/javascript/fluentci_api/fluentci_api/jetstream/client.mjs');
const wire =
  await import('../build/dev/javascript/fluentci_api/fluentci_api/jetstream/client_ffi.mjs');
const model = await import('../build/dev/javascript/fluentci_api/fluentci_api/model.mjs');
const did = 'did:plc:abcdefghijklmnopqrstuvwx';
const other = 'did:plc:zyxwvutsrqponmlkjihgfedcb';
const cid = 'bafyreia'.padEnd(59, 'a');
const wasm = Buffer.from([0, 97, 115, 109, 1, 0, 0, 0]);
const digest = createHash('sha256').update(wasm).digest('hex');
function event(name = 'hello', version = '1.0.0', time = 100, author = did, overrides = {}) {
  return {
    did: author,
    time_us: time,
    kind: 'commit',
    commit: {
      operation: 'create',
      collection: 'io.fluentci.plugin',
      rkey: `${name}-${version}`,
      cid,
      record: {
        $type: 'io.fluentci.plugin',
        name,
        version,
        description: 'Useful build pipeline',
        author,
        license: 'MIT',
        publishedAt: '2026-11-05T00:00:00.000Z',
        url: `https://plugins.example/${name}.wasm`,
        sha256: digest,
        size: 8,
        ...overrides,
      },
    },
  };
}
async function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'fluentci-api-test-'));
  const connection = await nativeDb.open({ url: `file:${join(dir, 'registry.sqlite')}` });
  connection.testUrl = `file:${join(dir, 'registry.sqlite')}`;
  t.after(async () => {
    await db.close(connection);
    rmSync(dir, { recursive: true, force: true });
  });
  return connection;
}
async function add(connection, ...events) {
  for (const e of events) await ingest(connection, JSON.stringify(e));
}
async function server(t, connection, options = {}) {
  const instance = runtime.create(connection, options);
  register(instance, connection);
  const http = runtime.app(instance).listen(0, '127.0.0.1');
  await once(http, 'listening');
  t.after(() => new Promise((resolve) => http.close(resolve)));
  return { instance, url: `http://127.0.0.1:${http.address().port}` };
}

test('welcome page has ASCII art, site links and an XRPC health route', async (t) => {
  const connection = await fixture(t);
  const { url } = await server(t, connection);
  const plain = await fetch(url);
  assert.equal(plain.status, 200);
  assert.match(plain.headers.get('content-type'), /text\/plain/);
  const text = await plain.text();
  assert.ok(text.includes('| |_|'));
  assert.ok(text.includes('https://fluentci.io'));
  assert.ok(text.includes('https://docs.fluentci.io'));
  assert.ok(text.includes('API endpoints are under /xrpc'));
  const html = await fetch(url, { headers: { Accept: 'text/html' } });
  assert.match(html.headers.get('content-type'), /text\/html/);
  assert.ok((await html.text()).includes('href="https://docs.fluentci.io"'));
  const icon = await fetch(url + '/favicon.ico');
  assert.equal(icon.status, 200);
  assert.equal(Buffer.from(await icon.arrayBuffer()).readUInt16LE(2), 1);
  for (const path of ['/xrpc/_health', '/health']) {
    const health = await fetch(url + path);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
  }
});

test('migrations, search, SemVer latest selection, and stable query-bound pagination', async (t) => {
  const connection = await fixture(t);
  await add(
    connection,
    event('alpha', '1.9.0', 100),
    event('alpha', '1.10.0', 101),
    event('alpha', '2.0.0-beta.1', 102),
    event('beta', '1.0.0', 103),
  );
  assert.equal((await db.get_package(connection, 'alpha', '', did)).version, '1.10.0');
  let page = await db.list_packages(connection, '', '', 2, '');
  assert.equal(page.packages.toArray().length, 2);
  const next = await db.list_packages(connection, '', '', 2, page.cursor[0]);
  assert.equal(next.packages.toArray().length, 2);
  assert.equal(
    new Set([...page.packages.toArray(), ...next.packages.toArray()].map((p) => p.uri)).size,
    4,
  );
  assert.throws(() => db.list_packages(connection, 'alpha', '', 2, page.cursor[0]), /Cursor/);
  assert.equal((await db.list_packages(connection, '%', '', 20, '')).packages.toArray().length, 0);
  assert.equal(
    (await db.list_packages(connection, 'Useful', '', 20, '')).packages.toArray().length,
    4,
  );
});

test('Jetstream is idempotent, rejects forged records, and ignores deletes and persists account state', async (t) => {
  const connection = await fixture(t);
  const first = event();
  await add(connection, first, first);
  assert.equal((await db.list_packages(connection, '', '', 20, '')).packages.toArray().length, 1);
  await add(
    connection,
    event('forged', '1.0.0', 110, did, { author: other }),
    event('bad-url', '1.0.0', 111, did, { url: 'https://example.com/archive.zip' }),
  );
  assert.equal((await db.list_packages(connection, '', '', 20, '')).packages.toArray().length, 1);
  const deleted = { ...first, time_us: 200, commit: { ...first.commit, operation: 'delete' } };
  await add(connection, deleted, deleted, { ...first, time_us: 150 });
  assert.equal((await db.list_packages(connection, '', '', 20, '')).packages.toArray().length, 1);
  assert.equal(await db.cursor(connection), 200);
  await add(connection, { ...first, time_us: 300 });
  await add(connection, { kind: 'account', did, time_us: 400, account: { active: false } });
  assert.equal((await db.list_packages(connection, '', '', 20, '')).packages.toArray().length, 0);
  await add(connection, { kind: 'account', did, time_us: 500, account: { active: true } });
  assert.equal((await db.list_packages(connection, '', '', 20, '')).packages.toArray().length, 1);
});

test('package names are publisher scoped and getPackage rejects ambiguous names', async (t) => {
  const connection = await fixture(t);
  await add(connection, event(), event('hello', '1.0.0', 101, other));
  await assert.rejects(db.get_package(connection, 'hello', '', ''), /disambiguate/);
  assert.equal((await db.get_package(connection, 'hello', '1.0.0', other)).author, other);
});

test('real XRPC query routes return validated schemas, pagination, and useful errors', async (t) => {
  const connection = await fixture(t);
  await add(connection, event());
  const { url } = await server(t, connection);
  const get = await fetch(`${url}/xrpc/io.fluentci.registry.getPackage?name=hello&author=${did}`);
  assert.equal(get.status, 200);
  assert.equal((await get.json()).package.url, 'https://plugins.example/hello.wasm');
  const search = await fetch(`${url}/xrpc/io.fluentci.registry.searchPackages?q=hello`);
  assert.equal(search.status, 200);
  assert.equal((await search.json()).packages.length, 1);
  const list = await fetch(`${url}/xrpc/io.fluentci.registry.listPackages?limit=1`);
  assert.equal(list.status, 200);
  const invalid = await fetch(`${url}/xrpc/io.fluentci.registry.listPackages?limit=101`);
  assert.equal(invalid.status, 400);
  const missing = await fetch(`${url}/xrpc/io.fluentci.registry.getPackage?name=missing`);
  assert.equal((await missing.json()).error, 'PackageNotFound');
});

test('function signatures survive Jetstream, SQLite and every registry response', async (t) => {
  const connection = await fixture(t);
  const functions = [
    {
      name: 'build',
      description: 'Build source files',
      inputFormat: 'json',
      args: [
        { name: 'directory', type: 'string', description: 'Source directory', required: true },
        { name: 'verbose', type: 'boolean', required: false },
      ],
      returnType: 'Effect String',
      wasmParams: [],
      wasmResults: ['i32'],
    },
  ];
  await add(
    connection,
    event('sccache', '1.0.0', 100, did, {
      functions,
      repository: 'https://github.com/fluentci-io/fluentci',
      subdir: 'examples/sccache',
      logo: 'https://cdn.example/sccache.png',
      topics: ['cache', 'rust'],
      os: ['linux', 'macos', 'freebsd'],
      arch: ['x86_64', 'aarch64'],
      readmeUrl: 'https://raw.githubusercontent.com/fluentci-io/fluentci/main/README.md',
    }),
  );
  const { url } = await server(t, connection);
  for (const method of ['getPackage?name=sccache', 'listPackages', 'searchPackages?q=sccache']) {
    const response = await fetch(`${url}/xrpc/io.fluentci.registry.${method}`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual((body.package ?? body.packages[0]).functions, functions);
    assert.equal((body.package ?? body.packages[0]).logo, 'https://cdn.example/sccache.png');
    assert.equal((body.package ?? body.packages[0]).subdir, 'examples/sccache');
    assert.deepEqual((body.package ?? body.packages[0]).topics, ['cache', 'rust']);
    assert.deepEqual((body.package ?? body.packages[0]).os, ['linux', 'macos', 'freebsd']);
    assert.deepEqual((body.package ?? body.packages[0]).arch, ['x86_64', 'aarch64']);
    assert.equal(
      (body.package ?? body.packages[0]).readmeUrl,
      'https://raw.githubusercontent.com/fluentci-io/fluentci/main/README.md',
    );
    assert.equal(
      (body.package ?? body.packages[0]).repository,
      'https://github.com/fluentci-io/fluentci',
    );
  }
  for (const overrides of [
    { repository: 'https://example.com/repo', subdir: '../outside' },
    { subdir: 'modules/cache' },
    { logo: 'file:///tmp/logo.png' },
    { logo: 'https://user:password@example.com/logo.png' },
    { repository: 'https://user:secret@example.com/repo' },
    { readmeUrl: 'file:///tmp/README.md' },
    { readmeUrl: 'https://user:secret@example.com/README.md' },
    { topics: ['cache', 'cache'] },
    { topics: ['Cache'] },
    { topics: ['a'.repeat(51)] },
    { os: ['linux', 'linux'] },
    { arch: ['ARM64'] },
  ]) {
    assert.equal(
      wire.decodeEvent(JSON.stringify(event('unsafe-source', '1.0.0', 102, did, overrides))).isOk(),
      false,
    );
  }
  const malformed = event('bad-signature', '1.0.0', 101, did, {
    functions: [
      { name: 'build', args: [{ name: 'missing-type' }], wasmParams: [], wasmResults: [] },
    ],
  });
  assert.equal(wire.decodeEvent(JSON.stringify(malformed)).isOk(), false);
});

test('publish requires scoped service auth, validates Wasm, and sends immutable objects to S3', async (t) => {
  const connection = await fixture(t);
  const keypair = await Secp256k1Keypair.create();
  const { instance, url } = await server(t, connection, {
    resolveSigningKey: async () => keypair.did(),
  });
  const oldBucket = process.env.S3_BUCKET,
    oldUrl = process.env.S3_PUBLIC_URL;
  process.env.S3_BUCKET = 'plugins';
  process.env.S3_PUBLIC_URL = 'https://cdn.example/artifacts';
  t.after(() => {
    if (oldBucket === undefined) delete process.env.S3_BUCKET;
    else process.env.S3_BUCKET = oldBucket;
    if (oldUrl === undefined) delete process.env.S3_PUBLIC_URL;
    else process.env.S3_PUBLIC_URL = oldUrl;
  });
  const commands = [];
  instance.s3 = { send: async (command) => commands.push(command) };
  const endpoint = `${url}/xrpc/io.fluentci.registry.publish`;
  const anonymous = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/wasm' },
    body: wasm,
  });
  assert.equal(anonymous.status, 401);
  const jwt = await createServiceJwt({
    iss: did,
    aud: 'did:web:api.fluentci.io',
    lxm: 'io.fluentci.registry.publish',
    keypair,
  });
  const headers = { 'Content-Type': 'application/wasm', Authorization: `Bearer ${jwt}` };
  const invalid = await fetch(endpoint, { method: 'POST', headers, body: Buffer.from('not wasm') });
  assert.equal(invalid.status, 400);
  assert.equal(commands.length, 0);
  const badJwt = await createServiceJwt({
    iss: did,
    aud: 'did:web:other.example',
    lxm: 'io.fluentci.registry.publish',
    keypair,
  });
  assert.equal(
    (
      await fetch(endpoint, {
        method: 'POST',
        headers: { ...headers, Authorization: `Bearer ${badJwt}` },
        body: wasm,
      })
    ).status,
    401,
  );
  const uploaded = await fetch(endpoint, { method: 'POST', headers, body: wasm });
  assert.equal(uploaded.status, 200);
  const output = await uploaded.json();
  assert.equal(output.sha256, digest);
  assert.equal(output.size, 8);
  assert.ok(output.url.endsWith('.wasm'));
  assert.equal(commands.length, 1);
  assert.deepEqual(commands[0].input.Body, wasm);
  assert.equal(commands[0].input.ContentType, 'application/wasm');
  assert.match(commands[0].input.CacheControl, /immutable/);
  const { parse } = await import('@bytecodealliance/jco');
  const component = Buffer.from(
    await parse(`(component
    (core module $m (func (export "add") (param i32 i32) (result i32) local.get 0 local.get 1 i32.add))
    (core instance $i (instantiate $m))
    (func (export "add") (param "left" u32) (param "right" u32) (result u32)
      (canon lift (core func $i "add"))))`),
  );
  const componentResponse = await fetch(endpoint, { method: 'POST', headers, body: component });
  assert.equal(componentResponse.status, 200);
  assert.equal(
    (await componentResponse.json()).sha256,
    createHash('sha256').update(component).digest('hex'),
  );
  assert.deepEqual(commands[1].input.Body, component);
  const invalidComponent = Buffer.from([0, 97, 115, 109, 13, 0, 1, 0, 7, 127]);
  assert.equal(
    (await fetch(endpoint, { method: 'POST', headers, body: invalidComponent })).status,
    400,
  );
  assert.equal(commands.length, 2);
  instance.s3 = {
    send: async () => {
      throw Error('storage offline');
    },
  };
  assert.equal((await fetch(endpoint, { method: 'POST', headers, body: wasm })).status, 503);
});

test('Jetstream subscribes to the collection and indexes a real WebSocket message', async (t) => {
  const connection = await fixture(t);
  const ws = new WebSocketServer({ port: 0, host: '127.0.0.1' });
  await once(ws, 'listening');
  let query;
  ws.on('connection', (socket, request) => {
    query = new URL(request.url, 'http://localhost');
    socket.send(JSON.stringify(event('socket-plugin', '1.0.0', 123)));
  });
  const stop = wire.start(connection, ingest, { url: `ws://127.0.0.1:${ws.address().port}` });
  t.after(async () => {
    stop();
    await stop.drain();
    for (const client of ws.clients) client.terminate();
    await new Promise((resolve) => ws.close(resolve));
  });
  for (let i = 0; i < 100; i++) {
    if (
      (await db.cursor({ ...connection, source: `ws://127.0.0.1:${ws.address().port}/` })) === 123
    )
      break;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.equal(query.searchParams.get('wantedCollections'), 'io.fluentci.plugin');
  assert.equal(
    (await db.get_package(connection, 'socket-plugin', '1.0.0', did)).name,
    'socket-plugin',
  );
});

test('FTS5 supports prefixes, accents and literal input, and follows updates while ignoring deletes', async (t) => {
  const connection = await fixture(t);
  await add(
    connection,
    event('rust-build', '1.0.0', 100, did, { description: 'Café compiler tooling' }),
  );
  const search = async (q) =>
    (await db.list_packages(connection, q, '', 20, '')).packages.toArray();
  assert.equal((await search('comp')).length, 1);
  assert.equal((await search('cafe')).length, 1);
  assert.equal((await search('rust tool')).length, 1);
  assert.equal((await search('omp')).length, 0);
  assert.equal((await search('" OR * --')).length, 0);
  assert.equal((await search('*()')).length, 0);
  await add(
    connection,
    event('rust-build', '1.0.0', 200, did, { description: 'Formatter workflow' }),
  );
  assert.equal((await search('compiler')).length, 0);
  assert.equal((await search('format')).length, 1);
  const deleted = event('rust-build', '1.0.0', 300);
  deleted.commit.operation = 'delete';
  await add(connection, deleted);
  assert.equal((await search('format')).length, 1);
  await add(
    connection,
    event('rust-build', '1.0.0', 250, did, { description: 'Compiler pipeline' }),
  );
  assert.equal((await search('compiler')).length, 1);
});

async function waitFor(check) {
  for (let i = 0; i < 250; i++) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.fail('Timed out waiting for Jetstream');
}
async function stream(t) {
  const ws = new WebSocketServer({ port: 0, host: '127.0.0.1' });
  await once(ws, 'listening');
  t.after(async () => {
    for (const client of ws.clients) client.terminate();
    await new Promise((resolve) => ws.close(resolve));
  });
  return { ws, url: `ws://127.0.0.1:${ws.address().port}/subscribe` };
}

test('multiple Jetstreams deduplicate revisions, keep independent cursors and reconnect after failure', async (t) => {
  const connection = await fixture(t);
  const first = await stream(t),
    second = await stream(t);
  const one = event('first', '1.0.0', 20_000_000);
  one.commit.rev = '3l3qo2vutsw2b';
  const overlapping = { ...one, time_us: 30_000_000 };
  const two = event('second', '1.0.0', 15_000_000);
  two.commit.rev = '3l3qo2vutsw2c';
  let firstConnections = 0,
    secondConnections = 0,
    replayCursor;
  let writes = 0;
  await connection.client.execute('CREATE TABLE test_writes (uri TEXT)');
  await connection.client.execute(
    'CREATE TRIGGER test_plugin_insert AFTER INSERT ON plugin_records BEGIN INSERT INTO test_writes(uri) VALUES(new.uri); END',
  );
  await connection.client.execute(
    'CREATE TRIGGER test_plugin_update AFTER UPDATE ON plugin_records BEGIN INSERT INTO test_writes(uri) VALUES(new.uri); END',
  );
  first.ws.on('connection', (socket) => {
    firstConnections++;
    socket.send(JSON.stringify(one));
  });
  second.ws.on('connection', (socket, request) => {
    secondConnections++;
    if (secondConnections === 1) {
      socket.send(JSON.stringify(overlapping));
      socket.send(JSON.stringify(two));
    } else replayCursor = new URL(request.url, 'http://localhost').searchParams.get('cursor');
  });
  const stop = wire.start(connection, ingest, {
    urls: [first.url, first.url, second.url],
    retryDelayMs: 20,
  });
  t.after(async () => {
    stop();
    await stop.drain();
  });
  await waitFor(
    async () =>
      (await db.cursor({ ...connection, source: first.url })) === 20_000_000 &&
      (await db.cursor({ ...connection, source: second.url })) === 30_000_000,
  );
  assert.equal((await db.list_packages(connection, '', '', 20, '')).packages.toArray().length, 2);
  writes = Number(
    (await connection.client.execute('SELECT count(*) AS n FROM test_writes')).rows[0].n,
  );
  assert.equal(writes, 2);
  assert.equal(
    Number(
      (await connection.client.execute('SELECT count(*) AS n FROM jetstream_events')).rows[0].n,
    ),
    2,
  );
  for (const client of second.ws.clients) client.terminate();
  await waitFor(() => secondConnections === 2);
  assert.equal(replayCursor, '20000000');
  assert.equal(firstConnections, 1);
  const third = event('third', '1.0.0', 40_000_000);
  for (const client of first.ws.clients) client.send(JSON.stringify(third));
  await waitFor(async () => (await db.cursor({ ...connection, source: first.url })) === 40_000_000);
  assert.equal((await db.get_package(connection, 'third', '1.0.0', did)).name, 'third');
});

test('dedup survives reopening SQLite and a failed transaction leaves identity and cursor retryable', async (t) => {
  const connection = await fixture(t);
  const original = event('durable', '1.0.0', 100);
  original.commit.rev = '3l3qo2vutsw2b';
  await add(connection, original);
  await db.close(connection);
  Object.assign(connection, await nativeDb.open({ url: connection.testUrl }));
  await add({ ...connection, source: 'second-source' }, { ...original, time_us: 200 });
  assert.equal(
    Number(
      (await connection.client.execute('SELECT count(*) AS n FROM jetstream_events')).rows[0].n,
    ),
    1,
  );
  assert.equal(
    Number(
      (await connection.client.execute('SELECT event_time FROM plugin_records')).rows[0].event_time,
    ),
    100,
  );
  assert.equal(await db.cursor({ ...connection, source: 'second-source' }), 200);
  await connection.client.execute(
    "CREATE TRIGGER test_checkpoint_failure BEFORE INSERT ON checkpoints BEGIN SELECT RAISE(ABORT, 'checkpoint failed'); END",
  );
  const next = event('retry', '1.0.0', 300);
  await assert.rejects(add(connection, next), (error) => {
    assert.match(error.cause?.message ?? '', /checkpoint failed/);
    return true;
  });
  assert.equal(
    Number(
      (await connection.client.execute('SELECT count(*) AS n FROM jetstream_events')).rows[0].n,
    ),
    1,
  );
  assert.equal((await db.list_packages(connection, '', '', 20, '')).packages.toArray().length, 1);
  assert.equal(await db.cursor(connection), 100);
  await connection.client.execute('DROP TRIGGER test_checkpoint_failure');
  await add(connection, next);
  assert.equal(await db.cursor(connection), 300);
  assert.equal((await db.get_package(connection, 'retry', '1.0.0', did)).name, 'retry');
});

test('publisher-scoped identity permits other publishers and new versions but rejects duplicate versions', async (t) => {
  const connection = await fixture(t);
  await add(
    connection,
    event('same-name', '1.0.0', 100),
    event('same-name', '2.0.0', 101),
    event('same-name', '1.0.0', 102, other),
  );
  assert.equal((await db.list_packages(connection, '', did, 20, '')).packages.toArray().length, 2);
  assert.equal((await db.get_package(connection, 'same-name', '1.0.0', other)).author, other);
  const duplicate = event('same-name', '1.0.0', 103);
  duplicate.commit.rkey = 'alternate-key';
  await add(connection, duplicate);
  assert.equal((await db.list_packages(connection, '', '', 20, '')).packages.toArray().length, 3);
  await assert.rejects(
    connection.client.execute({
      sql: 'INSERT INTO plugin_records(uri, author, name, version, deleted, event_time) VALUES (?, ?, ?, ?, ?, ?)',
      args: ['at://alternate/record', did, 'same-name', '1.0.0', 0, 104],
    }),
    /UNIQUE/,
  );
});

test('upgrading an existing registry backfills the FTS5 index', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'fluentci-upgrade-'));
  const migrations = join(directory, 'old-migrations');
  mkdirSync(join(migrations, 'meta'), { recursive: true });
  const apiRoot = fileURLToPath(new URL('..', import.meta.url));
  writeFileSync(
    join(migrations, '0000_registry.sql'),
    readFileSync(join(apiRoot, 'drizzle/0000_registry.sql')),
  );
  const journal = JSON.parse(readFileSync(join(apiRoot, 'drizzle/meta/_journal.json'), 'utf8'));
  journal.entries = journal.entries.slice(0, 1);
  writeFileSync(join(migrations, 'meta/_journal.json'), JSON.stringify(journal));
  const url = `file:${join(directory, 'registry.sqlite')}`;
  let connection = await nativeDb.open({ url, migrationsFolder: migrations });
  t.after(async () => {
    await db.close(connection);
    rmSync(directory, { recursive: true, force: true });
  });
  const plugin = event('preexisting', '1.0.0', 100).commit.record;
  await connection.client.execute({
    sql: 'INSERT INTO plugin_records(uri,cid,author,name,description,version,published_at,license,url,sha256,size,deleted,event_time) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
    args: [
      `at://${did}/io.fluentci.plugin/preexisting-1.0.0`,
      cid,
      did,
      plugin.name,
      plugin.description,
      plugin.version,
      plugin.publishedAt,
      plugin.license,
      plugin.url,
      plugin.sha256,
      plugin.size,
      0,
      100,
    ],
  });
  await db.close(connection);
  connection = await nativeDb.open({ url });
  const matches = (await db.list_packages(connection, 'preexist', '', 20, '')).packages.toArray();
  assert.equal(matches.length, 1);
  assert.equal(matches[0].name, 'preexisting');
  const counters = await connection.client.execute('SELECT downloads FROM plugin_records');
  assert.equal(counters.rows[0].downloads, 0);
});

test('download counts default to zero and survive Jetstream metadata updates', async (t) => {
  const connection = await fixture(t);
  await add(connection, event('counter', '1.0.0', 100));
  const query = async () =>
    (await connection.client.execute("SELECT downloads FROM plugin_records WHERE name='counter'"))
      .rows[0].downloads;
  assert.equal(await query(), 0);
  await connection.client.execute("UPDATE plugin_records SET downloads=42 WHERE name='counter'");
  await add(connection, event('counter', '1.0.0', 200, did, { topics: ['cache'] }));
  assert.equal(await query(), 42);
  await assert.rejects(
    connection.client.execute("UPDATE plugin_records SET downloads=-1 WHERE name='counter'"),
  );
});

test('author PDS update events refresh metadata without resetting counters or accepting stale revisions', async (t) => {
  const connection = await fixture(t);
  await add(connection, event('editable', '1.0.0', 100));
  await connection.client.execute("UPDATE plugin_records SET downloads=7 WHERE name='editable'");
  const updated = event('editable', '1.0.0', 300, did, {
    description: 'Updated by the author in their PDS',
    topics: ['cache', 'rust'],
    os: ['linux', 'freebsd'],
    arch: ['x86_64', 'aarch64'],
    readmeUrl: 'https://example.com/docs/README.md',
    logo: 'https://example.com/logo.png',
  });
  updated.commit.operation = 'update';
  updated.commit.rev = 'metadata-update-2';
  updated.commit.cid = 'bafyreia'.padEnd(58, 'b') + 'a';
  await add(connection, updated, updated);
  const stale = event('editable', '1.0.0', 200, did, { description: 'stale' });
  stale.commit.operation = 'update';
  stale.commit.rev = 'metadata-update-1';
  await add(connection, stale);
  const { url } = await server(t, connection);
  const response = await fetch(`${url}/xrpc/io.fluentci.registry.getPackage?name=editable`);
  assert.equal(response.status, 200);
  const { package: plugin } = await response.json();
  assert.equal(plugin.description, updated.commit.record.description);
  assert.deepEqual(plugin.topics, ['cache', 'rust']);
  assert.deepEqual(plugin.os, ['linux', 'freebsd']);
  assert.deepEqual(plugin.arch, ['x86_64', 'aarch64']);
  assert.equal(plugin.readmeUrl, updated.commit.record.readmeUrl);
  assert.equal(plugin.logo, updated.commit.record.logo);
  assert.equal(plugin.cid, updated.commit.cid);
  const rows = await connection.client.execute(
    "SELECT downloads FROM plugin_records WHERE name='editable'",
  );
  assert.equal(rows.rows[0].downloads, 7);
});

test('versioned upload paths use the verified handle, bare SemVer metadata and conditional writes', async (t) => {
  const connection = await fixture(t);
  const keypair = await Secp256k1Keypair.create();
  const { instance, url } = await server(t, connection, {
    resolveSigningKey: async () => keypair.did(),
    resolvePublisherHandle: async () => 'alice.example',
  });
  const oldBucket = process.env.S3_BUCKET;
  const oldUrl = process.env.S3_PUBLIC_URL;
  process.env.S3_BUCKET = 'modules';
  process.env.S3_PUBLIC_URL = 'https://mod.fluentci.io';
  t.after(() => {
    if (oldBucket === undefined) delete process.env.S3_BUCKET;
    else process.env.S3_BUCKET = oldBucket;
    if (oldUrl === undefined) delete process.env.S3_PUBLIC_URL;
    else process.env.S3_PUBLIC_URL = oldUrl;
  });
  const commands = [];
  instance.s3 = { send: async (command) => commands.push(command) };
  const jwt = await createServiceJwt({
    iss: did,
    aud: 'did:web:api.fluentci.io',
    lxm: 'io.fluentci.registry.publish',
    keypair,
  });
  const endpoint = `${url}/xrpc/io.fluentci.registry.publish`;
  const upload = (params) =>
    fetch(`${endpoint}?${new URLSearchParams(params)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/wasm', Authorization: `Bearer ${jwt}` },
      body: wasm,
    });
  const valid = await upload({ name: 'hello-ci', version: '1.0.0-beta.1' });
  assert.equal(valid.status, 200);
  assert.equal(
    (await valid.json()).url,
    'https://mod.fluentci.io/@alice.example/hello-ci/v1.0.0-beta.1/hello-ci.wasm',
  );
  assert.equal(commands[0].input.Key, '@alice.example/hello-ci/v1.0.0-beta.1/hello-ci.wasm');
  assert.equal(commands[0].input.IfNoneMatch, '*');
  for (const params of [
    { name: 'hello-ci' },
    { name: '../escape', version: '1.0.0' },
    { name: 'hello-ci', version: 'v1.0.0' },
    { name: 'hello-ci', version: '1.0.0+build' },
  ]) {
    assert.equal((await upload(params)).status, 400);
  }
  assert.equal(commands.length, 1);
  process.env.S3_PUBLIC_URL = 'https://modules.fluentci.io';
  const proxied = await upload({ name: 'hello-ci', version: '2.0.0' });
  assert.equal(proxied.status, 200);
  assert.equal(
    (await proxied.json()).url,
    'https://modules.fluentci.io/alice.example/hello-ci/v2.0.0/hello-ci.wasm',
  );
  assert.equal(commands[1].input.Key, '@alice.example/hello-ci/v2.0.0/hello-ci.wasm');
  instance.s3 = {
    send: async () => {
      const error = new Error('exists');
      error.$metadata = { httpStatusCode: 412 };
      throw error;
    },
  };
  const conflict = await upload({ name: 'hello-ci', version: '1.0.0' });
  assert.equal(conflict.status, 409);
  assert.equal((await conflict.json()).error, 'PackageVersionExists');
  instance.options.resolvePublisherHandle = async () => '../../escape';
  assert.equal((await upload({ name: 'hello-ci', version: '1.0.0' })).status, 400);
});

test('actor package feed resolves identities and paginates only visible published versions', async (t) => {
  const connection = await fixture(t);
  await add(
    connection,
    event('alpha', '1.0.0', 100),
    event('alpha', '2.0.0', 101),
    event('beta', '1.0.0', 102),
    event('unrelated', '1.0.0', 103, other),
  );
  const { url } = await server(t, connection, {
    resolveActor: async (actor) =>
      actor === 'alice.example' ? did : actor.startsWith('did:') ? actor : null,
  });
  const base = `${url}/xrpc/io.fluentci.registry.getActorPackages`;
  const first = await fetch(`${base}?actor=alice.example&limit=2`);
  assert.equal(first.status, 200);
  const page = await first.json();
  assert.equal(page.packages.length, 2);
  assert.ok(page.packages.every((pkg) => pkg.author === did));
  assert.ok(page.cursor);
  const next = await fetch(
    `${base}?actor=${encodeURIComponent(did)}&limit=2&cursor=${encodeURIComponent(page.cursor)}`,
  );
  assert.equal(next.status, 200);
  const tail = await next.json();
  assert.equal(tail.packages.length, 1);
  assert.equal(tail.cursor, undefined);
  assert.equal(new Set([...page.packages, ...tail.packages].map((pkg) => pkg.uri)).size, 3);
  const mismatched = await fetch(
    `${base}?actor=${encodeURIComponent(other)}&cursor=${encodeURIComponent(page.cursor)}`,
  );
  assert.equal(mismatched.status, 400);
  assert.equal((await mismatched.json()).error, 'InvalidCursor');
  assert.equal((await fetch(base)).status, 400);
  assert.equal((await fetch(`${base}?actor=alice.example&limit=101`)).status, 400);
  assert.equal((await fetch(`${base}?actor=missing.example`)).status, 400);
  const deleted = event('beta', '1.0.0', 104);
  deleted.commit.operation = 'delete';
  delete deleted.commit.record;
  await add(connection, deleted);
  assert.equal((await db.actor_packages(connection, did, 100, '')).packages.toArray().length, 3);
  await add(connection, { kind: 'account', did, time_us: 105, account: { active: false } });
  const hidden = await fetch(`${base}?actor=${encodeURIComponent(did)}`);
  assert.deepEqual((await hidden.json()).packages, []);
});

test('public RSQL filters compose with FTS, bind cursors and reject invalid syntax', async (t) => {
  const connection = await fixture(t);
  await add(
    connection,
    event('linux-cache', '1.0.0', 100, did, {
      os: ['linux'],
      arch: ['aarch64'],
      topics: ['cache'],
    }),
    event('mac-cache', '1.0.0', 101, did, { os: ['macos'], arch: ['aarch64'], topics: ['cache'] }),
    event('win-build', '1.0.0', 102, did, { os: ['windows'], arch: ['x86_64'] }),
    event('unclassified', '1.0.0', 103),
  );
  const { url } = await server(t, connection);
  const search = (filter, extra = {}) =>
    fetch(
      `${url}/xrpc/io.fluentci.registry.searchPackages?${new URLSearchParams({ filter, ...extra })}`,
    );
  const response = await search('os==linux;arch=in=(aarch64,x86_64)', { q: 'cache' });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), '*');
  assert.deepEqual(
    (await response.json()).packages.map((p) => p.name),
    ['linux-cache'],
  );
  const grouped = await search('(os==linux,os==macos);topics==cache');
  assert.deepEqual(
    (await grouped.json()).packages.map((p) => p.name),
    ['linux-cache', 'mac-cache'],
  );
  const excluded = await search('os=out=(linux,macos)');
  assert.deepEqual(
    (await excluded.json()).packages.map((p) => p.name),
    ['unclassified', 'win-build'],
  );
  const first = await search('arch==aarch64', { limit: '1' });
  const { cursor } = await first.json();
  assert.ok(cursor);
  const next = await search('arch==aarch64', { limit: '1', cursor });
  assert.equal((await next.json()).packages.length, 1);
  assert.equal((await search('arch==x86_64', { cursor })).status, 400);
  for (const filter of [
    'downloads=gt=1',
    'os=like=linux',
    'os==lin*',
    'os==',
    'os==(linux',
    'os==linux;drop==table',
  ]) {
    assert.equal((await search(filter)).status, 400, filter);
  }
  const injection = await search('name=="\' OR 1=1 --"');
  assert.deepEqual((await injection.json()).packages, []);
});

test('daily downloads are optional, bounded to 7 UTC days and survive metadata edits', async (t) => {
  const connection = await fixture(t);
  await add(connection, event('daily'));
  const { url } = await server(t, connection);
  const endpoint = `${url}/xrpc/io.fluentci.registry.getPackage?name=daily`;
  const empty = (await (await fetch(endpoint)).json()).package;
  assert.equal(empty.downloads, 0);
  assert.equal(empty.dailyDownloads, undefined);
  const uri = `at://${did}/io.fluentci.plugin/daily-1.0.0`;
  const day = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
  for (const [offset, downloads] of [
    [-6, 4],
    [-2, 8],
    [0, 3],
    [-7, 1000],
    [1, 1000],
  ]) {
    await connection.client.execute({
      sql: 'INSERT INTO plugin_download_days (uri, date, downloads) VALUES (?, ?, ?)',
      args: [uri, day(offset), downloads],
    });
  }
  await connection.client.execute({
    sql: 'UPDATE plugin_records SET downloads = 15 WHERE uri = ?',
    args: [uri],
  });
  const update = event('daily', '1.0.0', 200, did, { topics: ['cache'], downloads: 9999 });
  update.commit.operation = 'update';
  await add(connection, update);
  const plugin = (await (await fetch(endpoint)).json()).package;
  assert.equal(plugin.downloads, 15);
  assert.equal(plugin.dailyDownloads.length, 7);
  assert.deepEqual(
    plugin.dailyDownloads.map((day) => day.downloads),
    [4, 0, 0, 0, 8, 0, 3],
  );
  assert.equal(plugin.dailyDownloads[0].date, day(-6));
  await assert.rejects(
    connection.client.execute({
      sql: 'INSERT INTO plugin_download_days VALUES (?, ?, ?)',
      args: [uri, day(2), -1],
    }),
  );
});

test('CORS allows every origin, route and preflight header including publisher auth', async (t) => {
  const connection = await fixture(t);
  const { url } = await server(t, connection);
  for (const path of [
    '/',
    '/xrpc/_health',
    '/missing',
    '/xrpc/io.fluentci.registry.getPackage?name=missing',
  ]) {
    const response = await fetch(url + path, { headers: { Origin: 'https://anywhere.example' } });
    assert.equal(response.headers.get('access-control-allow-origin'), '*', path);
    assert.equal(response.headers.get('access-control-expose-headers'), '*', path);
  }
  const response = await fetch(url + '/xrpc/io.fluentci.registry.publishPackage', {
    method: 'OPTIONS',
    headers: {
      Origin: 'https://anywhere.example',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'authorization,content-type,x-custom-header',
    },
  });
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('access-control-allow-origin'), '*');
  assert.match(response.headers.get('access-control-allow-methods'), /POST/);
  assert.equal(
    response.headers.get('access-control-allow-headers'),
    'authorization,content-type,x-custom-header',
  );
});

test('download recording requires a private token and atomically counts totals and UTC days once', async (t) => {
  const connection = await fixture(t);
  await add(connection, event('counted'));
  const token = 'trusted-worker-token-at-least-32-characters';
  const { url } = await server(t, connection, {
    trackingToken: token,
    resolveActor: async () => did,
  });
  const endpoint = `${url}/xrpc/io.fluentci.registry.recordDownload`;
  const { randomUUID } = await import('node:crypto');
  const send = (eventId, secret = token, extra = {}) =>
    fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
      },
      body: JSON.stringify({
        eventId,
        handle: 'alice.example',
        name: 'counted',
        version: '1.0.0',
        ...extra,
      }),
    });
  for (const secret of ['', 'wrong-token'])
    assert.equal((await send(randomUUID(), secret)).status, 401);
  assert.equal((await send('not-a-uuid')).status, 400);
  assert.equal((await send(randomUUID(), token, { version: 'v1.0.0' })).status, 400);
  assert.equal((await send(randomUUID(), token, { name: 'unknown' })).status, 400);
  const id = randomUUID();
  assert.deepEqual(await (await send(id)).json(), { recorded: 1, downloads: 1 });
  assert.deepEqual(await (await send(id)).json(), { recorded: 0, downloads: 1 });
  const ids = Array.from({ length: 12 }, () => randomUUID());
  const responses = await Promise.all([...ids, ...ids].map((eventId) => send(eventId)));
  for (const response of responses)
    assert.equal(response.status, 200, await response.clone().text());
  const payloads = await Promise.all(responses.map((response) => response.json()));
  assert.equal(
    payloads.reduce((sum, payload) => sum + payload.recorded, 0),
    12,
  );
  const plugin = (
    await (await fetch(`${url}/xrpc/io.fluentci.registry.getPackage?name=counted`)).json()
  ).package;
  assert.equal(plugin.downloads, 13);
  assert.equal(plugin.dailyDownloads.at(-1).downloads, 13);
  const uri = `at://${did}/io.fluentci.plugin/counted-1.0.0`;
  const ledger = await connection.client.execute({
    sql: 'SELECT count(*) AS count FROM plugin_download_events WHERE uri = ?',
    args: [uri],
  });
  assert.equal(ledger.rows[0].count, 13);
});

test('daily-counter failure rolls back the ledger and total, so the same event can retry', async (t) => {
  const connection = await fixture(t);
  await add(connection, event('retry-count'));
  const { randomUUID } = await import('node:crypto');
  const { url } = await server(t, connection, {
    trackingToken: 'a'.repeat(48),
    resolveActor: async () => did,
  });
  const eventId = randomUUID();
  const send = () =>
    fetch(`${url}/xrpc/io.fluentci.registry.recordDownload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${'a'.repeat(48)}` },
      body: JSON.stringify({
        eventId,
        handle: 'alice.example',
        name: 'retry-count',
        version: '1.0.0',
      }),
    });
  await connection.client.execute(
    "CREATE TRIGGER fail_counter BEFORE INSERT ON plugin_download_days BEGIN SELECT RAISE(ABORT, 'test counter failure'); END",
  );
  assert.equal((await send()).status, 500);
  assert.equal(
    (await connection.client.execute('SELECT count(*) AS count FROM plugin_download_events'))
      .rows[0].count,
    0,
  );
  assert.equal(
    (
      await connection.client.execute(
        "SELECT downloads FROM plugin_records WHERE name = 'retry-count'",
      )
    ).rows[0].downloads,
    0,
  );
  await connection.client.execute('DROP TRIGGER fail_counter');
  assert.deepEqual(await (await send()).json(), { recorded: 1, downloads: 1 });
});

test('download recording is disabled without a configured token', async (t) => {
  const connection = await fixture(t);
  const { url } = await server(t, connection, { trackingToken: '' });
  const response = await fetch(`${url}/xrpc/io.fluentci.registry.recordDownload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer arbitrary-token' },
    body: JSON.stringify({
      eventId: '00000000-0000-4000-8000-000000000000',
      handle: 'alice.example',
      name: 'hello',
      version: '1.0.0',
    }),
  });
  assert.equal(response.status, 503);
});

test('published URL, checksum and version stay immutable while metadata edits and lifecycle events work', async (t) => {
  const connection = await fixture(t);
  const created = event('immutable', '1.0.0', 100);
  await add(connection, created);
  const initial = await db.get_package(connection, 'immutable', '1.0.0', did);
  const changed = event('immutable', '1.0.0', 200, did, {
    url: 'https://different.example/replaced.wasm',
    sha256: 'f'.repeat(64),
    description: 'Updated documentation',
  });
  changed.commit.operation = 'update';
  await add(connection, changed);
  const updated = await db.get_package(connection, 'immutable', '1.0.0', did);
  assert.equal(updated.url, initial.url);
  assert.equal(updated.sha256, initial.sha256);
  assert.equal(updated.description, 'Updated documentation');
  await db.apply_event(
    connection,
    new model.Upsert(
      updated.withFields({
        version: '9.0.0',
        url: changed.commit.record.url,
        sha256: 'b'.repeat(64),
        description: 'Still editable',
      }),
      300,
      'immutable-version-attempt',
    ),
  );
  const preserved = await db.get_package(connection, 'immutable', '1.0.0', did);
  assert.equal(preserved.version, '1.0.0');
  assert.equal(preserved.url, initial.url);
  assert.equal(preserved.sha256, initial.sha256);
  assert.equal(preserved.description, 'Still editable');
  for (const [column, value] of [
    ['url', changed.commit.record.url],
    ['sha256', 'b'.repeat(64)],
    ['version', '9.0.0'],
    ['url', null],
  ]) {
    await assert.rejects(
      connection.client.execute({
        sql: `UPDATE plugin_records SET ${column}=? WHERE uri=?`,
        args: [value, initial.uri],
      }),
      /immutable/,
    );
  }
  const deleted = event('immutable', '1.0.0', 400);
  deleted.commit.operation = 'delete';
  delete deleted.commit.record;
  await add(connection, deleted, deleted);
  const retained = await db.get_package(connection, 'immutable', '1.0.0', did);
  assert.equal(retained.url, initial.url);
  assert.equal(retained.description, 'Still editable');
  const recreated = event('immutable', '1.0.0', 500, did, {
    url: changed.commit.record.url,
    sha256: 'c'.repeat(64),
    description: 'Restored documentation',
  });
  await add(connection, recreated);
  const restored = await db.get_package(connection, 'immutable', '1.0.0', did);
  assert.equal(restored.url, initial.url);
  assert.equal(restored.sha256, initial.sha256);
  assert.equal(restored.version, '1.0.0');
  assert.equal(restored.description, 'Restored documentation');
  await add(
    connection,
    event('immutable', '2.0.0', 600, did, {
      url: changed.commit.record.url,
      sha256: 'd'.repeat(64),
    }),
  );
  assert.equal(
    (await db.get_package(connection, 'immutable', '2.0.0', did)).sha256,
    'd'.repeat(64),
  );
});

test('ignored deletes create no tombstones and legacy tombstones can initialize their artifact identity', async (t) => {
  const connection = await fixture(t);
  const deleted = event('late', '1.0.0', 100);
  deleted.commit.operation = 'delete';
  delete deleted.commit.record;
  await add(connection, deleted);
  assert.equal(
    (await connection.client.execute('SELECT count(*) AS n FROM plugin_records')).rows[0].n,
    0,
  );
  assert.equal(await db.cursor(connection), 100);
  await connection.client.execute({
    sql: 'INSERT INTO plugin_records(uri,author,deleted,event_time) VALUES(?,?,1,100)',
    args: [`at://${did}/io.fluentci.plugin/late-1.0.0`, did],
  });
  await add(connection, event('late', '1.0.0', 200));
  const plugin = await db.get_package(connection, 'late', '1.0.0', did);
  assert.equal(plugin.url, 'https://plugins.example/late.wasm');
  assert.equal(plugin.sha256, digest);
  assert.equal(plugin.version, '1.0.0');
});

test('publisher profiles page distinct modules with exact totals and query-bound cursors', async (t) => {
  const connection = await fixture(t);
  await add(
    connection,
    event('alpha', '1.0.0', 100, did, {
      publishedAt: '2026-11-05T00:00:00.000Z',
      description: 'Old description',
    }),
    event('alpha', '2.0.0', 200, did, {
      publishedAt: '2026-11-06T00:00:00.000Z',
      description: 'Compiler tooling',
    }),
    event('beta', '1.0.0', 300, did, { publishedAt: '2026-11-07T00:00:00.000Z' }),
    event('foreign', '1.0.0', 400, other),
  );
  const first = await db.actor_profile_packages(connection, did, '', true, 1, '');
  assert.equal(first.total[0], 2);
  assert.deepEqual(
    first.packages.toArray().map((value) => value.name),
    ['beta'],
  );
  const second = await db.actor_profile_packages(connection, did, '', true, 1, first.cursor[0]);
  assert.deepEqual(
    second.packages.toArray().map((value) => [value.name, value.version]),
    [['alpha', '2.0.0']],
  );
  const filtered = await db.actor_profile_packages(connection, did, 'Compiler', true, 20, '');
  assert.equal(filtered.total[0], 2);
  assert.deepEqual(
    filtered.packages.toArray().map((value) => value.name),
    ['alpha'],
  );
  assert.equal(
    (await db.actor_profile_packages(connection, did, 'Old', true, 20, '')).packages.toArray()
      .length,
    0,
  );
  await assert.rejects(
    db.actor_profile_packages(connection, did, 'Compiler', true, 1, first.cursor[0]),
    /Cursor/,
  );
  const { url } = await server(t, connection);
  const response = await fetch(
    url +
      '/xrpc/io.fluentci.registry.getActorPackages?' +
      new URLSearchParams({ actor: did, latest: 'true', q: 'alpha' }),
  );
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.total, 2);
  assert.equal(data.packages[0].version, '2.0.0');
});

test('HTTP reads wait for the shared native transaction and inner queries do not deadlock', async () => {
  const orm = await import('../build/dev/javascript/fluentci_api/fluentci_api/drizzle/orm_ffi.mjs');
  let release;
  const held = new Promise((resolve) => {
    release = resolve;
  });
  let statements = 0;
  const native = {
    transaction: async (run) => run(native),
    update: () => {
      statements++;
      return { set: () => ({ where: () => ({ returning: () => Promise.resolve([]) }) }) };
    },
  };
  const connection = { client: {}, db: native };
  const query = { kind: 'update', table: {}, values: {}, where: undefined };
  const writer = orm.transaction(connection, async (tx) => {
    await orm.execute(tx, query);
    await held;
  });
  const reader = orm.execute(connection, query);
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(statements, 1);
  release();
  await Promise.all([writer, reader]);
  assert.equal(statements, 2);
  await assert.rejects(
    orm.transaction(connection, async () => {
      throw Error('rollback');
    }),
  );
  await orm.execute(connection, query);
  assert.equal(statements, 3);
});

test('Jetstream drains a large replay with backpressure rather than dropping its pending queue', async (t) => {
  const connection = await fixture(t);
  const ws = new WebSocketServer({ port: 0, host: '127.0.0.1' });
  await once(ws, 'listening');
  const source = `ws://127.0.0.1:${ws.address().port}/`;
  ws.on('connection', (socket) => {
    for (let time = 1; time <= 1500; time++)
      socket.send(JSON.stringify({ did, kind: 'identity', time_us: time }));
  });
  const stop = wire.start(
    connection,
    async (db, message) => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      await ingest(db, message);
    },
    { url: source, highWaterMark: 16, lowWaterMark: 8 },
  );
  t.after(async () => {
    stop();
    await stop.drain();
    for (const client of ws.clients) client.terminate();
    await new Promise((resolve) => ws.close(resolve));
  });
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline && (await db.cursor({ ...connection, source })) !== 1500)
    await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(await db.cursor({ ...connection, source }), 1500);
});
