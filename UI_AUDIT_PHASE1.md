# Phase 1 — UI/UX Audit Report

**Scope:** entire frontend of the production-tracking PWA at this repo root.
**Mode:** read-only. No code changes yet.
**Date generated:** 2026-05-18.

---

## 1. Pages / Screens Inventory

| # | Route | Body class | Inline `<style>` LOC | Notes |
|---|-------|------------|----------------------|-------|
| 1 | `/index.html` (Captura) | `body.shell-captura.app-shell` | ~213 | Default landing. Holds two views: `#view-capture` (default) and `#view-charts` (hash `#charts`). Loads `styles.css?v=97` *and* inline mockup-verbatim block. |
| 2 | `/dashboard.html` (Tablero) | `body.shell-tablero.app-shell.dashboard-body` | ~245 | Lines overview. Does **not** load `styles.css` (decoupled — only inline). |
| 3 | `/admin.html` (Admin) | `body.shell-admin.app-shell.admin-shell` | ~150 | 4 sub-panels (`config`, `catalogos`, `resumen`, `datos`) toggled via `[data-tab]` — they are panels, not separate routes. Loads `styles.css?v=97` + inline. |

Sub-views (modal/overlay layer, all in legacy `styles.css`):

- Capture form (`#form-popup`)
- Numpad
- End-of-shift summary
- History sheet
- Charts heatmap & line/bar canvases
- Confirm/alert popups
- Admin lock overlay (currently disabled by `ADMIN_GATE_ENABLED=false`)
- Admin breaks editor

**Service worker:** `sw.js` (cache `prod-v8`). Caches HTML/CSS/JS for offline-first.

---

## 2. Design Token Inconsistencies

### 2.1 Token sources of truth — **CRITICAL**

There is no single source. Tokens are declared in **four** places:

1. `styles.css` — **four** separate `:root {}` blocks (lines 1, 1303, 2574, 4450). The Ocean Teal palette at 2574 wins for most keys; earlier blocks still leak.
2. `index.html` inline `body.shell-captura { ... }` (~lines 16-22).
3. `dashboard.html` inline `body.shell-tablero { ... }` (~lines 15-33).
4. `admin.html` inline `body.shell-admin { ... }` (~lines 16-23).

Each redefines `--bg`, `--paper`, `--ink`, `--accent`, `--muted`, etc. Most values match across the four, but drift is unavoidable:
- `--line-2` declared in captura + tablero, **missing** in admin.
- `--accent-2` declared in captura + tablero, **missing** in admin.
- `--ink-2` declared in captura only.
- `--info` declared in tablero only.

### 2.2 Color values — **HIGH**

177 raw hex/rgb declarations in `styles.css` alone. After dedup, the palette in use:

**Neutrals (consistent core, some drift):**
- `#0c1a26` — `--ink` (canonical) ✓
- `#1e3a4d`, `#1a2e3d`, `#0c2440` — three "deep ink alts" (`--ink-2`, `--text`, plus a one-off)
- `#3e5566` — `--text-2` (used once)
- `#5d7282` — `--muted` (canonical) ✓
- `#8da0ad` — `--muted-2` (fails WCAG AA on `--paper`; see §5)
- `#dbe5ec`, `#d4dae6`, `#e2e7f0`, `#e6edf1`, `#c4ccdb`, `#c6d3dc` — six "line/border" shades, only `#dbe5ec` is canonical
- `#fbfdfd` — `--paper` ✓
- `#f8fafb` — `--paper-2`
- `#eaf0f3` — `--paper-3`
- `#f0f5f7` — `--bg`
- `#fff` — used once (avoid; should be `--paper`)

**Accent — drift between two palette eras:**
- `#0d9488` — current Ocean Teal accent ✓
- `#14b8a6` — `--accent-2`
- `#0a7c72` — accent press shade (used 2×)
- `#ccfbf1`, `#99f0e1` — accent-soft & accent-line
- `#1668c2`, `#3b82f6` — **legacy blue accent still alive** in `styles.css` (auth screens, info chips)
- `rgba(31,126,224, *)` — legacy blue used in **57 rgba declarations** in `styles.css` (focus rings, hover halos, button glows from the previous palette)

