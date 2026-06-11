# Ink Shadow (墨影) — Murder Mystery Game Design System

> A neutral, minimalist dark-theme design system for murder mystery games.
> Designed as a universal base that adapts to any story genre — ancient, modern, sci-fi, anime, horror.
> Category: Dark Minimal · Theatrical Immersion

## 1. Visual Theme & Atmosphere

Understated sophistication. The interface should feel like entering a dimly lit room — quiet, focused, expectant. It serves the story, never competes with it.

**Core principles:**
- **Interface as stage, not actor** — UI recedes so players focus on narrative and social interaction
- **Dark by default** — every murder mystery benefits from a dark canvas; light themes are optional per-script overrides
- **Quiet luxury** — no gradients, no glow, no skeuomorphism. Subtle surfaces, restrained accents, deliberate negative space
- **Functional clarity above all** — players must read clues, vote, chat under time pressure. Legibility is non-negotiable

**Mood keywords:** restrained, atmospheric, focused, versatile, cinematic

## 2. Color

### Base Palette (Neutral Theme — default)

```
--color-surface-0: #08080D;    /* page background — deepest */
--color-surface-1: #0F0F17;    /* cards, panels */
--color-surface-2: #181824;    /* elevated cards, modals */
--color-surface-3: #22222F;    /* hover states, active tabs */
--color-surface-4: #2C2C3A;    /* borders, dividers */

--color-text-primary:   #E8E5E0;  /* body text */
--color-text-secondary: #9A9AA0;  /* labels, hints */
--color-text-muted:     #5E5E68;  /* disabled, timestamps */
--color-text-inverse:   #08080D;  /* text on accent */

--color-accent:         #C8A66A;  /* muted amber — primary action */
--color-accent-hover:   #D4B87E;  /* amber hover */
--color-accent-muted:   rgba(200, 166, 106, 0.12);  /* accent bg tint */

--color-teal:           #5A9E9E;  /* secondary info, links */
--color-crimson:        #C45454;  /* danger, voting highlight */
--color-sage:           #6A9F7A;  /* success, confirmation */
--color-smoke:          #7A7A88;  /* neutral indicators */
```

### Semantic Roles

| Role | Token | Usage |
|------|-------|-------|
| Primary action | `--color-accent` | CTAs, active states, room code |
| Secondary | `--color-teal` | links, secondary actions, info badges |
| Danger | `--color-crimson` | errors, voting highlight, destructive actions |
| Success | `--color-sage` | confirmations, "ready" states, online status |
| Muted | `--color-smoke` | inactive tabs, secondary badges |

### Surface Hierarchy

Use surfaces in order: `surface-0` (page) → `surface-1` (card) → `surface-2` (elevated) → `surface-3` (interactive) → `surface-4` (border). Never skip a level.

### Theme Override Interface

Each theme overrides a fixed set of CSS custom properties. The base neutral theme is the default.

```css
/* Future theme overrides only need to change these: */
.theme-ancient {
  --color-accent: #B84C3A;        /* vermillion red */
  --color-teal: #7B6B4E;          /* bronze */
  --color-surface-0: #0A0806;     /* warm black */
  --font-display: "Noto Serif SC", serif;
  --theme-border-radius: 2px;
  --theme-ambient: grain;
}
.theme-modern {
  --color-accent: #4A90D9;        /* steel blue */
  --color-teal: #5AC8B8;          /* cyan */
  --font-display: "DM Sans", sans-serif;
  --theme-border-radius: 8px;
  --theme-ambient: none;
}
.theme-scifi {
  --color-accent: #00E5A0;        /* neon green */
  --color-teal: #00B4D8;          /* electric cyan */
  --color-surface-0: #030712;     /* void black */
  --font-display: "Space Grotesk", sans-serif;
  --theme-border-radius: 0px;
  --theme-ambient: scanlines;
}
.theme-anime {
  --color-accent: #E85D75;        /* sakura pink */
  --color-teal: #6EC1E4;          /* sky blue */
  --font-display: "Zen Maru Gothic", sans-serif;
  --theme-border-radius: 12px;
  --theme-ambient: none;
}
```

## 3. Typography

### Font Stack

```css
--font-body: "Inter", "Noto Sans SC", -apple-system, sans-serif;
--font-display: "Inter", "Noto Sans SC", -apple-system, sans-serif; /* overridden per theme */
--font-mono: "JetBrains Mono", "Noto Sans SC", monospace;
```

