# Phase 2 — Design System Proposal

**Status:** draft for approval. No code changes yet.
**Scope:** desktop-first (per user constraint). Tablet/mobile handled via the 2-breakpoint system but not in active polish scope.

**Defaults chosen on §10 of Phase 1 (override any of these in your reply):**

1. Accent → **Ocean Teal `#0d9488`** kept. Strip the legacy blue everywhere it still lives.
2. Topbar duplication → **accept 3× inline duplication**, enforce via a banner comment + a 1-line consistency note in the build/lint readme. Zero build step.
3. Modal/popup modernization → **deferred to a later milestone.** Out of Phase 3 scope.
4. Hero counter scale → **keep `clamp(64px, 7vw, 104px)`**.
5. Page container → **1200px** max-width across all 3 shells.

---

## 1. Color Palette

### 1.1 Neutrals — single 9-step ramp

| Token | Value | OKLCH-ish | Role |
|---|---|---|---|
| `--ink-950` | `#0c1a26` | very deep ink | Primary text on light surfaces |
| `--ink-900` | `#172a3a` | deep ink | Headings second-level |
| `--ink-700` | `#2f4554` | dark slate | Body emphasis |
| `--ink-500` | `#5d7282` | slate | Secondary text ✓ (replaces `--muted`) |
| `--ink-400` | `#7d8f9c` | mid slate | Tertiary text, captions (AA-safe ≥ 14px bold) |
| `--ink-300` | `#a3b1bb` | light slate | Decorative icons, divider hover |
| `--ink-200` | `#c6d3dc` | line-2 | Strong border |
| `--ink-100` | `#dbe5ec` | line | Default border |
| `--ink-50`  | `#eaf0f3` | wash | Hover surface, paper-3 |

| Token | Value | Role |
|---|---|---|
| `--paper`   | `#fbfdfd` | Card and container fill (never `#fff`) |
| `--paper-2` | `#f8fafb` | Recessed surface (input bg, nested) |
| `--bg`      | `#f0f5f7` | Page background |

### 1.2 Accent — Ocean Teal, 4 steps

| Token | Value | Role |
|---|---|---|
| `--accent`        | `#0d9488` | Primary CTAs, active states, focus rings |
| `--accent-ink`    | `#0a7c72` | **Accent text on `--paper` (AA-compliant 4.93:1)** |
| `--accent-soft`   | `#ccfbf1` | Tinted backgrounds (badges, hover surfaces) |
| `--accent-line`   | `#99f0e1` | Soft borders on accent surfaces |

### 1.3 Semantic — paired pill / text variants

Each semantic role gets TWO variants: the brand hue (for icons, fills, indicator dots) and a "ink" variant darker by ~10 lightness for text on white surfaces.

| Token | Value | Role | Contrast on `--paper` |
|---|---|---|---|
| `--success`      | `#059669` | Icon, dot, fill | 4.39:1 (large text only) |
| `--success-ink`  | `#047857` | Text on `--paper` | **5.21:1 ✓ AA** |
| `--success-soft` | `#d1fae5` | Background tint | — |
| `--warning`      | `#ea580c` | Icon, dot, fill | 3.66:1 (large text only) |
| `--warning-ink`  | `#c2410c` | Text on `--paper` | **4.94:1 ✓ AA** |
| `--warning-soft` | `#ffedd5` | Background tint | — |
| `--danger`       | `#be123c` | Icon, dot, fill, text | **6.71:1 ✓ AA** |
| `--danger-ink`   | `#9f1239` | Stronger text | 8.06:1 ✓ AAA |
| `--danger-soft`  | `#ffe4e6` | Background tint | — |
| `--info`         | `#2563eb` | Icon, dot | 4.50:1 ✓ AA |
| `--info-ink`     | `#1e40af` | Text | 8.95:1 ✓ AAA |
| `--info-soft`    | `#dbeafe` | Background tint | — |

**Rule:** any small text (<18px) in a status color MUST use `--{role}-ink`, not the brand hue. Icons, dots, bar fills can use the brand hue freely.