**Semantic:**
- Success: `#059669`, `#047857`, `#138148`, `#d1fae5`, `#a7f3d0`, `rgba(26,160,90,*)` — **two greens** competing (`#138148` from old era, `#059669` from new)
- Warning: `#ea580c`, `#c4671e`, `#ffedd5`, `#fdba74`, `rgba(224,122,43,*)` — **two oranges** competing
- Danger: `#be123c`, `#e11d48`, `#ffe4e6`, `#fda4af`, `rgba(210,59,77,*)` — three reds

**Total unique color values:** ~55 in `styles.css` + ~20 in inline blocks. **Target after consolidation: ~20.**

### 2.3 Font families — **MEDIUM**

| Stack | Declarations |
|---|---|
| `var(--mono)` (= JetBrains Mono) | 40 |
| `var(--font-mono)` (legacy alias = ui-monospace stack) | 31 |
| `inherit` | 38 |
| `var(--sans)` (= Geist) | 7 |
| `var(--font-sans)` (legacy = system-ui stack) | 7 |
| `ui-monospace, Menlo, …` (one-off) | 1 |

Two parallel font systems: `--sans`/`--mono` (newer Geist+JetBrains, declared in inline shells) vs. `--font-sans`/`--font-mono` (legacy system stack in `styles.css:19-20`). Components that use `var(--font-mono)` get **system mono**, not JetBrains. Visible drift in legacy components (admin popup, form labels, capture history sheet) where the mono font feels different from the topbar mono.

### 2.4 Font sizes — **HIGH**

**33 distinct discrete pixel values:**
9, 10, 10.5, 11, 12, 12.5, 13, 13.5, 14, 15, 16, 17, 18, 20, 22, 24, 26, 28, 30, 32, 36, 40, 44, 48, 56, 72, 96, 110, 180.

Top of distribution: 12px (71×), 13px (60×), 11px (49×), 14px (41×), 18px (23×). Plenty of one-offs (`13.5px` 3×, `10.5px` 1×, `12.5px` 2×, `9px` 2×) reveal ad-hoc choices.

**17 distinct `clamp()` formulas for big numbers / hero counters** including:
- `clamp(64px, 7vw, 104px)` — current Captura counter ✓
- `clamp(96px, 22vw, 160px)` — older Captura counter (still in mobile breakpoint)
- `clamp(72px, 12vw, 180px)`, `clamp(80px, 16vw, 200px)`, `clamp(120px, 16vw, 220px)`, `clamp(56px, 16vw, 180px)`, `clamp(40px, 7vw, 72px)` — all in `styles.css` (legacy hero/big-number rules)
- 5 different `clamp(22px, ?, ??px)` rules for "section title" type — drift

There is no enforced scale. Two type systems are live (legacy in `styles.css` + new inline tokens).

### 2.5 Font weights — **LOW**

| Weight | Count |
|---|---|
| 600 | 108 |
| 700 | 62 |
| 500 | 10 |
| 800 | 1 |
| `var(--…)` | 4 |

Concentrated on 500/600/700 with one 800 outlier. Acceptable spread, but `font-weight: var(--…)` references variables that aren't declared anywhere — they fall back silently to 400.

### 2.6 Line heights — **LOW**

`1` (33×), `1.5` (8×), `1.1` (8×), `1.45`, `1.15`, `1.55`, `1.3`, `1.2`, `0.92`. The `0.92` is a counter override; otherwise reasonable.

### 2.7 Spacing values (padding / margin / gap) — **HIGH**

Top values (raw pixel counts in declarations):
4 (54×), 6 (68×), 8 (108×), 10 (96×), 12 (105×), 14 (103×), 16 (74×), 18 (51×), 20 (31×), 22 (31×), 24 (43×), 26 (5×), 28 (17×), 30 (1×), 32 (25×), 36 (7×), 40 (14×), 48 (4×), 56 (7×), 64 (2×), 80 (2×), 86 (1×), 90 (1×), 110 (4×).

**Off-scale outliers:** 5, 7, 9, 11, 26, 30, 86, 90, 110. **Near-duplicates:** 18 vs 20, 22 vs 24, 30 vs 32. No 4-/8-multiple scale enforced.

### 2.8 Border radius — **HIGH**

17 distinct values: `0`, `2`, `3`, `4`, `6`, `8`, `10`, `11`, `12`, `14`, `16`, `18`, `20`, `22`, `32`, `50%`, `999px`.

