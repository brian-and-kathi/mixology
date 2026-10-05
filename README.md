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
| `/menu` | **Phone guest menu.** A sticky search box and tabs (All / Pours / Cocktails / Cellar, with counts), mood chips, per-section chips, one card per item. Not linked from the shop. |
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
- **Cellar** comes from `menu_wines`. Each wine's category (its badge) is its grape (`products.grape`, migration 031), or with no grape its main ingredient's label (Sangria, Sake, Cranberry wine). A grape badge always shows, on the TV, the phone card and as the wine page's title badge, even when the name says it ("… Merlot 2020" · Merlot); a label from the type is left out when the name already says it, as on Pours. The list runs by color (red, rosé, white, sparkling, then other), then category, then name, with featured wines first; the first wine of each category gets the same small gap Pours puts between spirit families. A grape is display text, not an ingredient: recipes still match wines on their type ("red wine").
- **Reserved** (migration 032): a bottle kept for an occasion (`products.reserved`, optional `reserved_note` such as "Kathi's 50th", at most 40 characters; never together with Featured). While it is in stock, its pour (or Cellar wine) and every cocktail that can only be built with reserved bottles stay listed but **locked**: a skeleton key and a muted antique brass "Ask the host" tag (`--reserved: #a08a5c`, 6.3:1 on the black background), the row dimmed and sorted after the available items of its family (Pours, Cellar category) or section (Cocktails). Tapping one opens a page with only the name, "Saved for …" when there is a note, and "Ask the host"; the recipe, pour and wine URLs give that same page when opened directly, and a locked item is never featured, cast to the TV or listed as a bottle under another recipe's ingredient. A cocktail with a free (unreserved) bottle or stand-in for every required line is not locked. An out-of-stock reserved bottle is simply off the menu, as before. The views carry it as `reserved`, `reserved_note` (last columns of `menu_neat`, `menu_wines` and `menu_mixed`; `free_spec_ids()` is `available_spec_ids()` without reserved bottles). The TV shows a padlock instead of the key (Brian, 2026-10-04: it reads better from the couch); `TV_RESERVED_ICON` in `src/components/TvBoard.tsx` switches it back to the key. Phone and admin use the key.
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

- `db/migrations/` holds numbered SQL files, `010_glassware.sql` through `033_moods.sql`. Data loads that go with a migration live in `db/loads/` (`033_moods.sql`, the mood tags), run right after it. Each runs in one transaction and records itself in the `schema_migrations` table. Migrations 001–009 were applied before this repo existed; their files aren't here, but both branches record them.
- **Current state (checked 2026-10-04):** `main` and `dev` both have 001–033 (028 `bar_versions` applied 2026-09-28 after backup branch `pre-028-bar-versions`; 029 `bar_status` applied 2026-09-28 after backup branch `pre-029-bar-status`; 031 `wine_grape` applied 2026-10-04 after backup branch `pre-wine-grape-2026-10-04`; acceptance 28/28 on both). 032 `reserved_products` is on both (main 2026-10-04 after backup branch `pre-reserved-2026-10-04`; acceptance 29/29 on both). 033 `moods` is on both, with the moods.csv tags loaded (main 2026-10-04 after backup branch `pre-menu-search-2026-10-04`; dev lacks 13 of the 50 tagged items; acceptance 30/30 on both). 029 must be on a branch before code that reads it runs against it: without it the guest pages fail closed and the admin switch can't save. Each has fallen behind once and was brought up to date without a reset: `dev` missed 023 and 024, and `main` missed 025 and 026 until 2026-09-27. Keep them in step: every migration that goes to `main` goes to `dev` too, or previews and local runs break when the code starts using the new schema. To check a branch: `SELECT version FROM schema_migrations ORDER BY version;`.
- Apply a migration with `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/0NN_name.sql`, on `dev` first, then on `main`.
- `db/acceptance.sql` is the acceptance suite: 30 numbered checks covering buildability, substitutions, the neat/mixed/wine lists, stock toggles, the vermouth rule, recipe units and method styles, the PIN throttle, the Cellar rule, bottle supply, ratings, short names, the 024 renames, the 028 change signal, the 029 bar status, the 030 featured flag, the 031 grape, the 032 reserved bottles and the 033 mood tags. It runs inside `BEGIN … ROLLBACK`, so its fixtures never persist. Run it with `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/acceptance.sql`. Each check prints `check N passed` and the run ends with `all acceptance checks passed`. The first failure raises an error and stops. It needs every migration applied, so it also catches a branch that has fallen behind.

