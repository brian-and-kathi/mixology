# mixology

Guest-facing menu for the home bar (**The Addled Cortex**): a TV billboard, a phone menu and a PIN-protected `/admin`, server-rendered from a Postgres database.

**Architecture.** A Next.js app (`next` 16, React 19) hosted on **Vercel**, reading and writing a Postgres 17 database on **Neon** through the Neon HTTP driver (`@neondatabase/serverless`), so `DATABASE_URL` must point at Neon. Vercel's Git integration builds every push to GitHub `bhwithun/mixology`: `main` deploys to production, every other branch gets a preview deployment. Production reads Neon's `main` branch; previews and local development use Neon's `dev` branch.

**Where the code lives.** GitHub `bhwithun/mixology` is the only copy. `~/GrokProjects/bartender` on Liandri is the older, pre-repo project; its `bartender-db` Docker Postgres serves only that project and is not used by this app.

The product contract is `DESIGN.md` (§4 schema, §5 UX, §10 locked rules). It is kept outside this repo, in the home-bar project.

## Routes

| Route | What it is |
| --- | --- |
| `/` | **Locksmith shop.** Public cover (Hart & Ward). Two links: Contact us, and Admin. |
| `/contact` | **The door.** Three glass icons, no digits. The right knock opens the lounge. |
| `/lounge` | **Tonight's password.** A color, a verb, and an animal, after a correct knock. Both change at 8:00am Eastern. |
| `/tv` | **TV board.** Pours, Cocktails, Cellar in columns at full viewport height, with a QR code to `/menu`. The short commit hash sits dimly in the top-right corner. Mouse cursor hidden. |
| `/menu` | **Phone guest menu.** Tabs in the same order (Pours / Cocktails / Cellar), one card per item. Not linked from the shop. |
| `/recipe/[id]` | **Recipe card.** Glass and service style, ingredients with the in-stock bottles, method, rating. Only buildable recipes are shown. |
| `/pour/[id]` | **Pour card.** How it's usually served, tasting note, rating. |
| `/wine/[id]` | **Cellar wine card.** How it's served, pairings, rating. |
| `/admin` | **Bar admin** (Stock, Bottles, Recipes, Ingredients), behind a 4-digit PIN. |
| `/api/cast`, `/api/rate` | Show on TV and guest ratings. |
| `/api/health` | JSON liveness and DB check (used by the container healthcheck). |

## How the data maps

The sections come straight from the existing database views, so the app holds no menu logic of its own:

- **Pours** come from `menu_neat`.
- **Cocktails** come from `menu_mixed`, which lists buildable recipes only. Ingredient stock comes from `recipe_line_status`, and a stocked substitute from `spec_substitutions` is shown as "(use X)".
- **Cellar** comes from `menu_wines`.
- **Glass icons** come from `recipes.glass_id` → `glassware`. They're inline SVGs covering all 13 glass names. Glassware is display-only; it's not inventory.
- Pours have no glass in the schema, so they show a rocks glass. Cellar shows a wine glass.

On the TV, empty sections are omitted. The board first tries to fit the whole menu on one screen: a long section spreads across side-by-side sub-columns. Only if it still doesn't fit do **all** columns page together on one slow timer (15 s). The page refreshes its data every 60 s.

## Hosting at a glance

| | Production | Preview | Local |
| --- | --- | --- | --- |
| Git | `main` | any other branch | your clone |
| Vercel | Production deployment | Preview deployment (Vercel login required) | none (`npm run dev`) |
| Neon branch | `main` | `dev` | `dev` |
| URL | https://mixology-xi.vercel.app, https://speakeasy.brianandkathi.com | `mixology-<hash>-brian-and-kathi.vercel.app` | http://localhost:3000 |

## Neon (database)

| | |
| --- | --- |
| Organization | BrianAndKathi (`org-cold-voice-47719388`) |
| Project | `mixology` (`green-snow-21814330`) |
| Region | AWS US East 2 (Ohio), `aws-us-east-2` |
| Postgres | 17 |
| Database / owner role | `mixology` / `mixology_owner` |
| Plan limits (free) | 10 branches per project, 6 hours of point-in-time history |

Console: https://console.neon.tech/app/projects/green-snow-21814330. In the sidebar, **Branches** lists every branch, **SQL Editor** runs queries (pick the branch and the `mixology` database at the top), and **Tables** browses and edits rows.

### Branches