### 1.4 Decommissioned colors

Replace and delete from the codebase:

| Legacy value | Locations | Replace with |
|---|---|---|
| `#3b82f6`, `#1668c2`, `rgba(31,126,224,*)` (57 rules) | `styles.css` focus rings, hover halos | `--accent` / `--accent-soft` |
| `#138148` | `styles.css` legacy success | `--success-ink` |
| `#c4671e` | `styles.css` legacy warning | `--warning-ink` |
| `#e11d48` | `styles.css` legacy danger | `--danger-ink` |
| `#fff` (1 use) | `styles.css` | `--paper` |
| `#0c2440`, `#1a2e3d`, `#1e3a4d` (ink alternates) | sparse | `--ink-900` |
| `#3e5566` | 1 use | `--ink-700` |
| `#8da0ad` (`--muted-2`) | brand-sub fallback | `--ink-400` |
| `#d4dae6`, `#e2e7f0`, `#c4ccdb`, `#e6edf1` | borders | `--ink-100` or `--ink-200` |

---

## 2. Typography

### 2.1 Families (2 only)

| Token | Stack |
|---|---|
| `--sans` | `'Geist', ui-sans-serif, system-ui, -apple-system, sans-serif` |
| `--mono` | `'JetBrains Mono', ui-monospace, 'SF Mono', Consolas, monospace` |

Delete `--font-sans` / `--font-mono` legacy aliases entirely. Every `font-family: var(--font-mono)` becomes `font-family: var(--mono)`.

### 2.2 Size scale — 8 steps + 1 hero clamp

| Token | Value | Use |
|---|---|---|
| `--text-2xs`  | `11px` | Micro labels, delta pills, sparkline meta |
| `--text-xs`   | `12px` | Mono labels, captions, field labels, monospace UI text |
| `--text-sm`   | `13px` | Body small, table cells, button text |
| `--text-base` | `14px` | Default body text |
| `--text-md`   | `16px` | Brand-name, btn-hero text |
| `--text-lg`   | `18px` | Bento label, card-name (raised from 15px → 18px for hierarchy step) |
| `--text-xl`   | `22px` | Sub-section headings, small KPI |
| `--text-2xl`  | `28px` | Page-title, card-count, ds-value (unified — currently 30 + 28 + 28) |
| `--text-3xl`  | `36px` | Tile-big (bento side tiles) |
| `--text-hero` | `clamp(64px, 7vw, 104px)` | Captura main counter only |

**Rule:** no other font-size value appears in any stylesheet. Currently 33 distinct sizes → **target 10**.

### 2.3 Weight scale — 4 steps

| Token | Value | Use |
|---|---|---|
| `--weight-regular` | `400` | (Not used in current product — reserved for paragraph text if added) |
| `--weight-medium`  | `500` | Body emphasis, nav-pill inactive |
| `--weight-semi`    | `600` | Default UI text, labels, buttons, nav |
| `--weight-bold`    | `700` | Numbers, titles, nav active state |

Delete the `font-weight: 800` outlier.

### 2.4 Line height — 3 values

| Token | Value | Use |
|---|---|---|
| `--lh-tight`   | `1` | Numbers, hero counter, single-line UI |
| `--lh-snug`    | `1.2` | Headings, titles, card-name |
| `--lh-normal`  | `1.5` | Body text, paragraphs |

Currently 9 distinct values → **target 3**.

### 2.5 Letter-spacing — 3 values

| Token | Value | Use |
|---|---|---|
| `--track-tight`  | `-0.025em` | Page-title, big numbers |
| `--track-snug`   | `-0.01em` | Card-name |
| `--track-normal` | `0` | Body |

---

## 3. Spacing scale — 8 steps (4 / 8 multiples)

