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
