// The build: the committed app.js and astro-calc.js are what ts/ compiles to, and the only
// JavaScript in the repository is that compiled output plus the generator output cities.js, each
// marked for GitHub's language bar (Marcos, 2026-10-17: no hand-written JavaScript). The generator
// output is held byte for byte: cities.js is written by SunApp's update_cities.py and stars.json,
// the star catalogue app.js fetches, by fetch_stars.py; neither is edited by hand. When one of
// them writes a new version, update its hash below in the same commit.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const COMPILED = ['app.js', 'astro-calc.js'];
/** The generator output, by sha256, as at 33ccdfb (cities.js is also SunApp's, byte for byte). */
const GENERATED: Record<string, string> = {
  'cities.js': '2f08782c7f41df5eb95c15a4a668a389505bd4bfba059040d048cbc1324afce2',
  'stars.json': '3f418954db41daac9113ad163a8ad2ab8c18563094d497e961c957daf114f5f6',
};
const GENERATED_JS = Object.keys(GENERATED).filter((f) => f.endsWith('.js'));

test('tools/build-ts.sh --check passes: app.js and astro-calc.js equal a fresh compile', () => {
  const out = execFileSync(`${root}tools/build-ts.sh`, ['--check'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  assert.match(out, /^build-ts: app\.js matches ts\/app\.ts$/m);
  assert.match(out, /^build-ts: astro-calc\.js matches ts\/astro-calc\.ts$/m);
  assert.match(out, /^build-ts: check passed$/m);
});

test('the generator output (cities.js, stars.json) is unchanged, byte for byte', () => {
  for (const [f, sha] of Object.entries(GENERATED)) {
    assert.equal(createHash('sha256').update(readFileSync(`${root}${f}`)).digest('hex'), sha, f);
  }
  assert.match(readFileSync(`${root}cities.js`, 'utf8'), /^\/\/ Stormberry Labs shared city catalogue\.\n\/\/ GENERATED FILE, DO NOT EDIT BY HAND\.\n/);
});

test('app.js keeps its one import, of ./astro-calc.js, and index.html loads it as a module', () => {
  const app = readFileSync(`${root}app.js`, 'utf8');
  assert.deepEqual(app.match(/^\s*(import|export)\b.*$/gm), [
    "import { getJulianDate, getLocalSiderealTime, getAltAz, getSunPosition, getLunarPosition } from './astro-calc.js';",
  ]);
  const html = readFileSync(`${root}index.html`, 'utf8');
  assert.deepEqual(html.match(/<script\b[^>]*\bsrc="[^"]*"[^>]*>/g), [
    '<script src="cities.js?v=2f08782c">',
    `<script type="module" src="app.js?v=${createHash('sha256').update(app).digest('hex').slice(0, 8)}">`,
  ]);
});

test('the only JavaScript is compiled or generated output, each file marked so', (t) => {
  const git = (...args: string[]): string => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' });
  let inGit = false;
  try { inGit = git('rev-parse', '--is-inside-work-tree').trim() === 'true'; } catch { inGit = false; }
  if (!inGit) { t.skip('not a git checkout'); return; }
  const js = git('ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', '*.js', '*.mjs', '*.cjs').split('\0').filter(Boolean);
  assert.deepEqual([...new Set(js)].sort(), [...COMPILED, ...GENERATED_JS].sort());
  for (const f of [...COMPILED, ...GENERATED_JS]) assert.equal(git('check-attr', 'linguist-generated', '--', f).trim(), `${f}: linguist-generated: true`);
});
