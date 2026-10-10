# Style guide

Part A covers code conventions. Part B covers the design system. When this
guide and the code disagree, fix one of them in the same change.

---

# Part A: Code

## A1. Python

**Tooling:** Ruff (format and lint) and pyright in `strict` mode. Config is
in `pyproject.toml`.

- Line length 100. Ruff's formatter decides layout, so there are no layout
  debates.
- Ruff rule sets: `E F W I N UP B SIM C4 RUF PT D ANN DTZ S PL TID`.
  `D` uses the Google convention. `DTZ` bans naive datetimes. `TID`'s
  banned-API rules forbid `datetime.now()`/`utcnow()` outside `core/clock.py`.
- Type hints on everything, including tests. No `Any` without a comment
  saying why. Prefer `Sequence`/`Mapping` for parameters and concrete types
  for return values.
- Google-style docstrings on every public module, class and function. Tests
  need one line saying what they verify.
- **Python 3.12 is the minimum** (the work PC). Ruff and pyright target 3.12,
  so the gate rejects newer syntax and APIs (e.g. `except A, B:`,
  `uuid.uuid7()`). Annotations are evaluated eagerly on 3.12:
  - quote a reference to the class being defined (`-> "EntityRef"`)
  - don't name methods after builtins you use in annotations (`list_live()`,
    not `list()`)
  - don't add `from __future__ import annotations`, because FastAPI and
    Pydantic would then resolve every annotation from a string at runtime
- The PEP 695 syntax (`type X = …`, `def f[T](…)`) is fine: it is 3.12.

```python
def complete(self, todo_id: str) -> Todo:
    """Marks a todo as completed.

    Args:
        todo_id: ID of an existing, non-deleted todo.

    Returns:
        The updated todo.

    Raises:
        NotFound: If no live todo has this ID.
    """
```

**Structure and naming**

| Thing | Convention |
|---|---|
| Domain rows | `@dataclass(frozen=True, slots=True)` in `models.py`: `Todo`, `TodoList` |
| API schemas | Pydantic in `schemas.py`: `TodoCreate`, `TodoPatch`, `TodoOut` |
| Repository | `TodoRepository`. Methods are verbs on rows: `get`, `list_open`, `insert`, `update`, `soft_delete`. They return dataclasses or `None`. |
| Service | `TodoService`. Methods are use cases: `create`, `complete`, `move`. They raise `core.errors` types. |
| Router | `router = APIRouter()`. Handlers are sync `def` and stay a few lines each. |
| SQL | Uppercase keywords, named parameters (`:id`), one statement per string. Never build SQL with f-strings from values. Column lists are written out (no `SELECT *`). |
| API field names | `snake_case` end to end (DB → Python → JSON → TS). No alias layer. |

**Rules**

- No SQL outside `repository.py` (and the migration runner).
- No `HTTPException` in services. Services raise domain errors and the core
  handler maps them.
- PATCH handlers use `model_fields_set` to tell "absent" from `null`.
- Time comes only from the injected `Clock`. IDs come only from
  `core.ids.new_id()` (stdlib `uuid.uuid7()`).
- Tests are named `test_<behaviour>`, use the `db`, `clock` and `client`
  fixtures, and have no sleeps or network.

## A2. TypeScript and React

**Tooling:** `tsc` (strict), ESLint (flat config: `@eslint/js`,
`typescript-eslint` strict-type-checked, `react-hooks`, `react-refresh`,
`jsdoc`) and Prettier.

- `tsconfig`: `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`,
  `noFallthroughCasesInSwitch`, `verbatimModuleSyntax`, `isolatedModules`.
- **No `any`**: `@typescript-eslint/no-explicit-any` and the `no-unsafe-*`
  family are errors. Use `unknown` and narrow it.
- **JSDoc on every exported** function, hook, component and type
  (`jsdoc/require-jsdoc` with `publicOnly`). Keep it short: what it does and
  anything non-obvious. Do not repeat the types.
- **One component per file.** Small private helper components are not
  allowed in the same file. They get their own file. The local ESLint rule
  `planbox/one-component-per-file` enforces this.
- Named exports only. The exceptions are config files that need a default
  export.
- **Generated API types are the only source of backend shapes.** Alias them
  in the module's `types.ts`. Never redeclare them.

| Thing | Convention |
|---|---|
| Component file | `TodoRow.tsx` exports `TodoRow` and `TodoRowProps` |
| Hook | `useTodos.ts` exports `useTodos` |
| Other modules | `camelCase.ts`: `quickAddParser.ts`, `selectors.ts` |
| Tests | Next to the source: `selectors.test.ts`, `TodoRow.test.tsx` |
| Query keys | Tuples from a factory per module: `todoKeys.items()`, `todoKeys.lists()` |
| Event props | `onX` for props, `handleX` for local handlers |
| Booleans | `isX`/`hasX`/`canX` |

