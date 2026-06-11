import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadScript } from '../src/loader.js';
import { Room } from '../src/room/Room.js';
import { PhaseEngine } from '../src/engine/PhaseEngine.js';
import { buildView } from '../src/view.js';
import type { Script, ServerMessage, ClientStateView, GameEvent } from '@mmg/schema';

// ─── 测试基础设施 ───

function createSendCapture() {
  const mailboxes = new Map<string, ServerMessage[]>();
  const send = (playerId: string, msg: ServerMessage) => {
    if (!mailboxes.has(playerId)) mailboxes.set(playerId, []);
    mailboxes.get(playerId)!.push(msg);
  };
  const lastView = (playerId: string): ClientStateView | undefined => {
    const msgs = mailboxes.get(playerId) ?? [];
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].kind === 'stateSync') return (msgs[i] as { view: ClientStateView }).view;
    }
    return undefined;
  };
  const messages = (playerId: string): ServerMessage[] => mailboxes.get(playerId) ?? [];
  return { send, lastView, messages };
}

import { fileURLToPath } from 'node:url';

const mockScriptPath = fileURLToPath(new URL('../../../content/_mock', import.meta.url));
const { script: mockScript } = loadScript(mockScriptPath);
const playableIds = mockScript.characters.filter((c) => !c.isVictim).map((c) => c.id);

/** 6 人加入并按 intro 的 turnOrder 顺序分配角色,方便后续测试 */
const introTurnOrder = mockScript.phases.find((p) => p.id === 'p_intro')!.turnOrder!;

/** 创建带剧本的 Room */
function createRoomWithScript(send: (playerId: string, msg: ServerMessage) => void): Room {
  const room = new Room(send);
  room.setScriptProvider(
    [mockScript.meta],
    (id) => id === mockScript.meta.id ? mockScript : undefined,
  );
  return room;
}

function setupFullRoom() {
  const cap = createSendCapture();
  const room = createRoomWithScript(cap.send);

  // 房主加入并选本
  const hostResult = room.join('玩家1');
  assert.ok('playerId' in hostResult);
  const hostId = hostResult.playerId;
  room.selectScript(hostId, mockScript.meta.id);

  // 其余玩家加入
  const playerIds: string[] = [hostId];
  for (let i = 1; i < 6; i++) {
    const r = room.join(`玩家${i + 1}`);
    assert.ok('playerId' in r, `玩家${i + 1}加入成功`);
    playerIds.push(r.playerId);
  }

  // 开始分配
  room.startAssigning(playerIds[0]!);

  // 按 turnOrder 给每个玩家分配对应角色
  for (let i = 0; i < 6; i++) {
    const res = room.selectChar(playerIds[i]!, introTurnOrder[i]!);
    assert.ok(!res.error, `分配角色 ${introTurnOrder[i]}: ${res.error}`);
  }

  return { room, playerIds, cap };
}

/** 快速跳到指定环节 —— 暴力 ready/speak 循环,覆盖 p_brief/p_backstory/p_prologue/p_intro */
function fastForwardTo(room: Room, playerIds: string[], targetPhaseId: string): void {
  const readyPhases = ['p_brief', 'p_backstory', 'p_prologue'];
  const speakPhases = ['p_intro'];

  let safety = 0;
  while (room.getState().currentPhaseId !== targetPhaseId && safety < 30) {
    const cur = room.getState().currentPhaseId;
    if (readyPhases.includes(cur)) {
      for (const pid of playerIds) room.handleIntent(pid, { kind: 'ready' });
    } else if (speakPhases.includes(cur)) {
      for (const pid of playerIds) room.handleIntent(pid, { kind: 'speak', text: '发言' });
    } else {
      // fallback: 尝试 ready
      for (const pid of playerIds) room.handleIntent(pid, { kind: 'ready' });
    }
    safety++;
  }
}

// ─── 测试 ───

test('loader: mock 剧本加载成功', () => {
  const { script } = loadScript(mockScriptPath);
  assert.equal(script.meta.id, '_mock');
  assert.equal(script.characters.length, 7);
  assert.equal(script.phases.length, 19);
});

test('Room 生命周期: lobby → selecting → assigning → playing', () => {
  const { room, playerIds } = setupFullRoom();
  assert.equal(room.getState().status, 'playing');
  assert.equal(room.getState().currentPhaseId, 'p_brief');
  assert.equal(room.getState().players.length, 6);
});

