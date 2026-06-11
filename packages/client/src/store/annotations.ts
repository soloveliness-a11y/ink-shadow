import { create } from 'zustand';

export interface ScriptAnnotation {
  id: string;
  scriptId: string;
  playerId: string;
  charId: string;
  /** 正文页码;-1 表示非剧本正文(如线索卡摘录),不参与正文高亮回填。 */
  pageIndex: number;
  /** 页内环节序号(每页按环节分块,标注绑定到具体环节的正文)。 */
  segIndex: number;
  startOffset: number;
  endOffset: number;
  type: 'highlight-yellow' | 'highlight-green' | 'highlight-blue' | 'underline' | 'excerpt';
  text: string;
  /** 摘录来源(线索卡标题等);仅 type==='excerpt' 时有意义。 */
  source?: string;
  createdAt: number;
}

export type AnnotationInput = Omit<ScriptAnnotation, 'id' | 'createdAt'>;

const ANNO_KEY_PREFIX = 'mmg:script-annos:';
const keyOf = (scriptId: string, playerId: string) => `${ANNO_KEY_PREFIX}${scriptId}:${playerId}`;

function loadRaw(scriptId: string, playerId: string): ScriptAnnotation[] {
  try {
    const raw = localStorage.getItem(keyOf(scriptId, playerId));
    return raw ? (JSON.parse(raw) as ScriptAnnotation[]) : [];
  } catch {
    return [];
  }
}

function persist(scriptId: string, playerId: string, list: ScriptAnnotation[]): void {
  try {
    localStorage.setItem(keyOf(scriptId, playerId), JSON.stringify(list));
  } catch { /* storage disabled */ }
}

interface AnnotationState {
  list: ScriptAnnotation[];
  /** 加载某份剧本+玩家的标注到内存(切剧本/进游戏时调)。 */
  load: (scriptId: string, playerId: string) => void;
  /** 追加一条标注,自动补 id/createdAt 并落盘。返回新 id。 */
  add: (input: AnnotationInput) => string;
  /** 删除一条标注并落盘。 */
  remove: (id: string) => void;
}

export const useAnnotationStore = create<AnnotationState>((set, get) => ({
  list: [],
  load: (scriptId, playerId) => {
    // 旧版标注无 segIndex,其高亮/下划线 offset 体系已变(改为环节正文相对偏移),丢弃;
    // 摘录不依赖 offset,保留。
    const list = loadRaw(scriptId, playerId).filter(
      (a) => a.type === 'excerpt' || a.segIndex !== undefined,
    );
    set({ list });
  },
  add: (input) => {
    const anno: ScriptAnnotation = {
      ...input,
      id: `a_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      createdAt: Date.now(),
    };
    const next = [...get().list, anno];
    persist(anno.scriptId, anno.playerId, next);
    set({ list: next });
    return anno.id;
  },
  remove: (id) => {
    const target = get().list.find((a) => a.id === id);
    if (!target) return;
    const next = get().list.filter((a) => a.id !== id);
    persist(target.scriptId, target.playerId, next);
    set({ list: next });
  },
}));
