# Money Leak Tracker

A family budget web app: import your bank CSVs, see where the money goes, find the "leaks" (subscriptions, small purchases, rising categories), and follow your house and car loans down to the last payment.

- **Family accounts**: everyone signs in with their own email and password and shares one family budget (transactions, budgets, loans).
- **Loans & milestones**: enter a loan's contract details and see what you paid last year and over the last 12 months, the interest vs capital split, what you still owe, a year-by-year table for tax returns, and milestones (25 / 50 / 75 % repaid, turning point, last payment) with countdowns. Linked bank payments are checked against the schedule.
- **Insights**: savings rate vs goal, recurring charges, small-purchase leak, over-budget and rising categories, top merchants, bank fees.
- **Bank import**: CSV from French and other banks (`;` or `,`, `1 234,56`, debit/credit columns, Windows-1252), duplicate detection, rule-based auto-categorisation that learns from your corrections.
- **Your data**: stored in your own Supabase Postgres database, protected by Row Level Security. Full history is kept (optional 2 / 3 / 5-year limit). JSON backup & restore, CSV export.

Plain HTML, CSS and JavaScript: no build step. Charts by [Chart.js](https://www.chartjs.org/), login and database by [Supabase](https://supabase.com/).

## Project layout

```
public/            the website (what Netlify serves)
  index.html
  css/style.css
  js/config.js     Supabase URL + publishable key
  js/store.js      data layer: login, family, sync with the database (or localStorage)
  js/loans.js      loan maths, Loans tab, loan dialog
  js/app.js        everything else: dashboard, insights, import, settings
  _headers         security headers (Content-Security-Policy etc.)
supabase/schema.sql  tables, security policies and functions
netlify.toml       tells Netlify to publish the public folder
```

## Set-up

### 1. Database (Supabase, free plan)

1. Create a project at [supabase.com](https://supabase.com/).
2. **SQL Editor → New query**: paste [`supabase/schema.sql`](supabase/schema.sql) and click **Run**. Re-running it later is safe.
3. **Project Settings → API Keys**: copy the **Project URL** and the **publishable** key into `public/js/config.js`. Never use the secret / `service_role` key in the website.
4. **Authentication → URL Configuration**: set **Site URL** to your Netlify address (e.g. `https://your-site.netlify.app`) and add it under **Redirect URLs**. The links in sign-up and password-reset emails go there.
5. **Authentication → Sign In / Providers → Email**: set the minimum password length to 8.

Notes about the free plan:
- Supabase's built-in email sender only sends a few emails per hour. That is enough for a family, but if sign-up or reset emails stop arriving, wait an hour or add your own SMTP server (Authentication → Emails → SMTP settings).
- Free projects are paused after about a week with no activity. Your data is kept: open the Supabase dashboard and click **Restore**. Regular use keeps it awake.
- Once all family members have signed up, you can turn off **Allow new users to sign up** (Authentication → Sign In / Providers) so nobody else can create accounts.

### 2. Website (Netlify)

1. Push this repository to GitHub.
2. In Netlify: **Add new site → Import an existing project → GitHub**, pick this repository. Netlify reads `netlify.toml`, so leave the build command empty. The publish directory is `public`.
3. Every push to `main` is deployed automatically.
4. Put the Netlify address in Supabase (step 1.4).

`public/_headers` sends a strict Content-Security-Policy that only allows this site, the two pinned CDN libraries and the Supabase project in `config.js`. **If you change the Supabase project, update the `connect-src` line too.**

### 3. Family

1. The first person creates an account and chooses **Start a new family budget**.
2. In **Budgets & settings → Family budget**, click **Copy invitation** and send it to your family.
3. Each family member creates an account and enters the invite code.

The family owner can remove members and create a new invite code (the old one stops working).

## Moving data from the single-file version

Open the old `index_1.html`, go to **Budgets & settings → Export backup (.json)**, then in the new app use **Restore backup**. Old ids, categories and rules are upgraded automatically.

## Running locally

```bash
python3 -m http.server 8765 -d public
```

Open <http://localhost:8765/> (add `http://localhost:8765` to the Supabase redirect URLs if you want to test email links locally).
Add `?local` to the address (<http://localhost:8765/?local>) to try the app without logging in: data then stays in that browser only.

## Security model

- The publishable key in `config.js` is public by design. Access is controlled in the database: every table has Row Level Security, so a signed-in user can only read and change rows of the family budget they belong to, and logged-out visitors can read nothing.
- Families are created and joined only through the `create_household` / `join_household` functions; only a family's name, settings and version can be edited directly.
- Passwords are handled by Supabase Auth and never touch this code.
- External scripts are pinned to exact versions with Subresource Integrity hashes.