Dominant: `999px` (49× — pills), `10px` (47× — buttons/inputs), `12px` (22×), `14px` (21× — cards), `8px` (20× — small fields). Outliers `11px`, `18px`, `22px`, `32px` are ad-hoc.

### 2.9 Shadows — **MEDIUM**

20+ unique definitions. Mix of token references (`var(--shadow-sm/md/lg/press)`) and inline rgba blobs. The token vars themselves are declared in legacy `styles.css` and don't follow the Ocean Teal hue (most are zinc-tinted). Examples of inline shadows not using tokens:

- `0 12px 28px -22px rgba(13,70,80,0.16)` (tablero card hover, inline)
- `0 6px 18px -8px rgba(13,70,80,0.28)` (captura btn-hero-primary, inline)
- `0 10px 24px -10px rgba(15,23,42,0.22)` (legacy)
- `0 2px 8px rgba(31,126,224,0.25)` (legacy blue glow)

### 2.10 Breakpoints — **HIGH**

**21 distinct breakpoints across files:**

380, 479, 480, 540, 600, 720, 759, 760, 768, 820, 880, 1023, 1023.98, 1024, 1025, 1400, 1600.

Several mean roughly the same thing (1023 / 1023.98 / 1024 / 1025 are all "the tablet/desktop boundary"). The mockup-verbatim shells use 760/880/1023; the legacy `styles.css` uses 768/1024/600/480/380. Result: zones around 768–880px have rules from both systems firing simultaneously.

### 2.11 `!important` count — **HIGH**

| File | Count |
|---|---|
| `styles.css` | 177 |
| `index.html` inline | 2 |
| `dashboard.html` inline | 2 |
| `admin.html` inline | 2 |

177 in legacy CSS is largely specificity warfare from previous redesigns. Every `!important` is a future-fix tripwire.

---

## 3. Component Drift

### 3.1 `.btn` — **CRITICAL**

Defined in **5 locations** with materially different visuals:

| Location | Padding | Radius | Min-height | Font | Notes |
|---|---|---|---|---|---|
| `styles.css:679` | (legacy) | (legacy) | — | mono | First-era button |
| `styles.css:1359` | — | — | — | — | Second-era override (hover lifts -1px) |
| `index.html:109` (captura) | `10px 16px` | `12px` | 40px | inherit | Current canonical |
| `dashboard.html:67` (tablero) | `10px 16px` | `12px` | 40px | inherit | Matches captura ✓ |
| `admin.html:68` (admin) | `10px 16px` | `10px` | 44px | inherit | Different radius + height |

Plus variants: `.btn-primary`, `.btn-ghost`, `.btn-danger`, `.btn-warn`, `.btn-small`, `.btn-hero`, `.btn-hero-primary`, `.btn-hero-ghost`, `.btn-block`, `.quickkey`, `.numkey`, `.filter-chip`, `.log-chip`, `.weekstrip-icon`, `.lang-toggle`, `.sync-status`, `.kebab-btn`, `.icon-btn`. **18 button-like classes** total.

### 3.2 Card containers — **CRITICAL**

8+ variants in use:
- `.card` (legacy + 3 inline shells)
- `.card.admin-card`
- `.card.admin-card.full`
- `.ds-tile` (tablero summary)
- `.line-card` / `.card` for line-card (tablero list)
- `.tile` / `.bento-tile` / `.bento-hero` / `.bento-chart` / `.bento-scrap` / `.bento-oee` (captura)
- `.hero.counter-card.bento-hero` (captura primary)
- `.chart-card`, `.chart-card.heatmap-card`
- `.admin-panel`
- `.popup`, `.popup-login` (modal containers)

Border-radius drifts: 14px (cards) vs 16px (chart) vs 22px (popup) vs 32px (some legacy).

### 3.3 Topbar — **MEDIUM**

Triplicated. Content is intentionally identical across captura/tablero/admin, but the **CSS is copy-pasted three times** in three inline blocks. Maintenance risk: any topbar change must be applied 3×. Already drifted on the brand-sub `max-width: 26ch` (captura+tablero) vs `22ch` (admin).

### 3.4 Inputs / fields — **MEDIUM**

- `.field input`, `.input` (admin inline)
- `.popup-input`, `.numpad-input` (legacy)
- `.weekstrip-input` (legacy)
- Raw `<input>` styled by tag selector in `styles.css`

