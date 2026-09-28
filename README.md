# VehicleHub — Website (GitHub Pages)

This folder is the public website. Data still lives in your Google Sheet; the website talks to your Apps Script project as an API.

## Files

| File | Purpose |
|---|---|
| `index.html` | The whole app (same file as `Index.html` in Apps Script) |
| `manifest.webmanifest`, `icon-192.png`, `icon-512.png` | Lets phones "Add to Home screen" like an app |
| `sw.js` | Keeps a copy of the page so it opens quickly; always loads the newest version when online |

## 1. Prepare Apps Script (once)

1. Paste the latest `Code.gs`, `Matching.gs` and `Index.html` into your Apps Script project and Save.
2. **Deploy → Manage deployments → ✏️ Edit**
   - Execute as: **Me**
   - Who has access: **Anyone** ← required, otherwise the website cannot connect
   - Version: **New version** → **Deploy**
3. Copy the **Web app URL** (it ends with `/exec`).
   Test it: open `<your URL>?ping=1` — you should see `{"ok":true,"app":"VehicleHub"}`.

## 2. Put the URL into index.html

Open `index.html`, find this line near the top and paste your URL between the quotes:

```js
window.VM_API_URL = 'PASTE_YOUR_WEB_APP_URL_HERE';
```

## 3. Publish on GitHub Pages

1. Create a GitHub account → **New repository** (e.g. `vehicle-match`), **Public**.
2. **Add file → Upload files** → upload the 5 files listed above (README is optional) → **Commit changes**.
3. Repository **Settings → Pages** → Source: **Deploy from a branch** → Branch: **main** / **(root)** → **Save**.
4. After 1–2 minutes your site is live at `https://<your-username>.github.io/vehicle-match/`.

## Updating later

- Changed `index.html`? Upload the new file to the repository again (same name) → Commit. The site updates in a minute or two.
- Changed `Code.gs` / `Matching.gs`? **Deploy → Manage deployments → Edit → New version** (the URL stays the same, so the website needs no change).

## Own domain (optional)

Buy a domain (e.g. `vehiclematch.lk` or `.com`), then in **Settings → Pages → Custom domain** enter it and follow GitHub's DNS instructions (a CNAME record pointing to `<your-username>.github.io`). Tick **Enforce HTTPS**.

## Notes

- The repository is public, but it contains **no data and no passwords** — only the page. All data stays in your Google Sheet and Drive, protected by the app login.
- The old `script.google.com` link keeps working too.
