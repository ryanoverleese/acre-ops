# Grower design system research

Research for the Acre Insights grower surface (`/grower`). Checked against Acre Ops tokens in `app/globals.css`, the installer shell (`.af-app`), grower UI on the field-map branch, and public ag / design-system sources. This is guidance for how the grower UI should look and behave — not a new component library build.

## Verdict

Treat grower as a **third product surface** on the same site: office (dense tables), installer (field PWA), grower (calm phone-first read-only).

Do **not** invent a second design system. Reuse Acre brand tokens already shipped for the installer app (`field-green`, `bone`, Barlow), thin grower-only CSS recipes, and keep the **field map as the main visual**. One job per screen. Large type and touch targets for outdoor phone use.

Locked product tone from the plan still stands: plain labels, no decoration, read-only.

---

## What Acre already has

### Office (default `:root`)

| Role | Value |
| --- | --- |
| Page bg | `#f6f5f4` |
| Accent | sage `#4a7a5b` |
| Type | General Sans (display), Source Sans 3 (body) |
| Layout | Dense tables, sidebar, many themes (`river`, `clay`, `harvest`, …) |

Built for staff who live in lists and filters. Wrong density for a grower checking one field between tasks.

### Installer (`.af-app`)

| Role | Token | Value |
| --- | --- | --- |
| Brand green | `--field-green` | `#1F402A` |
| Ink green | `--field-green-ink` | `#163126` |
| Page | `--bone` | `#F6F2EA` |
| Card | `--bone-raised` | `#FFFFFF` |
| Moisture / dry / stress | `--moist` / `--dry` / `--stressed` | blue / amber / red |
| Display | `--font-display` | Barlow Condensed |
| Body | `--font-body` | Barlow |
| Safe area | top bar padding | `env(safe-area-inset-top)` |

Already tuned for phone, sunlight, gloves, and field context. Same company brand growers already see on Acre Insights materials.

### Grower today (field-map branch)

Thin classes: `.grower-shell`, `.grower-top`, field list rows, map wrap, probe facts. Brand is present as a small “Acre Insights” kicker, but the shell does **not** yet adopt `.af-app` tokens. Login and list still sit closer to generic office styling than to the installer field language.

**Gap:** a named grower surface contract (tokens + recipes + screen jobs), not more one-off CSS.

---

## How design systems are structured (industry)

Sources: Brad Frost three-tier tokens; Material 3 token layers; Regrow Leaf; Australian Government Agriculture Design System.

### Layers (keep lean)

1. **Primitives** — raw values (`#1F402A`, `8px`, Barlow).
2. **Semantic** — roles (`--color-bg`, `--color-action`, `--font-heading`).
3. **Component / recipe** — only when a pattern repeats (`--grower-row-pad`). Skip Tier 3 until something is reused three times.

Frost’s guidance: three tiers unlock multi-brand theming; for a small product, start with primitives + a short semantic set, then add component tokens later. Do not tokenize every button variant.

### Product principles that fit Acre grower

| Source | Principles to keep |
| --- | --- |
| **Regrow Leaf** | Simple, Consistent, Modular, Accessible, Usable, Always evolving. Shared base so teams stop forking buttons. |
| **Ag Design System (AU gov)** | Function over fashion; consistent not uniform; cut decorative load. |
| **GSMA AgriTech UX Guidebook** | Less is more; limit choice; clear hierarchy; keep cues consistent (green = good, red = problem); design for where/when the user is using the phone. |
| **Acre plan** | Plain type, plain labels, no decoration; one farm session; map = boundary + elevation + probe pin. |

### What “good” looks like in ag apps

- **Field as the core object** — FarmAct-style mobile apps put the field first; growers navigate by field name, not by internal IDs.
- **Separate office vs grower density** — ag SaaS that ships one dense dashboard for both audiences tends to overwhelm growers (Regrow / industry write-ups on grower time pressure).
- **Outdoor phone** — high contrast, large tap targets (≥44px), avoid hairline text, respect safe areas (installer already does this).
- **One next step** — GSMA: fewer actionable elements per screen; forward/back or detail/overview only.

---

## Recommendation for Acre grower

### Surface model

```
Shared primitives (space, radius, status colors)
        │
   ┌────┴────┬──────────────┐
Office     Installer      Grower
:root      .af-app        .grower-app  (new wrapper)
sage UI    field-green    same field-green + bone
tables     PWA chrome     calm list + map hero
```

Grower should **opt into installer brand tokens**, not office sage tables and not a third unrelated palette.

### Adopt these tokens on `.grower-app`

Copy meaning from `.af-app` (do not duplicate hex in random classes):

- Background: `--bone`
- Surfaces: `--bone-raised`
- Brand / primary action: `--field-green`
- Text: `--ink` / stone scale for secondary
- Status only when needed: `--moist`, `--dry`, `--stressed` (water / probe language later)
- Type: Barlow body; Barlow Condensed for farm name / field name only
- Spacing: existing `--space-*` scale (4px grid)
- Radius: `--r-md` / `--r-lg` from installer, or shared `--radius-sm`

