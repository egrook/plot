# Plot — agent notes

Personal 2D project planner. **Vite + React 18 + React Router**, not Next.js. **Bun + Hono** API. Tailwind v4 + shadcn (zinc, `style: new-york`). Always dark (`index.html` has `class="dark"`). Fonts are local IBM Plex in `public/fonts/` — do not add Google Fonts.

This repo is AI-written. Prefer small, reversible changes. Match existing tone: short, plain UI copy. No `window.alert` / `confirm` — use `ConfirmDialog` and toasts.

User-facing docs and env tables live in [README.md](README.md) and [`.env.example`](.env.example). Do not duplicate them here.

## Commands

```bash
bun install
bun run dev          # Vite :5173 + API :3001, /api proxied
bun run build && bun run start
bunx tsc --noEmit -p tsconfig.json   # client; run after TS changes
```

Runtime is Bun. SQLite, Postgres, MySQL, password hashing, and S3 come from Bun — do not add `pg`, `better-sqlite3`, or AWS SDK.

## Layout

| Path | Role |
| --- | --- |
| `server/index.ts` | Hono routes, permissions |
| `server/config.ts` | env (fail fast) |
| `server/db.ts` | schema (sqlite/postgres/mysql) + queries |
| `server/sql.ts` | bun:sqlite vs Bun.SQL adapter |
| `server/storage.ts` | local disk vs S3 |
| `server/auth.ts` | session cookie `plot_session` |
| `src/api.ts` | fetch wrapper + `ApiError` |
| `src/auth.tsx` | session provider |
| `src/types.ts` | shared client types |
| `src/pages/ProjectPage.tsx` | board (largest UI file) |
| `src/pages/AdminPage.tsx` | first-account user admin |
| `src/components/ui/` | shadcn primitives |

Client `@/` → `src/`. Server does not use that alias.

## Auth and permissions

- Sessions: httpOnly cookie, `secure` when `COOKIE_SECURE` / production.
- `isPublicApi` allowlist in `server/index.ts`. New unauthenticated routes must be added there or they 401.
- **Owner** vs **invited share** (`project_shares`, view|edit) vs **public link** (`/s/:slug`, optional password). Public *edit* slugs grant via `public_link_grants` after unlock — that is not the same as an invited share.
- Owner-only: delete/trash board, share users, public links.
- Invited **edit** (not public-link-only): board content, snapshots save/restore/delete.
- View-only: no writes. Use `denyIfViewOnly` / `projectAccessible` / `projectOwned`. Fail closed.
- `REGISTRATION_ENABLED` (default true): `POST /auth/register` 403 when false; UI reads it from `GET /auth/me`.
- **Admin** is the user with the oldest `created_at`. Ids are UUIDs and are not used. No admin column. `/admin` + `/api/admin/*` are first-account only. Admin create bypasses registration lock. The first account cannot be deleted.

Sharing is by exact username. Public slugs are 8-char `[a-z0-9]`.

## Data and files

- Queries are **async** (`await queries.foo.get/all/run`). `run` returns `{ changes }`.
- Schema: update **all three** `CREATE TABLE` dialects **and** sqlite `ALTER` / postgres+mysql `addColumn` extras. SQLite `INTEGER` is 64-bit; use `BIGINT` for timestamps on postgres/mysql.
- Dialects: MySQL uses `` `type` `` and `ON DUPLICATE KEY`; others `ON CONFLICT`. Quote MySQL reserved names.
- Spaces (`nodes`): `markdown` | `excalidraw` | `image` | `file`. Soft-delete via `deleted_at`. Status `todo|doing|blocked|done` or empty; `due_on` is `YYYY-MM-DD` or `YYYY-MM-DDTHH:mm`. **Validate real calendar values** — reject `2024-02-30` and `T25:00` (see `parseDueOn` / `parseDueValue`).
- Folders are **per user**, including shared boards. One folder placement per user per board.
- Snapshots: JSON payload of live nodes/edges/viewport. Restore does not touch ownership, shares, or links. Cap 30.
- Duplicate: copy live graph only, not shares/links/trash. Copier becomes owner.
- Uploads: unguessable ids, `/api/files/:id`. `GET` is public if you know the id.
- **S3:** never `new Response(s3File, { headers })` — Bun throws. Use `s3File.stream()` then `new Response(stream, init)`. Upload to S3 can succeed while serve still fails if you regress this.

## UI conventions

- Dark zinc tokens in `src/index.css`. Lucide icons. Confirm destructive actions.
- Sidebar lists: `md:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]`, `min-w-0 overflow-hidden` on the aside. Prefer `overflow-y-auto thin-scroll` over Radix `ScrollArea` for long lists (it clips/widens columns).
- `File` from lucide must be imported as `File as FileIcon` — it collides with the `File` constructor.
- Excalidraw: store `viewBackgroundColor: "#ffffff"` and invert in CSS. Skip save if the scene signature is unchanged. Do not PATCH viewport while an overlay is open.
- Markdown: `@uiw/react-md-editor`. Wiki-links `[[title]]` via `remarkWikiLinks` + `MarkdownBody`. Note file attachments are `[filename](/api/files/…)` and open the file URL. Mixed image+file paste must insert **one** document update (see `insertUploads`).
- Images in notes: upload, not base64. New numbered titles: `Untitled note`, `Untitled note 2`, …
- Always-on-top nav on the landing page; logo → `/dashboard` if signed in, else `/`.

## Git

Work and commit on a feature branch (`feat/…`, `fix/…`). Do **not** commit to `master` unless the user explicitly asks to commit on master. Pushing `master` also needs an explicit ask. Open a PR only if they ask.

## Checks

After TS edits: `bunx tsc --noEmit -p tsconfig.json`. Server is run by Bun; `tsconfig.node.json` may lack Bun types.

Do not commit `.env`, `data/`, real compose files, or secrets. Templates only: `.env.example`, `.env.production.example`, `docker-compose.example.yml`.