test('测试模式: 先等待测试员手选角色,bot 再补选剩余角色', () => {
  const cap = createSendCapture();
  const room = createRoomWithScript(cap.send);
  const hostResult = room.join('测试员');
  assert.ok('playerId' in hostResult);
  const hostId = hostResult.playerId;
  room.selectScript(hostId, mockScript.meta.id);

  const start = room.startTestMode(hostId);
  assert.ok(!start.error, `开启测试模式: ${start.error}`);
  assert.equal(room.getState().status, 'assigning');
  assert.equal(room.getState().players.length, playableIds.length);
  assert.equal(room.getState().players.find((p) => p.playerId === hostId)?.charId, undefined, '测试员应先保持未选角');
  assert.equal(room.getState().players.filter((p) => p.playerId.startsWith('bot_') && p.charId).length, 0, 'bot 不应在测试员选择前抢角色');

  const chosen = introTurnOrder[2]!;
  const selected = room.selectChar(hostId, chosen);
  assert.ok(!selected.error, `测试员选角: ${selected.error}`);

  const state = room.getState();
  assert.equal(state.players.find((p) => p.playerId === hostId)?.charId, chosen, '测试员应拿到自己选择的角色');
  assert.equal(state.players.filter((p) => p.playerId.startsWith('bot_') && p.charId).length, playableIds.length - 1, 'bot 应补完剩余角色');
  assert.equal(new Set(state.players.map((p) => p.charId).filter(Boolean)).size, playableIds.length, '所有可玩角色应唯一分配');
  assert.equal(state.status, 'playing', '补完 bot 后进入游戏');
});

test('测试模式: 房间已有其他真人时,测试员选角后自动补齐所有未选席位', () => {
  const cap = createSendCapture();
  const room = createRoomWithScript(cap.send);
  const hostResult = room.join('测试员');
  assert.ok('playerId' in hostResult);
  const hostId = hostResult.playerId;
  room.selectScript(hostId, mockScript.meta.id);
  const guestResult = room.join('围观真人');
  assert.ok('playerId' in guestResult);
  const guestId = guestResult.playerId;

  const start = room.startTestMode(hostId);
  assert.ok(!start.error, `开启测试模式: ${start.error}`);
  assert.equal(room.getState().players.find((p) => p.playerId === hostId)?.charId, undefined);
  assert.equal(room.getState().players.find((p) => p.playerId === guestId)?.charId, undefined);

  const chosen = introTurnOrder[3]!;
  const selected = room.selectChar(hostId, chosen);
  assert.ok(!selected.error, `测试员选角: ${selected.error}`);

  const state = room.getState();
  assert.equal(state.players.find((p) => p.playerId === hostId)?.charId, chosen, '测试员仍保留自己手选角色');
  assert.ok(state.players.find((p) => p.playerId === guestId)?.charId, '其他未选真人也应被自动补齐,不阻塞测试模式');
  assert.equal(new Set(state.players.map((p) => p.charId).filter(Boolean)).size, playableIds.length);
  assert.equal(state.status, 'playing');
});

test('Briefing 环节:全员 ready → 推进到 backstory', () => {
  const { room, playerIds } = setupFullRoom();
  // p_brief(ready) → p_backstory → p_prologue → p_intro
  // 一轮 6 人 ready 只推进到 p_backstory
  for (let i = 0; i < 6; i++) {
    const res = room.handleIntent(playerIds[i]!, { kind: 'ready' });
    assert.ok(!res.error, `ready ${i}: ${res.error}`);
  }
  assert.equal(room.getState().currentPhaseId, 'p_backstory');
});

test('Sequential 环节:按 turnOrder 轮流发言 → 推进', () => {
  const { room, playerIds } = setupFullRoom();
  fastForwardTo(room, playerIds, 'p_intro');
  assert.equal(room.getState().currentPhaseId, 'p_intro');

  for (const pid of playerIds) {
    const res = room.handleIntent(pid, { kind: 'speak', text: '发言' });
    assert.ok(!res.error, `发言: ${res.error}`);
  }
  assert.equal(room.getState().currentPhaseId, 'p_search1');
});