Min-height: 44 (admin) vs 48 (popup) vs 40 (some legacy). Border-radius: 8 vs 10 vs 12.

### 3.5 Page-head — **MEDIUM**

Three inline definitions (captura/tablero/admin) plus a competing legacy rule at `styles.css:3424` (`flex-wrap: wrap`) that previously caused the vertical-stack bug — currently overpowered by inline `!important` flags. The fix was applied 3×; the legacy rule is still there.

---

## 4. Alignment & Layout Issues

### 4.1 Container width drift — **MEDIUM**

- Captura inline `.page`: `max-width: 1200px` ✓
- Tablero inline `.page`: `max-width: 1200px` ✓
- Admin inline `.page`: `max-width: 1200px` ✓
- **Legacy override** `styles.css:3258`: `body.app-shell .page { max-width: 1320px }`

Because all three shells also have `app-shell` on the body, the legacy 1320px rule fights with inline 1200px. Specificity tie → inline wins on most properties via `!important` or source order; max-width is fragile.

### 4.2 Page padding drift — **LOW**

| Shell | Padding | Reason |
|---|---|---|
| Captura | `20px 32px 40px` | — |
| Tablero | `20px 32px 40px` | — |
| Admin | `20px 32px **90px**` | Reserve for fixed save-bar |
| Legacy | `clamp(14px, 2vw, 24px) clamp(14px, 3vw, 32px) clamp(32px, 4vw, 56px)` | Override of `body.app-shell .page` |

Captura inline ≈ tablero ✓ — admin's extra bottom is legitimate (save-bar). Legacy fluid padding conflicts and is shadowed.

### 4.3 Vertical rhythm — **MEDIUM**

No consistent vertical rhythm. Section spacing varies: `margin-bottom: 16px` (tablero summary), `margin-bottom: 20px` (lines section), `margin-bottom: 12px` (some legacy). No baseline grid.

### 4.4 Topbar height — **LOW**

All three: 56px ✓. Position sticky, z-index 60 ✓.

### 4.5 Gutter drift in grids — **MEDIUM**

- Tablero summary `gap: 12px`
- Tablero line cards `gap: 14px` (`.dashboard-grid`)
- Admin `grid-2` `gap: 14px`
- Captura bento `gap: 16px`
- Legacy `.capture-grid` `gap: clamp(12px, 1.6vw, 18px)`

5 different gutter values for the same conceptual "primary grid gap."

---

## 5. Accessibility Flags

### 5.1 Color contrast — **HIGH**

WCAG AA threshold: 4.5:1 normal, 3:1 large/UI.

- `--muted` `#5d7282` on `--paper` `#fbfdfd` → **5.78:1** ✓ AA normal
- `--muted-2` `#8da0ad` on `--paper` `#fbfdfd` → **3.12:1** ✗ Fails AA for normal text (passes large/UI only). Used in `.brand-sub` placeholder fallback and a few secondary chips.
- `--success` `#059669` on `--paper` `#fbfdfd` → **4.39:1** ✗ Just below AA normal. Used on `.card-count.idle/ok`, `.ds-delta.delta-up`. Acceptable for "large text" (≥18px bold) — the dashboard counts qualify; the delta pills do not.
- `--warning` `#ea580c` on `--paper` → **3.66:1** ✗ Fails AA for normal-weight text. Used in `.delta-down` and `.ds-icon` (icons are fine; text fails).
- `--danger` `#be123c` on `--paper` → **6.71:1** ✓
- `--accent` `#0d9488` on `--paper` → **3.74:1** ✗ Fails AA normal. Used for active line-card status. Icons fine; small label text fails.
- `--ink` on `--paper` → **17.4:1** ✓

### 5.2 Focus rings — **MEDIUM**

Mockup-verbatim shells each declare a focus-visible rule with `:is(...)` covering most interactive classes. Coverage is **good but not total**:

- `.weekstrip-day` listed in captura focus rule but not in admin/tablero
- `.numkey`, `.quickkey`, `.popup-close`, `.history-close` — no focus-visible rule
- Admin `.row-action .btn` inherits parent `.btn` focus, OK
- Form selects/inputs have a focus rule via `:is(input, select, textarea):focus-visible` ✓

### 5.3 Missing aria-label on icon-only buttons — **HIGH**

