# Upgrade Plan — Agri Robot Store

**Scope:** `packages/ui` (tokens + 7 primitives) and `apps/web` (5 routes, 30 components).
Nothing in `packages/contracts`, `services/`, `robot/`, `infra/` or `.github/` is touched.
No props, exports, routes or data flow change. Visual layer only.

**Status:** diagnosis complete, awaiting approval. No files edited yet.

---

## 1. Diagnosis

### Baseline (verified, not assumed)

| Check | Result |
| --- | --- |
| `pnpm build` | passes — 8/8 static routes |
| `pnpm test` | passes |
| BEFORE screenshots | 10 captured (5 routes x 375px / 1440px) |

### Honest finding: the token layer is already at a senior bar

This is not a generic AI-generated interface, and most of the standard redesign playbook
does not apply. Verified in the source:

- `packages/ui/src/tokens.css` is a single source of truth. No component declares a raw
  colour, radius, duration or type size.
- Contrast is **measured, not judged** — `packages/ui/src/__tests__/tokens.test.ts` parses
  the CSS and computes WCAG ratios for real component pairings in both themes. It already
  caught two live bugs (the chip ink at 1.4:1, the badge at 3.46:1).
- The severity scale is separated in **lightness** (L* ~84/65/42), deuteranopia-checked,
  and always printed with its word.
- Three-state theming (light / dark / system) with a pre-paint script, done correctly in
  both directions.
- `prefers-reduced-motion` is handled twice: `motion-safe:` at each call site plus a
  global backstop in `globals.css`.
- Custom 24-grid icon family — no Lucide, no emoji. Sentence case. Tabular figures.
  Semantic landmarks and visible focus rings throughout.

**Therefore the fonts, palette, radii, shadows and motion tokens are NOT being changed.**
Changing them would be churn against a considered system, and would risk the contrast
test. The real weaknesses are at the **composition layer** — how correct primitives are
arranged on a page — plus one measured layout defect.

### What I am deliberately not doing

The loaded redesign skill prescribes marketing-site moves that would damage this product:
doubling whitespace, background photography, glassmorphism, grain overlays, asymmetric
zig-zag feature rows, "expensive" display type. This is equipment software read outdoors
in sunlight by gloved hands, on a deliberately dense 15px operational scale. Density here
is a feature. The skill itself concedes dense layouts belong in data dashboards.

Also not doing, and recommending against:

- **De-duplicating the 7 repeated "Simulated" badges** in the Dashboard sensor list.
  Visually it is noise, but that badge is a documented safety control with a type-level
  guarantee that it cannot be suppressed. Not worth trading a safety invariant for tidiness.
- **Root `DESIGN.md`** is a Claude brand analysis (cream / coral / serif) left over from a
  different skill and unrelated to this product. Out of scope; flagging only.

---

## 2. The ten weaknesses, ranked by quality gain per line changed

### Rank 1 — Crop Scout scrolls 1,423px into nothing  *(measured defect)*

`apps/web/src/components/scout/detection-log.tsx:55`

Measured at 1440x900: `document.scrollHeight` = **2687px** while `body.scrollHeight` =
**1264px**. The window really scrolls to 1787px. Over half the page is void.

Cause, isolated by bisection: the 37 `<li>` rows inside the `overflow-y-auto` list are
statically positioned, so their containing block resolves to the initial containing block
and Chromium counts the last row's bottom (2729px) toward document scroll height. The list
clips them visually but the document still grows.

- **Fix:** add `relative` to the `<ul>` className. **One word.**
- **Verified:** `position:relative` on the ul collapses the document to exactly 1264px.
  (`overflow:hidden` on the card does not fix it; `contain` also works but is heavier.)
- Gain per line: the highest in this list by a wide margin.

### Rank 2 — Store page title and a card title are the same size

`apps/web/src/app/page.tsx:25` and `apps/web/src/components/store/app-card.tsx:52`

Both render at `text-2xl` (28px). The h1 of the product and the name of one app inside it
have identical weight, so the page has no top of hierarchy.

- **Fix:** h1 to `text-3xl` (36px — token already exists, unused at page level).
- **One token.** Largest perceptual change on the landing screen.

### Rank 3 — Featured card line length is 99 characters

`apps/web/src/components/store/app-card.tsx:68`

Measured 986px wide at 1440 ≈ **99ch**. Comfortable measure is 65–75ch.

- **Fix:** add `max-w-[68ch]` to the description span.
- **One class.**

### Rank 4 — Crop Health "Plant detail" is a 428px empty rectangle

