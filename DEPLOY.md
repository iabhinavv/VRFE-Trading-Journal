# Deploy — Trading Journal by VRFE (web app)

This folder is the complete web app. Upload **everything in it** to a GitHub repo
and turn on Pages. All links are relative, so **no path changes are needed**.

## Files (all required)

```
index.html      landing page (this is the site's home)
landing.css     landing page styles
app.html        the journal app  (linked from "Open Journal")
app.css         app styles
app.js          app logic
icons/          icon16/32/48/128.png (favicon + branding)
.nojekyll       tells GitHub Pages to serve files as-is
```

## Option A — upload in the browser (easiest)

1. Create a new repo on GitHub, e.g. **`trading-journal`** (Public).
2. On the repo page click **Add file → Upload files**.
3. Drag in the **contents of this folder** (index.html, app.html, the CSS/JS,
   the `icons` folder, and `.nojekyll`) — not the folder itself.
4. **Commit changes.**
5. Go to **Settings → Pages**. Under *Build and deployment* set
   **Source: Deploy from a branch**, **Branch: `main` / `(root)`**, **Save**.
6. Wait ~1 minute. Your app is live at:
   `https://<your-username>.github.io/trading-journal/`

The home page is the landing; **Open Journal** goes to `app.html`.

## Option B — command line

```bash
cd vrfe-journal-web
git init
git add -A
git commit -m "Trading Journal by VRFE — web app"
git branch -M main
git remote add origin https://github.com/<your-username>/trading-journal.git
git push -u origin main
```

Then enable Pages as in step 5 above.

## Notes

- **Data is per-site and local** to each visitor's browser (localStorage). Great
  for a demo; each person's entries stay on their own device.
- The app loads the Inter font from Google Fonts over HTTPS; if that's ever
  blocked it falls back to the system font with no layout change.
- To link straight to the app (skip the landing), share the `/app.html` URL.
- Not uploading the extension here — `manifest.json`, `background.js`, and the
  Python build scripts are intentionally left out; they aren't used on the web.
