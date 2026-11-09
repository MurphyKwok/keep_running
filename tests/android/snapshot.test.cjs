const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

test('copySnapshot replaces stale Android files with the current web build', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'keep-running-snapshot-'));
  const sourceDir = path.join(root, 'dist');
  const targetDir = path.join(root, 'android-assets');
  await fs.mkdir(path.join(sourceDir, 'assets'), { recursive: true });
  await fs.mkdir(path.join(targetDir, 'assets'), { recursive: true });
  await fs.writeFile(path.join(sourceDir, 'index.html'), '<html>current</html>');
  await fs.writeFile(path.join(sourceDir, 'assets', 'app.js'), 'current');
  await fs.writeFile(path.join(targetDir, 'assets', 'stale.js'), 'stale');

  try {
    const { copySnapshot } = await import('../../scripts/build-android-snapshot.mjs');
    copySnapshot(sourceDir, targetDir);

    assert.equal(await fs.readFile(path.join(targetDir, 'index.html'), 'utf8'), '<html>current</html>');
    assert.equal(await fs.readFile(path.join(targetDir, 'assets', 'app.js'), 'utf8'), 'current');
    await assert.rejects(fs.access(path.join(targetDir, 'assets', 'stale.js')));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
