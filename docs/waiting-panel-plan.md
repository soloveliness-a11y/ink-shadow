# WaitingPanel Feature — Implementation Plan

## Overview

A collapsible floating panel that provides waiting activities when the player has acted but the phase hasn't ended. Renders globally via the App level, overlays scene content without blocking it.

---

## 1. Component API Design

### 1.1 New file: `packages/client/src/components/WaitingPanel.tsx`

```
Props: none (reads everything from useGameStore)
Returns: ReactElement | null (null when not visible)
```

**Internal state:**

| State | Type | Default | Purpose |
|-------|------|---------|---------|
| `expanded` | `boolean` | `false` | Collapsed pill vs full panel |
| `activeTab` | `'clues' \| 'timeline' \| 'pm' \| 'chars'` | `'clues'` | Which tab is active |
| `pmTarget` | `string` | `''` | Selected PM recipient charId |
| `lastSeenPmTs` | `number` | `Date.now()` | For unread dot calculation |

**Store selectors (all fine-grained, never whole `view`):**

```tsx
const view          = useGameStore(s => s.view);
const myCharId      = useGameStore(s => s.view?.self?.charId);
const phaseProgress = useGameStore(s => s.view?.phaseProgress);
const currentPhase  = useGameStore(s => s.view?.currentPhase);
const privateMessages = useGameStore(s => s.privateMessages);
const send          = useGameStore(s => s.send);
const publicCharacters = useGameStore(s => s.view?.publicCharacters);
const revealedClues = useGameStore(s => s.view?.revealedClues);
const log           = useGameStore(s => s.view?.log);
const roomCode      = useGameStore(s => s.roomCode);
const status        = useGameStore(s => s.view?.status);
```

### 1.2 New store exports: `packages/client/src/store/game.ts`

Add two derived selector hooks:

```tsx
export function useHasActed(): boolean {
  const myCharId = useGameStore(s => s.view?.self?.charId);
  const actedIds = useGameStore(s => s.view?.phaseProgress?.actedCharIds);
  return Boolean(myCharId && actedIds?.includes(myCharId));
}

export function usePhaseEnded(): boolean {
  const status = useGameStore(s => s.view?.status);
  const phase  = useGameStore(s => s.view?.currentPhase);
  return status !== 'playing' || !phase;
}
```

---

## 2. Auto-Detection Logic (Show / Hide)

### 2.1 Visibility gate

```tsx
const visible = useHasActed() && !usePhaseEnded() && Boolean(currentPhase);
if (!visible) return null;
```

### 2.2 Transition behavior

| Transition | Animation |
|------------|-----------|
| `!visible → visible` | Slide up from bottom-right, start collapsed |
| `visible → !visible` | Fade out + slide down |
| `collapsed → expanded` | Width/height spring animation |
| `expanded → collapsed` | Reverse spring |

Use CSS `opacity` + `transform: translateY()` with `--ease` and `--dur` tokens from tokens.css.

### 2.3 Edge cases

- **Phase transition mid-expand:** Component unmounts via `visible → false`, state resets naturally.
- **Re-entering same phase:** Panel re-appears collapsed (no persistence of expand state across phases).
- **`exitKind === 'hostAdvance'` with `pendingAdvance`:** Panel stays visible — host hasn't clicked yet.
- **`exitKind === 'timer'` with countdown:** Panel stays visible until timer fires and phase changes.
- **Spectator / not required:** If `!requiresMe`, the player never acted, so `hasActed` is false → panel never shows. This is correct — spectators see the normal scene.

---

## 3. Tab Content & Data Sources

### Tab 1: Clues + Notes

**Data:**
- `view.revealedClues` — publicly revealed clues
- `view.self?.myClues` — player's private clues
- CaseNotes component for note-taking

**Rendering strategy:**
- Render `<CaseNotes noteKey={noteKey} />` directly (reuse existing component, it accepts `noteKey` prop)
- `noteKey` = `` `note:${roomCode}:${myCharId}` ``
- Clues displayed as a scrollable list above the notes editor
- Revealed clues: show name + description, no lock icon
- Private clues: show with lock icon, distinct styling (`.badge-secret`)