test('P0-1a: sequential 中途轮空 — 掉线玩家被自动跳过,环节正常推进(不卡死)', () => {
  const { room, playerIds } = setupFullRoom();
  fastForwardTo(room, playerIds, 'p_intro');
  assert.equal(room.getState().currentPhaseId, 'p_intro');

  // playerIds[i] 的角色 === introTurnOrder[i],turnOrder 第 3 位掉线
  const deadIdx = 2;
  room.disconnect(playerIds[deadIdx]!);

  // 其余在线玩家依次发言(掉线者不发言)
  for (let i = 0; i < playerIds.length; i++) {
    if (i === deadIdx) continue;
    room.handleIntent(playerIds[i]!, { kind: 'speak', text: '发言' });
  }

  assert.equal(room.getState().currentPhaseId, 'p_search1', '掉线者应被跳过,sequential 正常推进而非卡死');
});

test('P0-1b: sequential 队首掉线 — disconnect 联动跳过指针,后续玩家不被 not_your_turn 挡住', () => {
  const { room, playerIds } = setupFullRoom();
  fastForwardTo(room, playerIds, 'p_intro');
  assert.equal(room.getState().currentPhaseId, 'p_intro');

  // 轮到第一个发言者(turnIndex=0)时他掉线
  room.disconnect(playerIds[0]!);

  // 其余 5 人依次发言,不应被 not_your_turn 卡住
  for (let i = 1; i < playerIds.length; i++) {
    const res = room.handleIntent(playerIds[i]!, { kind: 'speak', text: '发言' });
    assert.ok(!res.error, `玩家${i}发言不应被挡: ${res.error}`);
  }

  assert.equal(room.getState().currentPhaseId, 'p_search1', '队首掉线应被跳过,环节推进');
});

test('P0-1c: sequential 当前发言者掉线即触发收尾 — 仅剩成员已全发言则直接推进', () => {
  const { room, playerIds } = setupFullRoom();
  fastForwardTo(room, playerIds, 'p_intro');
  assert.equal(room.getState().currentPhaseId, 'p_intro');

  // 前 5 人按序发言,最后一人(turnOrder 末位)掉线
  for (let i = 0; i < playerIds.length - 1; i++) {
    room.handleIntent(playerIds[i]!, { kind: 'speak', text: '发言' });
  }
  assert.equal(room.getState().currentPhaseId, 'p_intro', '末位未发言前仍在 intro');

  room.disconnect(playerIds[playerIds.length - 1]!);
  assert.equal(room.getState().currentPhaseId, 'p_search1', '末位掉线后应自动收尾推进');
});

test('P0-2: 房主掉线 → host 自动转移给下一个在线玩家,新 host 能行使特权', () => {
  const cap = createSendCapture();
  const room = createRoomWithScript(cap.send);
  const host = room.join('房主');
  const guest = room.join('客人');
  assert.ok('playerId' in host);
  assert.ok('playerId' in guest);
  const hostId = (host as { playerId: string }).playerId;
  const guestId = (guest as { playerId: string }).playerId;
  room.selectScript(hostId, mockScript.meta.id);

  room.disconnect(hostId);

  const newHost = room.getState().players.find((p) => p.isHost);
  assert.equal(newHost?.playerId, guestId, 'host 应转移给在线的客人');
  assert.equal(room.getState().players.find((p) => p.playerId === hostId)?.isHost, false, '老房主不再是 host');

  // 新 host 能行使特权(取消选本)
  const res = room.selectScript(guestId, '');
  assert.ok(!res.error, `新 host 应能操作: ${res.error}`);
  // 老房主已无特权
  const denied = room.selectScript(hostId, mockScript.meta.id);
  assert.equal(denied.error, 'not_host', '老房主操作应被拒');
});

test('P0-2: 房主掉线但无其他在线玩家 → 保留 host,重连恢复', () => {
  const cap = createSendCapture();
  const room = createRoomWithScript(cap.send);
  const host = room.join('房主');
  const hostId = (host as { playerId: string }).playerId;

  room.disconnect(hostId);
  const back = room.join('房主回来', hostId);
  assert.ok('playerId' in back);
  assert.equal(room.getState().players.find((p) => p.playerId === hostId)?.isHost, true, '无人接手时重连恢复 host');
});

