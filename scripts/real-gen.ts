/**
 * 真实出图:对 _mock 出所有未 done 的图(cover + 9 线索图)。
 * resume 模式跳过已有 13 张真实图;每张间隔 240-300s 防风控。
 * 从根目录跑:pnpm exec tsx scripts/real-gen.ts
 */
import 'dotenv/config';
import { zScript } from '../packages/schema/src/index.js';
import { VisualRunner } from '../packages/visual-pipeline/src/runner.js';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const apiKey = process.env.MMG_API_KEY;
if (!apiKey) {
  console.error('❌ MMG_API_KEY 未设置(检查 .env)');
  process.exit(1);
}
const apiUrl = process.env.MMG_API_URL || 'https://5yuantoken.org/v1';
const model = process.env.MMG_MODEL || 'gpt-5.5';

const path = resolve('content/_mock/script.json');
const script = zScript.parse(JSON.parse(readFileSync(path, 'utf-8')));

console.log(`=== 真实出图 ===`);
console.log(`apiUrl: ${apiUrl}`);
console.log(`model: ${model}`);
console.log(`resume: true(跳过已 done)\n`);

const runner = new VisualRunner({ baseUrl: apiUrl, apiKey, model, resume: true });
const { script: updated, result } = await runner.run(script, path);

writeFileSync(path, JSON.stringify(updated, null, 2), 'utf-8');
console.log(`\n=== 真实出图完成 ===`);
console.log(`done=${result.done} failed=${result.failed} total=${result.total} skipped=${result.skipped}`);
console.log(`meta.status=${updated.meta.status}`);
