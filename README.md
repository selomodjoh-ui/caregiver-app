# caregiver-app

A job-matching web app for Washington State that connects licensed caregivers with adult family homes. Caregivers list credentials and free hours; providers post shifts, find who is available, and message applicants.

## What is built so far

- Sign-up, sign-in and sign-out for caregivers and providers
- Caregivers: credentials with expiry dates and document upload, weekly free times,
  a shift board (apply, withdraw, accept or decline offers)
- Providers: home profile, posting shifts, reviewing applicants, searching who is free,
  offering a shift
- Chat between a caregiver and a home, tied to a shift

Not built yet: ratings and testimonials after completed shifts, payments, email or text
alerts, automatic licence checks. Credentials and home licences are verified by hand in the
Supabase Table Editor (`credentials.status`, `homes.license_verified`).

## How it is put together

- **App:** React and TypeScript, built with Vite. It runs in any phone or computer browser.
- **Backend:** Supabase (logins, database, file storage).
- **Hosting:** Cloudflare Workers, connected to this repository. Every push to `main` rebuilds
  the live site at https://caregiver-app.selomodjoh.workers.dev

## One-time setup

### 1. Create the database tables

In the Supabase dashboard, open **SQL Editor** and run each file in `supabase/migrations/`
in number order: start a new query, paste the file's contents, and click **Run**.

### 2. Supabase address and public key

The live site reads these from `.env.production` in this repository:

| Name | Value |
|---|---|
| `VITE_SUPABASE_URL` | the Supabase Project URL |
| `VITE_SUPABASE_KEY` | the publishable key (`sb_publishable_...`) |

Both are public by design. Never put the secret (`sb_secret_...` / `service_role`) key in
this repository or the app.

### 3. Supabase sign-in address

In Supabase, under **Authentication > URL Configuration**, set **Site URL** to the live site
address so confirmation emails link back to the app.

### 4. Cloudflare

`wrangler.jsonc` tells Cloudflare to build with `npm run build` and serve the `dist` folder.
No dashboard variables are needed.

## Running it on a computer (optional)

```
npm install
cp .env.example .env   # then fill in the two values
npm run dev
```

## Before real users

Use test accounts and dummy documents only until a Washington lawyer has reviewed the model
and someone has reviewed the security.
