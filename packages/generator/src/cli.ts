#!/usr/bin/env -S npx tsx
import 'dotenv/config';
import { generate } from './pipeline.js';
import type { GenParams } from './types.js';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);

function parseArgs(): GenParams & { out: string; resume: boolean } {
  const params: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i]?.startsWith('--')) {
      const key = args[i]!.slice(2);
      const val = args[i + 1];
      if (val && !val.startsWith('--')) { params[key] = val; i++; }
      else params[key] = 'true';
    }
  }

  const players = Number(params.players) || 6;
  const difficulty = (params.difficulty || 'normal') as GenParams['difficulty'];

  return {
    players: Math.max(4, Math.min(8, players)),
    theme: params.theme || '现代都市悬疑',
    difficulty: ['easy', 'normal', 'hard', 'expert'].includes(difficulty) ? difficulty : 'normal',
    style: params.style,
    out: params.out || `content/${(params.theme || 'untitled').slice(0, 20).replace(/\s+/g, '-')}`,
    resume: params.resume === 'true',
  };
}

async function main() {
  const params = parseArgs();
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('❌ ANTHROPIC_API_KEY 环境变量未设置');
    console.error('   请在 .env 文件中设置,或运行: ANTHROPIC_API_KEY=sk-... pnpm --filter @mmg/generate dev');
    process.exit(1);
  }

  const outDir = resolve(params.out);
  const scriptPath = resolve(outDir, 'script.json');

  // Resume check
  if (params.resume && existsSync(scriptPath)) {
    console.log(`📂 恢复已有剧本: ${scriptPath}`);
    // MVP: just reload and re-validate
    const existing = JSON.parse(readFileSync(scriptPath, 'utf8'));
    console.log(`   标题: ${existing.meta?.title || '(未命名)'}`);
    console.log(`   状态: ${existing.meta?.status || 'unknown'}`);
    return;
  }

  console.log(`\n🎭 剧本杀生成器`);
  console.log(`   人数: ${params.players} | 题材: ${params.theme} | 难度: ${params.difficulty}`);
  console.log(`   输出: ${outDir}\n`);

  mkdirSync(outDir, { recursive: true });

  const script = await generate(params, apiKey, {
    onStage: (stage) => console.log(`⏳ ${stage}`),
    onRetry: (stage, attempt, error) => console.log(`   ↻ 重试 #${attempt}: ${error.slice(0, 80)}`),
    onProgress: (msg) => console.log(`   ${msg}`),
  });

  writeFileSync(scriptPath, JSON.stringify(script, null, 2), 'utf8');
  console.log(`\n✅ 剧本已保存: ${scriptPath}`);
  console.log(`   角色: ${script.characters.length} | 线索: ${script.clues.length} | 环节: ${script.phases.length}`);
}

main().catch((err) => {
  console.error(`\n❌ 生成失败: ${err.message}`);
  process.exit(1);
});