`apps/web/src/components/analytics/detection-detail.tsx`

Measured: panel 544px tall, content 116px. The unselected state is text pinned to the top
of a large void, so it reads as a rendering failure rather than a resting state.

- **Fix:** centre the empty state in the panel (`flex items-center justify-center` on the
  wrapper, reusing the existing `EmptyState` primitive).
- **2–3 classes.**

### Rank 5 — Disabled primary buttons fall below legibility

`packages/ui/src/components/button.tsx:48`

`disabled:opacity-45` on a filled primary renders "Save to robot" and "Hold to spray" as
pale green-on-green. At 45% the label is unreadable, which matters because both are
gates the operator is trying to understand ("why can't I spray?").

- **Fix:** raise to `disabled:opacity-60` and add a `--color-disabled-ink` token pairing
  so the state is measurable by the existing contrast test.
- **Centralized in the design system — one token + one class, fixes every disabled button
  in the product.**

### Rank 6 — Dashboard metric cards have uneven internal rhythm

`apps/web/src/app/apps/dashboard/page.tsx:62-111`

Battery and Signal carry sparklines; Uptime and Location do not. All four are equal-height
grid items with top-aligned content, so two cards have a dead bottom third.

- **Fix:** `justify-between` on the card class so the hint sits on a common baseline.
- **One class x4.**

### Rank 7 — Store header strands the theme toggle at 375px

`apps/web/src/app/page.tsx:24`

`flex-wrap justify-between` drops the toggle to its own line, left-aligned under the h1,
where it reads as page content rather than a control.

- **Fix:** `w-full justify-end` on the toggle at the wrapped breakpoint.
- **One class.**

### Rank 8 — Crop Health severity bar is a 1070 x 8px hairline

`apps/web/src/components/analytics/analytics-workspace.tsx`

Measured 1070px wide at 8px tall (134:1). At that aspect the three proportions stop being
readable as quantities.

- **Fix:** cap the bar at `max-w-[52rem]` and raise to `h-2.5`.
- **Two classes.**

### Rank 9 — Crop Scout camera overlay collides with its own placeholder  *(structural)*

`apps/web/src/components/scout/camera-feed.tsx`

With no video gateway running, the detection bounding box and its "Late blight 74%" label
are drawn on top of the "No video" message. Two truths overlapping into one unreadable
smear — visible in both camera panels.

- **Fix:** suppress the bbox overlay when there is no frame, keeping the detection summary
  as text below.
- **Structural — a conditional around existing JSX. Justification:** the overlay's purpose
  is to locate a detection *within a frame*; with no frame it has nothing to annotate and
  only destroys the placeholder. No props or data flow change.

### Rank 10 — Mission Planner's left column ends ~800px above its right  *(structural)*

`apps/web/src/components/mission/mission-workspace.tsx`

At 1440 the grid is 1761px tall; the left column's content ends far above that, leaving a
large void beside a very long right rail.

- **Fix:** move the "Recorded missions" history card into the left column beneath "The
  route", and set `items-start` on the grid.
- **Structural — relocating one rendered card inside the same component. Justification:**
  history is reference material, not part of the sprayer control stack; it is the only
  block that can rebalance the columns without inventing content. Same component, same
  props, same data.

---

## 3. Proposed execution order

Per your brief, committed stage by stage:

| Stage | Contents | Items |
| --- | --- | --- |
| 1. Tokens | disabled-state token pairing | 5 |
| 2. Typography | h1 scale, line measure | 2, 3 |
| 3. Layout / spacing | dead scroll, empty panel, metric rhythm, mobile header, severity bar | 1, 4, 6, 7, 8 |
| 4. Components | camera overlay, mission column rebalance | 9, 10 |
| 5. Motion | none proposed | — |

**Stage 5 is empty on purpose.** There is no GSAP or Framer Motion in the tree and motion
is CSS-only, correctly gated. You told me not to add scroll choreography unasked, and
nothing here needs it.

### Verification after every stage

`pnpm build`, `pnpm test`, `pnpm lint`, `pnpm typecheck` — all must stay green, plus a
visual check at 375px and 1440px.

### Estimated change size

Roughly **25–35 changed lines across 9 files**, no new dependencies, no deleted files, no
build-config changes. Eight of the ten items are one to three classes each.

---

## 4. Decisions I need from you

1. Approve the list, or cut any item.
2. Items **9 and 10** are the only structural ones. Approve or drop them individually.
3. Item 5 adds one token to `tokens.css`. Confirm that is acceptable.
