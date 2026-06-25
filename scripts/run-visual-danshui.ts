import 'dotenv/config';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { VisualRunner } from '../packages/visual-pipeline/src/runner.js';

export async function runVisualDanshui(label = 'Running visual pipeline for danshui...') {
  const scriptPath = resolve('content/danshui/script.json');
  const script = JSON.parse(readFileSync(scriptPath, 'utf-8'));

  const runner = new VisualRunner({
    baseUrl: process.env.MMG_API_URL || 'https://5yuantoken.org/v1',
    apiKey: process.env.MMG_API_KEY || '',
    model: process.env.MMG_MODEL || 'gpt-image-2',
    resume: true,
  });

  console.log(label);
  const { script: updated, result } = await runner.run(script, scriptPath);

  writeFileSync(scriptPath, JSON.stringify(updated, null, 2), 'utf-8');
  console.log(`Done: ${result.done} done, ${result.failed} failed / ${result.total} total`);
}

const isDirectRun = process.argv[1]?.endsWith('run-visual-danshui.ts');
if (isDirectRun) {
  runVisualDanshui().catch(err => { console.error(err); process.exit(1); });
}
