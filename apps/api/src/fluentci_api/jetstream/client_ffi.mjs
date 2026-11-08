import { Some, None } from '../../../gleam_stdlib/gleam/option.mjs';
import { decode_wire } from '../function_metadata.mjs';
import { decode_wire as decodeLabels } from '../module_metadata.mjs';
import { RegistryPackageView as Package } from '../lexicon/models.mjs';
import WebSocket from 'ws';
import { Lexicons } from '@atproto/lexicon';
import { Upsert, Delete, Account, Checkpoint } from '../model.mjs';
import { Ok, Error as GError } from '../../gleam.mjs';
import { lexicons, COLLECTION } from '../config_ffi.mjs';
import { cursor, close } from '../db/client.mjs';
import semver from 'semver';
import { createHash } from 'node:crypto';
import { sources } from '../config_ffi.mjs';
let validators;
const eventId = (parts) => createHash('sha256').update(JSON.stringify(parts)).digest('hex');
export function decodeEvent(message) {
  try {
    validators ??= new Lexicons(lexicons());
    const event = JSON.parse(message);
    if (!Number.isSafeInteger(event.time_us) || event.time_us < 0)
      throw new Error('Invalid event time');
    if (typeof event.did !== 'string' || !event.did.startsWith('did:'))
      throw new Error('Invalid event DID');
    if (event.kind === 'account' && typeof event.account?.active === 'boolean')
      return new Ok(
        new Account(
          event.did,
          event.account.active,
          event.time_us,
          eventId(['account', event.did, event.account.seq ?? event.time_us, event.account.active]),
        ),
      );
    if (event.kind !== 'commit' || event.commit?.collection !== COLLECTION)
      return new Ok(new Checkpoint(event.time_us));
    const c = event.commit;
    if (
      typeof c.rkey !== 'string' ||
      !/^[-A-Za-z0-9._:~]{1,512}$/.test(c.rkey) ||
      ['.', '..'].includes(c.rkey)
    )
      throw new Error('Invalid record key');
    const uri = `at://${event.did}/${COLLECTION}/${c.rkey}`;
    const id = eventId([
      'commit',
      event.did,
      c.collection,
      c.rkey,
      c.operation,
      c.rev ?? [event.time_us, c.cid ?? null],
    ]);
    if (c.operation === 'delete') return new Ok(new Delete(uri, event.did, event.time_us, id));
    // An author can edit metadata directly in the PDS. Updates use the same
    // ownership/schema validation and timestamp-ordered upsert as new records.
    if (!['create', 'update'].includes(c.operation)) throw new Error('Unknown commit operation');
    const result = validators.validate(COLLECTION, c.record);
    if (!result.success) throw result.error;
    const p = c.record;
    if (p.$type !== COLLECTION || p.author !== event.did || c.rkey !== `${p.name}-${p.version}`)
      throw new Error('Record ownership or key mismatch');
    if (
      !/^[a-z][a-z0-9-]{0,63}$/.test(p.name) ||
      !semver.valid(p.version) ||
      p.version.includes('+')
    )
      throw new Error('Invalid package name/version');
    if (!/^[a-f0-9]{64}$/.test(p.sha256)) throw new Error('Invalid checksum');
    const url = new URL(p.url);
    if (
      !['https:', 'http:'].includes(url.protocol) ||
      !url.pathname.endsWith('.wasm') ||
      url.username ||
      url.password
    )
      throw new Error('Invalid Wasm URL');
    if (p.logo !== undefined) {
      const logo = new URL(p.logo);
      if (
        !['https:', 'http:'].includes(logo.protocol) ||
        !logo.hostname ||
        logo.username ||
        logo.password
      )
        throw new Error('Invalid module logo URL');
    }
    for (const [field, maxItems, maxLength, pattern] of [
      ['topics', 20, 50, /^[a-z0-9][a-z0-9-]*$/],
      ['os', 16, 32, /^[a-z0-9][a-z0-9_-]*$/],
      ['arch', 16, 32, /^[a-z0-9][a-z0-9_-]*$/],
    ]) {
      const values = p[field];
      if (
        values !== undefined &&
        (!Array.isArray(values) ||
          values.length > maxItems ||
          new Set(values).size !== values.length ||
          values.some(
            (value) =>
              typeof value !== 'string' || value.length > maxLength || !pattern.test(value),
          ))
      )
        throw new Error(`Invalid module ${field}`);
    }
    if (p.readmeUrl !== undefined) {
      const readme = new URL(p.readmeUrl);
      if (
        !['https:', 'http:'].includes(readme.protocol) ||
        !readme.hostname ||
        readme.username ||
        readme.password
      )
        throw new Error('Invalid module README URL');
    }
    if (p.repository !== undefined) {
      const repository = new URL(p.repository);
      if (
        !['https:', 'http:', 'ssh:', 'git:'].includes(repository.protocol) ||
        !repository.hostname ||
        repository.password ||
        (repository.username && repository.protocol !== 'ssh:')
      )
        throw new Error('Invalid source repository URL');
    }
    if (
      p.subdir !== undefined &&
      (!p.repository ||
        p.subdir.startsWith('/') ||
        p.subdir.includes('\\') ||
        p.subdir.includes(':') ||
        p.subdir.split('/').includes('..'))
    )
      throw new Error('Invalid module subdirectory');
    if (typeof c.cid !== 'string' || !c.cid.length) throw new Error('Missing record CID');
    return new Ok(
      new Upsert(
        new Package(
          p.name,
          p.description,
          p.version,
          new Date(p.publishedAt).toISOString(),
          p.author,
          p.license,
          p.url,
          p.sha256,
          p.functions == null ? new None() : new Some(decode_wire(p.functions)),
          p.size,
          p.repository == null ? new None() : new Some(p.repository),
          p.logo == null ? new None() : new Some(p.logo),
          p.subdir == null ? new None() : new Some(p.subdir),
          p.topics == null ? new None() : new Some(decodeLabels(p.topics)),
          p.readmeUrl == null ? new None() : new Some(p.readmeUrl),
          p.os == null ? new None() : new Some(decodeLabels(p.os)),
          p.arch == null ? new None() : new Some(decodeLabels(p.arch)),
          new None(),
          new None(),
          uri,
          c.cid,
        ),
        event.time_us,
        id,
      ),
    );
  } catch (error) {
    return new GError(error.message);
  }
}
// Live subscriptions start at the head while independent historical subscriptions
// resume durable cursors. Both use the same deduplication and timestamp ordering.
export function start(connection, ingest, options = {}) {
  if (process.env.JETSTREAM_ENABLED === 'false' && !options.url && !options.urls) return () => {};
  const urls = [
    ...new Set(
      (options.urls ?? (options.url ? [options.url] : sources())).map(
        (value) => new URL(value).href,
      ),
    ),
  ];
  let stopped = false;
  let processing = Promise.resolve();
  const startedAt = Date.now() * 1000 - 10_000_000;
  const workers = urls.flatMap((url) =>
    (options.live === false ? [false] : [true, false]).map((live) => ({
      url,
      source: live ? `live:${url}` : url,
      live,
      opened: false,
      socket: null,
      timer: null,
      attempt: 0,
      queued: 0,
      failed: false,
    })),
  );
  const schedule = (worker) => {
    if (stopped || worker.timer) return;
    const delay =
      options.retryDelayMs ?? Math.min(30_000, 500 * 2 ** Math.min(worker.attempt++, 6));
    worker.timer = setTimeout(() => {
      worker.timer = null;
      connect(worker).catch((error) => {
        console.error('Jetstream connection:', error.message);
        schedule(worker);
      });
    }, delay);
  };
  const connect = async (worker) => {
    await processing;
    if (stopped) return;
    const scoped = { ...connection, source: worker.source };
    const saved = worker.live && !worker.opened ? startedAt : await cursor(scoped);
    if (stopped) return;
    const url = new URL(worker.url);
    url.searchParams.set('wantedCollections', COLLECTION);
    if (saved) url.searchParams.set('cursor', String(Math.max(0, saved - 10_000_000)));
    worker.failed = false;
    const socket = new WebSocket(url, { maxPayload: 2 * 1024 * 1024 });
    worker.socket = socket;
    let alive = true;
    const heartbeat = setInterval(() => {
      if (socket.readyState !== WebSocket.OPEN || socket.isPaused) return;
      if (!alive) {
        socket.terminate();
        return;
      }
      alive = false;
      socket.ping();
    }, options.heartbeatMs ?? 30_000);
    heartbeat.unref();
    socket.on('pong', () => {
      alive = true;
    });
    socket.on('open', () => {
      worker.attempt = 0;
      worker.opened = true;
      console.info(`Jetstream ${worker.live ? 'live' : 'replay'} connected: ${url.host}`);
    });
    socket.on('message', (bytes) => {
      if (stopped || worker.failed) return;
      alive = true;
      worker.queued++;
      if (worker.queued >= (options.highWaterMark ?? 128)) socket.pause();
      processing = processing
        .then(async () => {
          if (worker.failed) return;
          try {
            // A hung native SQLite operation cannot safely be abandoned while
            // continuing on the same connection. Fail fast so systemd restarts
            // with a fresh connection and resumes from the durable checkpoint.
            const watchdog = setTimeout(() => {
              console.error(
                `Jetstream ingestion stalled for ${url.host}; restarting for checkpoint recovery`,
              );
              if (options.onStall) options.onStall();
              else process.exit(1);
            }, options.ingestTimeoutMs ?? 60_000);
            try {
              await ingest(scoped, bytes.toString());
            } finally {
              clearTimeout(watchdog);
            }
          } catch (error) {
            worker.failed = true;
            console.error('Index failed; replaying source from durable checkpoint:', error.message);
            socket.terminate();
          }
        })
        .finally(() => {
          worker.queued--;
          if (worker.queued < (options.lowWaterMark ?? 64) && socket.readyState === WebSocket.OPEN)
            socket.resume();
        });
    });
    socket.on('error', (error) => console.error('Jetstream:', error.message));
    socket.on('close', () => {
      clearInterval(heartbeat);
      schedule(worker);
    });
  };
  for (const worker of workers)
    connect(worker).catch((error) => {
      console.error('Jetstream connection:', error.message);
      schedule(worker);
    });
  const stop = () => {
    stopped = true;
    for (const worker of workers) {
      clearTimeout(worker.timer);
      worker.socket?.terminate();
    }
  };
  stop.drain = () => processing;
  return stop;
}
export function standalone(connection, stop) {
  const shutdown = async () => {
    stop();
    await stop.drain?.();
    await close(connection);
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}
