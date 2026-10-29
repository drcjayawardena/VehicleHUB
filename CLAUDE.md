# CLAUDE.md — VehicleHUB

## Owner preferences
- Explain to the owner in **Sinhala**, keeping technical terms in English (e.g. "Script property එක set කරන්න").
- The owner is not a developer: give click-by-click steps, and warn before anything that shows secrets on screen.

## Architecture
- **Data**: Google Sheets (LEADS, WA_LOG, users, vehicles …). No data or passwords live in this repo.
- **Backend**: Google Apps Script web app — code in `apps-script/`
  (`Code.gs`, `Matching.gs`, `McLogin.gs`, `WhatsApp.gs`, `Index.html`, `appsscript.json`).
  Script ID: `1SoG9hIml7sLsYZvprgl_qbkJplVzWbDjmkokt4ctbdcZDGC9Zb_h7N-B` (see `apps-script/.clasp.json`).
- **Website**: GitHub Pages from `main` / root — https://drcjayawardena.github.io/VehicleHUB/
  (`index.html` app, `request.html` public customer request page, `vehicles.html`, `config.js` holds the `/exec` URL).
- **MasterCAL**: separate Apps Script app. `McLogin.gs` gives one login for both — VehicleHUB asks MasterCAL `whoami`
  with the MasterCAL session token; approved MasterCAL users get Officer access.

## Deploy pipeline (clasp 2.4.2 via GitHub Actions)
- Push to `main` touching `apps-script/**` → `.github/workflows/apps-script-deploy.yml` runs `clasp push --force`
  then `clasp deploy` to the **same deployment ID** (the `/exec` URL never changes), then pings `?ping=1`.
- `clasp push --force` replaces EVERY file in the Apps Script project; the workflow refuses to run if any of the 6 files is missing.
- Auth comes from the repo secret `CLASPRC_JSON` (contents of `~/.clasprc.json`, clasp 2.4.2 format:
  `token` / `refresh_token` / `oauth2ClientSettings`). It was regenerated in Google Cloud Shell on 2026-10-29.
- **Rule**: if anyone edits code in the Apps Script editor, run Actions → "Apps Script — pull live code" first,
  then `git pull` here, before changing `apps-script/`. Otherwise the next deploy overwrites the editor changes.
- Front-end files (`index.html`, `request.html`, …) deploy by GitHub Pages only; no Apps Script deploy needed.

## WhatsApp (Meta Cloud API, account "VehicleHUB Sri Lanka")
Script properties (Apps Script → Project Settings). Never print or screenshot `WA_TOKEN`.
| Property | Meaning |
|---|---|
| `WA_TOKEN`, `WA_PHONE_ID` | Cloud API credentials |
| `WA_LEAD_TEMPLATE` | `new_lead` — officer alert (4 vars), `WhatsApp.gs`. Do not change. |
| `WA_CUSTOMER_TEMPLATE` | `lead_received` — customer confirmation (3 vars: name, lead ref, agent), `sendLeadWhatsApp_` in `Code.gs` |
| `WA_CUSTOMER_LANG` / `WA_LANG` | template language (default `en`) |
| `WA_ENABLED` | `false` stops all sending |
Other approved templates: `vehicle_match`, `user_approved`. Each customer send is logged to `WA_LOG` as `cust:<lead_id>`.

## Open items (as of 2026-10-29)
1. `lead_received` template was **In review** at Meta. Once **Active**, set script property
   `WA_CUSTOMER_TEMPLATE = lead_received`, then test via `request.html` with the owner's own number and check `WA_LOG`.
2. Login lockout after repeated failed logins.
3. Re-approval required when a user edits their profile.
4. `addMaster` needs a server-side admin check (currently only gated in `Index.html`).
5. Version-compare bug (app update check).