| Button | File | aria-label? |
|---|---|---|
| `#sync-status` (captura) | `index.html:271` | ✗ Missing |
| `#sync-status` (tablero) | `dashboard.html:202` | ✗ Missing (only `title=""`) |
| `#sync-status` (admin) | `admin.html` | ✗ Missing |
| `#lang-toggle` (all 3) | (all) | Has `aria-label` via `bindToggle` ✓ |
| `#kebab-btn` (all 3) | (all) | ✓ Localized via `data-i18n-aria-label="menu.more"` |
| `#weekstrip-month` | `index.html:377` | ✗ Missing |
| `.popup-close` (× many) | `styles.css` | Mostly ✓ (legacy uses `aria-label`) |

### 5.4 Semantic markup — **MEDIUM**

- Nav-pills use `<a>` for cross-page links ✓ and `<button>` for view toggles ✓
- Admin tabs are `<button type="button">` with `role="tab"` but the parent `.sidenav` does **not** have `role="tablist"` and the `.admin-panel`s have `role="tabpanel"` but no `aria-labelledby`. **Incomplete ARIA tab pattern.**
- Several decorative icons missing `aria-hidden="true"` (e.g. material-symbols inside buttons that already have visible text — non-critical noise).
- `<select id="equip-status">` inside captura topbar has no `<label>` element (visually labeled by surrounding context only).

### 5.5 Alt text — **LOW**

No `<img>` tags in any of the 3 HTML files (all icons are Material Symbols or inline SVG). N/A.

### 5.6 Heading order — **LOW**

- Captura: `<h1>` "Captura del turno" — no further headings on landing view ✓
- Tablero: `<h1>` "Tablero de Producción" — `.lines-title` is a `<span>`, not `<h2>` (semantic gap, but visually a section title)
- Admin: `<h1>` per panel (4 panels) → arguably should be `<h2>` since they share the page header context. **Minor.**

---

## 6. Responsive Issues

### 6.1 Two conflicting breakpoint systems — **HIGH**

| System | Used in | Boundaries |
|---|---|---|
| New (mockup-verbatim) | inline blocks of all 3 HTMLs | 760, 880, 1023 |
| Legacy | `styles.css` | 380, 479, 480, 540, 600, 720, 768, 1023.98, 1024, 1025, 1400, 1600 |

Around 768–880px **both** systems fire. Examples:
- Inline tablero collapses summary to 2-col at `< 880px`
- Legacy `@media (max-width: 768px)` rewrites `.dashboard-summary` to a different layout

Result: between 768 and 880 the dashboard summary picks up the legacy rule, then flips again at 760.

### 6.2 Captura inline media query at `< 760px` — **MEDIUM**

Re-declares the counter at `clamp(96px, 22vw, 160px)` — the **older, larger** clamp that was supposed to be retired. At 759px the counter jumps from 104px (desktop max) to **96px floor** instead of staying tight. Off-spec.

### 6.3 Bottom tabbar — **LOW**

Defined in legacy `styles.css` and appears in all three HTMLs as `<nav class="bottom-tabbar">`. Visibility toggled by media query. Not currently visible at desktop sizes ≥ 1024 ✓. But the `hidden` toggle is duplicated across legacy + inline.

### 6.4 Mobile/tablet not in scope — **NOTE**

User instructed earlier: "We are working right now in desktop view version does not worry about tablet or mobile version." Responsive issues are still flagged here for completeness but are deprioritized.

---

## 7. Cross-file Coherence Score (subjective)

Two random pages opened side-by-side:

| Pairing | Coherence | Tells of "different hands" |
|---|---|---|
| Captura ↔ Tablero | 8/10 | Topbar identical, page-head identical, font scale consistent. Minor: ds-value 30px vs card-count 28px in same column. |
| Captura ↔ Admin | 6/10 | Admin uses sidenav vs captura uses bento; OK. But: button radius 10px (admin) vs 12px (captura), input min-height differs. |
| Tablero ↔ Admin | 6/10 | Same button radius mismatch. Card padding 16px/18px both ✓. Brand-sub max-width 26ch vs 22ch ✗. |
| Any modern shell ↔ Capture form popup | 3/10 | Modal popups use legacy `styles.css` exclusively. Different font stack (system mono vs JetBrains), different radii, different shadows, different padding. **Most visible drift in the product.** |
| Any modern shell ↔ Charts heatmap | 4/10 | Heatmap uses legacy chart-card styling. Title sizing and gutters don't match the bento grid. |

