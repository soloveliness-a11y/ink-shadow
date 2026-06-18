import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { zCharacter, zClue } from '../src/script.js';

const mockUrl = new URL('../../../content/mock/script.json', import.meta.url);
const loadMock = (): unknown => JSON.parse(readFileSync(mockUrl, 'utf8'));

test('character with skills, passiveClueGivers, investigationReport → valid', () => {
  const raw = loadMock() as { characters: Array<Record<string, unknown>> };
  const base = raw.characters[0];
  const enriched = {
    ...base,
    skills: ['医学', '武术'],
    passiveClueGivers: [
      { targetCharId: 'c_detective', clueId: 'clue_001' },
    ],
    investigationReport: '死者身上发现不明粉末。',
  };
  const result = zCharacter.safeParse(enriched);
  assert.equal(result.success, true, JSON.stringify(result.error));
});

test('clue with requiredSkill, linkedSecretClueId → valid', () => {
  const raw = loadMock() as { clues: Array<Record<string, unknown>> };
  const base = raw.clues[0];
  const enriched = {
    ...base,
    requiredSkill: '医学',
    linkedSecretClueId: 'clue_secret_01',
  };
  const result = zClue.safeParse(enriched);
  assert.equal(result.success, true, JSON.stringify(result.error));
});

test('character WITHOUT new fields → still valid (backward compatible)', () => {
  const raw = loadMock() as { characters: Array<Record<string, unknown>> };
  const base = raw.characters[0];
  const result = zCharacter.safeParse(base);
  assert.equal(result.success, true, JSON.stringify(result.error));
});

test('clue WITHOUT new fields → still valid (backward compatible)', () => {
  const raw = loadMock() as { clues: Array<Record<string, unknown>> };
  const base = raw.clues[0];
  const result = zClue.safeParse(base);
  assert.equal(result.success, true, JSON.stringify(result.error));
});