**React**

- Function components and hooks only. No class components.
- Server state lives **only** in TanStack Query. UI state lives in component
  state. URL state (selected item, filters) lives in the router's search
  params. There is no global store library.
- Mutations follow the optimistic recipe in ARCHITECTURE §8. A component
  never calls `fetch` directly.
- Derived data comes from pure, tested selector functions.
- Components take data and callbacks. Hooks own the side effects.
- Accessibility is not optional: every interactive element is reachable by
  keyboard, has a visible focus ring and has an accessible name. Icon-only
  buttons get `aria-label` and a tooltip.

## A3. Shared conventions

- Commits are imperative and scoped: `todos: add move endpoint`,
  `core: migration runner checksums`.
- New dependencies need a one-line justification in `docs/PLAN.md` §
  Dependencies (what it does, why we don't write it ourselves, maintenance
  status) **before** they are installed. Versions are pinned exactly.
- Comments explain *why*. Code says *what*.

---

# Part B: Design system

**Character:** lean, professional, fluent. Content first, chrome second.
Generous whitespace, one accent colour, few borders, soft shadows only on
things that float.

## B1. Tokens

Tokens live in `frontend/src/styles/tokens.css` inside Tailwind v4's
`@theme` block. Tailwind's default palette, radii, shadows, type scale and
easings are reset there, so **only our tokens exist as utilities**:
`bg-surface`, `text-text-muted`, `border-border`, `rounded-md`,
`shadow-md`, `ease-out`. Colour utilities repeat the token name, so the
muted text colour is `text-text-muted`. That reads oddly, but it is explicit.
The dark theme overrides the same variables under `[data-theme="dark"]`.
Durations are not a Tailwind namespace, so use them as variables:
`duration-(--duration-fast)`.

Raw colours and arbitrary colour, spacing, radius, shadow or type values
(`bg-[#123]`, `p-[13px]`) are banned outside `tokens.css`. Arbitrary *layout*
dimensions (a panel width, `max-w-[85vw]`) are allowed when no utility
fits.

The theme is set with `data-theme="light|dark"` on `<html>`. The preference
is `system | light | dark` and is stored in `localStorage`. An inline script
in `index.html` applies it before first paint. `system` follows
`prefers-color-scheme` live.

### Colour (OKLCH)

| Token | Light | Dark | Use |
|---|---|---|---|
| `--color-bg` | `oklch(0.985 0.002 260)` | `oklch(0.165 0.005 260)` | App background, main area |
| `--color-surface` | `oklch(1 0 0)` | `oklch(0.205 0.006 260)` | Cards, detail panel, inputs |
| `--color-surface-raised` | `oklch(1 0 0)` | `oklch(0.245 0.007 260)` | Popovers, menus, dialogs, palette |
| `--color-sidebar` | `oklch(0.97 0.003 260)` | `oklch(0.185 0.006 260)` | Sidebar |
| `--color-hover` | `oklch(0.95 0.004 260)` | `oklch(0.26 0.007 260)` | Row and item hover |
| `--color-selected` | `oklch(0.94 0.025 262)` | `oklch(0.29 0.04 262)` | Selected row, active nav |
| `--color-border` | `oklch(0.92 0.004 260)` | `oklch(1 0 0 / 0.08)` | Dividers (use sparingly) |
| `--color-border-strong` | `oklch(0.85 0.006 260)` | `oklch(1 0 0 / 0.16)` | Input borders |
| `--color-text` | `oklch(0.22 0.01 260)` | `oklch(0.95 0.004 260)` | Primary text |
| `--color-text-muted` | `oklch(0.48 0.012 260)` | `oklch(0.72 0.01 260)` | Secondary text, metadata (≥ 4.5:1) |
| `--color-text-subtle` | `oklch(0.62 0.01 260)` | `oklch(0.58 0.01 260)` | Placeholders and disabled only |
| `--color-accent` | `oklch(0.52 0.19 264)` | `oklch(0.70 0.15 264)` | **The** accent: primary buttons, checkbox fill, focus ring, links, today marker |
| `--color-accent-hover` | `oklch(0.47 0.19 264)` | `oklch(0.75 0.14 264)` | |
| `--color-accent-subtle` | `oklch(0.96 0.025 264)` | `oklch(0.30 0.06 264)` | Accent backgrounds (badges, drop indicator halo) |
| `--color-on-accent` | `oklch(1 0 0)` | `oklch(0.17 0.02 264)` | Text on accent |
| `--color-danger` | `oklch(0.54 0.20 27)` | `oklch(0.70 0.17 27)` | Overdue, high priority, destructive |
| `--color-warning` | `oklch(0.62 0.14 62)` | `oklch(0.80 0.14 75)` | Medium priority (marks only, ≥ 3:1) |
| `--color-success` | `oklch(0.60 0.14 155)` | `oklch(0.72 0.14 155)` | Rare: confirmations only |
| `--color-focus` | `= accent` | `= accent` | 2 px focus ring, 2 px offset |

