# caregiver-app

A job-matching web app for Washington State that connects licensed caregivers with adult family homes. Caregivers list credentials and free hours; providers post shifts, find who is available, and message applicants.

## What is built so far

- Sign-up for caregivers and providers (name, optional sex/gender, mobile, email, address, password)
- Sign-in and sign-out
- A profiles table in the database, filled in automatically at sign-up

Still to come: credentials with expiry dates, availability, the home profile, posting and applying for shifts, and chat.

## How it is put together

- **App:** React and TypeScript, built with Vite. It runs in any phone or computer browser.
- **Backend:** Supabase (logins, database, file storage).
- **Hosting:** Cloudflare Workers, connected to this repository. Every push to `main` rebuilds
  the live site at https://caregiver-app.selomodjoh.workers.dev

## One-time setup

### 1. Create the database table

In the Supabase dashboard, open **SQL Editor**, start a new query, paste the contents of
`supabase/migrations/0001_profiles.sql`, and click **Run**.

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
