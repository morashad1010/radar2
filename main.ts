// token-radar-01 driver (Node 22+, standard library only).
//
// Reads the sealed snapshot, scores every protocol that records no token with lib/model.ts, writes
// out/board.json and out/data.js, copies the dashboard and the screenshots, and writes out/dossier.json
// with the vendored make.fun library. Every byte it writes is a pure function of the snapshot: no clock,
// no randomness, no unordered iteration reaches the output.
//
//   node main.ts --input input/snapshot.json
//   MAKEFUN_OUTPUT_DIR=out node main.ts --input input/snapshot.json
//   node main.ts --input /input --output /output

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

/** The scorer's caps: the text cap shapes the dossier bytes, the rest only refuse. */
const DOSSIER_CAPS = {
  text_max_bytes: 65_536,
  screenshots: { max: 4, max_bytes: 524_288 },
  dashboard: { max_files: 400, max_bytes: 4_194_304 },
};

/** --name <value> or --name=<value>, else the fallback. */
function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  return eq === undefined ? fallback : eq.slice(name.length + 3);
}

function fail(message: string): never {
  process.stderr.write(`token radar: ${message}\n`);
  process.exit(1);
}

const inputArg = arg('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) fail(`no snapshot at ${inputFile}; pass --input <snapshot.json|directory>`);
const outDir = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

/** The regular files in a directory, dot names skipped, in name order. */
function regularFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => !name.startsWith('.'))
    .filter((name) => statSync(join(dir, name)).isFile())
    .sort();
}

const dashboardDir = join(here, 'dashboard');
const screenshotsDir = join(here, 'screenshots');
const dashboardFiles = regularFiles(dashboardDir);
const screenshotFiles = regularFiles(screenshotsDir);

if (!dashboardFiles.includes('index.html')) fail('dashboard/ has no index.html');
if (!dashboardFiles.some((name) => name.endsWith('.css'))) fail('dashboard/ has no .css file');
if (!dashboardFiles.some((name) => name.endsWith('.js'))) fail('dashboard/ has no .js file');
if (screenshotFiles.length < 3) {
  fail(`screenshots/ holds ${screenshotFiles.length} image${screenshotFiles.length === 1 ? '' : 's'}; hand in at least 3`);
}

let snapshotText: string;
try {
  snapshotText = readFileSync(inputFile, 'utf8');
} catch {
  fail(`cannot read ${inputFile}`);
}

let snapshot;
try {
  snapshot = parseSnapshot(snapshotText);
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

const { board, radar } = buildRadar(snapshot);
const issue = boardIssue(board, snapshot);
if (issue !== null) fail(`the model wrote a board the gate refuses: ${issue}`);

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
writeFileSync(join(outDir, 'data.js'), dataScript(radar));

/** Copy a directory's regular files into out/<name>/, skipping dot names. */
function copyInto(from: string, to: string, names: string[]): void {
  mkdirSync(to, { recursive: true });
  for (const name of names) copyFileSync(join(from, name), join(to, name));
}

copyInto(dashboardDir, join(outDir, 'dashboard'), dashboardFiles);
copyInto(screenshotsDir, join(outDir, 'screenshots'), screenshotFiles);

// Last, the dossier: the scorer rebuilds it from this output and compares bytes.
writeFileSync(join(outDir, 'dossier.json'), buildDossier(outDir, DOSSIER_CAPS));

const maxImplied = radar.stats.max_implied;
process.stdout.write(
  `token radar: ${board.length} rows, ${radar.stats.watchlist} of ${snapshot.watchlist.length} watchlist slugs covered, max implied value $${maxImplied.toLocaleString('en-US')}\n`,
);
