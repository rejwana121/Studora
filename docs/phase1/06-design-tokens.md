# 6. UI DESIGN TOKENS AND COLOUR SYSTEM (FINAL, AMENDED)

> **Amendment note**: this replaces the palette-system-only draft from the original Phase 1 submission with the exact final visual system requested before implementation. See amendment record in the Phase 1 report. Nothing in this file is installed or coded yet — Phase 2 implements it as `mobile/src/design-system/tokens.ts`.

Contrast ratios below are computed using the standard WCAG 2.1 relative-luminance formula (sRGB → linear, `L = 0.2126R + 0.7152G + 0.0722B`, `contrast = (L_light + 0.05) / (L_dark + 0.05)`), not estimated. AA targets: **≥4.5:1** for normal text, **≥3:1** for large text (≥18pt/24px or bold ≥14pt) and for meaningful icons/UI components. All pairings below meet or exceed the applicable threshold; each ratio is stated so Phase 2 can re-verify with an automated contrast-checker as a safety net (recommended CI/lint step, not a re-litigation of the values).

## 6.1 Exact colour tokens

| Token | Hex | Role |
| --- | --- | --- |
| `color.primary.violet` | **#5D3FD3** | Primary deep violet |
| `color.primary.violetStrong` | **#4A2FB0** | Pressed/hover state, gradient stop |
| `color.secondary.teal` | **#14B8A6** | Secondary teal (accents, chips w/ dark text) |
| `color.secondary.tealStrong` | **#0C7A77** | Teal for filled buttons/white text |
| `color.accent.coral` | **#FF6B57** | Coral accent (chips/badges w/ dark text) |
| `color.accent.coralStrong` | **#C23A28** | Coral for filled buttons/alerts w/ white text |
| `color.accent.warmYellow` | **#FFC94D** | Warm yellow highlight surface (w/ dark text) |
| `color.accent.warmYellowText` | **#96650F** | Warm-yellow-family text/icon on light surfaces |
| `color.accent.lavender` | **#EDE7FB** | Lavender surface |
| `color.accent.mint` | **#DFF5EC** | Mint surface |
| `color.background.main` | **#F7F4FC** | Main app background |
| `color.background.card` | **#FFFFFF** | Card background |
| `color.text.primary` | **#1B1730** | Primary text |
| `color.text.secondary` | **#5B5770** | Secondary text |
| `color.text.onFill` | **#FFFFFF** | Text on any saturated filled surface |
| `color.border.divider` | **#E2DEEE** | Border / divider |
| `color.success.strong` | **#157A52** | Success text/icon |
| `color.warning.strong` | **#96650F** | Warning text/icon (= `warmYellowText`) |
| `color.risk.low.bg` / `.text` | **#DFF5EC** / **#157A52** | Low workload-risk state |
| `color.risk.moderate.bg` / `.text` | **#FFF3D6** / **#96650F** | Moderate workload-risk state |
| `color.risk.high.bg` / `.text` | **#FFE4DF** / **#A82F1F** | High workload-risk state |
| `color.risk.critical.bg` / `.text` | **#9A1F1F** (solid) / **#FFFFFF** | Critical workload-risk state |