| Token | Value | Common use |
|---|---|---|
| `--space-1`  | `4px`  | Tight icon gaps |
| `--space-2`  | `8px`  | Default gap |
| `--space-3`  | `12px` | Section gap small, padding inset small |
| `--space-4`  | `16px` | Default padding, card padding inset |
| `--space-5`  | `20px` | Page padding top |
| `--space-6`  | `24px` | Topbar gap, section margin-bottom |
| `--space-8`  | `32px` | Page padding left/right, large section gap |
| `--space-10` | `40px` | Page padding bottom |
| `--space-12` | `48px` | Major section break |
| `--space-16` | `64px` | Hero region |

Off-scale values to retire: `5, 7, 9, 11, 14, 18, 22, 26, 30, 36, 86, 90, 110`. Replace by snapping to nearest scale step.

**Card padding** standardizes to `var(--space-4) var(--space-5)` (16×20) everywhere. Currently drifts: 16×18 / 18×22 / 20×20.

**Gutter:** all primary grids use `gap: var(--space-3)` (12px). Currently drifts: 12 / 14 / 16.

---

## 4. Border-radius — 5 steps

| Token | Value | Use |
|---|---|---|
| `--radius-sm`   | `8px`  | Inputs, small buttons |
| `--radius-md`   | `10px` | Buttons (default), select |
| `--radius-lg`   | `12px` | Secondary buttons (replaces current 12 in tablero), small cards |
| `--radius-xl`   | `14px` | Cards (canonical) |
| `--radius-2xl`  | `16px` | Chart cards, hero card |
| `--radius-pill` | `999px` | Pills, chips, dots |

Currently 17 values → **target 6**. Retire: `0, 2, 3, 4, 6, 11, 18, 20, 22, 32, 50%`. (Use `--radius-pill` for circles via 1:1 aspect; never `50%`.)

---

## 5. Shadows — 4 steps

| Token | Value | Use |
|---|---|---|
| `--shadow-none`  | `none` | Default state |
| `--shadow-sm`    | `0 1px 2px rgba(12,26,38,0.04)` | Card resting |
| `--shadow-md`    | `0 6px 16px -8px rgba(12,26,38,0.10)` | Card hover, pressed sheet |
| `--shadow-lg`    | `0 12px 28px -16px rgba(12,26,38,0.18)` | Modal, popup, dropdown |
| `--shadow-focus` | `0 0 0 3px var(--accent-soft)` | Focus ring inner |

**Banned** in new code: any `box-shadow` literal not referencing one of these tokens. Currently ~20 ad-hoc shadows live in inline + legacy CSS.

**Borders for elevation (no shadow):**
- `border: 1px solid var(--ink-100)` — default
- `border: 1px solid var(--ink-200)` — stronger
- `border: 1px solid var(--accent)` — accent state

---

## 6. Breakpoints — 2 only

| Token | Value | Boundary |
|---|---|---|
| `--bp-md` | `768px`  | Phone ↔ tablet |
| `--bp-lg` | `1024px` | Tablet ↔ desktop |

All existing breakpoints collapse:

| Current | → | New |
|---|---|---|
| `380, 479, 480, 540, 600, 720, 760` | → | `< 768px` |
| `768, 820, 880` | → | `768px` boundary |
| `1023, 1023.98, 1024, 1025` | → | `1024px` boundary |
| `1400, 1600` | → | drop (rely on max-width 1200px) |

Current usage: 21 distinct values → **target 2**.

---

## 7. Container & Layout

| Property | Value |
|---|---|
| Page max-width | `1200px` (all 3 shells) |
| Page padding desktop | `var(--space-5) var(--space-8) var(--space-10)` (20 / 32 / 40) |
| Admin page padding bottom | `90px` (reserve for save-bar — exception with comment) |
| Page padding mobile | `var(--space-5) var(--space-4) var(--space-12)` (20 / 16 / 48) |
| Topbar height | `56px` |
| Sidenav width (admin) | `260px` |
| Grid gutter | `var(--space-3)` (12px) |

---

## 8. Component Specs

### 8.1 Buttons

One base `.btn` + 4 variants + 2 sizes. Replaces the 18 button-like classes.

