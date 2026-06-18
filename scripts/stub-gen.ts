/**
 * stub 快速出图验证:绕过 cli 的 rate-limit(minIntervalMs:0),对 mock 出所有未 done 的图。
 * stub 图为 1×1 像素,仅验证"规划→出图→回填"链路,不验证视觉。
 * 验证后用 /tmp/mock-script-pre-stub.json 恢复 + trash 删 stub 图。
 */
import { zScript } from '../packages/schema/src/index.js';
import { VisualRunner } from '../packages/visual-pipeline/src/runner.js';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const path = resolve('content/mock/script.json');
const script = zScript.parse(JSON.parse(readFileSync(path, 'utf-8')));
const runner = new VisualRunner({ baseUrl: 'http://localhost:0', apiKey: 'stub', model: 'stub', resume: false, minIntervalMs: 0 });
const { script: updated, result } = await runner.run(script, path);
writeFileSync(path, JSON.stringify(updated, null, 2), 'utf-8');
console.log(`\n=== stub 出图完成 ===`);
console.log(`done=${result.done} failed=${result.failed} total=${result.total} skipped=${result.skipped}`);
console.log(`meta.status=${updated.meta.status}`);