test('搜证与公开线索', () => {
  const { room, playerIds } = setupFullRoom();
  fastForwardTo(room, playerIds, 'p_search1');
  assert.equal(room.getState().currentPhaseId, 'p_search1');

  const butlerPid = playerIds[1]!;

  const r1 = room.handleIntent(butlerPid, { kind: 'searchClue', clueId: 'cl_teacup' });
  assert.ok(!r1.error, `搜证茶杯: ${r1.error}`);
  assert.ok(room.getState().acquiredClues['c_butler']?.includes('cl_teacup'));

  const r1b = room.handleIntent(butlerPid, { kind: 'searchClue', clueId: 'cl_teacup' });
  assert.ok(r1b.error, '重复搜证应拒绝');

  const r2 = room.handleIntent(butlerPid, { kind: 'revealClue', clueId: 'cl_teacup' });
  assert.ok(!r2.error, `公开线索: ${r2.error}`);
  assert.ok(room.getState().revealedClues.includes('cl_teacup'));
});

test('PhaseEngine:投票管家 → end_good;投其他人 → end_bad', () => {
  const minimalScript = {
    ...mockScript,
    phases: [
      { id: 'p_vote', kind: 'vote' as const, title: '投票', instruction: '', participants: 'all' as const, allowedActions: ['castVote' as const], exit: { kind: 'voteComplete' as const } },
      { id: 'p_end_good', kind: 'reveal' as const, title: '好结局', instruction: '', participants: 'all' as const, allowedActions: [], exit: { kind: 'timer' as const, timerSec: 15 } },
      { id: 'p_end_bad', kind: 'reveal' as const, title: '坏结局', instruction: '', participants: 'all' as const, allowedActions: [], exit: { kind: 'timer' as const, timerSec: 15 } },
    ],
    flow: {
      entry: 'p_vote',
      edges: [
        { from: 'p_vote', to: 'p_end_good', condition: { kind: 'voteResult' as const, equalsCharId: 'c_butler' } },
        { from: 'p_vote', to: 'p_end_bad', condition: { kind: 'always' as const } },
      ],
    },
  };

  const makeState = () => ({
    roomCode: 'TEST',
    scriptId: '_mock',
    status: 'playing' as const,
    players: [
      { playerId: 'p1', charId: 'c_wife', nickname: 'A', connected: true, ready: true, isHost: true },
      { playerId: 'p2', charId: 'c_butler', nickname: 'B', connected: true, ready: true, isHost: false },
      { playerId: 'p3', charId: 'c_doctor', nickname: 'C', connected: true, ready: true, isHost: false },
    ],
    currentPhaseId: '',
    phaseRuntime: { phaseId: '', startedAt: Date.now(), actedCharIds: [] },
    revealedClues: [] as string[],
    acquiredClues: {} as Record<string, string[]>,
    votes: {} as Record<string, string>,
    flags: {} as Record<string, boolean>,
    log: [] as GameEvent[],
  });

  const noop = { broadcastState: () => {}, event: () => {}, sendToChar: () => {} };

  // 全投管家 → end_good
  {
    const state = makeState();
    const engine = new PhaseEngine(minimalScript, state, noop);
    engine.start();
    assert.equal(state.currentPhaseId, 'p_vote');
    engine.handleAction('c_wife', { kind: 'castVote', targetCharId: 'c_butler' });
    engine.handleAction('c_butler', { kind: 'castVote', targetCharId: 'c_wife' });
    engine.handleAction('c_doctor', { kind: 'castVote', targetCharId: 'c_butler' });
    assert.equal(state.currentPhaseId, 'p_end_good', '全投管家 → 好结局');
  }

  // 各投不同人 → end_bad
  {
    const state = makeState();
    const engine = new PhaseEngine(minimalScript, state, noop);
    engine.start();
    engine.handleAction('c_wife', { kind: 'castVote', targetCharId: 'c_nephew' });
    engine.handleAction('c_butler', { kind: 'castVote', targetCharId: 'c_wife' });
    engine.handleAction('c_doctor', { kind: 'castVote', targetCharId: 'c_singer' });
    assert.equal(state.currentPhaseId, 'p_end_bad', '无多数票 → 坏结局');
  }
});

