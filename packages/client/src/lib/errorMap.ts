/**
 * 引擎/房间返回的错误码 → 友好中文 + 默认兜底。
 * 客户端 store 收到 ServerMessage error 时优先用 code 映射,降级到 message。
 */
const MAP: Record<string, string> = {
  // PhaseEngine 错误
  no_active_phase: '当前不在可行动环节',
  action_not_allowed: '本环节不支持该操作',
  not_participant: '本环节不包含你',
  not_your_turn: '请等待轮到你再行动',
  clue_not_found: '线索不存在',
  already_acquired: '该线索已被获取',
  clue_private: '这是其他角色的私有线索',
  clue_locked: '该线索尚未解锁,先去对应地点搜证',
  clue_taken: '该线索已被其他玩家抢先搜走',
  cannot_search_own_scene: '不能搜查自己角色所在的区域',
  search_limit_reached: '你的搜证次数已用完',
  clue_not_owned: '只有线索持有者才能公开',
  already_revealed: '该线索已经公开',
  target_not_found: '目标角色不存在',
  cannot_vote_self: '不能投给自己',
  cannot_vote_victim: '不能投给死者',

  // Room 错误
  not_host: '只有房主可以执行此操作',
  not_in_lobby: '当前不在大厅阶段',
  no_script_selected: '请先选择剧本',
  no_script: '当前房间没有剧本',
  no_script_provider: '剧本加载器未就绪',
  script_not_found: '剧本不存在',
  room_not_joinable: '房间已开始游戏,无法加入',
  room_full: '房间已满',
  no_char: '请先完成角色分配',
  no_pending_advance: '没有可推进的阶段',
  no_snapshot: '没有可回退的状态',
  not_test_mode: '仅测试模式可用',
  no_scripts_available: '暂无可用剧本',
  char_taken: '该角色已被选择',
  player_not_found: '玩家不存在',
  char_not_found: '角色不存在',
  already_assigned: '你已经选过角色',
  not_in_assigning: '当前不在选角阶段',

  // 协议版本
  version_mismatch: '游戏已更新,请刷新页面(Cmd/Ctrl+R)后再进入',

  // 决胜轮
  target_restricted: '该角色不在本轮投票范围内',

  // 踢人
  kicked: '你已被房主移出房间',
  kick_not_allowed: '仅可在大厅阶段踢人',
  cannot_kick_self: '不能踢出自己',
};

export function friendlyError(code?: string, message?: string): string {
  if (code && MAP[code]) return MAP[code];
  // skill_required:xxx → 需要 xxx 技能才能搜索此线索
  if (code?.startsWith('skill_required:')) {
    const skill = code.slice('skill_required:'.length);
    return `需要「${skill}」技能才能搜索此线索`;
  }
  if (message) return message;
  if (code) return code;
  return '未知错误';
}
