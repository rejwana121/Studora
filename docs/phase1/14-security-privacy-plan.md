# 14. SECURITY / PRIVACY PLAN

## 14.1 Authentication & session
Supabase Auth issues JWTs (email/password for MVP). Mobile stores tokens in `expo-secure-store` (never `AsyncStorage`/plaintext). Backend verifies JWT signature + expiry on every request via a shared FastAPI dependency; expired/invalid tokens return 401 and the app routes to `(auth)`.

## 14.2 Authorization (ownership)
Two independent layers, both required (defense in depth), per R4/BR-02:
1. **Backend**: every query filters by `user_id` derived from the verified JWT — the client-supplied body/query is never trusted for `user_id` (PRD §13, explicit rule).
2. **Database**: PostgreSQL RLS policy `user_id = auth.uid()` on every personal table (§9 data dictionary). Even a backend bug cannot leak cross-user rows because RLS enforces it independently.
Verification: two-account isolation test repeated at the end of every phase that touches data (AC-02), not just once at the end.

## 14.3 Input validation
Pydantic schemas validate every request body/query at the API boundary (type, enum, range — e.g. `priority` must be one of the three values, `deadline` must parse as a valid timestamp). Mobile forms mirror the same constraints for fast feedback, but the server validation is authoritative.

## 14.4 Secrets management
No secrets committed at any point. `mobile/.env.example` and `backend/.env.example` list required variable names only (Supabase URL/anon key, JWT verification config, backend base URL) with placeholder values. Real values live in local `.env` files (gitignored) and, later, in CI/deployment secret stores — never in code or docs.

## 14.5 Data minimization and retention
Only fields needed for the features in [09-data-dictionary.md](09-data-dictionary.md) are collected. No task titles/notes/subject names ever leave the operational database into `analytics_events` (§13.7). Account deletion (PRD §4) removes/anonymizes the user's rows across all tables listed in §9 — exact cascade (`ON DELETE CASCADE` from `auth.users` down through owned tables) is implemented in the Phase 3 migration and confirmed against this table list.

## 14.6 Transport & API security
HTTPS only for all mobile↔backend and backend↔Supabase traffic. CORS restricted to the mobile app's expected origins/schemes for local dev. Rate-limiting/basic abuse protection is a Should-tier hardening item (not required for a single-developer MVP demo, but the FastAPI dependency structure does not preclude adding it later).

## 14.7 Non-diagnostic / responsible-AI boundary (R5, Safety boundary)
The workload engine (§11) never uses clinical/diagnostic language; explanations are drawn from a fixed template set reviewed against this rule, not generated as free text that could drift into diagnostic claims. No hidden behavioural monitoring: all signals used are ones the student can see reflected in their own tasks/sessions/planner data — nothing inferred from device sensors, location, or content outside the app's own academic-planning data.

## 14.8 No advertising / no data sale (R5)
No third-party analytics/ad SDKs are integrated. `analytics_events` stays first-party (Supabase table), used only for the BI purposes in §13, never sold or shared.

## 14.9 Subscription/payment safety (M10)
Sandbox checkout collects zero payment fields — no card number, expiry, CVV, or billing address inputs exist anywhere in the mobile app or API schema for MVP. `entitlements`/`subscription_events` tables (§9.15–9.16) have no payment-instrument columns by construction, removing the possibility of accidentally handling financial credentials.

## 14.10 Accessibility as a security/trust adjacent requirement
Baseline WCAG AA contrast, scalable text, non-colour status cues, 44x44 touch targets (§6, PRD §12/§15) are Must-tier — treated as part of "doing right by the student," verified per screen as it's built, not deferred to a single end-of-project audit (deep audit remains Should, S8).

## 14.11 Known limitation to be carried to final handoff (AC-10/P10)
iOS locked-device/killed-app notification sound verification is not performed (no paid Apple Developer account authorized); Android is the authoritative physical-device evidence source for MVP (§12). This is a documented, explicit limitation — not a silent gap.

## 14.12 Future live-payment security note (post-MVP, for roadmap continuity only)
When live billing is added post-MVP, raw card data must never be stored (BRD §7) — integration must use a PCI-compliant provider's tokenized flow (Stripe, or native App Store/Play Billing entitlement receipts) exactly as already anticipated by the entitlement abstraction in [09-data-dictionary.md](09-data-dictionary.md) §9.15.
