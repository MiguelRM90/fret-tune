import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const ROOT = process.cwd();
const SRC_DIR = resolve(ROOT, 'src');
const DIST_BROWSER_DIR = resolve(ROOT, 'dist/fret-tune/browser');

const FORBIDDEN_DOM_SINKS = [
  ['inner', 'HTML'].join(''),
  ['outer', 'HTML'].join(''),
  ['insertAdjacent', 'HTML'].join(''),
  ['bypassSecurity', 'Trust'].join(''),
  ['ev', 'al('].join(''),
];

const NGSW_HASH_TABLE_ALLOWLIST =
  /^(\/fret-tune)?\/(index\.html|favicon\.svg|manifest\.webmanifest|main-[A-Z0-9]+\.js|polyfills-[A-Z0-9]+\.js|chunk-[A-Z0-9]+\.js|worker-[A-Z0-9]+\.js|styles-[A-Z0-9]+\.css|worklets\/capture\.worklet\.js|icons\/[a-z0-9\-x.]+\.(png|svg)|screenshots\/[a-z0-9\-]+\.svg)$/;

function walkFiles(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      results.push(...walkFiles(fullPath));
    } else if (stat.isFile()) {
      results.push(fullPath);
    }
  }
  return results;
}

export function verifySourceSecurity() {
  const files = walkFiles(SRC_DIR);
  const violations = [];

  for (const file of files) {
    const content = readFileSync(file, 'utf8');
    for (const sink of FORBIDDEN_DOM_SINKS) {
      if (content.includes(sink)) {
        violations.push(`${relative(ROOT, file)} contains forbidden pattern "${sink}"`);
      }
    }
  }

  if (violations.length > 0) {
    throw new Error(`XSS-01 static security scan failed:\n  - ${violations.join('\n  - ')}`);
  }

  const indexHtml = readFileSync(resolve(SRC_DIR, 'index.html'), 'utf8');
  if (!indexHtml.includes('<meta name="referrer" content="no-referrer"')) {
    throw new Error('SEC-11: src/index.html is missing <meta name="referrer" content="no-referrer" />');
  }
  if (!indexHtml.includes('http-equiv="Content-Security-Policy"')) {
    throw new Error('SEC-03: src/index.html is missing <meta http-equiv="Content-Security-Policy">');
  }
  if (!indexHtml.includes('window.top !== window.self')) {
    throw new Error('SEC-05: src/index.html is missing anti-framing guard (window.top !== window.self)');
  }
  if (indexHtml.includes('user-scalable=no') || indexHtml.includes('maximum-scale=1')) {
    throw new Error('TD-24: src/index.html viewport must not disable user zoom');
  }
  if (!indexHtml.includes('rel="apple-touch-icon"')) {
    throw new Error('TD-20: src/index.html is missing apple-touch-icon link');
  }

  const manifestRaw = readFileSync(resolve(ROOT, 'public/manifest.webmanifest'), 'utf8');
  const manifest = JSON.parse(manifestRaw);
  if (manifest.id !== '/fret-tune/' || manifest.lang !== 'en' || manifest.dir !== 'ltr') {
    throw new Error('P3.3 / SEC-01: manifest.webmanifest must declare id="/fret-tune/", lang="en", dir="ltr"');
  }
  const purposes = new Set(manifest.icons.map((i) => i.purpose));
  if (purposes.has('any maskable') || !purposes.has('any') || !purposes.has('maskable')) {
    throw new Error('P3.3 / TD-20: manifest.webmanifest must separate "any" and "maskable" icon purposes');
  }
}

export function verifyDistBuild() {
  const ngswPath = resolve(DIST_BROWSER_DIR, 'ngsw.json');
  const distIndexPath = resolve(DIST_BROWSER_DIR, 'index.html');

  if (!existsSync(ngswPath) || !existsSync(distIndexPath)) {
    throw new Error(
      `Production build output not found at ${DIST_BROWSER_DIR}. Run "pnpm run build:gh-pages" first.`,
    );
  }

  const ngsw = JSON.parse(readFileSync(ngswPath, 'utf8'));
  const hashKeys = Object.keys(ngsw.hashTable ?? {});

  for (const group of ngsw.assetGroups ?? []) {
    if (group.installMode !== 'prefetch' || group.updateMode !== 'prefetch') {
      throw new Error(
        `P3.2: assetGroup "${group.name}" must use installMode="prefetch" and updateMode="prefetch"`,
      );
    }
  }

  const requiredPatterns = [
    { name: 'index.html', regex: /\/index\.html$/ },
    { name: 'manifest.webmanifest', regex: /\/manifest\.webmanifest$/ },
    { name: 'capture.worklet.js', regex: /\/worklets\/capture\.worklet\.js$/ },
    { name: 'pitch-detection worker chunk', regex: /\/worker-[A-Z0-9]+\.js$/ },
    { name: 'main bundle', regex: /\/main-[A-Z0-9]+\.js$/ },
    { name: 'styles bundle', regex: /\/styles-[A-Z0-9]+\.css$/ },
    { name: '192x192 PNG icon', regex: /\/icons\/icon-192x192\.png$/ },
    { name: '512x512 PNG icon', regex: /\/icons\/icon-512x512\.png$/ },
    { name: 'maskable PNG icon', regex: /\/icons\/icon-maskable-512x512\.png$/ },
    { name: 'apple-touch-icon.png', regex: /\/icons\/apple-touch-icon\.png$/ },
  ];

  for (const req of requiredPatterns) {
    if (!hashKeys.some((k) => req.regex.test(k))) {
      throw new Error(`P3.2 / SEC-08b: ngsw.json hashTable is missing required asset: ${req.name}`);
    }
  }

  for (const key of hashKeys) {
    if (!NGSW_HASH_TABLE_ALLOWLIST.test(key)) {
      throw new Error(`SEC-08b: Unexpected asset in ngsw.json hashTable: ${key}`);
    }
  }

  const distIndex = readFileSync(distIndexPath, 'utf8');
  if (!distIndex.includes("'strict-dynamic'") || !distIndex.includes("'sha256-")) {
    throw new Error('SEC-03 / SEC-13: dist index.html is missing Angular autoCsp sha256 hashes');
  }
  if (!distIndex.includes('sha384-')) {
    throw new Error('SEC-09: dist index.html is missing Subresource Integrity (sha384) hashes');
  }
}

const args = process.argv.slice(2);
const checkDist = args.includes('--dist') || args.includes('--all');
verifySourceSecurity();
console.log('✓ Source security & manifest checks passed (XSS-01, SEC-01, SEC-03, SEC-05, SEC-11, P3.3).');
if (checkDist) {
  verifyDistBuild();
  console.log('✓ Production ngsw.json & autoCsp/SRI checks passed (P3.2, SEC-03, SEC-08b, SEC-09, SEC-13).');
}

