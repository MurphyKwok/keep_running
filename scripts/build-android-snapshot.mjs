import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const ASSET_URL_PREFIX = '/assets/public/';

export function copySnapshot(sourceDir, targetDir) {
  if (!existsSync(path.join(sourceDir, 'index.html'))) {
    throw new Error(`Web build not found at ${sourceDir}`);
  }

  rmSync(targetDir, { recursive: true, force: true });
  mkdirSync(path.dirname(targetDir), { recursive: true });
  cpSync(sourceDir, targetDir, { recursive: true });
}

export function buildSnapshot({ projectRoot = process.cwd(), targetDir } = {}) {
  const viteBinary = path.join(projectRoot, 'node_modules', 'vite', 'bin', 'vite.js');
  const destination = targetDir || path.join(
    projectRoot,
    'android',
    'app',
    'src',
    'main',
    'assets',
    'public',
  );

  if (!existsSync(viteBinary)) {
    throw new Error('Vite is not installed. Run pnpm install before preparing the APK snapshot.');
  }

  const result = spawnSync(process.execPath, [viteBinary, 'build'], {
    cwd: projectRoot,
    env: { ...process.env, PATH_PREFIX: ASSET_URL_PREFIX },
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    throw new Error(`Vite build failed with exit code ${result.status}`);
  }

  copySnapshot(path.join(projectRoot, 'dist'), destination);
}

const invokedDirectly = process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (invokedDirectly) {
  buildSnapshot({ projectRoot: process.cwd() });
}