---

## 8. Severity Roll-up

| Severity | Items |
|---|---|
| **Critical** | Token sources of truth (4× `:root` + 3× inline); `.btn` defined 5 different ways; 8+ card-container variants. |
| **High** | 33 distinct font sizes + 17 clamp formulas; 21 distinct breakpoints with two competing systems; color drift (two greens, two oranges, three reds, legacy blue still alive); 177 `!important`; missing aria-label on `#sync-status` and `#weekstrip-month`; `--muted-2`/`--warning`/`--accent`/`--success` color-contrast failures for small text. |
| **Medium** | Font-family drift (Geist vs system stack); 17 border-radius values; vertical rhythm + gutter drift across grids; topbar CSS triplicated; legacy popup/modal styling unmodernized; incomplete tablist ARIA in admin; max-width fights between inline 1200px and legacy 1320px. |
| **Low** | Heading-order quirks (admin h1 per panel); decorative icons missing `aria-hidden`; bottom-tabbar duplicate definitions; off-scale spacing one-offs (5/7/9/11/26/30); font-weight 800 outlier. |

---

## 9. Recommended Phase-2 Scope (for approval)

To converge the codebase to "one prestigious brand":

1. **Collapse to one `:root`** in `styles.css` and **delete the three inline `body.shell-*` token redefinitions**. Every shell consumes the same tokens via `var(--…)`.
2. **One scale per dimension**: 8-step font-size, 6-step font-weight, 8-step spacing, 5-step radius, 4-step shadow, 4-step breakpoint.
3. **One canonical `.btn`** + variants (`.btn-primary`, `.btn-ghost`, `.btn-danger`, `.btn-icon`, `.btn-hero`). Retire `.btn-warn`, `.btn-block`, `.btn-small` (replace with size modifier or padding utility).
4. **One canonical `.card`** + modifier classes (`.card-padded`, `.card-flush`, `.card-elevated`). Retire `.ds-tile`, `.bento-tile`, `.line-card` markup classes; keep them as semantic-only modifiers that style via `.card.is-summary` / `.card.is-bento`.
5. **One topbar partial** — extract to a single source. If staying static-HTML, factor out into `topbar.html` snippet included via a tiny build step, or accept the duplication but enforce via a lint/test rule.
6. **Color contrast remediation**: bump `--muted-2`, `--warning`, `--accent`, `--success` to AA-compliant text variants (we keep the brand hues for icons/fills; introduce darker text variants like `--accent-ink`, `--warning-ink`).
7. **Strip the 57 legacy blue rgba() rules** from `styles.css` (focus rings, hover halos) — they fight Ocean Teal at runtime.
8. **Two-breakpoint system**: `--bp-md: 768px`, `--bp-lg: 1024px`. Migrate all 21 distinct breakpoints into those two.
9. **A11y patch**: add `aria-label` to `#sync-status` + `#weekstrip-month`; complete tab ARIA on admin sidenav; verify all interactive elements hit AA contrast.

**No code changes in Phase 2 either.** Phase 2 = present the token catalog + component specs and wait for approval. Phase 3 = implementation.

---

## 10. Decisions That Need Your Input

Before Phase 2 I need direction on:

1. **Primary accent**: keep Ocean Teal `#0d9488`, or shift to the brand-blue era (`#3b82f6`/`#1f7ee0`) that still lives in 57+ rgba rules? Currently teal dominates but blue is not fully scrubbed.
2. **Topbar duplication strategy**: accept 3× inline duplication (zero-build, current state), or introduce a minimal includes step (e.g. tiny static-site build / fetch-and-inject) to keep one source?
3. **Modal/popup modernization scope**: capture form popup, numpad, EOS summary, history sheet, admin breaks editor — should Phase 3 reskin them, or defer (they're functional and not the user's flagged pain)?
4. **Hero counter scale**: keep `clamp(64, 7vw, 104)` (current professional sizing) or pull tighter still (`clamp(56, 6vw, 88)`) to read more enterprise / less consumer?
5. **Density**: the user said "I don't like too wide and too large sites." Confirm target page max-width: 1200px (current), 1100px, or narrower? Affects all 3 shells.

Awaiting Phase 1 sign-off + answers to §10 before drafting Phase 2 token proposal.
