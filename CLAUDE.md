# CLAUDE.md — VehicleHUB

## Owner preferences
- Explain to the owner in **Sinhala**, keeping technical terms in English (e.g. "Script property එක set කරන්න").
- The owner is not a developer: give click-by-click steps, and warn before anything that shows secrets on screen.

## Architecture
- **Data**: Google Sheets (LEADS, WA_LOG, users, vehicles …). No data or passwords live in this repo.
  Sheet "VehicleHub DB" (the Apps Script is bound to it): https://docs.google.com/spreadsheets/d/1M_eemNHd78aDl0S6TdQdzf77lDdEpoqBZhiRY3BolI0/edit
- **Local working copy**: `C:\Users\Pentium\Documents\Project\VehicleHUB` (older folders under `Documents\Ravi` are history only).
- **Backend**: Google Apps Script web app — code in `BackEND/`
  (`Code.gs`, `Matching.gs`, `McLogin.gs`, `WhatsApp.gs`, `Index.html`, `appsscript.json`).
  Script ID: `1SoG9hIml7sLsYZvprgl_qbkJplVzWbDjmkokt4ctbdcZDGC9Zb_h7N-B` (see `BackEND/.clasp.json`).
- **Website**: `FrontEND/`, published by `.github/workflows/pages-deploy.yml` (Pages source = GitHub Actions) —
  https://drcjayawardena.github.io/VehicleHUB/
  (`index.html` app, `request.html` public customer request page, `vehicles.html`, `config.js` holds the `/exec` URL).
  `FrontEND/index.html` and `BackEND/Index.html` are near-copies of the same app: apply UI changes to both.
- **MasterCAL**: separate Apps Script app. `McLogin.gs` gives one login for both — VehicleHUB asks MasterCAL `whoami`
  with the MasterCAL session token; approved MasterCAL users get Officer access.

## Deploy pipeline (clasp 2.4.2 via GitHub Actions)
- Push to `main` touching `BackEND/**` → `.github/workflows/apps-script-deploy.yml` runs `clasp push --force`
  then `clasp deploy` to the **same deployment ID** (the `/exec` URL never changes), then pings `?ping=1`.
- `clasp push --force` replaces EVERY file in the Apps Script project; the workflow refuses to run if any of the 6 files is missing.
- Auth comes from the repo secret `CLASPRC_JSON` (contents of `~/.clasprc.json`, clasp 2.4.2 format:
  `token` / `refresh_token` / `oauth2ClientSettings`). It was regenerated in Google Cloud Shell on 2026-10-29.
- **Rule**: if anyone edits code in the Apps Script editor, run Actions → "Apps Script — pull live code" first,
  then `git pull` here, before changing `BackEND/`. Otherwise the next deploy overwrites the editor changes.
- Push to `main` touching `FrontEND/**` → `pages-deploy.yml` publishes the website; no Apps Script deploy needed.

## SEO vehicle pages (static)
- `scripts/build-vehicle-pages.js` (Node, no dependencies) reads `publicListings` / `publicPhotos` / `publicPhoto` from the
  `/exec` API and generates `FrontEND/v/<vehicle_id>.html` (+ photos in `v/img/`, `v/index.json`), `sitemap.xml`, `robots.txt`.
  These are **generated in CI and not committed** (`.gitignore`). Run locally: `node scripts/build-vehicle-pages.js`.
- `pages-deploy.yml` runs the script before every publish (photos cached with `actions/cache`).
  `vehicle-pages-refresh.yml` calls it **every hour** (and manually: Actions → "Website — refresh vehicle pages").
  A failed build on a normal push does not block the website update; scheduled / manual runs fail loudly.
- `vehicles.html` links a card to `v/<id>.html` only if the id is in `v/index.json`; otherwise (vehicle approved in the last hour)
  it opens the old `#v=<id>` pop-up. Keep that fallback.
- GitHub pauses scheduled workflows after 60 days without repo activity — re-enable under Actions if the hourly run stops.

## Ad maker (social media)
- `FrontEND/ad-maker.html` — single-file tool (no backend): upload photos or load from the showroom, one click makes ads for
  Facebook/Instagram (square, portrait, story), WhatsApp status/TikTok (story) and a wide link image, plus captions (en/si) and hashtags.
  Runs fully in the browser (canvas; `plate.js` blurs number plates). Share on phones, Download ZIP + Copy caption on desktop.
  URL: https://drcjayawardena.github.io/VehicleHUB/ad-maker.html. Auto-posting to Meta/TikTok APIs is NOT built (needs app review).

## WhatsApp (Meta Cloud API, account "VehicleHUB Sri Lanka")
Script properties (Apps Script → Project Settings). Never print or screenshot `WA_TOKEN`.
| Property | Meaning |
|---|---|
| `WA_TOKEN`, `WA_PHONE_ID` | Cloud API credentials |
| `WA_LEAD_TEMPLATE` | `new_lead` — officer alert (4 vars), `WhatsApp.gs`. Do not change. |
| `WA_CUSTOMER_TEMPLATE` | `lead_received` — customer confirmation (3 vars: name, lead ref, agent), `sendLeadWhatsApp_` in `Code.gs` |
| `WA_CUSTOMER_LANG` / `WA_LANG` | template language (default `en`) |
| `WA_ENABLED` | `false` stops all sending |
Other private settings (also Script properties — never hard-code phone numbers / emails in the code):
| Property | Meaning |
|---|---|
| `PUBLIC_PHONE` | Number shown on the public showroom and static pages for Call / WhatsApp (empty → first admin's number from USERS) |
| `FIRST_ADMIN_PHONE`, `FIRST_ADMIN_EMAIL` | Used only by `setup()` when the USERS sheet is empty |

Other approved templates: `vehicle_match`, `user_approved`. Each customer send is logged to `WA_LOG` as `cust:<lead_id>`.

## Open items (as of 2026-10-29)
1. `lead_received` template was **In review** at Meta. Once **Active**, set script property
   `WA_CUSTOMER_TEMPLATE = lead_received`, then test via `request.html` with the owner's own number and check `WA_LOG`.
2. Re-approval required when a user edits their profile.
3. Version-compare bug (app update check).
Done 2026-10-29: login lockout (5 fails → 15 min, `APP.MAX_LOGIN_FAILS` / `APP.LOCK_MINUTES`), `addMaster` admin-only.