**Why Inter + Noto Sans SC:** Inter provides excellent Latin readability at small sizes with tight spacing. Noto Sans SC is the best free CJK sans-serif with consistent weight range. Together they render seamlessly for bilingual content.

### Type Scale

```
--text-xs:   11px;   line-height: 1.5;   /* timestamps, badges */
--text-sm:   13px;   line-height: 1.5;   /* secondary text, labels */
--text-base: 15px;   line-height: 1.6;   /* body text */
--text-lg:   18px;   line-height: 1.5;   /* emphasis, subheadings */
--text-xl:   22px;   line-height: 1.4;   /* section titles */
--text-2xl:  28px;   line-height: 1.3;   /* page titles */
--text-3xl:  36px;   line-height: 1.2;   /* hero text, reveal titles */
```

### Weight Usage

| Weight | Token | Use |
|--------|-------|-----|
| 400 | Regular | body text, descriptions |
| 500 | Medium | labels, navigation, secondary headings |
| 600 | SemiBold | buttons, active states |
| 700 | Bold | page titles, emphasis |

### Typography Rules

- Headings use `--text-xl` to `--text-3xl`, weight 600–700, `letter-spacing: -0.02em`
- Body text capped at `max-width: 65ch` for readability
- Room codes and codes use `--font-mono`, `letter-spacing: 0.1em`
- Never use all-caps for headings. Use sentence case
- Chinese text: add `letter-spacing: 0.04em` for body, `0.02em` for headings

## 4. Components

### Buttons

```
Primary:   bg: --color-accent, text: --color-text-inverse, radius: 6px, padding: 10px 24px, weight: 600
Secondary: bg: transparent, border: 1px solid --color-surface-4, text: --color-text-primary, radius: 6px
Ghost:     bg: transparent, text: --color-text-secondary, hover: text becomes --color-text-primary
Danger:    bg: --color-crimson, text: white
```

States: hover (lighten bg 8%), active (scale 0.98), disabled (opacity 0.4, cursor not-allowed), focus-visible (2px ring offset, color accent)

Transitions: `all 150ms cubic-bezier(0.23, 1, 0.32, 1)`

### Cards

```
bg: --color-surface-1, border: 1px solid --color-surface-4, radius: 8px, padding: 16px-20px
Hover: bg -> --color-surface-2, border-color -> --color-accent-muted
Active/Selected: border-color -> --color-accent, subtle accent bg tint
```

Cards never use `box-shadow` in the base theme. Elevation is communicated through background color hierarchy.

### Inputs

```
bg: --color-surface-1, border: 1px solid --color-surface-4, radius: 6px
Placeholder: --color-text-muted
Focus: border-color -> --color-accent, subtle accent bg tint
Error: border-color -> --color-crimson
```

### Tabs

Active tab: `color: --color-accent`, `border-bottom: 2px solid --color-accent`
Inactive: `color: --color-text-secondary`, no border
Hover on inactive: `color: --color-text-primary`

### Tags / Badges

```
bg: --color-accent-muted, text: --color-accent, radius: 4px, padding: 2px 8px, size: --text-xs
```

### Avatar / Character Card

- Square with rounded corners (radius: 10px), not circles
- Placeholder: solid `--color-surface-3` with character initial in `--color-text-secondary`
- Selected state: 2px `--color-accent` border
- Online indicator: 8px dot, `--color-sage` (online), `--color-text-muted` (offline)

### Progress / Phase Indicator

Horizontal step indicator. Current step: `--color-accent` filled. Completed: `--color-sage`. Upcoming: `--color-surface-3`.

## 5. Layout

### Grid System

- 12-column grid with 16px gutters
- Max content width: 1120px (centered)
- Sidebar width: 280px (collapsible)

### Scene Layout Pattern

All scenes follow the same structural template:

```
┌─────────────────────────────────────────────┐
│ Header (fixed, 56px)                        │
├─────────────────────────┬───────────────────┤
│                         │                   │
│ Main Content Area       │ Character Sidebar │
│ (flex: 1)               │ (280px, optional) │
│ max-width: 840px        │                   │
│ centered                │                   │
│                         │                   │
└─────────────────────────┴───────────────────┘
```

### Spacing Scale

```
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-5: 24px;
--space-6: 32px;
--space-8: 48px;
--space-10: 64px;
```

