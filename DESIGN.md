# Design System: Producción · Manufacturing Floor PWA

## 1. Visual Theme & Atmosphere

A daily-app-balanced control surface (density 4–5) for shop-floor operators
glancing between captures and shift KPIs. Confident asymmetric bento on Captura;
flat, tightly-aligned card grids on Tablero and Admin. Spring-physics motion at
medium intensity (6/10) — present but never theatrical. Atmosphere is clinical,
slate-cool, with a single committed teal accent that carries pace state. Width
restrained to 1200px so tiles and charts never stretch on wide monitors.

Scene: a tablet mounted at line side, operator captures hourly counts in 5
seconds, supervisor checks the Tablero from a desk monitor two rooms away.
Light theme — physical environment is always bright and a dark UI would clash.

Dials: **Variance 5 · Motion 6 · Density 5**.

## 2. Color Palette & Roles

- **Canvas Slate** (`#f0f5f7`) — Page background, cool slate tinted by teal
- **Paper** (`#fbfdfd`) — Cards, tiles, brandbar fill
- **Paper Quiet** (`#f8fafb`) — Input fields, nested surfaces
- **Paper Recessed** (`#eaf0f3`) — Hover states, recessed dividers, kicker pill bg when not accent
- **Line** (`#dbe5ec`) — 1px structural borders, dividers
- **Line Strong** (`#c6d3dc`) — Outline buttons, secondary borders
- **Ink** (`#0c1a26`) — Primary text (never `#000`), nav-pill active fill
- **Muted Steel** (`#5d7282`) — Secondary text, mono labels, descriptions
- **Accent Teal** (`#0d9488`) — Single accent: pace good, primary CTA, focus ring, donut arc
- **Accent Teal Bright** (`#14b8a6`) — Hero gradient companion only
- **Accent Soft** (`#ccfbf1`) — Kicker pill, sn-link active bg
- **Success** (`#059669`) — Pace ahead, delta-up
- **Warning** (`#ea580c`) — Pace warn, scrap moderate
- **Danger** (`#be123c`) — Scrap pill, pace behind, delta-down

Max 1 accent (teal). Saturation under 80%. No purple. No neon glow. Status
semantics (success/warn/danger) coexist with accent — they are data, not brand.

## 3. Typography Rules

Font stack: **Geist** (sans) + **JetBrains Mono** (mono). Both via Google Fonts.

Type scale — single source of truth across all screens:

| Token | Size | Weight | Tracking | Use |
|---|---|---|---|---|
| `--type-hero` | 88px (clamp 88–140 / 11vw) | 700 | -0.05em | Counter on Captura hero |
| `--type-display` | 28px | 700 | -0.025em | Page titles (h1) |
| `--type-tile-big` | 36px | 700 | -0.03em | OEE tile, Scrap tile, KPI values |
| `--type-card-big` | 30px | 700 | -0.02em | Line-card count, summary ds-value |
| `--type-clock` | 22px | 600 | -0.03em | Time display |
| `--type-name` | 15px | 700 | -0.01em | Card name (line, brand-name) |
| `--type-body` | 14px | 400 | normal | Default body |
| `--type-label` | 12px mono | 600 | 0 | Section labels, card titles, tile labels |
| `--type-meta` | 11px mono | 500 | 0 | Operator id, timestamps, sub-labels |
| `--type-delta` | 11px mono | 700 | 0 | Pace pills, delta pills |

Sentence case everywhere. No `text-transform: uppercase`. Mono only for labels +
metadata + numbers. Body and headlines always sans. Tabular-nums on every digit.

Banned: Inter, Times New Roman, Georgia, generic serifs. No gradient text.

## 4. Component Stylings

- **Topbar**: 56px tall, identical structure on every page. Brand (mark + name +
  optional sub) + nav-pills (Captura · Gráficas · Tablero · Admin) + right
  cluster (shift-pill + sync btn + lang btn). No back-btn. No status-select.
  Sticky top, z-index 60, 1px bottom border, paper background.
- **Nav pill**: 8px·14px, radius 999, mono-style not used here (sans weight 600,
  13px). Active = ink fill + paper text.
- **Brandbar shift-pill**: paper-2 fill, 1px line border, radius 999, live-dot +
  mono 12px. Plain text, no nested status-pill wrapper.
