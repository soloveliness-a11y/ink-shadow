import { loadScript } from '../packages/server/src/loader.js';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const ids = ['_mock', 'mock-faction', 'danshui', 'kuiilei'];
let fail = 0;
for (const id of ids) {
  try {
    const r = loadScript(resolve(root, 'content', id));
    const genre = r.script.meta.genre ?? 'murder';
    const hasTruth = !!r.script.truth;
    console.log(`✓ ${id.padEnd(12)} genre=${genre.padEnd(9)} truth=${hasTruth}  "${r.script.meta.title}"`);
  } catch (e) {
    console.log(`✗ ${id}: ${e instanceof Error ? e.message.slice(0, 200) : e}`);
    fail++;
  }
}
process.exit(fail > 0 ? 1 : 0);
