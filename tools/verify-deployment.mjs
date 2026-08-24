import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const DEFAULT_TIMEOUT_MS = 15_000;
const HOSTING_CONTROL_FILES = new Set(['_headers', '_redirects']);

function usage() {
  return [
    'Usage:',
    '  npm run verify:deploy -- --url <deployment-url> [options]',
    '',
    'Options:',
    '  --dist <directory>      local build to compare (default: dist)',
    '  --attempts <count>      retry count while a deployment propagates (default: 1)',
    '  --interval-ms <ms>      delay between attempts (default: 3000)',
    '  --help                  show this help',
  ].join('\n');
}

function positiveInteger(value, flag) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`${flag} must be a positive integer`);
  }
  return parsed;
}

function parseArguments(argv) {
  const options = {
    attempts: 1,
    dist: 'dist',
    intervalMs: 3_000,
    url: process.env.DEPLOY_URL,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--help') return { ...options, help: true };
    const value = argv[index + 1];
    if (value === undefined) throw new Error(`${flag} requires a value`);

    if (flag === '--url') options.url = value;
    else if (flag === '--dist') options.dist = value;
    else if (flag === '--attempts') options.attempts = positiveInteger(value, flag);
    else if (flag === '--interval-ms') options.intervalMs = positiveInteger(value, flag);
    else throw new Error(`unknown option: ${flag}`);
    index += 1;
  }

  return options;
}

function deploymentUrl(rawUrl) {
  if (rawUrl === undefined) {
    throw new Error('--url is required (or set DEPLOY_URL)');
  }

  const url = new URL(rawUrl);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('--url must use http or https');
  }
  if (url.username !== '' || url.password !== '') {
    throw new Error('--url must not contain credentials');
  }
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  url.search = '';
  url.hash = '';
  return url;
}

async function releaseFiles(rootDirectory, currentDirectory = rootDirectory) {
  const entries = await readdir(currentDirectory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = resolve(currentDirectory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await releaseFiles(rootDirectory, absolutePath)));
      continue;
    }
    if (!entry.isFile()) continue;

    const path = relative(rootDirectory, absolutePath).split(sep).join('/');
    if (HOSTING_CONTROL_FILES.has(path)) continue;
    files.push({ absolutePath, path });
  }

  return files.sort((left, right) => left.path.localeCompare(right.path));
}

function digest(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function fetchBytes(baseUrl, path, attempt) {
  const url = new URL(path, baseUrl);
  url.searchParams.set('deployment-verification', `${Date.now()}-${attempt}`);
  const response = await fetch(url, {
    cache: 'no-store',
    headers: { 'cache-control': 'no-cache' },
    redirect: 'follow',
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`${path}: HTTP ${response.status} ${response.statusText}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function compareDeployment(baseUrl, files, attempt) {
  const verified = [];
  for (const file of files) {
    const [expected, actual] = await Promise.all([
      readFile(file.absolutePath),
      fetchBytes(baseUrl, file.path, attempt),
    ]);
    const expectedDigest = digest(expected);
    const actualDigest = digest(actual);
    if (expectedDigest !== actualDigest) {
      throw new Error(
        `${file.path}: expected sha256 ${expectedDigest}, received ${actualDigest}`,
      );
    }
    verified.push(`${file.path} ${expectedDigest.slice(0, 12)}`);
  }
  return verified;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help === true) {
    console.log(usage());
    return;
  }

  const baseUrl = deploymentUrl(options.url);
  const distRoot = resolve(options.dist);
  const files = await releaseFiles(distRoot);
  if (files.length === 0 || files.every((file) => file.path !== 'index.html')) {
    throw new Error(`${distRoot} is not a hosted release build; run npm run build first`);
  }

  let lastError;
  for (let attempt = 1; attempt <= options.attempts; attempt += 1) {
    try {
      const verified = await compareDeployment(baseUrl, files, attempt);
      for (const file of verified) console.log(`verified ${file}`);
      console.log(`Deployment matches ${files.length} files from ${distRoot}.`);
      return;
    } catch (error) {
      lastError = error;
      console.error(`Attempt ${attempt}/${options.attempts} failed: ${error.message}`);
      if (attempt < options.attempts) await delay(options.intervalMs);
    }
  }

  throw lastError;
}

main().catch((error) => {
  console.error(`Deployment verification failed: ${error.message}`);
  process.exitCode = 1;
});