**One-accent rule:** only `--color-accent` is used decoratively. The
semantic colours carry *meaning* (overdue, priority, destruction) and appear
as small marks (an icon, a 3 px flag, text), never as large fills. Tags and
lists have no colours.

`src/styles/tokens.test.ts` parses `tokens.css`, converts OKLCH to sRGB
and checks WCAG contrast in both themes. Text, muted text, accent, danger
and on-accent must reach ≥ 4.5:1 on every background they are used on,
including hover and selected rows. Warning, which is only used for marks,
must reach ≥ 3:1. Changing a colour without passing this test fails the
build. The first draft's light accent, danger and warning were darkened
because of it.

### Spacing (base 4 px)

`--spacing: 0.25rem`. Allowed steps: **0, 0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 10,
12, 16** (= 0, 2, 4, 6, 8, 12, 16, 20, 24, 32, 40, 48, 64 px). Other steps
need a reason in review.

| Use | Value |
|---|---|
| Inside a control (icon to label) | 2 (8 px) |
| List row padding | 2 × 3 (8 × 12 px) |
| Between related groups | 4–6 |
| Page gutter | 6 desktop, 4 mobile |
| Between sections | 8–10 |

### Radius

| Token | Value | Use |
|---|---|---|
| `--radius-sm` | 6 px | Checkboxes, chips, kbd hints |
| `--radius-md` | 8 px | Buttons, inputs, list rows (hover/selected background) |
| `--radius-lg` | 12 px | Popovers, menus, cards, toasts |
| `--radius-xl` | 16 px | Dialogs, command palette, mobile sheets |
| `--radius-full` | 9999 px | Avatars, pills, toggle |

Nested radius = outer radius − padding (e.g. a menu item in a 12 px menu
with 4 px padding is 8 px).

### Typography

Font stack: `"Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system,
"Roboto", sans-serif`. Mono: `"Cascadia Code", ui-monospace, Consolas,
monospace`. Weights are 400, 500 and 600 only. Use
`font-variant-numeric: tabular-nums` for dates, counts and times.

| Token | Size / line height | Use |
|---|---|---|
| `--text-xs` | 12 / 16 px | kbd hints, badges |
| `--text-sm` | 13 / 20 px | Metadata, sidebar, secondary |
| `--text-base` | 14 / 22 px | Body, list rows, inputs (desktop) |
| `--text-lg` | 16 / 24 px | Detail panel title, dialog title |
| `--text-xl` | 20 / 28 px | View titles ("Today") |
| `--text-2xl` | 24 / 32 px | Rare: empty-state headline |

On coarse pointers, inputs use 16 px so mobile browsers do not zoom.

### Elevation

Use elevation only for things that float above the page. Static surfaces are
flat and separated by background tone, not lines.

| Token | Light | Use |
|---|---|---|
| `--shadow-sm` | `0 1px 2px oklch(0 0 0 / 0.06)` | Dragged row, raised button |
| `--shadow-md` | `0 4px 12px -2px oklch(0 0 0 / 0.10), 0 2px 4px -2px oklch(0 0 0 / 0.06)` | Popover, menu, tooltip, toast |
| `--shadow-lg` | `0 16px 40px -8px oklch(0 0 0 / 0.20), 0 4px 8px -4px oklch(0 0 0 / 0.08)` | Dialog, command palette, sheets |

Dark theme: the same shadows at about 1.6× alpha, plus a 1 px
`oklch(1 0 0 / 0.06)` inner border on raised surfaces, because shadows hardly
show on dark backgrounds.

### Motion

| Token | Value | Use |
|---|---|---|
| `--duration-fast` | 150 ms | Colour/opacity on hover and press, tooltips, checkbox tick |
| `--duration-base` | 200 ms | Popovers, menus, toasts, row enter |
| `--duration-slow` | 250 ms | Dialogs, palette, sidebar collapse, detail panel |
| `--ease-out` | `cubic-bezier(0.22, 1, 0.36, 1)` | **Entering** elements |
| `--ease-in` | `cubic-bezier(0.55, 0, 1, 0.45)` | Leaving elements (exit ≈ 0.75 × enter duration) |
| `--ease-in-out` | `cubic-bezier(0.65, 0, 0.35, 1)` | On-screen movement without physics (sidebar width) |
| Spring `layout` | `{ type: "spring", visualDuration: 0.22, bounce: 0.1 }` | Reordering, completing a todo, items making room |
| Spring `snappy` | `{ type: "spring", visualDuration: 0.18, bounce: 0 }` | Drag drop settle, panel open |

