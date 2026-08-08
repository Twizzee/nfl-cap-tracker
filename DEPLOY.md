# Deploy NFL Cap Tracker V6 as a real website

## Architecture
- Frontend: existing HTML/CSS/JS in `public/`
- Backend: Express API in `src/server.js`
- Production database: Supabase Postgres through `DATABASE_URL`
- Hosting: Vercel
- Automatic league refresh: Vercel Cron -> `/api/cron/sync`
- Local development fallback: `data/state.json`

## 1. Create the database
1. Create a Supabase project.
2. In Supabase, open **Connect** and copy the **Transaction pooler** connection string.
3. Replace `[YOUR-PASSWORD]` in that connection string with your database password.
4. You do not have to manually run `database.sql`: the server creates the two required tables on first connection. The SQL file is included if you prefer creating them yourself.

## 2. Put the project on GitHub
Create a new repository and upload/push this entire folder.

Typical Terminal commands:

```bash
git init
git add .
git commit -m "NFL Cap Tracker V6 website"
git branch -M main
git remote add origin YOUR_GITHUB_REPO_URL
git push -u origin main
```

## 3. Deploy on Vercel
1. Import the GitHub repository into Vercel.
2. Add these Environment Variables in Vercel project settings:
   - `DATABASE_URL` = Supabase Transaction pooler URL
   - `CRON_SECRET` = a random string at least 16 characters long
   - `ALLOW_PUBLIC_SYNC` = `false`
3. Deploy.

Vercel serves files from `public/` and runs the Express API as a serverless function.

## 4. Automatic updates
`vercel.json` schedules `/api/cron/sync` once per day at 12:00 UTC so it deploys on Vercel Hobby. If you use Vercel Pro, you can change the schedule to `*/30 * * * *` for 30-minute updates.

Vercel automatically sends `CRON_SECRET` as a Bearer Authorization header to the cron endpoint. The endpoint rejects calls that do not match it.

## 5. First production sync
After deployment, automatic sync will run on the cron schedule. If you want to force the first sync immediately, temporarily set `ALLOW_PUBLIC_SYNC=true`, redeploy, press **Update entire league**, then set it back to `false` and redeploy.

Or call the protected cron endpoint yourself with the secret from a trusted terminal:

```bash
curl -H "Authorization: Bearer YOUR_CRON_SECRET" https://YOUR_DOMAIN/api/cron/sync
```

## 6. Custom domain
In Vercel: Project -> Settings -> Domains. Add your domain and follow the DNS instructions Vercel shows.

## Local development
No database is required locally:

```bash
npm install
npm start
```

Open http://localhost:3000. Without `DATABASE_URL`, the app uses `data/state.json` exactly like V5.

To test production-style database storage locally, create a `.env` or export `DATABASE_URL` before running the server.

## Production behavior
- Data persists in Postgres instead of the deployment filesystem.
- Public visitors can read the tracker normally.
- Public manual full sync is disabled by default to prevent abuse.
- Vercel cron performs the 32-team sync automatically. The included Hobby-safe schedule runs once per day; Pro can run it as often as once per minute.
- A Postgres lock prevents duplicate full sync jobs from overlapping.
