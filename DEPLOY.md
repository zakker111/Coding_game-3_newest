# Publish the game on Render (step by step)

This publishes the game as one web service (API + website) with a managed Postgres database.
The repo already contains the setup file `render.yaml`, so you only click through Render.

You need: a GitHub account that can see `zakker111/Coding_game-3_newest`, and a Render account (free).

## 1. Create the Render account
1. Go to https://render.com and sign up (GitHub login is easiest).
2. Connect GitHub when asked and allow access to the `Coding_game-3_newest` repository.

## 2. Create the app from the Blueprint
1. In the Render dashboard click **New +** then **Blueprint**.
2. Pick the repository `zakker111/Coding_game-3_newest` and branch `main`.
3. Render reads `render.yaml` and shows two resources: `nowt-db` (Postgres) and `nowt-game` (web service).
4. Click **Apply** (or **Create**). Wait for both to show as live. The first build takes a few minutes.

## 3. Open the game
1. Open the `nowt-game` service. The URL is at the top, like `https://nowt-game.onrender.com`.
2. Check these work in the browser:
   - `https://<your-url>/workshop` loads the Workshop.
   - `https://<your-url>/api/ruleset` shows JSON.
3. Share the URL. The Workshop is the main page.

If the build or the page fails, copy the error from the **Logs** tab of `nowt-game` and send it to the agent.

## 4. Before you share it widely (important)
The game now needs an admin password of your choice. Render asks for it when you create the
Blueprint (step 2): enter `NOWT_ADMIN_PASSWORD` with at least 12 characters. Keep it secret.
The admin account is the only one that can start the daily league.

If Render doesn't ask for it, or you skipped it, open `nowt-game` → **Environment**, add `NOWT_ADMIN_PASSWORD`, and save.
The service restarts and applies the password.

## 5. Things to know about the free plan
- **Database expires after 30 days.** Render's free Postgres is deleted after 30 days. Either upgrade `nowt-db` to a paid plan in the Render dashboard, or ask the agent to add a backup/export step.
- **The web service sleeps** after a period without visitors (Render's exact timing may vary). The first visit after a sleep takes ~30–60 seconds to load. The daily league run (03:00 UTC) will not fire while the service is asleep.
- **Updating the game:** push changes to GitHub `main`. Render redeploys automatically (check **Settings → Auto-Deploy** if it doesn't).
- **Where the data lives:** bots, accounts, matches, and daily runs are in `nowt-db`. Redeploys keep the data now.

## Local run (optional, for testing on your computer)
```
corepack enable
pnpm install
pnpm build
NOWT_WEB_DIST=apps/web/dist node apps/server/src/index.js
```
Then open http://localhost:3000. Without `DATABASE_URL`, data is saved to `apps/server/.nowt/server-state.json`.

To test against Postgres locally, set `DATABASE_URL=postgres://user:password@localhost:5432/dbname` before starting.
