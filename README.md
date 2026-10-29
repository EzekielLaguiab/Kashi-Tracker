# Kashi Tracker (PWA)

Walang build step. Static files lang — i-host sa kahit anong HTTPS static host.

## Local test
    python3 -m http.server 8000     # tapos buksan http://localhost:8000

## Ilagay sa phone (install)
1. I-upload ang buong folder sa HTTPS host (Netlify Drop, GitHub Pages, Cloudflare Pages, Vercel).
2. Buksan ang link sa phone.
   - Android / Chrome: menu ⋮ → **Install app** (o "Add to Home screen")
   - iPhone / Safari: Share → **Add to Home Screen**
3. Gumagana na offline. Naka-save ang data sa device (localStorage) — hindi nasisync sa ibang device.

## Pag nag-update ka ng code
Palitan ang `CACHE = "kashi-v4"` sa `sw.js` (hal. `kashi-v4`) para mag-refresh ang cache ng users.

## Backup / Restore
Sidebar → **Backup Data** nagda-download ng `Kashi-Backup-YYYY-MM-DD.json`.
**Restore Data** → piliin ang file. Minemerge ito sa current data (duplicates nilalaktawan), kaya safe i-restore ulit.
Tumatanggap din ng JSON na galing sa lumang Kashi export.

## Offline
Pagkatapos ng unang load online, naka-cache na lahat ng files (app, fonts, icons) at gumagana na kahit walang internet.
