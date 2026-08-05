/**
 * Studora design tokens — single source of truth for colour, spacing, radius,
 * shadow and typography. Values are transcribed exactly from
 * docs/phase1/06-design-tokens.md (the approved Phase 1 visual system).
 * No screen may hardcode a raw colour/spacing value — import from here.
 */

export const color = {
  primary: {
    violet: '#6D28D9',
    violetStrong: '#5B21B6',
  },
  secondary: {
    teal: '#14B8A6',
    tealStrong: '#0C7A77',
  },
  accent: {
    coral: '#FF6B57',
    coralStrong: '#C23A28',
    warmYellow: '#FFC94D',
    warmYellowText: '#96650F',
    lavender: '#E4D9FA',
    mint: '#DFF5EC',
  },
  background: {
    main: '#EFE8FB',
    card: '#FFFFFF',
  },
  /** Reusable semantic neutral canvas — a cool-mist near-white, opt-in per
   * screen as an alternative to the global lavender `background.main`
   * where a screen needs purple to read as a controlled brand accent
   * rather than an all-over page wash. Deliberately not applied to
   * `background.main` itself, which every unreviewed screen still uses. */
  surface: {
    canvas: '#F7F7FB',
    /** Soft periwinkle/mist header-banner tone — distinct from both
     * `canvas` (near-neutral) and `background.main` (warmer lavender),
     * much lighter than `accent.lavender`. Verified contrast: text.primary
     * 15.1:1, text.secondary 6.0:1, primary.violet 6.2:1. */
    headerSoft: '#ECEFFB',
  },
  text: {
    primary: '#1B1730',
    secondary: '#5B5770',
    onFill: '#FFFFFF',
    disabled: '#A8A3BC',
  },
  border: {
    divider: '#E2DEEE',
  },
  success: {
    strong: '#157A52',
  },
  warning: {
    strong: '#96650F',
  },
  info: {
    bg: '#DFF7F5',
    text: '#0C7A77',
  },
  risk: {
    low: { bg: '#DFF5EC', text: '#157A52' },
    moderate: { bg: '#FFF3D6', text: '#96650F' },
    high: { bg: '#FFE4DF', text: '#A82F1F' },
    critical: { bg: '#9A1F1F', text: '#FFFFFF' },
  },
} as const;

export const gradient = {
  hero: ['#6D28D9', '#14B8A6'] as const, // 135deg
  premium: ['#5B21B6', '#C23A28'] as const, // 135deg
};

export const space = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  control: 10,
  card: 20,
  pill: 999,
} as const;

export const elevation = {
  card: {
    shadowColor: 'rgba(93,63,211,0.08)',
    offsetY: 4,
    blur: 12,
  },
  raised: {
    shadowColor: 'rgba(93,63,211,0.14)',
    offsetY: 8,
    blur: 24,
  },
} as const;

/** Cross-platform RN shadow props from an `elevation.*` token (iOS/web use shadow*, Android uses elevation). */
export function shadowStyle(e: { shadowColor: string; offsetY: number; blur: number }, androidElevation = 6) {
  return {
    shadowColor: e.shadowColor,
    shadowOffset: { width: 0, height: e.offsetY },
    shadowOpacity: 1,
    shadowRadius: e.blur,
    elevation: androidElevation,
  } as const;
}

export const touchTarget = {
  min: 44,
} as const;

export const type = {
  display: { fontSize: 28, lineHeight: 34, fontWeight: '700' as const },
  heading: { fontSize: 20, lineHeight: 26, fontWeight: '600' as const },
  subheading: { fontSize: 17, lineHeight: 22, fontWeight: '600' as const },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '400' as const },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' as const },
  label: { fontSize: 14, lineHeight: 18, fontWeight: '500' as const },
} as const;

/** Task type -> colour token key, per docs/phase1/06-design-tokens.md §6.3 */
export const taskTypeColor = {
  Assignment: color.primary.violet,
  Quiz: color.secondary.teal,
  Project: color.accent.coral,
  Presentation: color.accent.warmYellow,
  Lab: color.success.strong,
  Midterm: color.primary.violetStrong,
  FinalExam: color.accent.coralStrong,
  StudySession: color.secondary.tealStrong,
  Other: color.text.secondary,
} as const;

/** Task type -> human-readable display label. Raw enum values are the API
 * contract (see TaskType); this map only affects rendering. */
export const taskTypeLabel = {
  Assignment: 'Assignment',
  Quiz: 'Quiz',
  Project: 'Project',
  Presentation: 'Presentation',
  Lab: 'Lab',
  Midterm: 'Midterm',
  FinalExam: 'Final Exam',
  StudySession: 'Study Session',
  Other: 'Other',
} as const;

/** Priority dot colour — always render with the text label alongside, never colour alone. */
export const priorityColor = {
  Low: color.accent.mint,
  Medium: color.accent.warmYellow,
  High: color.accent.coral,
} as const;

/** Subject colour token -> swatch, per docs/Studora_PRD_Compact_Final.md §12
 * ("Deep violet, teal, coral, warm yellow, lavender and mint") and
 * app/schemas/subject.py's SubjectColorToken literal (same six, same order). */
export const subjectColor = {
  deepViolet: color.primary.violet,
  teal: color.secondary.teal,
  coral: color.accent.coral,
  warmYellow: color.accent.warmYellow,
  lavender: color.accent.lavender,
  mint: color.accent.mint,
} as const;

/** Workload-risk level -> chip tokens — always paired with a text label and icon. */
export const riskLevelTokens = color.risk;

export const tokens = {
  color,
  gradient,
  space,
  radius,
  elevation,
  touchTarget,
  type,
  taskTypeColor,
  taskTypeLabel,
  priorityColor,
  subjectColor,
  riskLevelTokens,
};

export default tokens;
