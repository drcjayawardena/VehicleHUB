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
  The hourly refresh workflow was removed on 2026-11-21 (owner's request): new / sold vehicles appear on the static pages only after the next
  push to `FrontEND/**` / `scripts/**`, or manually: Actions → "Website — deploy (GitHub Pages)" → Run workflow.
  A failed build on a normal push does not block the website update; manual runs fail loudly.
- `vehicles.html` is a marketplace (list/grid, filters, featured, saved ♥, full ad view at `#v=<id>` with leasing calculator and
  similar vehicles). A card's href is `v/<id>.html` when the id is in `v/index.json` (crawlers, new tab), else `#v=<id>`;
  a normal click always opens the full ad view in the page. Shared / WhatsApp links use the static page when it exists.
  `v/index.json` also lists each vehicle's photo files (`photos`), so the ad view shows them from the website instead of the API.
- Static cards injected between the SEO-LIST markers use the marketplace card markup (`a.ad`, `.th`, `.b`); keep them in step with `adCard()`.

## Inquiry sources (v3.8)
- Every request stores the `?src=` tag of the link the customer used in LEADS `source` (fb, ig, tiktok, wa, qr, google, showroom, wanted …).
  `vehicles.html` keeps `src` / `ref` for the visit and adds them to every `request.html` link; static `v/<id>.html` pages do the same (`TRACK_JS`).
- Dashboard card "Where inquiries come from" = `leadStats_` (7 / 30 / 90 days). Add a source name in `LEAD_SOURCE_NAMES` when a new tag is used.
- Officer app **Create Ad** writes a Sri Lankan classified-style caption per platform (Facebook / Instagram / TikTok / WhatsApp) with a link
  tagged `src=<platform>&ref=<officer>` (static page if built, else `vehicles.html#v=`, else the request form).

## Schema updates
- `autoMigrate_()` (Code.gs, called by `doPost`) appends new SCHEMA columns at the end of VEHICLES / LEADS once per `APP.VERSION`
  (`SCHEMA_VERSION` script property). It only appends — if a sheet's headers differ from the schema it changes nothing.
- v3.7 added VEHICLES `description` (public ad text), `featured` (admin only) and LEADS `mileage`, `fuel`, `transmission`,
  `district`, `condition`, `color` (from the post-ad form).
- `publicListings` is cached in pieces (`PUBLIC_LISTINGS_V2`); `clearPublicCache_()` runs on every vehicle save / approve / sale / delete.

## Market tab (other sites, manual)
- Officers paste an ad link + text (e.g. from ikman.lk) in the **Market** tab; `marketParse_` (Matching.gs) reads make/model/year/price(Lakhs)/fuel/gear/district,
  the officer checks and saves it to the `MARKET` sheet (created automatically), and `scoreMatch_` lists active buyers scoring >= `MIN_SCORE`.
- **No scraping** of ikman.lk (their terms were not verified). Keep it manual / paste-based unless the owner gets permission or a data feed.
- UI is in both `BackEND/Index.html` and `FrontEND/index.html` (`viewMarket`, `mk*`).

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
1. `lead_received` template is **Active** at Meta (seen 2026-11-22). Set script property
   `WA_CUSTOMER_TEMPLATE = lead_received` (if not done yet), then test via `request.html` with the owner's own number and check `WA_LOG`.
2. Re-approval required when a user edits their profile.
3. Version-compare bug (app update check).
Done 2026-10-29: login lockout (5 fails → 15 min, `APP.MAX_LOGIN_FAILS` / `APP.LOCK_MINUTES`), `addMaster` admin-only.
