# Scholar News — Premium Opportunity Finder

**Discover opportunities. Shape your future.**

Scholar News brings scholarships, academic and research jobs, fellowships, internships, awards, conferences, and training opportunities together in a responsive, searchable website.

## Live websites

- GitHub Pages: https://scholarnews.github.io/
- Cloudflare Worker: https://scholarnews.scholarnews.workers.dev/

## Website features

- Responsive, premium editorial-style design with the official Scholar News logo and navy/orange brand palette.
- Opportunity search across titles, institutions, countries, disciplines, and listing details.
- Filters for type, location, institution, study/career level, organization, field, status, deadline, publication date, and contact email.
- Deadline-aware sorting, “closing soon” reminders, and trending-field summaries.
- Listing details, direct links to the original opportunity, locally saved listings, pagination, and dark mode.
- Snapshot-first loading with a Google Sheets refresh and local fallbacks.

## Project files

- `index.html` — website structure and metadata.
- `premium.css` — responsive styling and light/dark themes.
- `premium.js` — data loading, search, filters, sorting, details, and saved listings.
- `SNLogo2.png` — optimized site logo.
- `data/` — opportunity snapshots used by the site.
- `scripts/sync_google_sheet.py` and `.github/workflows/sync-google-sheet.yml` — data synchronization and GitHub Pages deployment.

## Opportunity data and deployments

The site loads `data/opportunities.json` first, then attempts to refresh from the configured Google Sheet. The existing GitHub Actions workflow updates the data snapshot and deploys GitHub Pages. The Cloudflare Worker is connected to the GitHub repository through Cloudflare Workers Builds and deploys when the production branch changes.

**Important:** Keep the `data/` directory, the sync script, and the workflow when editing the site. The static website does not require a Node build step or package installation.


## Scholar News Application Desk — `/premium/`

The application workspace is now a separate responsive page at **https://scholarnews.github.io/premium/**. Opportunity cards and their details include **Apply with Scholar News**, which opens the desk with the selected opportunity pre-filled.

### Application tools
- Eligibility and requirement checklist (keyword-assisted; not an official eligibility decision).
- Cover / motivation letter templates.
- CV criteria review and tailoring checklist.
- Academic email drafts and academic statement scaffolds.
- Editable drafts that can be copied or downloaded as text.
- An application tracker with deadlines, official links, notes and status updates.

### Student accounts and private records

The page includes email/password authentication, profile/CV information, private CV file upload/download/delete, account-saved drafts and application records. The static-site code is provided, together with Supabase row-level security policies and a private storage-bucket policy.

**Account functionality requires one-time configuration before it works.** Create a Supabase project, run `supabase/schema.sql` in its SQL Editor, then set the project URL and public publishable/anon key in `premium/config.js`. Configure the sign-in / password-reset redirect URLs in Supabase as described in [premium/SETUP.md](premium/SETUP.md). Never add a service-role/secret key to the public site. Do not store real CVs before testing two separate accounts for data isolation.

### Project files
- `premium/index.html`, `premium/app.css`, `premium/app.js` — standalone application desk UI, styles and client logic.
- `premium/config.js` — public Supabase configuration placeholder; blank until set up.
- `supabase/schema.sql` — private tables, row-level security policies and private CV bucket.
- `premium/SETUP.md` — Supabase setup, redirect configuration and verification checklist.
- `premium-v20261010-applicationdesk.js/css` — cache-busted homepage opportunity feed, quick-apply actions and site styling.
- `index.html` — main opportunity finder; the embedded application workspace has been removed.

Templates and eligibility extraction are not AI-powered in this release. The tracker records progress on Scholar News; it does not submit applications to external institutions or send automatic email/push reminders. Drafts, CV text and applications are saved to Supabase only after the owner configures the project and signs in. The homepage’s locally saved opportunity feature remains device/browser-specific.
