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
- **Hosting:** Cloudflare Pages, connected to this repository.

## One-time setup

### 1. Create the database table

In the Supabase dashboard, open **SQL Editor**, start a new query, paste the contents of
`supabase/migrations/0001_profiles.sql`, and click **Run**.

### 2. Give the app its Supabase address and public key

In Supabase, open **Project Settings > API** and copy:

- the **Project URL**
- the **publishable** (also called **anon public**) key

Never use the `service_role` or secret key in this app.

On Cloudflare Pages, add them under **Settings > Environment variables**:

| Name | Value |
|---|---|
| `VITE_SUPABASE_URL` | the Project URL |
| `VITE_SUPABASE_KEY` | the publishable key |

### 3. Cloudflare Pages build settings

| Setting | Value |
|---|---|
| Framework preset | Vite |
| Build command | `npm run build` |
| Build output directory | `dist` |

## Running it on a computer (optional)

```
npm install
cp .env.example .env   # then fill in the two values
npm run dev
```

## Before real users

Use test accounts and dummy documents only until a Washington lawyer has reviewed the model
and someone has reviewed the security.
