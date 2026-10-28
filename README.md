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
Palitan ang `CACHE = "kashi-v3"` sa `sw.js` (hal. `kashi-v4`) para mag-refresh ang cache ng users.
