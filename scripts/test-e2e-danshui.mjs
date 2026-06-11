#!/usr/bin/env node
/**
 * 端到端测试：丹水山庄完整游戏流程
 * 核心逻辑：只在 pendingAdvance=true 时推进，其他时候等待
 */
import WebSocket from 'ws';

const WS_URL = 'ws://127.0.0.1:8080/ws';
const SCRIPT_ID = 'danshui';

let ws, syncCount = 0, currentPhase = '', charSelected = false, lastAction = '';
const errors = [], searched = new Set();

function log(m) { console.log(`[${Date.now() % 100000}] ${m}`); }
function send(i) { lastAction = i.kind; ws.send(JSON.stringify(i)); }

function onMsg(raw) {
  const msg = JSON.parse(raw.toString());
  if (msg.kind === 'joined') { log(`Joined`); send({ kind: 'selectScript', scriptId: SCRIPT_ID }); return; }
  if (msg.kind === 'assigned') { log(`Assigned: ${msg.charId}`); return; }
  if (msg.kind === 'error') { log(`⚠ ${msg.message}`); errors.push(msg.message); return; }
  if (msg.kind === 'stateSync') { handle(msg.view); return; }
}

function handle(v) {
  syncCount++;
  const ph = v.currentPhase;
  const title = ph?.title || '';
  const st = v.status;
  const me = v.self;

  if (title !== currentPhase) { log(`\n══ ${title} (${ph?.kind}) ══`); currentPhase = title; }

  // LOBBY → start test
  if (st === 'lobby' && !v.isTestMode) { log('startTest'); send({ kind: 'startTest' }); return; }

  // ASSIGNING → pick char
  if (st === 'assigning' && !charSelected) {
    const taken = new Set(v.players.filter(p => p.charId).map(p => p.charId));
    const avail = v.publicCharacters?.filter(c => !c.isVictim && !taken.has(c.id));
    if (avail?.length > 0) { charSelected = true; log(`selectChar ${avail[0].id}`); send({ kind: 'selectChar', charId: avail[0].id }); }
    return;
  }

  // PLAYING - 核心：只在 pendingAdvance=true 时推进
  if (st === 'playing' && me) {
    // 任何阶段，pendingAdvance=true → 用 manualAdvance（测试模式）
    if (v.pendingAdvance) {
      log('  → manualAdvance');
      send({ kind: 'manualAdvance' });
      return;
    }

    // Free + allReady → ready（但不重复发）
    const exitKind = v.phaseProgress?.exitKind;
    if (ph?.kind === 'free' && exitKind === 'allReady' && !v.phaseProgress?.actedCharIds?.includes(me.charId)) {
      log('  → ready');
      send({ kind: 'ready' });
      return;
    }

    // Investigation → search
    if (title === '谁是真凶？' && !v.pendingAdvance) {
      const cnt = ph.mySearchCount || 0, max = ph.maxSearches || 8;
      if (cnt < max && v.searchableClues?.length > 0) {
        const cl = v.searchableClues.find(c => !searched.has(c.id));
        if (cl) { searched.add(cl.id); log(`  → search [${cnt+1}/${max}] ${cl.id}`); send({ kind: 'searchClue', clueId: cl.id }); return; }
      }
      // 所有线索搜完或达到上限，等待 timer 结束
      return;
    }

    // Vote
    if (ph?.kind === 'vote' && !v.votesPublic?.[me.charId]) {
      const c = v.publicCharacters?.find(x => !x.isVictim && x.id !== me.charId);
      if (c) { log(`  → vote ${c.id}`); send({ kind: 'castVote', targetCharId: c.id }); }
      return;
    }
  }

  // FINISHED
  if (st === 'finished') {
    log(`\n═════ GAME OVER: ${title} ═════`);
    if (v.ending) { log(`Ending: ${v.ending.title}`); log(v.ending.narrative?.slice(0, 300)); }
    log(`Syncs: ${syncCount} | Errors: ${errors.length} | Searched: ${searched.size}`);
    errors.forEach(e => log(` ⚠ ${e}`));
    ws.close(); process.exit(errors.length > 0 ? 1 : 0);
  }
}

ws = new WebSocket(WS_URL);
ws.on('open', () => { log('Connected'); send({ kind: 'join', roomCode: '', nickname: 'E2E' }); });
ws.on('message', onMsg);
ws.on('error', e => { log(`Error: ${e.message}`); process.exit(1); });
setTimeout(() => { log('TIMEOUT 5min'); process.exit(1); }, 300000);
