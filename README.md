# mixology

Guest-facing menu for the home bar (**The Addled Cortex**): a TV billboard and a phone menu,
server-rendered from the Neon `mixology` Postgres database. Product contract:
`home-bar/DESIGN.md` (v0.3.5), §4 schema, §5 UX notes, §10 locked rules.

| Route | What it is |
| --- | --- |
| `/` | **TV board.** Pours, Cocktails, Cellar in three columns, names only, full viewport height. Mouse cursor hidden. The short commit hash sits dimly in the top-right corner. There's a QR code to `/menu`. |
| `/menu` | **Phone guest menu.** Tabs in the same order (Pours / Cocktails / Cellar), one card per item. |
| `/recipe/[id]` | **Recipe card.** Glass + service style (and alternate), ingredients, method, then rating (only if rated). Only buildable recipes are shown. |
| `/pour/[id]` | **Pour serve card.** Neat / Rocks / With water (the bottle's usual serve is highlighted), plus tasting note and rating only when present. |
| `/api/health` | JSON liveness + DB check (used by the container healthcheck). |

## How the data maps

The sections come straight from the existing database views, so the app holds no menu logic of its own:

- **Pours** come from `menu_neat`.
- **Cocktails** come from `menu_mixed`, which lists buildable recipes only. Ingredient stock comes from `recipe_line_status`, and a stocked substitute from `spec_substitutions` is shown as "(use X)".
- **Cellar** comes from `menu_wines`.
- **Glass icons** come from `recipes.glass_id` → `glassware`. They're inline SVGs covering all 13 glass names. Glassware is display-only; it's not inventory.
- Pours have no glass in the schema, so they show a rocks glass. Cellar shows a wine glass.

On the TV, empty sections are omitted. The board first tries to fit the whole menu on one screen: a long section spreads across side-by-side sub-columns. Only if it still doesn't fit do **all** columns page together on one slow timer (15 s). There's no per-column paging. The page refreshes its data every 60 s.

## Environment variables

| Name | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | yes | Postgres connection string for the Neon `mixology` database. Read from the environment only; never commit it. |
| `GIT_SHA` | no | Commit shown on the TV when not on Vercel. The container gets it as a build arg. |
| `VERCEL_GIT_COMMIT_SHA` | auto | Set by Vercel; takes precedence over `GIT_SHA`. |
| `BAR_NAME` | no | Wordmark text (default "The Addled Cortex"). |

## Environments

| Where | Neon branch | How it's configured |
| --- | --- | --- |
| **Production** (Vercel, `main`) | `main` | `DATABASE_URL`, Production target only |
| **Preview** (Vercel, other branches) and **local / container** | `dev` | Vercel Preview (and Development) `DATABASE_URL`. Locally, your `.env`. |

- Put the **`dev`** branch connection string in `.env`, **never `main`'s**. Get it from the Neon console (project `mixology`, branch `dev`, database `mixology`).
- To reset `dev` to a fresh copy of production data, use Neon's **reset from parent** on the `dev` branch (console, or `neon branches reset dev --parent`).
- **Test schema changes on `dev` first**, then apply them to `main`.

## Local development

Requires Node 20.9+.

```bash
cp .env.example .env          # then paste the Neon dev-branch DATABASE_URL into .env
npm install
npm run dev                   # http://localhost:3000  (Next loads .env automatically)
```

Production build without Docker:

```bash
npm run build
set -a; . ./.env; set +a      # or pass DATABASE_URL inline for one command
GIT_SHA=$(git rev-parse HEAD) node .next/standalone/server.js   # after copying static assets, see Dockerfile
# or simply: npm start  (Next warns that standalone prefers server.js, but it works)
```

## Container

A multi-stage `Dockerfile` builds Next.js `output: 'standalone'`. `docker-compose.yml` reads `DATABASE_URL` from `.env` and takes `GIT_SHA` as a build arg:

```bash
GIT_SHA=$(git rev-parse HEAD) docker compose up --build    # http://localhost:3000
```

Plain Docker:

```bash
docker build --build-arg GIT_SHA=$(git rev-parse HEAD) -t mixology .
docker run --rm -p 3000:3000 --env-file .env mixology
```

## Deploy (Vercel)

- Vercel project `mixology`, linked to GitHub `bhwithun/mixology`. Every push to `main` deploys to production; other branches get preview deployments.
- Framework preset: Next.js (no custom build settings). Vercel ignores `output: 'standalone'`.
- `DATABASE_URL` is set per environment as a sensitive env var: Production → Neon `main`, Preview/Development → Neon `dev`.
- The TV hash comes from `VERCEL_GIT_COMMIT_SHA` automatically.

## Notes

- The Neon HTTP driver (`@neondatabase/serverless`) is used, so `DATABASE_URL` must point at Neon.
- Glass icon shapes follow the line-art style of the speakeasy app's glassware icons.
- Not in this first pass: PIN admin, Open/Closed + paired devices, displays / TV assignment, PartyKit "Show on TV" overlays, themes and skins (DESIGN §4.4–4.6).
