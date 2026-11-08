import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { setTimeout } from 'node:timers/promises';
import { createHash } from 'node:crypto';
import { storeWasm } from '../build/dev/javascript/fluentci_api/fluentci_api/storage/wasm.mjs';

const bytes = Buffer.from('original artifact');
const artifact = {
  bucket: 'modules',
  key: '@alice.example/tool/v1.0.0/tool.wasm',
  bytes,
  digest: createHash('sha256').update(bytes).digest('hex'),
  author: 'did:plc:alice',
  versioned: true,
};
const exists = () => Object.assign(Error('exists'), { $metadata: { httpStatusCode: 412 } });

test('lost upload responses can retry identical bytes without replacing immutable objects', async () => {
  let object;
  let writes = 0;
  const client = {
    send: async (command, options) => {
      assert.ok(options.abortSignal instanceof AbortSignal);
      if (command.constructor.name === 'PutObjectCommand') {
        assert.equal(command.input.IfNoneMatch, '*');
        if (object) throw exists();
        object = command.input;
        writes++;
      } else if (command.constructor.name === 'HeadObjectCommand')
        return { ContentLength: object.Body.length, Metadata: object.Metadata };
      else assert.fail('identical retries should not download or overwrite existing artifacts');
    },
  };
  await storeWasm(client, artifact);
  await storeWasm(client, artifact);
  assert.equal(writes, 1);
  assert.deepEqual(object.Body, bytes);
  const changed = Buffer.from('different artifact');
  await assert.rejects(
    storeWasm(client, {
      ...artifact,
      bytes: changed,
      digest: createHash('sha256').update(changed).digest('hex'),
    }),
    { name: 'PackageVersionExists' },
  );
  assert.equal(writes, 1);
  assert.equal(object.Metadata.author, artifact.author);
  assert.equal(object.Metadata.sha256, artifact.digest);
});

test('legacy objects are hashed when metadata is absent; an ETag is never trusted as SHA-256', async () => {
  let fetched = 0;
  let existing = bytes;
  const client = {
    send: async (command) => {
      if (command.constructor.name === 'PutObjectCommand') throw exists();
      if (command.constructor.name === 'HeadObjectCommand')
        return { ContentLength: existing.length, ETag: artifact.digest };
      fetched++;
      return { Body: Readable.from([existing]) };
    },
  };
  await storeWasm(client, artifact);
  assert.equal(fetched, 1);
  existing = Buffer.alloc(bytes.length, 'x');
  await assert.rejects(storeWasm(client, artifact), { name: 'PackageVersionExists' });
  assert.equal(fetched, 2);
});

test('storage requests have a bounded deadline', async () => {
  const client = {
    send: (_command, { abortSignal }) =>
      new Promise((_, reject) => {
        abortSignal.addEventListener('abort', () => reject(abortSignal.reason), { once: true });
      }),
  };
  await Promise.all([
    assert.rejects(storeWasm(client, artifact, 5), { name: 'TimeoutError' }),
    setTimeout(20),
  ]);
});