### Tab 2: Timeline

**Data:** `view.log` — full event history (up to 200 events)

**Rendering strategy:**
- Import `renderEvent` from `packages/client/src/scenes/Free/renderEvent.tsx` (pure function, already exported)
- Display last 30 events in a scrollable vertical list
- Each entry: icon from `renderEvent().icon`, class from `.iconClass`, content from `.content`
- Add timestamp formatting (events have `.ts` field)
- Reuse existing `.ev-*` CSS classes for styling consistency

### Tab 3: Private Chat

**Data:** `privateMessages` from store, `send` for dispatching

**Rendering strategy:**
- Build a simplified inline PM view (don't reuse PrivateTab directly — it has 11 props and complex local state that couples it to FreeScene)
- PM candidate list: `publicCharacters.filter(c => c.id !== myCharId)`
- Thread filter: messages where `(from=me && to=target) || (from=target && to=me)`
- Target selection: horizontal chip row (same pattern as PrivateTab's `.pm-target-chip`)
- Composer: input + send button, submit on Enter
- Auto-scroll: `useRef` + `useEffect` on thread length
- Unread dot: compare `lastSeenPmTs` against latest message ts per candidate
- Character limit: import `SPEECH_MAX` from `lib/limits.ts`

### Tab 4: Characters

**Data:** `view.publicCharacters`, `view.players`

**Rendering strategy:**
- Compact card list (don't reuse CharacterSidebar — it subscribes to store internally and has note-editing logic)
- Each card: avatar, name, connection status dot, publicProfile excerpt (truncated to 80 chars)
- Owner info: match `players` array by `charId` to show nickname + connected status
- No note editing here — that's in the main CharacterSidebar
- Victim badge if `isVictim` is true

---

## 4. CSS Strategy

### 4.1 New file: `packages/client/src/components/WaitingPanel.css`

**Layout (desktop):**
```
Position: fixed, bottom-right corner
Collapsed: 48px × 48px pill with badge showing "等待中 (X/Y)"
Expanded: 380px × 520px floating card
```

**Layout (mobile, `max-width: 768px):**
```
Collapsed: bottom-center pill
Expanded: bottom sheet (100% width, 70vh height, rounded top corners)
```

**Z-index layering:**
- WaitingPanel: `var(--z-overlay)` (20) — above scene content
- Modals (ScriptBook, Lightbox, ConfirmDialog): `var(--z-toast)` (30) — above WaitingPanel
- This matches the existing hierarchy in tokens.css

**Design tokens to use:**
- Surfaces: `--s1` for panel background, `--s2` for tab bar
- Text: `--tp` primary, `--ts` secondary, `--tm` muted
- Accent: `--accent` for active tab indicator, `--teal` for progress elements
- Spacing: `--sp2` through `--sp4` for padding
- Radius: `--r-lg` for panel, `--r-sm` for tabs
- Transition: `--ease` + `--dur` for all animations
- Shadows: `0 8px 32px rgba(0,0,0,0.4)` for the floating card

**Key CSS classes:**
```
.wp-overlay        — fixed positioning container
.wp-pill           — collapsed state (circular badge)
.wp-panel          — expanded state (full card)
.wp-panel.mobile   — bottom sheet variant
.wp-tab-bar        — horizontal tab strip
.wp-tab            — individual tab button
.wp-tab.active     — active tab with accent underline
.wp-tab-badge      — unread count badge on tab
.wp-content        — scrollable tab content area
.wp-progress-ring  — SVG circular progress on pill
```

**Transitions:**
```css
.wp-overlay { transition: opacity var(--dur) var(--ease); }
.wp-pill { transition: transform var(--dur) var(--ease), opacity var(--dur) var(--ease); }
.wp-panel { transition: transform 300ms var(--ease), opacity var(--dur) var(--ease); }
```

**Backdrop:** No backdrop — the panel is non-blocking. Scene content remains interactive behind it. Use `pointer-events: none` on overlay container, `pointer-events: auto` on the panel itself.

---

## 5. Integration Points

### 5.1 `packages/client/src/App.tsx`

Add WaitingPanel to the global overlay layer, alongside existing overlays:

```tsx
import { WaitingPanel } from './components/WaitingPanel';
import './components/WaitingPanel.css';

// In App component, after the main content area:
<WaitingPanel />
```

Placement in JSX tree (after existing global overlays):
```tsx
<>
  {/* existing global overlays */}
  <ToastViewport />
  <BgmControl />
  <ScriptBook ... />
  <DmNarrative ... />

  {/* NEW */}
  <WaitingPanel />
</>
```

No props needed — the component reads everything from the store.

### 5.2 `packages/client/src/store/game.ts`

Add the two derived hooks described in §1.2. These are pure selector hooks with no side effects — safe additions that don't modify existing state shape.

### 5.3 `packages/client/src/components/PhaseStatus.tsx`

**No changes required.** PhaseStatus already computes `hasActed` locally. WaitingPanel computes its own `hasActed` via the store hook. They're independent consumers of the same data.

### 5.4 Scene components (Lobby, Assigning, Briefing, Intro, Free, Vote, Reveal)

**No changes required.** WaitingPanel renders at the App level and auto-detects when to appear. Scenes don't need to know about it.

### 5.5 Imports from existing files

| Import | From | Usage |
|--------|------|-------|
| `renderEvent` | `../scenes/Free/renderEvent.tsx` | Timeline tab event rendering |
| `CaseNotes` | `../scenes/Free/CaseNotes.tsx` | Clues+Notes tab note editor |
| `SPEECH_MAX` | `../lib/limits` | PM character limit |
| `useGameStore` | `../store/game` | All state access |

---

## 6. Testing Approach

### 6.1 Manual testing checklist

Since the existing test suite uses `node:test` with `handleServerMessage` as a pure function (no React rendering tests), component-level testing would require new infrastructure. Focus on:

1. **Typecheck passes:** `pnpm -C packages/client typecheck` (or equivalent)
2. **Existing 117 tests pass:** `pnpm test` across all packages
3. **Manual browser testing:**
   - Panel appears after player searches/votes/readies
   - Panel disappears when phase transitions
   - All 4 tabs render correct data
   - PM sending works and shows in thread
   - Case notes persist in localStorage
   - Mobile responsive: bottom sheet at ≤768px
   - Z-index: panel above scene, below modals
   - Collapse/expand animation is smooth
   - Panel doesn't block scene interaction

### 6.2 Potential unit tests (if desired)

If we want to add React component tests later, the recommended approach:
- Add vitest + @testing-library/react to `packages/client`
- Test `useHasActed` and `usePhaseEnded` as pure hook logic
- Test visibility gating with mocked store state

### 6.3 Regression safety

- WaitingPanel is purely additive — new component, new CSS file, two new store hooks
- No existing component is modified (except adding an import + JSX line in App.tsx)
- Existing scene components are untouched
- Risk is minimal: if WaitingPanel has a bug, it fails independently without affecting game flow

---

## Implementation Order

1. **Add store hooks** (`useHasActed`, `usePhaseEnded`) in `game.ts`
2. **Create `WaitingPanel.css`** with all classes and responsive rules
3. **Create `WaitingPanel.tsx`** — start with collapsed pill only, verify visibility logic
4. **Add Tab 1 (Clues+Notes)** — wire up CaseNotes + clue lists
5. **Add Tab 2 (Timeline)** — wire up renderEvent + event log
6. **Add Tab 3 (Private Chat)** — wire up PM thread + composer
7. **Add Tab 4 (Characters)** — wire up character cards
8. **Integrate in App.tsx** — add import + render
9. **Run typecheck + all tests** — verify no regressions
10. **Manual browser QA** — test all scenarios from checklist