| Branch | ID | Compute | Role |
| --- | --- | --- | --- |
| `main` | `br-still-math-b553fohk` | `ep-old-pine-b5cbob7t` | **Production.** The root branch, and what the live site reads. |
| `dev` | `br-damp-lab-b54is1bd` | `ep-royal-dew-b5n7aowm` | **Previews and local development.** A child of `main`. |
| `pre-*` | e.g. `pre-bottle-short-names` = `br-young-unit-b5brex19` | none | **Backups.** A copy of `main` taken just before a production change. |

Direct branch pages:
- `main`: https://console.neon.tech/app/projects/green-snow-21814330/branches/br-still-math-b553fohk
- `dev`: https://console.neon.tech/app/projects/green-snow-21814330/branches/br-damp-lab-b54is1bd

**Backup branches.** Before migrations or data loads touch `main`, make a branch of `main` named `pre-<change>`, with no compute. The ones kept so far are `pre-admin-v1`, `pre-pin-wines`, `pre-bottles-chevrons`, `pre-guest-ratings` and `pre-bottle-short-names`. They count toward the 10-branch limit, so delete old ones once a change has settled.
- **Compare:** open the backup's page in the console and use Schema Diff, or run `neon branches schema-diff main pre-<change> --project-id green-snow-21814330`. For data, add a compute to the backup and query both branches.
- **Restore:** `neon branches restore main pre-<change> --preserve-under-name main_before_restore --project-id green-snow-21814330`. This replaces `main`'s schema and data with the backup's, including guest ratings and admin edits made since the backup was taken, and keeps the replaced state as `main_before_restore`. Within the 6-hour history window, the console's Backup & restore page can also rewind `main` to a point in time.
- **Refresh `dev`** from production data with **Reset from parent** on the `dev` branch (console, or `neon branches reset dev --parent`). This discards anything that exists only on `dev`.

### Migrations and acceptance

- `db/migrations/` holds numbered SQL files, `010_glassware.sql` through `028_bar_versions.sql`. Each runs in one transaction and records itself in the `schema_migrations` table. Migrations 001–009 were applied before this repo existed; their files aren't here, but both branches record them.
- **Current state (checked 2026-09-27):** `main` and `dev` both have 001–027. 028 (`bar_versions`, branch `menu-events`) is not on either yet; the code works without it. Each has fallen behind once and was brought up to date without a reset: `dev` missed 023 and 024, and `main` missed 025 and 026 until 2026-09-27. Keep them in step: every migration that goes to `main` goes to `dev` too, or previews and local runs break when the code starts using the new schema. To check a branch: `SELECT version FROM schema_migrations ORDER BY version;`.
- Apply a migration with `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/0NN_name.sql`, on `dev` first, then on `main`.
- `db/acceptance.sql` is the acceptance suite: 25 numbered checks covering buildability, substitutions, the neat/mixed/wine lists, stock toggles, the vermouth rule, recipe units and method styles, the PIN throttle, the Cellar rule, bottle supply, ratings, short names, the 024 renames and the 028 change signal. It runs inside `BEGIN … ROLLBACK`, so its fixtures never persist. Run it with `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/acceptance.sql`. Each check prints `check N passed` and the run ends with `all acceptance checks passed`. The first failure raises an error and stops. It needs every migration applied, so it also catches a branch that has fallen behind.

### Editing the menu directly in SQL

Database triggers (migration 028) count every change the TV board, phone menu or a Show on TV pop-up shows, but only the app can reach the realtime relay. After direct SQL edits on `main`, run:

```
npm run notify            # production; or: npm run notify -- http://localhost:3000
```

It tells open TVs and phones to refresh (about 2.5 s later) and only announces what changed since the last announcement, so running it twice is harmless. If you forget, screens catch up at their next 15-minute check or when they're reopened. Previews sit behind Vercel sign-in, so the script can't reach them.

### Getting a connection string

Never commit one. The only place a real one belongs in the repo tree is `.env.local` or `.env`, both gitignored.
- **Console:** Project dashboard → **Connect** → pick the branch (`dev` for local work), database `mixology` and role `mixology_owner`, then copy the string.
- **CLI:** `neon connection-string dev --project-id green-snow-21814330 --database-name mixology --role-name mixology_owner` (add `--pooled` for the pooled host).
- Use `main`'s string only for deliberate production work: migrations, acceptance, backups.

## Vercel (hosting)

