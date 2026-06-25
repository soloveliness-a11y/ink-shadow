// NOTE: loadScript is imported from @mmg/server internals — this couples a
// standalone verification script to the server package. In the future,
// loadScript should be extracted to @mmg/schema or a shared @mmg/utils package
// so scripts like this can depend on a stable public API.
import { loadScript } from '../packages/server/src/loader.js';
import { resolve } from 'node:path';
import { readdirSync, existsSync } from 'node:fs';

const root = resolve(import.meta.dirname, '..');
const contentDir = resolve(root, 'content');

// 动态扫描 content/ 下所有含 meta.json 的目录(跳过 _template 等下划线开头)
const ids = readdirSync(contentDir, { withFileTypes: true })
  .filter((e) => e.isDirectory() && !e.name.startsWith('_') && existsSync(resolve(contentDir, e.name, 'meta.json')))
  .map((e) => e.name)
  .sort();

let fail = 0;
for (const id of ids) {
  try {
    const r = loadScript(resolve(contentDir, id));
    const genre = r.script.meta.genre ?? 'murder';
    const hasTruth = !!r.script.truth;
    console.log(`✓ ${id.padEnd(14)} genre=${genre.padEnd(9)} truth=${hasTruth}  "${r.script.meta.title}"`);
  } catch (e) {
    console.log(`✗ ${id.padEnd(14)} ${e instanceof Error ? e.message.slice(0, 200) : e}`);
    fail++;
  }
}
console.log(`\n${ids.length - fail}/${ids.length} 通过`);
process.exit(fail > 0 ? 1 : 0);