### Responsive Breakpoints

```
--bp-sm: 640px;   /* mobile landscape */
--bp-md: 768px;   /* tablet */
--bp-lg: 1024px;  /* desktop */
--bp-xl: 1280px;  /* wide desktop */
```

Below `--bp-md`: sidebar collapses to a bottom sheet or overlay.

## 6. Depth & Elevation

No drop shadows in the neutral base. Depth is communicated through:
1. **Surface hierarchy** — darker = deeper, lighter = elevated
2. **Border opacity** — subtle borders on `surface-1` cards
3. **Content density** — more padding = more importance

Per-theme overrides may add:
- Glassmorphism (modern, sci-fi)
- Paper texture (ancient)
- Noise grain (horror)

## 7. Motion

- Default easing: `cubic-bezier(0.23, 1, 0.32, 1)` (ease-out-expo)
- Enter: 200ms; Exit: 140ms
- Scene transitions: cross-fade 300ms
- Card hover: `transform: translateY(-2px)`, 150ms
- Button press: `transform: scale(0.98)`, 100ms
- Tab switch: content fade 200ms
- No bounce, no spring, no overshoot in the neutral base
- Per-theme: ancient may use slower transitions (400ms), sci-fi may use snappy (100ms)

## 8. Scene-Specific Guidelines

### Lobby
- Centered layout, single-column form
- Room code: large monospace display (`--text-2xl`, `--font-mono`)
- Player list: grid of small avatar cards (2-3 columns)
- Script selection: horizontal card row with cover art placeholder
- Host controls: subtle, secondary button style

### Assigning (Character Selection)
- Grid of character cards (auto-fill, min 200px)
- Each card: name, brief description, "select" action
- Selected card: accent border + checkmark overlay
- Once confirmed: card fades to muted state with "confirmed" badge

### Briefing
- Single-column narrative text on `surface-1` card
- Objectives listed with icon badges (main/hidden/side)
- "Ready" button at bottom, sticky on mobile
- Text should feel like reading a dossier — clean, readable, no distractions

### Intro (Speech)
- Speech bubbles for current speaker, log for history
- Active speaker gets subtle accent border on their avatar
- Input field at bottom, chat-room style
- Past speeches in muted text, compact layout

### Free (Investigation)
- Two-column: action tabs (left) + event log (right)
- Tabs: Search | Chat | Clues | Messages
- Search results: card grid of discoverable items
- Event log: chronological, color-coded by type (icon + text, not emoji)
- "Advance Phase" button: ghost style, not visually competing

### Vote
- Grid of suspect character cards
- Selected: crimson border + subtle crimson bg tint
- Vote confirmation: sage green badge
- Waiting state: subtle pulse animation on "waiting for others..."

### Reveal
- Full-width cinematic card
- Truth revealed with `--text-3xl` heading
- Narrative text in centered column
- Dramatic but restrained — let the story content carry the emotion

## 9. Anti-patterns

- **No emoji as UI icons.** Use SVG icons or icon font. Emoji are acceptable in user-generated content (chat messages) only.
- **No gradients** in the neutral base. Themes may add them.
- **No `#000000` pure black.** Always use tinted dark surfaces.
- **No more than one accent color in active use.** Teal is supporting, not a second accent.
- **No glow effects, box-shadows, or neon** in the neutral base.
- **No circular avatars.** Use rounded squares (squircles).
- **No hard borders everywhere.** Use surface color differences for separation; borders only on interactive elements.
- **No centered text for body paragraphs.** Left-align all reading text.
- **No animated backgrounds** in the neutral base. Per-theme only.
- **Do not flatten hierarchy** — every surface must clearly belong to a depth level.

## 10. Theme Extension Specification

Each theme is a CSS class that overrides custom properties. No theme should need more than 20 variable overrides.

Required overrides per theme:
- `--color-accent`, `--color-accent-hover`, `--color-accent-muted`
- `--color-teal` (secondary)
- `--color-crimson` (danger)
- `--color-sage` (success)
- `--color-surface-0` through `--color-surface-4` (optional, only if mood change needed)
- `--font-display`
- `--theme-border-radius`
- `--theme-ambient` (none | grain | scanlines | paper)

Optional overrides:
- `--color-text-primary`, `--color-text-secondary` (for light themes)
- `--transition-speed` (default: 200ms)
- `--card-elevation` (none | border | shadow | glass)