Office theme switcher (`data-theme`) must **not** recolor grower pages. Scope tokens under `.grower-app` the same way installer scopes under `.af-app`.

### Typography

| Use | Font | Notes |
| --- | --- | --- |
| Farm name, field name | Barlow Condensed | Brand-forward; one hero string per screen |
| Body, labels, rec text | Barlow | Plain, high legibility |
| Numbers (acres, elev, seasons) | Barlow tabular if available | Same family; avoid JetBrains Mono in grower |

Do not use Inter / system-only stacks. Do not put General Sans on grower (office display); growers should feel the same Acre field brand as installers.

### Screen jobs (v1)

| Screen | One job | Hero |
| --- | --- | --- |
| Login | Sign in as this farm | Acre Insights + farm name + PIN |
| Field list | Pick a field | Farm name; list is the interaction |
| Field detail | Understand this field | **Map** (boundary + elevation + probe pins) full-bleed in the content column |
| Probe / recs block | Read facts + this year’s water notes | Plain definition list + dated recs — not cards-as-decoration |

No stats strips, no promo chips on the map, no secondary marketing blocks in the first viewport.

### Components — recipes, not a library

Ship CSS recipes only:

1. **Shell** — safe-area top bar, farm title, sign out
2. **Field row** — full-width tap target, name + acres
3. **Map stage** — edge-to-edge within shell; map is the visual anchor
4. **Fact list** — `dt`/`dd` for serial, age, elevation, soil
5. **Rec row** — date + type + text
6. **Error banner** — already started as `.grower-banner-error`

No Material UI / Leaf fork. No new button variants beyond primary (sign in) and text (sign out / back).

### Interaction & accessibility

- Touch targets ≥ 44×44px; field rows at least 48px tall
- Contrast: field-green on bone, ink on bone (WCAG AA for body)
- Focus rings visible (reuse installer focus treatment)
- Offline later (phase 2); v1 still assumes patchy rural bandwidth — keep JS light, images few
- Language: “seasons”, “Not recorded”, water day — no office jargon (`field_season_id`, report_type codes)

### Motion

Two or three intentional motions max:

1. Soft fade/slide when opening a field (optional)
2. Map pin appear once tiles settle
3. Button press opacity — no decorative loops

### Anti-patterns (explicit)

- Purple / indigo SaaS gradients
- Floating badges on the map
- Card grids in the hero
- Dense office data tables for growers
- Reusing installer job chrome (route lists, repair queues) on grower pages
- Dark mode by default
- Emoji decoration

---

## Mapping research → Acre decisions

| Research finding | Acre decision |
| --- | --- |
| Three-tier tokens; don’t over-token | Primitives already exist; add `.grower-app` semantic aliases only |
| Multi-product theming (Frost) | Three surfaces, one repo, shared CSS file |
| Leaf: Simple / Consistent | One field-row pattern, one fact-list pattern |
| GSMA: less noise, limit choice | Login → fields → one field; no side nav |
| GSMA: design for context | Phone, daylight, short session between irrigation decisions |
| Ag DS: function over fashion | Plan’s “plain labels, no decoration” |
| Field-first mobile ag UX | Field list + map hero, not dashboard home |
| Separate grower vs office density | Grower never inherits office table chrome |

---

## Implementation checklist (when styling is next)

1. Wrap `/grower` layouts in `.grower-app` and set the installer brand CSS variables on that wrapper.
2. Restyle login, list, and field detail to bone / field-green / Barlow.
3. Make the field map the dominant visual on field detail (already structural; tighten chrome).
4. Bump tap targets and type sizes; verify outdoors contrast.
5. Document the six recipes above in this file as they land (link class names).
6. Do **not** add a Storybook / token JSON pipeline until a second grower product needs it.

---

## Sources

- Acre Ops: `app/globals.css` (`:root`, themes, `.af-app` installer brand block), grower classes on `cursor/grower-field-map-cffe`
- Plan: `docs/grower-app-plan.md`
- Brad Frost — three-tier design tokens / themeable systems ([bradfrost.com](https://bradfrost.com/blog/post/the-many-faces-of-themeable-design-systems/))
- Regrow — Leaf design system principles ([regrow.ag](https://www.regrow.ag/post/rewriting-regrows-mrv-platform-for-performance-and-scalability))
- GSMA — AgriTech UX Design Guidebook ([gsma.com](https://www.gsma.com/solutions-and-impact/connectivity-for-good/mobile-for-development/gsma_resources/agritech-ux-design-guidebook/))
- Agriculture Design System (AU) — design principles ([design-system.agriculture.gov.au](https://design-system.agriculture.gov.au/foundations/design-principles))

## Out of scope here

Applying the CSS, changing live grower pages, migrations, Netlify, or PIN ops. Those stay on the grower implementation PRs.