## 6.2 Verified contrast ratios (WCAG 2.1, computed)
| Pairing | Ratio | Result |
| --- | --- | --- |
| `text.primary` on `background.main` | 15.93:1 | AAA |
| `text.primary` on `background.card` | 17.33:1 | AAA |
| `text.secondary` on `background.main` | 6.35:1 | AA (normal text) |
| `text.secondary` on `background.card` | 6.91:1 | AA (normal text) |
| White text on `primary.violet` (buttons) | 6.74:1 | AA |
| White text on `secondary.tealStrong` (buttons) | 5.17:1 | AA |
| `text.primary` on `secondary.teal` (chips) | 6.96:1 | AA |
| White text on `accent.coralStrong` (destructive/alert buttons) | 5.34:1 | AA |
| `text.primary` on `accent.coral` (chips) | 6.18:1 | AA |
| `text.primary` on `accent.warmYellow` | 11.32:1 | AAA |
| `warning.strong` (#96650F) on white | 5.04:1 | AA |
| `text.primary` on `accent.lavender` | 14.38:1 | AAA |
| `text.primary` on `accent.mint` | 15.19:1 | AAA |
| `success.strong` on white | 5.33:1 | AA |
| Risk **Low**: `#157A52` on `#DFF5EC` | 4.68:1 | AA |
| Risk **Moderate**: `#96650F` on `#FFF3D6` | 4.57:1 | AA |
| Risk **High**: `#A82F1F` on `#FFE4DF` | 5.63:1 | AA |
| Risk **Critical**: white on `#9A1F1F` | 8.11:1 | AAA |
| Info banner: `#0C7A77` on `#DFF7F5` | 4.61:1 | AA |

**Never-pair list** (fails contrast, intentionally excluded): white text on `accent.warmYellow` or `accent.coral` (base, non-strong); `text.secondary` on any risk/alert fill; light yellow text on `background.card`.

## 6.3 Colour usage map
| Surface/element | Token(s) used |
| --- | --- |
| **Buttons — primary** | Fill `primary.violet`, text `onFill`. One per screen (PRD §12 "one dominant action"). |
| **Buttons — secondary** | Outline (1.5px `primary.violet` or `text.primary` border), transparent/`background.card` fill, `primary.violet` text. |
| **Buttons — destructive/alert** | Fill `accent.coralStrong`, text `onFill`. |
| **Buttons — tertiary/text-only** | No fill, `primary.violet` or `secondary.tealStrong` text. |
| **Navigation (bottom tabs)** | Bar: `background.card` + top `border.divider` hairline. Active: `primary.violet` icon+label **and** filled icon variant. Inactive: `text.secondary` icon+label, outline icon variant (icon-style change is a second, non-colour cue). |
| **Cards (default content)** | `background.card` on `background.main`, `radius.card`, `elevation.card`. Optional left/top accent stripe using the relevant subject/type colour — cards themselves stay neutral so large colour fills are reserved for Plan cards and the Critical banner, keeping the UI "not excessively" saturated everywhere. |
| **Gradients** | See §6.4 — used only for hero/onboarding moments and the Premium plan card, never on ordinary content cards. |
| **Task types** (9 enum values) | Assignment→`primary.violet`; Quiz→`secondary.teal`; Project→`accent.coral`; Presentation→`accent.warmYellow`; Lab→`accent.mint` (deep variant `success.strong` for icon); Midterm→`accent.lavender` (deep variant `primary.violetStrong` for icon); Final Exam→`accent.coralStrong`; Study Session→`secondary.tealStrong`; Other→`text.secondary` neutral chip. Each chip shows the type name as text, never colour alone. |
| **Priority levels** | Low→`accent.mint` dot; Medium→`accent.warmYellow` dot; High→`accent.coral` dot — **always** rendered with the text label "Low/Medium/High" next to the dot, never the dot alone. |
| **Workload-risk levels** | §6.1/§6.2 `risk.*` tokens — chip = background tint + text/icon colour + word label + icon (Low: check-circle outline; Moderate: alert-triangle outline; High: alert-triangle filled; Critical: alert-octagon filled, solid dark-red chip). Visual weight escalates with severity; written copy stays non-diagnostic at every level regardless of visual weight (Master Prompt safety boundary). |
| **Charts** | Categorical/multi-series: the six brand hues in fixed order — `primary.violet`, `secondary.teal`, `accent.coral`, `accent.warmYellow`, `success.strong` (mint family), `primary.violetStrong` (lavender family) — so a given series keeps the same colour across chart types. Single-series/sequential (e.g. study-minutes trend): a 5-step teal ramp from `#CFEFEA` (lightest) to `secondary.tealStrong` (darkest). |
| **Alerts/system banners** | Error: bg `risk.high.bg` / text `risk.high.text`. Success: bg `risk.low.bg` / text `success.strong`. Warning: bg `risk.moderate.bg` / text `warning.strong`. Info: bg `#DFF7F5` / text `secondary.tealStrong` (4.61:1). Each banner carries an icon + short label, never colour alone. |
| **Free plan card** | `accent.mint` surface, `secondary.teal` accent border/icon — calm, entry-level tone. |
| **Pro plan card** | `accent.lavender` surface, `primary.violet` accent border/icon — mid-tier. |
| **Premium plan card** | `gradient.premium` fill (see §6.4), `onFill` white text — the one place a strong gradient fill is used on a "product" card, making it deliberately the most visually distinctive plan. |

## 6.4 Gradient combinations
| Token | Stops | Usage |
| --- | --- | --- |
| `gradient.hero` | `primary.violet` (#5D3FD3) → `secondary.teal` (#14B8A6), 135° | Onboarding/welcome header, first-open distinctiveness |
| `gradient.premium` | `primary.violetStrong` (#4A2FB0) → `accent.coralStrong` (#C23A28), 135° | Premium plan card only |

Both gradients are built only from hues already in the mandated six-colour system (deep violet, teal, coral) — no new hues introduced. Gradients are deliberately restricted to two placements so they read as premium accents, not decoration (PRD §12 "controlled gradients").

## 6.5 Spacing, radius, shadow, typography tokens
| Category | Token | Value |
| --- | --- | --- |
| Spacing | `space.xs` | 4 |
| | `space.sm` | 8 |
| | `space.md` | 16 |
| | `space.lg` | 24 |
| | `space.xl` | 32 |
| | `space.xxl` | 48 |
| Radius | `radius.control` (inputs, small buttons) | 10 |
| | `radius.card` | 20 |
| | `radius.pill` (chips, tab pills, big buttons) | 999 |
| Shadow | `elevation.card` | `0px 4px 12px rgba(93,63,211,0.08)` — violet-tinted, not flat black, for a warmer/premium feel |
| | `elevation.raised` (modals, FAB) | `0px 8px 24px rgba(93,63,211,0.14)` |
| Touch target | `touchTarget.min` | 44×44 pt, enforced on every interactive element |
| Typography | `type.display` | 28/34, bold — screen titles |
| | `type.heading` | 20/26, semibold — card/section headers |
| | `type.subheading` | 17/22, semibold |
| | `type.body` | 15/22, regular — default text |
| | `type.caption` | 13/18, regular, `text.secondary` — timestamps, engine version |
| | `type.label` | 14/18, medium — buttons, chips, tab labels |

All type tokens scale with the OS dynamic-type/font-scale setting (PRD §15 Accessibility) — none are fixed unscalable pixel values in implementation.

**Font family**: system default (SF Pro on iOS / Roboto on Android) for MVP — zero cost, zero load-time risk, matches the "no unnecessary setup" and free-tier constraints. *Recommended Should-tier enhancement*: load the free, open-source Google Font **"Sora"** for `type.display`/`type.heading` only (via `expo-font`, no cost, no license) to sharpen first-open distinctiveness beyond colour; body/caption/label stay on the system font for performance. This is explicitly Should, not Must — cut first if Phase 2 time is tight.

## 6.6 Light-theme-only scope for MVP
Per the approved product direction (PRD §12 "light-first layered cards," avoid excessive dark screens) the MVP ships **one light theme only** — no dark-mode token set is defined or implemented now. If dark mode is requested post-MVP, it is added as a second token set behind the same semantic names (e.g. `color.background.main` gets a dark-mode value), so no component code changes, only token values.

## 6.7 Examples of correct vs incorrect usage
**Correct**
- A "High" risk chip shows a tinted coral background, `#A82F1F` text reading "High", and a filled triangle icon — three independent cues, not colour alone.
- Exactly one filled `primary.violet` button per screen (e.g. "Save task"); every other action on that screen is outline or text-style.
- Large background regions stay on the softly tinted `background.main`/`accent.lavender`/`accent.mint`, while dense-text cards sit on plain white (`background.card`) for readability — this is *why* the app avoids reading as "excessively white": most visible surface area carries a tint, only text-dense cards are neutral.
- The Premium gradient appears in exactly one place (the Premium plan card) so it stays a meaningful signal instead of decoration.

**Incorrect**
- Rendering workload-risk level as a coloured dot with no text label or icon — fails accessibility (colour-blind users) and violates the explicit "do not rely on colour alone" requirement.
- Setting body text in `accent.warmYellow` on `background.card` — light-on-light, far below 4.5:1, unreadable.
- Two or more saturated `primary.violet` filled buttons competing on one screen — breaks the "one dominant action" rule and looks noisy rather than premium.
- Using pure `#000000` text on a pure `#FFFFFF` full-bleed background across the whole app — technically high-contrast but reads as harsh/clinical, contrary to "colourful, calming" and "not excessively white" requirements; `text.primary`/`background.main` (both slightly tinted) are used instead.
- Applying `gradient.premium` to an ordinary task card "to make it pop" — dilutes its meaning as the Premium-tier signal.