```css
.btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: 10px var(--space-4);            /* 10×16 — height 40 */
  border-radius: var(--radius-md);          /* 10px everywhere */
  font-family: var(--sans);
  font-size: var(--text-sm);                /* 13px */
  font-weight: var(--weight-semi);
  line-height: var(--lh-tight);
  min-height: 40px;
  border: 1px solid var(--ink-100);
  background: var(--paper);
  color: var(--ink-950);
  cursor: pointer;
  transition: background 140ms, transform 140ms;
}
.btn:hover { background: var(--ink-50); }
.btn:active { transform: translateY(1px); }
.btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

.btn--primary  { background: var(--accent); border-color: var(--accent); color: var(--paper); }
.btn--primary:hover { filter: brightness(0.94); }

.btn--ghost    { background: transparent; border-color: transparent; }
.btn--ghost:hover { background: var(--ink-50); }

.btn--danger   { color: var(--danger-ink); }
.btn--danger:hover { background: var(--danger-soft); }

.btn--icon     { width: 36px; min-height: 36px; padding: 0; border: none; background: transparent; color: var(--ink-500); }
.btn--icon:hover { background: var(--ink-50); color: var(--ink-950); }

/* Sizes */
.btn--sm  { padding: 6px var(--space-3); font-size: var(--text-xs); min-height: 32px; }
.btn--hero { padding: 18px var(--space-12); font-size: var(--text-md); min-height: 56px; border-radius: var(--radius-2xl); }
```

**Retired classes** (their styling collapses into the above):
- `.btn-primary` → `.btn.btn--primary`
- `.btn-ghost`, `.btn-danger`, `.btn-warn` → variants
- `.btn-block` → utility class `.block { width: 100%; }`
- `.btn-small` → `.btn.btn--sm`
- `.btn-hero-primary` → `.btn.btn--primary.btn--hero`
- `.btn-hero-ghost` → `.btn.btn--ghost.btn--hero`
- `.quickkey`, `.numkey`, `.filter-chip`, `.log-chip`, `.weekstrip-icon` — stay as their own specialized classes (legitimate distinct components) but adopt the same `--radius-md/lg/pill`, `--text-sm`, and 40px-grid height.

### 8.2 Inputs

One base `.field` + `.input`.

```css
.field { display: flex; flex-direction: column; gap: var(--space-2); }
.field-label {
  font-family: var(--mono);
  font-size: var(--text-xs);
  font-weight: var(--weight-semi);
  color: var(--ink-500);
}
.input {
  background: var(--paper-2);
  border: 1px solid var(--ink-100);
  border-radius: var(--radius-sm);          /* 8px */
  padding: 12px var(--space-4);              /* height 44 */
  font-family: var(--sans);
  font-size: var(--text-base);               /* 14px */
  color: var(--ink-950);
  width: 100%;
  min-height: 44px;
  transition: border-color 140ms, box-shadow 140ms;
}
.input:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: var(--shadow-focus);
}
.input:disabled { background: var(--ink-50); color: var(--ink-400); cursor: not-allowed; }
```

### 8.3 Card

One canonical container + 3 modifiers.

```css
.card {
  background: var(--paper);
  border: 1px solid var(--ink-100);
  border-radius: var(--radius-xl);           /* 14px */
  padding: var(--space-4) var(--space-5);    /* 16 × 20 */
  display: flex;
  flex-direction: column;
  gap: var(--space-3);                       /* 12 */
}
.card--hero      { padding: var(--space-6) var(--space-8); border-radius: var(--radius-2xl); }
.card--compact   { padding: var(--space-3) var(--space-4); }
.card--elevated  { box-shadow: var(--shadow-md); border: none; }
.card:hover      { transform: translateY(-1px); box-shadow: var(--shadow-md); transition: transform 240ms cubic-bezier(0.16,1,0.3,1), box-shadow 240ms cubic-bezier(0.16,1,0.3,1); }
```

