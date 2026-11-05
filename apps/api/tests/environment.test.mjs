import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

test('invalid server configuration exits before creating SQLite or starting services', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'fluentci-env-'));
  try {
    const module = new URL('../build/dev/javascript/fluentci_api/fluentci_api.mjs', import.meta.url).href;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', `import { main } from ${JSON.stringify(module)}; main();`], {
      cwd: directory,
      encoding: 'utf8',
      timeout: 10_000,
      env: {
        FLUENTCI_API_ROOT: directory,
        DATABASE_URL: `file:${join(directory, 'registry.sqlite')}`,
        PORT: 'invalid',
        AWS_ACCESS_KEY_ID: 'secret-value-must-not-appear',
      },
    });
    assert.ifError(result.error);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Invalid FluentCI API environment:/);
    for (const message of ['S3_BUCKET is required', 'S3_PUBLIC_URL is required', 'PORT must be an integer', 'Set both AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY']) {
      assert.ok(result.stderr.includes(message), result.stderr);
    }
    assert.doesNotMatch(result.stderr, /secret-value-must-not-appear|Error:|at file:/);
    assert.equal(result.stdout, '');
    assert.deepEqual(await readdir(directory), []);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