- **Buttons**:
  - `.btn` (default action): 10px·16px, radius 12, min-height 40, sans 13/600,
    1px line border, paper bg. `:active` translateY 1px.
  - `.btn-primary`: accent fill, paper text.
  - `.btn-hero` (counter CTA only): 18px·48px, radius 16, 16px/700, accent fill,
    teal-tinted shadow.
- **Cards**: paper fill, 1px line border, radius 14, padding 18px·20px. No drop
  shadow at rest. 240ms transform hover lift (-1px) with teal-tinted shadow.
  Hero (Captura counter-card) uses radius 22 + 1px line shadow + radial accent
  gloss; only place that exceeds standard radius.
- **Inputs**: paper-2 bg, 1px line, radius 8, 12px·14px, min-height 44. Focus =
  accent border + 3px accent-soft halo, no outline ring.
- **Sparkline (line-card)**: inline SVG 100×32, stroke 2px, fill 15% opacity of
  stroke. Colors map to pace class.
- **Pills**: 11px mono 700, padding 3px·9px, radius 999. Tinted bg matching
  status (success 14% / accent 12% / warning 14% / danger 14% / muted paper-3).

## 5. Layout Principles

- **Max-width**: 1200px on every page. Centered with margin auto. No 1280/1400
  variants. Prevents stretch on wide monitors.
- **Page padding**: 28px top, 40px sides, 56px bottom. Identical across pages.
- **Page-head**: flex row, title-block left + actions/clock right, 24px gap,
  24px bottom margin.
- **Bento (Captura)**: 7fr / 5fr grid, 16px gap (was 20). Hero spans 3 rows.
- **Summary (Tablero) + KPIs (Gráficas)**: 4-col grid, 14px gap.
- **Line-card grid (Tablero)**: auto-fit minmax(280px, 1fr), 14px gap. Max 4
  cards per row at 1200px.
- **Charts grid (Gráficas)**: 2×2, 16px gap.
- **Admin layout**: 240px sidenav + 1fr content. Content max 920px so cards
  don't stretch. Sticky save-bar pinned bottom.
- **Section spacing**: 20px between major sections; never more, never less.
- **No overlap**. No absolute-positioned stacked content. No flex calc() hacks.

## 6. Motion & Interaction

- **Spring physics**: `cubic-bezier(0.16, 1, 0.3, 1)` (ease-out-quart) on all
  transforms. 240ms for hover, 360ms for reveals.
- **Live-dot pulse**: 2.2s infinite scale + opacity loop.
- **Counter flash**: 360ms scale 1 → 1.04 → 1 on capture.
- **Stagger reveal**: bento children 40–220ms, KPIs 30–180ms, summary 30–180ms,
  line-card grid 40–340ms, admin panel cards 40–240ms.
- **Tactile feedback**: `:active` translateY 1px on every button/pill.
- **Hover lift**: 240ms `transform: translateY(-1px)` + teal-tinted soft shadow.
  Only on cards/tiles/KPIs. No glow.
- **Reduced-motion**: every keyframe + transition guarded by media query.

Performance: animate only `transform` and `opacity`. No width/height/top/left.

## 7. Anti-Patterns (Banned)

- ✗ Emojis in markup
- ✗ Inter font
- ✗ Serif fonts in dashboards
- ✗ Pure `#000000` or `#ffffff`
- ✗ Purple / blue neon accent
- ✗ Drop-shadow glows
- ✗ Gradient text on display sizes
- ✗ Custom mouse cursors
- ✗ Centered hero text (variance 5+)
- ✗ Three equal cards in a row as feature grid
- ✗ AI filler ("Elevate", "Seamless", "Unleash", "Next-Gen")
- ✗ "John Doe", "Acme", "Nexus" placeholder names
- ✗ Round fake numbers (99.99%, 50%)
- ✗ Unsplash hot-links
- ✗ Overlapping text and images
- ✗ Stretching cards/charts on wide viewports (cap 1200px)
- ✗ Topbar shape differing across pages
- ✗ Multiple competing accent colors

## 8. Cross-Page Consistency Contract

Identical across `index.html`, `dashboard.html`, `admin.html`:
1. Topbar height (56px), padding (0 32px), structure, colors
2. Brand mark + name styling
3. Nav-pill list (4 pills: Captura · Gráficas · Tablero · Admin) — only `.active`
   target differs
4. Right cluster (shift-pill + sync + lang) — same controls, same order
5. Page max-width (1200px)
6. Page-head row layout (title block + right slot)
7. Type tokens from §3
8. Card radius, border, padding, hover behavior
9. Section spacing (20px between sections)