`.ds-tile`, `.bento-tile`, `.line-card`, `.admin-card`, `.chart-card` all collapse into `.card` + a context class for any extras (e.g. `.card.is-line-card` keeps line-card specific markup but doesn't redeclare card visuals).

### 8.4 Topbar (canonical structure)

Identical markup across all 3 shells, identical CSS. Stays inline (3× duplication accepted) with this banner at the top of each block:

```css
/* === TOPBAR (canonical). Mirror any change to dashboard.html AND admin.html. === */
```

```css
.topbar {
  height: 56px;
  padding: 0 var(--space-8);
  background: var(--paper);
  border-bottom: 1px solid var(--ink-100);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-6);
  position: sticky;
  top: 0;
  z-index: 60;
}
.brand        { display: flex; align-items: center; gap: var(--space-3); font-weight: var(--weight-bold); min-width: 0; }
.brand-dot    { width: 28px; height: 28px; border-radius: var(--radius-sm); background: var(--accent); display: grid; place-items: center; color: var(--paper); }
.brand-text   { display: flex; flex-direction: column; line-height: var(--lh-snug); min-width: 0; }
.brand-name   { font-size: var(--text-md); color: var(--ink-950); white-space: nowrap; }
.brand-sub    { color: var(--ink-500); font-size: var(--text-xs); font-weight: var(--weight-medium); font-family: var(--mono); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 26ch; }
.nav-pills    { display: flex; gap: var(--space-1); margin-left: var(--space-3); flex-shrink: 0; }
.nav-pill     { padding: var(--space-2) 14px; border-radius: var(--radius-pill); font-size: var(--text-sm); font-weight: var(--weight-semi); color: var(--ink-500); cursor: pointer; text-decoration: none; line-height: var(--lh-tight); background: transparent; border: none; font-family: inherit; }
.nav-pill:hover  { color: var(--ink-950); }
.nav-pill.active { background: var(--ink-950); color: var(--paper); }
.topbar-actions  { display: flex; gap: var(--space-3); align-items: center; }
.shift-pill      { display: inline-flex; align-items: center; gap: var(--space-2); padding: 6px var(--space-3) 6px var(--space-2); background: var(--paper-2); border: 1px solid var(--ink-100); border-radius: var(--radius-pill); font-size: var(--text-xs); font-family: var(--mono); color: var(--ink-950); white-space: nowrap; }
.live-dot        { width: 8px; height: 8px; border-radius: var(--radius-pill); background: var(--success); box-shadow: 0 0 0 3px rgba(5,150,105,0.18); display: inline-block; flex-shrink: 0; }
.sync-status     { /* uses .btn--icon */ }
.lang-toggle     { /* uses .btn--icon size 36×36, mono 12px, weight 700 */ }
```

Brand-sub max-width: **26ch on all 3 shells** (currently admin has 22ch — fix).

### 8.5 Navigation (admin sidenav)

```css
.sidenav    { background: var(--paper); border-right: 1px solid var(--ink-100); padding: var(--space-4) var(--space-3); position: sticky; top: 56px; height: calc(100dvh - 56px); overflow-y: auto; }
.sn-section { font-family: var(--mono); color: var(--ink-500); font-size: var(--text-xs); font-weight: var(--weight-semi); padding: var(--space-2) var(--space-3); margin-top: var(--space-4); }
.sn-link    { display: flex; align-items: center; gap: var(--space-3); padding: 10px var(--space-3); border-radius: var(--radius-md); font-size: var(--text-sm); color: var(--ink-950); cursor: pointer; font-weight: var(--weight-medium); background: transparent; border: none; width: 100%; text-align: left; font-family: inherit; text-decoration: none; }
.sn-link:hover { background: var(--ink-50); }
.sn-link.active { background: var(--accent-soft); color: var(--accent-ink); font-weight: var(--weight-semi); }
```

ARIA tab pattern completed: parent gets `role="tablist"`, links get `aria-controls` + `aria-selected`, panels get `aria-labelledby`.

### 8.6 Page-head (canonical)

```css
.page-head    { display: flex; flex-direction: row; flex-wrap: nowrap; justify-content: space-between; align-items: flex-end; margin-bottom: var(--space-4); gap: var(--space-6); text-align: left; }
.page-head > div:first-child { flex: 1 1 auto; min-width: 0; }
.page-title   { font-size: var(--text-2xl); font-weight: var(--weight-bold); letter-spacing: var(--track-tight); margin: 0; color: var(--ink-950); line-height: var(--lh-snug); }
.page-meta    { display: inline-flex; align-items: center; gap: var(--space-3); color: var(--ink-500); font-size: var(--text-sm); margin-top: var(--space-1); }
```

No `!important` needed once legacy `.page-head { flex-direction: column }` rule is **removed** from `styles.css` rather than overridden.

### 8.7 Modal/popup (deferred)

Phase-3 leaves the legacy popup styling alone. We add ONE token migration only (so they don't visually diverge from Ocean Teal): swap the legacy blue rgba focus rings to `--accent-soft`, swap legacy success/warning/danger to the new `*-ink` variants. No structural rework.

---

## 9. Motion

Single ease + 3 durations.

| Token | Value | Use |
|---|---|---|
| `--ease-out`  | `cubic-bezier(0.16, 1, 0.3, 1)` | Default for all transitions |
| `--dur-fast`  | `140ms` | Button hover, link color change |
| `--dur-base`  | `240ms` | Card hover, layout lift |
| `--dur-slow`  | `460ms` | Stagger reveal, panel switch |

Banned: linear easing, bounce/elastic, transitions on `width/height/top/left`.

---

## 10. Implementation Strategy for Phase 3

Order of operations to minimize risk:

1. **Token migration commit.** Single `:root` in `styles.css` with full token set above. Delete the other 3 `:root` blocks in `styles.css`. Delete the inline token redeclarations in the 3 shells (replace with `@import` of `styles.css` if needed — already imported in captura+admin; add link in dashboard.html).
2. **Color decommission commit.** Sweep & replace the 12 legacy color values listed in §1.4. Use `git grep` + sed against `styles.css` per-color.
3. **Component consolidation commit (buttons).** Collapse `.btn-*` variants. Update HTML class lists.
4. **Component consolidation commit (cards).** Collapse `.ds-tile` / `.bento-tile` / `.line-card` / `.admin-card` to `.card` + modifier. Update HTML class lists.
5. **Inline-shell consolidation commit.** Delete redundant declarations from each `body.shell-X` inline block. Keep only shell-specific layout (sidenav layout, bento grid template).
6. **Breakpoint collapse commit.** Rewrite media queries to `768`/`1024` only.
7. **A11y patch commit.** Aria labels, complete tab pattern, contrast fixes.
8. **Cleanup commit.** Remove dead legacy CSS rules (`styles.css` likely drops from 4959 → ~2500 LOC).

Each commit small and reviewable. Estimated **8 commits, ~3-5 hours of focused work**.

---

## 11. What Phase 3 Will NOT Touch

- Business logic in `app.js`, `admin.js`, `dashboard.js`, `sync.js`, `seed.js` — visual/structural CSS + HTML only.
- Copy text in `i18n.js` — locked.
- Service worker logic in `sw.js` — only cache name bump.
- Supabase configuration.
- Modal/popup interiors (deferred per §10 default 3).

---

## 12. Approval Checklist

Reply approving (or overriding) each:

- [ ] Color palette §1 — including replacing `--muted-2` `#8da0ad` with `--ink-400` `#7d8f9c` (less green-tinted, AA-friendlier)
- [ ] Type scale §2 — 10 sizes total, hero clamp kept
- [ ] Spacing scale §3 — retire 13 off-scale values
- [ ] Radius scale §4 — 6 values total
- [ ] Shadow scale §5 — 5 tokens, ban inline literals
- [ ] Breakpoints §6 — 768 + 1024 only
- [ ] Container §7 — 1200px, padding 20/32/40
- [ ] Button spec §8.1
- [ ] Card spec §8.3
- [ ] Topbar spec §8.4 — accept 3× duplication
- [ ] Modal modernization deferred §8.7
- [ ] Phase 3 commit plan §10

Once approved (or modified) I begin Phase 3 commit-by-commit.
