# 8. REPOSITORY STRUCTURE

Monorepo, single Git repository (to be initialized in Phase 2, not now). Structure below is the Phase 2 target.

```
Studora-Claude/
├── docs/
│   ├── Studora_Business_Vision_Compact_Final.md   (+.docx, authoritative)
│   ├── Studora_BRD_Compact_Final.md               (+.docx, authoritative)
│   ├── Studora_PRD_Compact_Final.md               (+.docx, authoritative)
│   ├── Studora_Claude_Master_Prompt_Compact_Final.md
│   └── phase1/ … phaseN/                          (planning + phase completion reports)
│
├── mobile/                                        # Expo / React Native / TypeScript
│   ├── app/                                        # Expo Router routes
│   │   ├── (auth)/
│   │   └── (app)/{today,tasks,planner,focus,insights,...}
│   ├── src/
│   │   ├── design-system/                          # tokens.ts, components/
│   │   ├── api/                                    # typed client, per-domain modules
│   │   ├── features/                                # feature-scoped hooks/state per domain
│   │   ├── lib/                                     # secure storage, query client, notifications
│   │   └── types/
│   ├── assets/
│   ├── app.json / app.config.ts
│   ├── package.json
│   ├── tsconfig.json
│   ├── .env.example
│   └── eas.json                                    # only if/when free-tier dev builds are used
│
├── backend/                                        # FastAPI
│   ├── app/
│   │   ├── main.py
│   │   ├── api/v1/{profile,subjects,tasks,planner,sessions,workload,recommendations,notifications,dashboard,plans,feedback}.py
│   │   ├── core/                                    # config, auth/JWT dependency, security
│   │   ├── models/                                  # SQLAlchemy/SQLModel
│   │   ├── schemas/                                 # Pydantic
│   │   ├── services/                                # business logic incl. workload engine
│   │   └── db/                                       # session, base
│   ├── alembic/                                       # migrations
│   ├── tests/                                          # pytest, incl. workload-engine fixtures
│   ├── pyproject.toml (or requirements.txt)
│   ├── .env.example
│   └── ruff.toml (or config in pyproject)
│
├── scripts/                                        # dev/setup helper scripts (no Docker requirement)
├── .github/workflows/                              # CI — Should (S5), added when time permits
├── .gitignore
├── README.md
└── (no secrets ever committed; each app has only .env.example)
```

## 8.1 Rules carried into Phase 2
- `mobile/` and `backend/` are independently runnable; no cross-import.
- Nothing under `node_modules/`, `.expo/`, `__pycache__/`, `.venv/`, build output, or `.env` (non-example) is ever committed — `.gitignore` covers all of these from the first commit.
- Every domain (subjects, tasks, planner, sessions, workload, recommendations, notifications, dashboard, plans, feedback) gets a matching backend router module and mobile API module with the same name, so traceability from [10-api-contract.md](10-api-contract.md) to code stays obvious.
- Docs stay authoritative: this `docs/phase1/` set is not code and is not superseded by later phases unless explicitly revised with the same review discipline.
