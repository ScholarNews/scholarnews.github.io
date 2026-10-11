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

Do not upload sensitive documents until you have tested account ownership and access rules. The default email sender is deliberately rate-limited and is not suitable for repeated production sign-up/reset emails. If you see “email rate limit exceeded”, stop retrying and wait for the limit to reset. For reliable delivery, configure a trusted custom SMTP provider in Supabase Authentication settings and verify its sender/domain. Ensure the Site URL and Redirect URLs above include the exact `/premium/` URL used by students.

## Fix: “Upload failed: Bucket not found”

The CV uploader uses a private Storage bucket whose exact ID is `student-cvs`. This error means that bucket is missing from the Supabase project the website is currently contacting, or the website's `premium/config.js` points to a different project than the one where the SQL was run.

1. Open the Supabase dashboard and select the project whose Project URL is configured in `premium/config.js`.
2. In **SQL Editor**, run the complete `supabase/fix-cv-storage.sql` file from this repository. Alternatively, re-run the complete `supabase/schema.sql`.
3. Open **Storage → Buckets** and verify a bucket with ID `student-cvs` exists and is **private**.
4. Reload the application desk and retry your CV upload.

Do not create a public bucket, do not change the app's bucket name, and do not place a service-role or secret key in the website. The repair SQL creates/updates the private bucket and re-establishes the per-user storage access policies.


## Fix: “could not find the table 'public.applications' in the schema cache”

The CV-bucket-only repair does not create the application tracker tables. In the **same Supabase project** whose URL is set in `premium/config.js`, open **SQL Editor**, run the entire `supabase/schema.sql` file (or the complete `supabase/fix-account-tables.sql` repair script), and confirm it completes successfully. The script creates missing profiles, applications, drafts and CV metadata tables, applies row-level security, keeps the CV bucket private, and requests a PostgREST schema-cache refresh. Then reload the Application Desk.

If the error persists, check the project URL in `premium/config.js` against the project selected in the dashboard and run this diagnostic query:

~~~sql
select to_regclass('public.profiles') as profiles_table,
       to_regclass('public.applications') as applications_table,
       to_regclass('public.drafts') as drafts_table,
       to_regclass('public.cv_files') as cv_files_table;
~~~

Each result should show its table name, not `NULL`.

## Verify the CV bucket is private

In **Storage → Buckets**, select `student-cvs` and verify the Public setting is off. You can also execute:

~~~sql
select id, name, public from storage.buckets where id = 'student-cvs';
~~~

The result must show `public = false`. Private buckets require authenticated access policies and signed URLs for downloads. <https://supabase.com/docs/guides/storage/buckets/fundamentals>


## CV extraction and reusable document profile

Under **Profile → CV Vault**, uploading a text-based PDF or a DOCX extracts its readable text inside the browser and saves that text to the student's private profile. A rule-based pass suggests common details such as name, institution, education level and discipline when detected. The applicant can review/edit those fields and the extracted CV text in the profile form. The Application Studio then pre-fills applicant details and a compact evidence extract for cover/motivation letters, academic emails, statements, CV tailoring and eligibility checklists.

Text is extracted locally in the browser; the original file is uploaded to the private `student-cvs` bucket. PDF files that are scans/images without selectable text need OCR or a text-based copy. Legacy Word `.doc` files are stored but not parsed by this browser-only version; save them as PDF or `.docx` first. This version organizes and reuses CV text but does not use a hosted AI model to independently validate credentials. Check every detected fact, personalize motivation statements, correct the working draft and submit only through the official opportunity provider.


## Included
- Email/password sign-up, sign-in and password reset.
- Student profile with education details and CV text.
- Private PDF, DOC and DOCX uploads up to 10 MB, with download and delete.
- Application records with official link, deadline, status and notes.
- Editable drafts saved to the signed-in account.

Templates and eligibility extraction are not AI-driven in this release. The tracker records an applicant’s progress on Scholar News; it does not submit applications to external institutions or send automatic email/push reminders.

## Improved CV parsing and motivation suggestions

The Application Studio pre-fills profile details after account data finishes loading, including when a student opens a direct URL such as \`/premium/?tool=cover\`. PDF text extraction retains line positions so section headings can be identified. The evidence field prefers professional summary, experience, research, education and skills rather than copying page numbers or contact details as the entire background. Three editable motivation starting points are available in the cover-letter and statement tools: background fit, contribution, and career development. Suggestions are rule-based and should be personalized; they do not invent verified achievements or submit documents automatically.


## Fix: a new student cannot sign in or another student's CV/profile appears

The application now clears private form data when the signed-in user changes, scopes profile/tracker/draft/CV-list queries to the current user ID, and handles the “email not confirmed” state with a **Resend confirmation email** action. Supabase row-level security must also be correct; the browser must never be treated as the privacy boundary.

1. In Supabase, open the **same project** whose URL is configured in `premium/config.js`. Open **SQL Editor** and run the complete `supabase/secure-student-data.sql` migration from this repository. It removes older policies from the Scholar News profile, applications, drafts and CV metadata tables, recreates owner-only row policies, and resets the `student-cvs` bucket's per-user folder policies. Do not make the CV bucket public.
2. In **Authentication → Users**, open the new user's record and check whether email confirmation is pending. If it is pending, the user must open the confirmation link from their email. On the Application Desk, they can enter the account email and click **Resend confirmation email**. Configure a trusted SMTP provider in **Authentication → SMTP Settings** if confirmation emails are not being delivered; repeated requests may be rate-limited. Check **Authentication → URL Configuration** so the actual GitHub Pages/Cloudflare URL used by students is allowed.
3. Once confirmed, sign out, reload the Application Desk with a hard refresh, and sign in using that user's own email/password. Each student's CV, extracted profile text, application tracker, and saved drafts should be private to that auth user ID. Existing rows keep their existing `user_id`; do not manually change ownership unless you have verified which student owns them.
4. Test with two separate accounts: upload a different test CV and save one test application while signed into each. Neither account should see the other account's records. The SQL migration restores owner-only policies; the app also filters queries by user ID, and CV files must live under a storage path beginning with that same user's UUID.

If sign-in still fails, read the exact message shown under the sign-in form. **Invalid login credentials** generally means check the email/password or use the newest password-reset link; **email not confirmed** means complete/resend confirmation; **email rate limit exceeded** means stop retrying and configure SMTP/wait for the limit to reset. An account appearing in Supabase Authentication alone does not prove that its email is confirmed or that a session can be established.