test('PhaseEngine:投票分支缺 always 时平票仍进入 reveal 兜底,不直接 flow_end', () => {
  const minimalScript: Script = {
    ...mockScript,
    phases: [
      { id: 'p_vote', kind: 'vote' as const, title: '投票', instruction: '', participants: 'all' as const, allowedActions: ['castVote' as const], exit: { kind: 'voteComplete' as const } },
      { id: 'p_end_good', kind: 'reveal' as const, title: '揭晓', instruction: '', participants: 'all' as const, allowedActions: [], exit: { kind: 'hostAdvance' as const } },
    ],
    flow: {
      entry: 'p_vote',
      edges: [
        { from: 'p_vote', to: 'p_end_good', condition: { kind: 'voteResult' as const, equalsCharId: 'c_butler' } },
      ],
    },
  };
  const state = {
    roomCode: 'TEST',
    scriptId: '_mock',
    status: 'playing' as const,
    players: [
      { playerId: 'p1', charId: 'c_wife', nickname: 'A', connected: true, ready: true, isHost: true },
      { playerId: 'p2', charId: 'c_butler', nickname: 'B', connected: true, ready: true, isHost: false },
      { playerId: 'p3', charId: 'c_doctor', nickname: 'C', connected: true, ready: true, isHost: false },
    ],
    currentPhaseId: '',
    phaseRuntime: { phaseId: '', startedAt: Date.now(), actedCharIds: [] },
    revealedClues: [] as string[],
    acquiredClues: {} as Record<string, string[]>,
    votes: {} as Record<string, string>,
    flags: {} as Record<string, boolean>,
    log: [] as GameEvent[],
  };
  const events: string[] = [];
  const bus = { broadcastState: () => {}, event: (evt: Omit<GameEvent, 'ts'>) => events.push(evt.type), sendToChar: () => {} };
  const engine = new PhaseEngine(minimalScript, state, bus);

  engine.start();
  engine.handleAction('c_wife', { kind: 'castVote', targetCharId: 'c_nephew' });
  engine.handleAction('c_butler', { kind: 'castVote', targetCharId: 'c_wife' });
  engine.handleAction('c_doctor', { kind: 'castVote', targetCharId: 'c_singer' });

  assert.equal(state.currentPhaseId, 'p_end_good');
  assert.equal(events.includes('flow_end'), false);
});

test('Room: sessionToken 重连不新增玩家,并恢复原角色', () => {
  const { room, playerIds } = setupFullRoom();
  const hostId = playerIds[0]!;
  const hostChar = room.getState().players.find((p) => p.playerId === hostId)?.charId;

  room.disconnect(hostId);
  assert.equal(room.getState().players.find((p) => p.playerId === hostId)?.connected, false);

  const result = room.join('玩家1回来了', hostId);
  assert.ok('playerId' in result);
  assert.equal(result.playerId, hostId);
  assert.equal(room.getState().players.length, 6);
  const restored = room.getState().players.find((p) => p.playerId === hostId);
  assert.equal(restored?.connected, true);
  assert.equal(restored?.charId, hostChar);
  assert.equal(restored?.nickname, '玩家1回来了');
});

test('buildView: briefing 阶段下发行动进度,ready 写回玩家状态', () => {
  const { room, playerIds, cap } = setupFullRoom();
  let view = cap.lastView(playerIds[0]!);
  assert.equal(view?.phaseProgress?.totalRequired, 6);
  assert.equal(view?.phaseProgress?.actedCount, 0);

  const res = room.handleIntent(playerIds[0]!, { kind: 'ready' });
  assert.ok(!res.error);
  assert.equal(room.getState().players.find((p) => p.playerId === playerIds[0])?.ready, true);

  view = cap.lastView(playerIds[1]!);
  assert.equal(view?.phaseProgress?.actedCount, 1);
  assert.equal(view?.phaseProgress?.pendingCharIds.length, 5);
});

test('PhaseEngine:投票不能投自己或死者', () => {
  const { room, playerIds } = setupFullRoom();
  fastForwardTo(room, playerIds, 'p_search1');
  room.getState().currentPhaseId = 'p_vote';
  room.getState().phaseRuntime = { phaseId: 'p_vote', startedAt: Date.now(), actedCharIds: [] };

  const wifePid = playerIds[0]!;
  const selfVote = room.handleIntent(wifePid, { kind: 'castVote', targetCharId: 'c_wife' });
  assert.equal(selfVote.error, 'cannot_vote_self');

  const victimId = mockScript.characters.find((c) => c.isVictim)!.id;
  const victimVote = room.handleIntent(wifePid, { kind: 'castVote', targetCharId: victimId });
  assert.equal(victimVote.error, 'cannot_vote_victim');
});

