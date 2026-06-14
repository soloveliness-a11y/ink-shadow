/**
 * 一键生产流水线: M1 生成 → 校验 → M2 配图 → 打包到 content/
 *
 * Usage:
 *   pnpm produce --players 6 --theme "民国上海谍战" --difficulty hard
 *   pnpm produce --visual-model stub  (只用 stub 出图,免 key)
 *   pnpm produce --visual-model gpt-image-2 --daemon-url http://127.0.0.1:17456
 */
import 'dotenv/config';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { generate, type GenParams } from '../packages/generator/src/pipeline.js';
import { zScript, validateScript } from '../packages/schema/src/index.js';
import { VisualRunner } from '../packages/visual-pipeline/src/runner.js';
import { writeScriptSplit } from './write-script.js';

const args = process.argv.slice(2);

function parseArgs() {
  const params: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i]?.startsWith('--')) {
      const key = args[i]!.slice(2);
      const val = args[i + 1];
      if (val && !val.startsWith('--')) { params[key] = val; i++; }
      else params[key] = 'true';
    }
  }
  return params;
}

async function main() {
  const p = parseArgs();

  const players = Math.max(4, Math.min(8, Number(p.players) || 6));
  const theme = p.theme || '现代都市悬疑';
  const difficulty = (p.difficulty || 'normal') as GenParams['difficulty'];
  const visualModel = p['visual-model'] || process.env.MMG_MODEL || 'stub';
  const apiUrl = p['api-url'] || process.env.MMG_API_URL || 'https://5yuantoken.org/v1';
  const visualApiKey = p['api-key'] || process.env.MMG_API_KEY || '';
  const skipVisual = p['skip-visual'] === 'true';

  if (!skipVisual && visualModel !== 'stub' && !visualApiKey) {
    console.error('Real image generation needs MMG_API_KEY (or --api-key). Use --visual-model stub to skip.');
    process.exit(1);
  }

  console.log('=== Murder Mystery Game: Produce Pipeline ===\n');
  console.log(`Players: ${players} | Theme: ${theme} | Difficulty: ${difficulty}`);
  console.log(`Visual: ${skipVisual ? 'SKIP' : visualModel}\n`);

  // ── Stage 1: Generate script (M1) ──
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicApiKey) {
    console.error('ANTHROPIC_API_KEY not set. Set it in .env or pass via environment.');
    process.exit(1);
  }

  console.log('[Stage 1/3] Generating script via M1...');
  const script = await generate(
    { players, theme, difficulty },
    anthropicApiKey,
    {
      onStage: stage => console.log(`  -> ${stage}`),
      onRetry: (stage, attempt, error) => console.log(`  retry #${attempt} ${stage}: ${error.slice(0, 80)}`),
      onProgress: msg => console.log(`  ${msg}`),
    },
  );
  console.log(`  Generated: ${script.characters.length} chars, ${script.clues.length} clues, ${script.phases.length} phases\n`);

  // ── Stage 2: Validate ──
  console.log('[Stage 2/3] Validating script...');
  const parseResult = zScript.safeParse(script);
  if (!parseResult.success) {
    console.error('Schema validation FAILED:', parseResult.error.issues);
    process.exit(1);
  }
  const validationResult = validateScript(parseResult.data);
  if (!validationResult.ok) {
    const errors = validationResult.issues.filter(i => i.level === 'error');
    if (errors.length > 0) {
      console.error('Self-consistency validation FAILED:');
      errors.forEach(e => console.error(`  [${e.code}] ${e.path}: ${e.message}`));
      process.exit(1);
    }
  }
  console.log('  Validation passed.\n');

  // ── Stage 3: Visual pipeline (M2) ──
  const scriptDir = resolve(join('content', script.meta.id));
  const scriptPath = join(scriptDir, 'script.json'); // runner 临时读写单文件(用于 resume);最终输出拆分格式
  mkdirSync(scriptDir, { recursive: true });

  let finalScript = parseResult.data;
  if (!skipVisual) {
    console.log(`[Stage 3/3] Generating visuals via M2 (${visualModel})...`);
    const runner = new VisualRunner({
      baseUrl: apiUrl,
      apiKey: visualApiKey,
      model: visualModel,
      resume: true,
    });
    const { script: updated, result } = await runner.run(parseResult.data, scriptPath);
    finalScript = updated;
    writeFileSync(scriptPath, JSON.stringify(finalScript, null, 2), 'utf-8'); // 临时单文件(runner resume 用)
    console.log(`  Visuals: ${result.done} done, ${result.failed} failed / ${result.total} total`);
    console.log(`  Status: ${finalScript.meta.status}\n`);

    if (result.failed > 0) {
      console.warn('WARNING: Some visuals failed. Script saved but status is not "ready".');
    }
  } else {
    console.log(`[Stage 3/3] Visuals skipped.\n`);
  }

  // 写拆分格式(规范,取代单 script.json):meta.json + characters/ + clues/scenes/phases/flow/(truth/endings).json
  writeScriptSplit(finalScript, scriptDir);
  if (existsSync(scriptPath)) rmSync(scriptPath); // 移除 runner 临时单文件(loader 用拆分 meta.json)

  console.log('=== Done! ===');
  console.log(`  Script(拆分格式): ${scriptDir}/`);
  console.log(`  Run: pnpm start`);
  console.log(`  Open: http://localhost:8080`);
}

main().catch(err => {
  console.error(`\nProduce failed: ${err.message}`);
  process.exit(1);
});