| | |
| --- | --- |
| Team (scope) | `brian-and-kathi` (`team_tiRwsxJAo2wmRvzJ2GToaYnZ`) |
| Project | `mixology` (`prj_BQ8ioCaCKTUz0pnMFW0SlGw9l5IZ`) |
| Git | GitHub `bhwithun/mixology`; production branch `main` |
| Production domains | https://mixology-xi.vercel.app and https://speakeasy.brianandkathi.com (both serve the current production deployment) |
| Deployment URLs | `https://mixology-<hash>-brian-and-kathi.vercel.app`. These, and all previews, redirect to a Vercel login. |
| Framework | Next.js preset, no custom build settings. Vercel ignores `output: 'standalone'`, which is only for the container. |

Where to find things (the dashboard requires a login to the `brian-and-kathi` team):

- **Project:** https://vercel.com/brian-and-kathi/mixology. The overview shows the current production deployment. **Deployments** in the sidebar lists every production and preview build, newest first.
- **One deployment:** `https://vercel.com/brian-and-kathi/mixology/<deployment id without the dpl_ prefix>`, for example https://vercel.com/brian-and-kathi/mixology/EW9FqrsoKp7F5QtgA5dPP8FQG7AR (production at `30d0987`). Every commit on GitHub links to its deployment through the **Vercel** status check.
- **Build logs:** on the deployment's page, or at `<deployment URL>/_logs` for signed-in team members.
- **Runtime logs:** **Logs** in the project sidebar (filter by environment, route or status).
- **Environment variables:** **Settings → Environment Variables**. This page is the source of truth for which names are set in which environment.
- **Domains:** **Settings → Domains**.

### Environment variables

Names only. Never put values in the repo, tickets or chat.

| Name | Production | Preview / Development | Notes |
| --- | --- | --- | --- |
| `DATABASE_URL` | Neon `main` | Neon `dev` | Sensitive. Required. |
| `ADMIN_PIN_HASH` | yes | yes | Sensitive. scrypt hash of the 4-digit admin PIN (`scrypt:N:r:p:<salt>:<key>`; make it with `printf '%s' "<PIN>" \| node scripts/pin-hash.mjs`). Never store the PIN itself. If it's missing or malformed, `/admin` stays locked (fails closed). |
| `ADMIN_PASSWORD` | yes | yes | Legacy. It no longer signs anyone in; it is the session-cookie signing key. Removing or changing it signs every admin out once. |
| `SESSION_SECRET` | optional | optional | If set, the cookie-signing key is derived from it instead of `ADMIN_PASSWORD` / `ADMIN_PIN_HASH`. |
| `BAR_NAME` | optional | optional | Wordmark text (default "The Addled Cortex"). |
| `VERCEL_GIT_COMMIT_SHA` | automatic | automatic | Set by Vercel; the TV's build hash. |
| `GIT_SHA` | not used | not used | The commit shown on the TV outside Vercel (container build arg, local). |
| `RELAY_URL` | set | set | Base URL of the realtime relay Worker, `https://mixology-relay.brian-952.workers.dev` ([relay/README.md](relay/README.md)). Unset: pages poll as before. |
| `RELAY_SECRET` | set | set | Sensitive. Bearer for publishing to the relay; same value as the Worker's `RELAY_SECRET` secret. |

Vercel applies env var changes only to new deployments, so redeploy after changing one.

### Which commit is live

The TV board (`/`) shows `Build <short hash>` in its top-right corner, taken from `VERCEL_GIT_COMMIT_SHA`. Compare it with `git rev-parse --short origin/main`, or with the production deployment on the project overview.

### Rolling back

- **Instant Rollback:** on the project overview's production deployment tile, click **Instant Rollback** and choose the earlier deployment, or use `vercel rollback <deployment-id-or-url>`. On the Hobby plan, only the immediately previous production deployment is eligible.
- After a rollback, Vercel stops auto-assigning production domains, so pushes to `main` won't go live until you **Undo Rollback** on the same tile, or run `vercel promote <deployment>`.
- A rollback does not touch Neon. If the bad release included a migration, restore `main` from its `pre-*` backup as well (see Backup branches).

## Local development

Requires Node 20.9+ (`engines` in `package.json`).

```bash
gh repo clone bhwithun/mixology && cd mixology
cp .env.example .env.local    # then paste the Neon dev-branch DATABASE_URL (never main's)
npm install
npm run dev                   # http://localhost:3000
```

`.env.local` and `.env` are gitignored (`.env` and `.env.*`, except `.env.example`). Next loads both, and `.env.local` wins. `docker compose` reads only `.env`. Other scripts: `npm run typecheck` (tsc), `npm run build`, `npm start`.

