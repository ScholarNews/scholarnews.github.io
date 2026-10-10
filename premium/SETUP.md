# Configure Scholar News accounts and private CV storage

The application desk is a static website with Supabase email/password authentication, student-owned database records, and a private CV storage bucket. Authentication remains disabled until a Supabase project is configured.

## 1. Create a Supabase project

1. Visit https://supabase.com/ and create a project. Choose the free plan if it meets your needs.
2. In Project Settings → API / Connect, copy the Project URL and the public publishable or anon key. **Never use a service-role or secret key in the website.**
3. Open the Supabase SQL Editor and run the complete contents of **supabase/schema.sql** in this repository. This creates the tables, row-level security rules and private student-cvs bucket.

## 2. Set the public website config

Edit **premium/config.js**:

~~~js
window.SN_SUPABASE_CONFIG = {
  url: "https://YOUR_PROJECT_REF.supabase.co",
  anonKey: "YOUR_PUBLIC_PUBLISHABLE_OR_ANON_KEY"
};
~~~

A public key is intended for browser applications; row-level security is what protects user data. Never paste a service-role key in this file. Commit the change to main. GitHub Pages and the connected Cloudflare Worker should deploy the updated repository.

## 3. Set allowed authentication URLs

In Supabase Authentication → URL Configuration, add these Site URLs / Redirect URLs for the domains you will actually use:

- https://scholarnews.github.io
- https://scholarnews.github.io/premium/
- https://scholarnews.scholarnews.workers.dev
- https://scholarnews.scholarnews.workers.dev/premium/

If your Cloudflare hostname is different, use the exact hostname you test. Add a custom domain too if you later adopt one. Email confirmations and password resets depend on these destinations.

## 4. Test ownership and privacy

1. Open https://scholarnews.github.io/premium/ and create a test account.
2. Confirm the email if requested, then sign in.
3. Save a profile, upload a test CV, create an application and save a draft.
4. Sign in with a second test account and verify it cannot see the first account’s profile, CV files, drafts or applications.
5. Repeat on the Cloudflare hostname if students will use it.

Do not upload sensitive documents until you have tested account ownership and access rules. Use SMTP for reliable production email; provider default email sending may be rate-limited.

## Included

- Email/password sign-up, sign-in and password reset.
- Student profile with education details and CV text.
- Private PDF, DOC and DOCX uploads up to 10 MB, with download and delete.
- Application records with official link, deadline, status and notes.
- Editable drafts saved to the signed-in account.

Templates and eligibility extraction are not AI-driven in this release. The tracker records an applicant’s progress on Scholar News; it does not submit applications to external institutions or send automatic email/push reminders.
