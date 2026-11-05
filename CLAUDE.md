# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

**Try-on** is a virtual try-on (GenAI) fashion e-commerce web app. Sprint 1 setup (branch `chore/sprint-01-setup`) has scaffolded `backend/` (Express 5, ESM) and `frontend/` (Vite + React 19 + Tailwind v4); features (auth, profile) are not built yet. The root `package.json` only pulls in `@supabase/supabase-js`; each app has its own `package.json`.

Project docs and agent prompts are written in Vietnamese.

## Development process: lightweight Scrum for agentic coding

`PB.md` is the product backlog (Epics 1–4, US-01 → US-09). **Each Epic becomes one Sprint** (Epic 1 → `sprint-01`, and so on).

The **main agent is the orchestrator**. It calls the subagents in `.claude/agents/` for each step and does not do their work itself. **After every step, stop and wait for the user to confirm** before starting the next one.

### Steps per sprint

1. **User stories (agent-ba):** expand each user story of the Epic into a detailed story in `sprint-xx/US-xx.md` covering the main flow, error flows, validation, acceptance criteria and non-functional requirements.
2. **Sprint backlog (agent-ba):** plan the sprint's tasks in `sprint-xx/sprint-backlog.md`. This covers installing tools and libraries, preparing env variables (`.env.example`), and implementing each user story.
3. **Business design (agent-ba):**
   - Mermaid flowcharts → `sprint-xx/design/flows/`
   - Mermaid ERD and schema → `sprint-xx/design/db/`

   Design **only what this sprint needs**. Carry over earlier sprints' designs and modify them only when necessary, noting what changed.
4. **UI/UX design (agent-uiux):**
   - In the first sprint, create the design system with **Stitch MCP**.
   - In later sprints, update the design system only if needed. Otherwise go straight to the screens.
   - Write Markdown screen descriptions → `sprint-xx/screens/`.
5. **Implementation (agent-coder):** build the features from the business design and the UI/UX design, then test:
   - unit tests
   - API tests through **Postman MCP**

   Keep the test suite lean and focused on edge cases and real risks. Skip trivial or obvious tests.

### Cross-cutting duties of the main agent

- Record recurring errors and their fixes with `/learn-by-mistake` (→ `common_errors.md`).
- Run `/wrap-up` when a sprint is finished.
- Keep `PROGRESS.md` up to date with project progress: per-sprint status, the current step, what is done or pending, and blockers.
- Keep `DECISIONS.md` up to date with business and algorithm decisions: what was decided, why, and in which sprint. When a decision changes, update its entry instead of appending a contradictory one.

### Git workflow: one branch per user story

- **Each user story gets its own branch**, created from an up-to-date `main` (use `/branch`) before implementation of that story starts. Name it `feature/US-xx-<short-name>` (e.g. `feature/US-02-profile-photo`).
- All commits for that story go on its branch (`/commit`). Do not mix work from several user stories on one branch, and do not commit feature work directly to `main`.
- **Merge into `main` only after** the story's tests (unit + Postman API tests) pass **and the user has confirmed**. Then merge with `/merge`. Never merge without the user's confirmation.
- After merging, record it in `PROGRESS.md`. The repo is not yet a git repository, so run `git init` with `main` as the default branch before the first story's branch.

### Sprint folder layout

```
sprint-xx/
  US-xx.md            # detailed user stories (step 1)
  sprint-backlog.md   # task plan (step 2)
  design/flows/       # Mermaid flowcharts (step 3)
  design/api.md       # API contract for the sprint (step 3)
  design/db/          # Mermaid ERD + schema (step 3)
  screens/            # screen descriptions (step 4)
```

The design system lives at project level in `design/design-system.md` because every sprint shares it. agent-uiux only designs (step 4); agent-coder writes the UI code in step 5 unless the main agent explicitly asks agent-uiux to code it. Subagents cannot call each other: when one hits an ambiguity it reports the question back, and the main agent asks the right agent or the user.

## Commands

