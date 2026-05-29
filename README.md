# Zoom Attendance

Static GitHub Pages site backed by GitHub Actions workflows that fetch Zoom webinar attendance, publish retention reports, and back up generated report data to Firebase Storage.

## Why this design

GitHub Pages only hosts static HTML, CSS, and JavaScript. It cannot safely run a backend that stores Zoom secrets. This repo keeps Zoom credentials in GitHub Secrets, runs the Zoom API fetch inside GitHub Actions, and publishes generated data to a Pages site.

GitHub’s current docs describe Pages as static hosting and recommend GitHub Actions for deployment:

- https://docs.github.com/en/pages/getting-started-with-github-pages/about-github-pages
- https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site
- https://docs.github.com/en/actions/how-tos/writing-workflows/choosing-when-your-workflow-runs/triggering-a-workflow

## Zoom requirements

- Zoom account with Webinar enabled
- Zoom `Server-to-Server OAuth` app
- Report scopes for webinar reporting

Recommended minimum scopes for this repo:

- `report:read:webinar:admin`
- `report:read:list_webinar_participants:admin`

Zoom docs used:

- https://developers.zoom.us/docs/internal-apps/create/
- https://developers.zoom.us/docs/rooms/s2s-oauth/

## Repository secrets

Add these GitHub Actions secrets in the repository settings:

- `ZOOM_ACCOUNT_ID`
- `ZOOM_CLIENT_ID`
- `ZOOM_CLIENT_SECRET`

For Firebase backup, also add:

- `FIREBASE_SERVICE_ACCOUNT_KEY`
- `FIREBASE_STORAGE_BUCKET`

You do not need to share your personal Firebase email login if you use a service account. The correct credential is the Firebase service account JSON for the project.

## Local usage

1. Copy `.env.example` to `.env`
2. Fill the Zoom values
3. Install dependencies:

```bash
npm install
```

4. Fetch attendance for a webinar:

```bash
WEBINAR_ID=12345678901 npm run fetch:attendance
```

5. Back up generated reports to Firebase Storage:

```bash
FIREBASE_SERVICE_ACCOUNT_KEY='{"type":"service_account",...}' \
FIREBASE_STORAGE_BUCKET="your-project.appspot.com" \
npm run backup:firebase
```

This writes:

- `site/data/latest.json`
- `site/data/latest.csv`

## GitHub Actions workflows

Use the `Fetch Zoom Attendance` workflow with a `webinar_id` input. It will:

1. Request a Zoom Server-to-Server OAuth token
2. Fetch webinar summary and all participant pages
3. Write JSON and CSV into `site/data/`
4. Commit the generated files back to the default branch

Use the `Sync Zoom Reports` workflow for the full automated flow. It will:

1. Run every day at `12:00 AM IST`
2. Pull recent Zoom webinar history
3. Regenerate all retained webinar reports
4. Upload the site report files to Firebase Storage
5. Commit updated `site/` data back to `main`

The `Deploy GitHub Pages` workflow publishes the `site/` folder.

## Site URL

For the repository `abhishek-dungen/Zoom-Attendace`, the default project Pages URL is:

`https://abhishek-dungen.github.io/Zoom-Attendace/`
