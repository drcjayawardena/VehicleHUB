# VehicleHUB

Vehicle buyer / seller matching app for Sri Lanka (app version 3.6).
Data lives in a Google Sheet, the backend is Google Apps Script, the website is GitHub Pages.

## 📁 Folders
| Folder | What it is | Deploys to |
|---|---|---|
| `BackEND/` | Google Apps Script code — `Code.gs`, `Matching.gs`, `McLogin.gs`, `WhatsApp.gs`, `Index.html`, `appsscript.json`, `.clasp.json` | Apps Script web app (workflow **Apps Script — deploy**) |
| `FrontEND/` | Website — `index.html` (app), `request.html`, `vehicles.html`, `config.js` (/exec URL), `plate.js`, `years.js`, `sw.js`, icons | GitHub Pages (workflow **Website — deploy**) |
| `.github/workflows/` | Automatic deploy / pull workflows | — |
| `CLAUDE.md` | Project notes for Claude Code | — |

## 🚀 How deploy works
1. Change files in this folder (`C:\Users\Pentium\Documents\Project\VehicleHUB`).
2. Commit and push to `main`.
3. GitHub Actions does the rest:
   - `BackEND/` changed → `clasp push` + `clasp deploy` to the same deployment (the /exec URL never changes).
   - `FrontEND/` changed → the website is published to GitHub Pages.
4. Check: https://github.com/drcjayawardena/VehicleHUB/actions

⚠️ Apps Script editor එකේ code වෙනස් කළොත් → Actions → **"Apps Script — pull live code"** → Run workflow → ඊට පස්සේ මෙතන `git pull`.
නැත්නම් ඊළඟ deploy එකෙන් editor එකේ වෙනස්කම් මැකෙනවා.

## 🌐 App
| What | Link |
|---|---|
| Main app (Officers / Admin login) | https://drcjayawardena.github.io/VehicleHUB/ |
| Customer request page | https://drcjayawardena.github.io/VehicleHUB/request.html |
| Public vehicles / showroom | https://drcjayawardena.github.io/VehicleHUB/vehicles.html |

## 📊 Google Sheet (Database)
| What | Link |
|---|---|
| VehicleHub DB | https://docs.google.com/spreadsheets/d/1M_eemNHd78aDl0S6TdQdzf77lDdEpoqBZhiRY3BolI0/edit |

Sheets: `USERS`, `LEADS`, `VEHICLE_MASTER`, `DROPDOWN_LISTS`, `WA_LOG` …
⚠️ Sheet එකේ customer data තියෙනවා — access දෙන්න ඕන අයට විතරයි.

## ⚙️ Apps Script (Backend)
| What | Link |
|---|---|
| Editor | https://script.google.com/home/projects/1SoG9hIml7sLsYZvprgl_qbkJplVzWbDjmkokt4ctbdcZDGC9Zb_h7N-B/edit |
| Project Settings (Script properties) | https://script.google.com/home/projects/1SoG9hIml7sLsYZvprgl_qbkJplVzWbDjmkokt4ctbdcZDGC9Zb_h7N-B/settings |
| Web app API (/exec) | https://script.google.com/macros/s/AKfycbzbWYCtLp5F8ZSeNa-BH5CI8ZOtBo90mLSp3yHWgHKxBBZVHKseZMiaPEbFoOrv6_Um/exec |
| Health check | https://script.google.com/macros/s/AKfycbzbWYCtLp5F8ZSeNa-BH5CI8ZOtBo90mLSp3yHWgHKxBBZVHKseZMiaPEbFoOrv6_Um/exec?ping=1 |
| MasterCAL login API (used by `McLogin.gs`) | https://script.google.com/macros/s/AKfycbx8m_v6iMUy8tTSGzxSfxi79ZyTfJgpy89WjVkqRMO3dvnm734znkdTvjpW92DhO-xN/exec |

🔒 Script Properties page එකේ `WA_TOKEN` පේනවා — screenshot ගන්න එපා.

## 🐙 GitHub
| What | Link |
|---|---|
| Repository | https://github.com/drcjayawardena/VehicleHUB |
| Actions | https://github.com/drcjayawardena/VehicleHUB/actions |
| Secrets (`CLASPRC_JSON`) | https://github.com/drcjayawardena/VehicleHUB/settings/secrets/actions |
| Pages settings (Source: GitHub Actions) | https://github.com/drcjayawardena/VehicleHUB/settings/pages |

## 💬 WhatsApp (Meta)
| What | Link |
|---|---|
| Message templates (VehicleHUB Sri Lanka) | https://business.facebook.com/latest/whatsapp_manager/message_templates/?business_id=1319557227910659 |

Templates: `new_lead` (officer alert), `vehicle_match`, `user_approved`, `lead_received` (customer confirmation).

## Notes
- The repository is public but holds **no data and no passwords** — only code. All data stays in the Google Sheet and Drive.