### Editing the menu directly in SQL

Database triggers (migration 028) count every change the TV board, phone menu or a Show on TV pop-up shows, but only the app can reach the realtime relay. After direct SQL edits on `main`, run:

```
npm run notify            # production; or: npm run notify -- http://localhost:3000
```

It tells open TVs and phones to refresh (about 2.5 s later; measured 2.5–2.6 s in production) and only announces what changed since the last announcement, so running it twice is harmless ("nothing new to announce"). If you forget, screens catch up at their next 15-minute check or when they're reopened.

- Run it once after the whole batch of edits, not after each statement.
- An UPDATE that sets the same values changes nothing and announces nothing. A tasting note, serve note or method change refreshes only an open Show on TV pop-up; stock, names, badges, ABV, serve flags, ingredients, recipes, glasses and ratings refresh the board.
- Edits on `dev` go with `npm run notify -- http://localhost:3000` against a local app on `dev`. Previews sit behind Vercel sign-in, so the script can't reach them.
- App edits (admin, `/db`, ratings) announce themselves; no script is needed.

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

- Migrations so far: 010 glassware; 011–012 ingredient-only specs (dry/sweet vermouth, absinthe verte and vanilla vodka hidden from Cellar and Pours); 013 `change_log`; 014 sweet/dry vermouth stand-in block; 015 `tv_cast`, the single Show on TV record; 016 recipe line units (no amount only for `top` and `rinse`); 017 `recipes.method_style`; 018 reviewed method-text rewrites, which skip any text changed since review; 019 `admin_login_attempts`, the PIN throttle; 020 `is_cellar_wine()`, the one Cellar rule; 021 `spec_supply()`, the bottles behind each ingredient; 022 `drink_ratings`, guest ratings; 023 `products.short_name` and `spec_label`; 024 six reviewed name fixes, which skip any value changed since review with a NOTICE; 025 `change_log` accepts `family`; 026 retired badge overrides; 027 `night_roll`; 028 `bar_versions`, the database change signal for the realtime relay (DESIGN §4.6); 029 `bar_status`, the bar's Open/Closed switch (DESIGN §3.1), which starts Closed; 030 `products.featured`; 031 `products.grape`, the Cellar category (optional, never blank; last column of `menu_wines`; backfilled for Harvester Cabernet, the Chateau Grand Traverse Merlot, Woodbridge Pinot Grigio and Barefoot Moscato). Admin sets it in the bottle form's Grape field, next to Wine color (wines only, with the grapes already in use as suggestions), or on `/db` products; 032 `products.reserved` and `reserved_note` (Reserved bottles, see How the data maps: CHECKs keep the note trimmed, non-blank and at most 40 characters, and reserved and featured never both on; `free_spec_ids()`; `reserved`, `reserved_note` appended to `menu_neat`, `menu_wines` and `menu_mixed`). Admin sets it with the **Reserved** switch next to Featured on the bottle form (turning one on turns the other off; `saveProduct` refuses both), with an optional Occasion note shown while it is on; Stock rows show a key and the note in the grey line. It never changes In stock. The 028 trigger already bumps the change signal on any product edit, so the menu refreshes like any other edit.
- Admin: `/admin` (Stock, Bottles, Recipes, Ingredients) signs in with a 4-digit PIN on an on-screen keypad (`ADMIN_PIN_HASH`, ~180-day cookie); 5 wrong tries lock that IP and device for 5 min, then 15 min, then 1 h (Neon table `admin_login_attempts`, migration 019, acceptance check 19). Edits are logged in `change_log` (migration 013) for "Recently changed" and undo; sweet/dry vermouth can't stand in for each other (migration 014, acceptance check 15). Shared photos stay in the browser (IndexedDB), never on the server. Stock and Bottles split into **Spirits | Wines** (remembered per device); Wines are exactly the bottles the guest Cellar would show, via the shared SQL function `is_cellar_wine()` (migration 020, which `menu_wines` now uses too; acceptance check 20). Out wines fold into a quiet "Out · N" section and never count toward "Out only" or the "N out" counts; whether they can appear in "To buy" is one constant, `WINES_IN_TO_BUY` in `src/lib/admin-data.ts` (default off; on = a wine a recipe is waiting on shows as "… (wine)"). "Add wine" starts on a general type (a generic "wine" type if one exists, else "red wine"), and wines are "Usually served" Chilled / Room temp / Over ice (stored in the same `serves_chilled` / `serves_neat` / `serves_rocks` columns), defaulting to Chilled, or Room temp for a red. The guest menu's **Bar admin** link goes to `/admin/stock`; sign-in only returns to same-origin `/admin…` paths. See DESIGN §4.8 / §5.4 / §5.5.
- Show on TV: cocktail and pour pages POST/DELETE `/api/cast` `{type: "recipe"|"pour", id}` (the item must be on the guest menu; light per-IP rate limit); the TV polls `GET /api/cast` every 2 s and shows a bottom band for 5 minutes (DESIGN §10.1). A cocktail's band shows its moods (migration 033, the /menu chip labels in that order) on one quiet cream line under the name, and no line when it has none (Brian via Vincent, 2026-10-04). Like any other band content it counts toward the band's fit: a tall card shrinks a step (`--band-scale`) rather than clip. A cast never restyles the item's row on the board.
- Glass icon shapes follow the line-art style of the speakeasy app's glassware icons.
- UPCs are shown in their printed form (`formatUpc()` in `lib/format.ts`: `0 12345 67890 5` for UPC-A, a 13-digit code with a leading 0 shown as its UPC-A, `5 012345 678900` for EAN-13, `1234 5678` for 8 digits, anything else as stored) in the `/db` products table, under the `/db` product form's UPC input and under the admin bottle form's Barcode input. Display only: stored values, saving and lookups keep the plain digits, and the `/db` products search matches both forms. Checked by `node scripts/check-format-upc.mts`.
- Open/Closed (migration 029, DESIGN §3.1): the admin menu's first row, **Bar is open / Bar is closed**, flips it in one tap (`PATCH /api/admin/bar`). Opening lasts until the next 2:00 AM America/New_York (`lib/bar-clock.ts`, checked by `node scripts/check-bar-clock.mts`); the bar never opens by itself. While Closed, only admins get in: the locksmith cover `/` is unchanged; the knock page `/contact` is the bare door and `POST /api/knock` answers every knock like a wrong one; `/lounge` sends guests back to `/contact`; `/menu`, `/recipe`, `/pour` and `/wine` show "The bar is closed"; guest `POST /api/cast` and `POST /api/rate` get 403; the TV keeps the board under a Closed watermark with a dimmed QR. Admins see everything, with a "Closed · admin view" pill on guest pages. Closing clears the TV cast. Open screens follow the `bar:status` relay topic (poll every 10 s without the relay; `GET /api/bar/status`). If the status can't be read the server fails closed for guests after a 45 s grace.
- Phone menu search and filters (2026-10-04, `src/components/MenuBrowser.tsx`, logic in `src/lib/menu-filter.ts`; `/menu` only; the TV board is unchanged, the Show on TV band shows a cocktail's moods). Search matches every typed word across names, badges, places, ingredient lines, grapes and notes that aren't on the card (full bottle name, brand, tasting note, wine pairings, a cocktail's method), ignoring case and accents; matches are marked, and a note-only match shows a short excerpt. Tabs All / Pours / Cocktails / Cellar carry counts (`?tab=` opens one); a section with nothing left collapses to "No matches", and when nothing matches anywhere a single "No matches · Clear filters" line (search, chips and tab reset) replaces the sections. There is no visible result line (Brian via Vincent, 2026-10-04: phone space); a visually hidden live region still reads the count to screen readers, and the search box's × clears the search. Every chip row wraps (no sideways scroll, 32px chips): mood chips take 3 rows at 360–390px wide today, Pours 2, Cocktails 1, Cellar 3 at 390 (4 at 360), with the grapes starting their own row. Mood chips: "Top rated ★" (guest average 4.0 or more), then Brian's 8 moods in order (Cozy, Night-Out, Smoky, Tropical, Bitter, Indulgent, Clean, Nostalgic; one at a time), each shown only when 2 or more available (not reserved) items on tonight's menu carry it (`MOOD_MIN_ITEMS` in `src/lib/moods.ts`). Section chips (hidden while searching): Pours by spirit family with Whiskey split by badge, Cocktails Stirred / Shaken / Hot from `recipes.method_style` (built, blended, rolled, thrown and swizzled have no chip), Cellar Red / White / Other then grapes. Migration 033 adds `products.moods` and `recipes.moods` (`text[]`, default empty, CHECK `moods_ok()`: only the 8 moods, at most 3, no repeats); the tags came from Trinity's moods.csv via `db/loads/033_moods.sql`. Admin sets them with the Moods chips on the bottle and recipe forms (up to 3). Older builds never read the columns, so they are harmless to leave in place on a rollback.
- Not built yet: paired devices, displays / TV assignment, themes and skins (DESIGN §4.4–4.6).