Production build without Docker:

```bash
npm run build
set -a; . ./.env.local; set +a    # or pass DATABASE_URL inline for one command
GIT_SHA=$(git rev-parse HEAD) npm start
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

## Shipping a change

1. **Branch** off `main`, commit and push the branch (never push unreviewed work to `main`).
2. **Preview:** Vercel builds the branch against Neon `dev`. Test there, or locally against `dev` (apply any new migration to `dev`, or to a temporary child branch of `dev`, first).
3. **Approval** of the preview.
4. **Back up production:** create a Neon branch of `main` named `pre-<change>` (no compute), and optionally save a text snapshot of the affected tables.
5. **Migrations on Neon `main`**, in number order, then any data load.
6. **Apply migrations to `dev` too** (and the same data load if `dev` has those rows), then run the acceptance suite there, so previews and local runs keep working.
7. **Acceptance:** run `db/acceptance.sql` on `main`. Every check must pass. If one fails, stop: don't deploy, and restore `main` from the backup if needed.
8. **Fast-forward `main`** to the branch and push without forcing: `git checkout main && git merge --ff-only <branch> && git push origin main`. Vercel deploys production.
9. **Verify:** wait for the deployment to be Ready, then check that the TV shows `Build <new hash>` and click through the menu, a pour page and a recipe page. Note the previous production deployment's id for rollback.
10. **Clean up:** delete the feature branch (remote and local) and any temporary Neon branches.

## Notes

- Migrations so far: 010 glassware; 011–012 ingredient-only specs (dry/sweet vermouth, absinthe verte and vanilla vodka hidden from Cellar and Pours); 013 `change_log`; 014 sweet/dry vermouth stand-in block; 015 `tv_cast`, the single Show on TV record; 016 recipe line units (no amount only for `top` and `rinse`); 017 `recipes.method_style`; 018 reviewed method-text rewrites, which skip any text changed since review; 019 `admin_login_attempts`, the PIN throttle; 020 `is_cellar_wine()`, the one Cellar rule; 021 `spec_supply()`, the bottles behind each ingredient; 022 `drink_ratings`, guest ratings; 023 `products.short_name` and `spec_label`; 024 six reviewed name fixes, which skip any value changed since review with a NOTICE; 025 `change_log` accepts `family`; 026 retired badge overrides; 027 `night_roll`; 028 `bar_versions`, the database change signal for the realtime relay (DESIGN §4.6).
- Admin: `/admin` (Stock, Bottles, Recipes, Ingredients) signs in with a 4-digit PIN on an on-screen keypad (`ADMIN_PIN_HASH`, ~180-day cookie); 5 wrong tries lock that IP and device for 5 min, then 15 min, then 1 h (Neon table `admin_login_attempts`, migration 019, acceptance check 19). Edits are logged in `change_log` (migration 013) for "Recently changed" and undo; sweet/dry vermouth can't stand in for each other (migration 014, acceptance check 15). Shared photos stay in the browser (IndexedDB), never on the server. Stock and Bottles split into **Spirits | Wines** (remembered per device); Wines are exactly the bottles the guest Cellar would show, via the shared SQL function `is_cellar_wine()` (migration 020, which `menu_wines` now uses too; acceptance check 20). Out wines fold into a quiet "Out · N" section and never count toward "Out only" or the "N out" counts; whether they can appear in "To buy" is one constant, `WINES_IN_TO_BUY` in `src/lib/admin-data.ts` (default off; on = a wine a recipe is waiting on shows as "… (wine)"). "Add wine" starts on a general type (a generic "wine" type if one exists, else "red wine"), and wines are "Usually served" Chilled / Room temp / Over ice (stored in the same `serves_chilled` / `serves_neat` / `serves_rocks` columns), defaulting to Chilled, or Room temp for a red. The guest menu's **Bar admin** link goes to `/admin/stock`; sign-in only returns to same-origin `/admin…` paths. See DESIGN §4.8 / §5.4 / §5.5.
- Show on TV: cocktail and pour pages POST/DELETE `/api/cast` `{type: "recipe"|"pour", id}` (the item must be on the guest menu; light per-IP rate limit); the TV polls `GET /api/cast` every 2 s and shows a bottom band for 5 minutes (DESIGN §10.1).
- Glass icon shapes follow the line-art style of the speakeasy app's glassware icons.
- Not built yet: Open/Closed and paired devices, displays / TV assignment, themes and skins (DESIGN §4.4–4.6).