Run from the repo root; Node 24 is required. Copy `backend/.env.example` to `backend/.env` and `frontend/.env.example` to `frontend/.env` first (the backend refuses to start with missing or invalid env).

| Task | Backend (`cd backend`) | Frontend (`cd frontend`) |
|---|---|---|
| Install | `npm install` | `npm install` |
| Dev server | `npm run dev` (port 4000, `node --watch`) | `npm run dev` (port 5173) |
| Test | `npm test` | `npm test` |
| Run one test file | `npx vitest run tests/app.test.js` | `npx vitest run src/services/apiClient.test.js` |
| Run one test by name | `npx vitest run -t "<name>"` | `npx vitest run -t "<name>"` |
| Lint | `npm run lint` | `npm run lint` |
| Format (Prettier, shared root `.prettierrc`) | `npm run format` / `npm run format:check` | `npm run format` / `npm run format:check` |
| Build | n/a | `npm run build` |
| Migrate (D-19) | `npm run migrate` (needs `DATABASE_URL`; applies `migrations/NNN_*.sql` in order, tracked in `schema_migrations`) | n/a |
| Image test fixtures | `npm run fixtures` (writes `tests/fixtures/generated/`, gitignored) | n/a |
| Seed admin (D-32) | `npm run seed:admin` (needs `ADMIN_EMAIL`, `ADMIN_PASSWORD`) | n/a |
| Setup Storage bucket (D-26) | `npm run setup:storage` (creates/repairs private bucket `profile-photos`, idempotent) | n/a |

Notes: Tailwind v4 is configured in CSS (`frontend/src/index.css`, `@theme` tokens from `design/design-system.md`), there is no `tailwind.config.js`. Vitest uses `vite.config.js` on the frontend and `vitest.config.js` on the backend. Postman workspace "Try-on", collection "Try-on API" and environment "local" are created through Postman MCP.

## Product notes

Core try-on behavior (US-05/06): when a buyer selects a category, show an image of *the user* wearing the first product, and generate or show the next one when they press an arrow or swipe. This depends on the profile photo (US-02) and product images (US-04). GenAI images may be slow, so plan for caching and clear waiting states.

Full-body photos and height/weight are sensitive personal data, so keep their storage buckets private.

## Agreed stack and target layout

| Layer | Tech |
|---|---|
| Frontend | `frontend/`: React + Vite + TailwindCSS, React Router; API base URL from `import.meta.env.VITE_API_URL` |
| Backend | `backend/`: Node.js + Express REST API under the `/api` prefix |
| DB / Storage | Supabase Postgres + Supabase Storage, reached **only from the backend** with the service role key (the frontend never talks to Supabase directly) |
| Auth | JWT issued by the backend, passwords hashed with bcrypt. Supabase Auth is **not** used unless the user decides otherwise |
| Schema | SQL files in `migrations/` with ordered names (`001_create_profiles.sql`), kept in sync with the sprint ERD |

Backend layering: `routes/ → controllers/ → services/ → Supabase`, plus `middlewares/` (auth, validate, upload, error handler) and `config/`. Response shape: `{ success, data }` / `{ success: false, error: { code, message } }`. Frontend is organized by feature: `features/<feature>/`, shared `components/`, `pages/`, `services/` (a single API client that attaches the JWT and handles 401 in one place).

agent-uiux and agent-coder must look up current library docs through Context7 before using a library (Tailwind/Vite integration in particular changes between versions).

## MCP

`.mcp.json` configures Supabase MCP in **read-only** mode (fill in the project ref and access token placeholders) and Postman MCP (used for API testing in step 5). Stitch MCP is used for the design system. Schema changes go through migration files, not ad-hoc SQL.

## Custom commands (`.claude/commands/`)

`/branch`, `/commit`, `/push`, `/pull`, `/merge` (safe merge into `main`), `/learn-by-mistake` (records issues in `common_errors.md`), `/wrap-up` (summarizes the session and updates the project structure notes).