The spring presets live in `src/ui/motion.ts`. CSS durations and easings
live in `tokens.css`. Do not inline magic numbers.

**Motion rules**

1. **Never delay an action.** State changes immediately. Animation plays on
   top. Focus moves at once, even while an exit animation runs.
2. Enter: fade plus a 4–8 px translate or a 0.97 → 1 scale, `ease-out`.
   Exit: faster, `ease-in`, opacity mostly.
3. Layout changes (reorder, complete, insert, remove) use Motion's `layout`
   with the `layout` spring, and `AnimatePresence` for removals.
4. Completing a todo: the checkbox ticks (fast), the title strikes through,
   and the row stays visible in place. In list views it leaves after a short
   hold of 600 ms, which is cancelled by undo or by completing several in a
   row. Today keeps it, struck through, until the next day.
5. No decorative motion: nothing loops or bounces for attention, and there is
   no page-load choreography. Staggering, if used, is ≤ 20 ms per item and
   capped at 6 items.
6. **Reduced motion:** `<MotionConfig reducedMotion="user">` at the root.
   CSS uses `@media (prefers-reduced-motion: reduce)` to set the duration
   tokens to `0.01ms` except opacity fades (≤ 100 ms). Movement is replaced
   by a cross-fade or nothing.

## B2. Components

- **Primitives:** Base UI (`@base-ui/react`) for Dialog, Popover, Menu,
  Tooltip, Select, Combobox, Checkbox, Switch, Toast and Context Menu. Each
  is wrapped once in `src/ui/` (e.g. `ui/Dialog.tsx`) with our tokens and
  motion. Modules use the `ui/` wrappers and never Base UI directly. ESLint
  enforces this through the local `planbox/boundaries` rule.
- **Shared composites** that more than one module needs (`NameDialog`,
  `PageHeader`, `ViewLayout`, `InlineTitle`, `AutosaveTextArea`) also live
  in `ui/`. A component moves there when a second module needs it, not
  before.
- **Popup transitions** use CSS through Base UI's `data-[starting-style]` /
  `data-[ending-style]` attributes and the duration/easing tokens. Motion
  (the library) is for layout springs and panel width only.
- **Variants** are plain typed maps (`const buttonVariants = { primary: "…",
  ghost: "…" } satisfies Record<ButtonVariant, string>`) joined with a tiny
  `cx()` helper. There is no `cva`/`tailwind-merge`. `className` on `ui/`
  components is for **layout only** (margin, width, grid placement).
- **Buttons:** `primary` (accent fill, at most one per view), `secondary`
  (surface + border-strong), `ghost` (transparent, hover tone; the default
  for toolbars) and `danger` (used in confirmations only).
- **Rows** (todo, later notes, …) have no borders between them. Hover shows
  `--color-hover` with `radius-md`. Selected shows `--color-selected`.
  Metadata is `text-sm text-muted` on the same line on desktop and wraps to a
  second line on narrow screens.
- **Empty states:** one short sentence, plus a primary action with its
  shortcut hint. No illustrations.
- **Icons:** Lucide at 16 px (inline) and 18 px (toolbar), stroke width 1.75,
  `currentColor`.

## B3. Interaction, input and responsiveness

- **Keyboard layouts.** Symbol shortcuts (`?`, `[`, `]`) work with Shift
  and AltGr, as on German keyboards where `[` is AltGr+8. Letter shortcuts
  respect Shift exactly.
- **Keyboard first.** Every action has a palette command. Common actions
  have a single-key shortcut that fires only when focus is not in a text
  field. Shortcuts are shown in tooltips, menus and the `?` overlay.
  Modifier shortcuts use Ctrl (Windows). The registry shows "⌘" on macOS
  later.
- **Never hover-only.** Anything revealed on hover is also revealed on
  `:focus-within` and is always visible on `(pointer: coarse)`. Every row
  action is also in the row's context menu (right-click, long-press, or the
  `⋯` button / `.` key).
- **Touch targets:** at least 44 × 44 px on coarse pointers. On fine pointers,
  icon buttons are at least 28 × 28 px visually with a 32 px hit area.
- **Breakpoints (Tailwind defaults):** `md` 768, `lg` 1024, `xl` 1280. The
  layout must work at 360 px wide.
- **Focus:** always visible (`:focus-visible`, 2 px accent ring, 2 px
  offset). Dialogs trap focus and return it on close (Base UI does this).
- **Feedback:** no spinners for local operations. Errors appear as a toast
  with the server's message and, where possible, "Retry". Destructive
  actions are undoable rather than confirmed. Confirmation is reserved for
  irreversible bulk actions.