test('防作弊: vote 阶段只公开已投状态,不泄露其他人的投票目标', () => {
  const { room, playerIds, cap } = setupFullRoom();
  fastForwardTo(room, playerIds, 'p_search1');
  room.getState().currentPhaseId = 'p_vote';
  room.getState().phaseRuntime = { phaseId: 'p_vote', startedAt: Date.now(), actedCharIds: [] };

  room.handleIntent(playerIds[0]!, { kind: 'castVote', targetCharId: 'c_butler' });
  room.handleIntent(playerIds[2]!, { kind: 'castVote', targetCharId: 'c_wife' });

  const wifeView = cap.lastView(playerIds[0]!);
  const doctorView = cap.lastView(playerIds[2]!);

  assert.equal(wifeView?.votesPublic?.c_wife, 'c_butler', '本人应能看到自己的投票目标');
  assert.equal(wifeView?.votesPublic?.c_doctor, '__voted__', '不应泄露他人投票目标');
  assert.equal(doctorView?.votesPublic?.c_doctor, 'c_wife', '另一名本人也应能看到自己的投票目标');
  assert.equal(doctorView?.votesPublic?.c_wife, '__voted__', '另一视角也不应泄露他人目标');

  const logVotes = room.getState().log.filter((e) => e.type === 'vote_cast');
  assert.equal(logVotes.length, 2);
  for (const event of logVotes) {
    const payload = event.payload as Record<string, unknown> | undefined;
    assert.equal(payload?.targetCharId, undefined, '投票日志不应包含目标角色 id');
    assert.equal(payload?.targetName, undefined, '投票日志不应包含目标角色名');
  }

  const doctorVoteEvents = cap.messages(playerIds[2]!).filter((msg) => msg.kind === 'event' && msg.event.type === 'vote_cast');
  assert.equal(doctorVoteEvents.length, 2);
  for (const msg of doctorVoteEvents) {
    if (msg.kind !== 'event') continue;
    const payload = msg.event.payload as Record<string, unknown> | undefined;
    assert.equal(payload?.targetCharId, undefined, '广播事件不应包含目标角色 id');
    assert.equal(payload?.targetName, undefined, '广播事件不应包含目标角色名');
  }
});

test('防作弊: buildView 非终局不泄露凶手身份', () => {
  const { room, playerIds, cap } = setupFullRoom();

  const view = cap.lastView(playerIds[0]!);
  assert.ok(view, '应有 stateSync');
  assert.equal(view!.ending, undefined, '非 reveal 阶段不应有 ending');

  for (const c of view!.publicCharacters) {
    assert.ok(!('isMurderer' in c), `公开角色 ${c.id} 不应含 isMurderer`);
  }
});

test('Room: 加入满员房间 → 拒绝', () => {
  const cap = createSendCapture();
  const room = createRoomWithScript(cap.send);
  const host = room.join('房主');
  assert.ok('playerId' in host);
  room.selectScript((host as { playerId: string }).playerId, mockScript.meta.id);

  // maxPlayers = 12, so fill up to 12
  for (let i = 1; i < 12; i++) {
    const r = room.join(`玩家${i + 1}`);
    assert.ok('playerId' in r);
  }
  // 第 13 人 → 拒绝
  const r = room.join('多余的');
  assert.ok('error' in r);
  assert.equal(r.error, 'room_full');
});

test('Room: 非房主不能 startAssigning', () => {
  const cap = createSendCapture();
  const room = createRoomWithScript(cap.send);
  const host = room.join('房主');
  const guest = room.join('客人');
  assert.ok('playerId' in host);
  assert.ok('playerId' in guest);

  // 需要先选本
  room.selectScript((host as { playerId: string }).playerId, mockScript.meta.id);

  const res = room.startAssigning((guest as { playerId: string }).playerId);
  assert.ok(res.error);
  assert.equal(res.error, 'not_host');
});

test('Room: 未选剧本不能开始', () => {
  const cap = createSendCapture();
  const room = createRoomWithScript(cap.send);
  const host = room.join('房主');
  assert.ok('playerId' in host);

  const res = room.startAssigning((host as { playerId: string }).playerId);
  assert.ok(res.error);
  assert.equal(res.error, 'no_script_selected');
});

test('Room: 选剧本后全员可见 selectedScript', () => {
  const cap = createSendCapture();
  const room = createRoomWithScript(cap.send);
  const host = room.join('房主');
  assert.ok('playerId' in host);
  const hostId = (host as { playerId: string }).playerId;

  // 选本前
  let view = cap.lastView(hostId);
  assert.ok(view);
  assert.equal(view!.selectedScript, undefined);

  // 选本后
  room.selectScript(hostId, mockScript.meta.id);
  view = cap.lastView(hostId);
  assert.ok(view);
  assert.equal(view!.selectedScript?.title, '公馆惊魂·一九三五');
});
