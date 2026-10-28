# Hosting The World Engine on your own computer

Your computer runs the server instead of Render. Kronos, every Zeus and every stage display connect to it live,
exactly as they do now, and new versions install themselves.

## What you need, once

1. **Node.js 22** from [nodejs.org](https://nodejs.org) (the LTS installer).
2. **Git** from [git-scm.com](https://git-scm.com).
3. **cloudflared**, for the public link that lets Zeus on other networks join:
   - Windows: `winget install --id Cloudflare.cloudflared`
   - Mac: `brew install cloudflared`
   - No account is needed.
4. Download the code once with Git (not as a zip, so updates can arrive):
   ```bash
   git clone https://github.com/ladharimedaziz/wargames.git
   ```

## Every session

Double-click **start-world-engine.bat** (Windows) or **start-world-engine.command** (Mac) in the `wargames` folder.
Keep the window open. It prints three things:

- **On this computer**: `http://localhost:3000`, for you.
- **On the same Wi-Fi**: a `192.168…` address, fastest for anyone in the room.
- **PUBLIC LINK**: a `https://….trycloudflare.com` address that works from anywhere. Send it to every Zeus. It is
  also saved in `data/public-url.txt`. It changes each time you start the window, so send the new one each session.

If you ever lose the Kronos password, run `npm run reset-kronos -- yourNewPassword` in the wargames folder and restart. Kronos can also change it under Accounts > Set.

Accounts and passwords work as before. Without `SESSION_SECRET`, the computer makes its own secret and keeps it in
`data/`, so passwords stay the same between sessions on that computer. To pick the Kronos password, set
`KRONOS_PASSWORD` before starting (Windows: `set KRONOS_PASSWORD=…` in the window, then `node scripts\host.mjs`).

## Updates arrive on their own

Every minute the window checks GitHub for new code. When there is some, it waits until no Zeus panel is connected,
saves every committee, installs the update and restarts in a few seconds. Open pages, including stage displays,
reload themselves onto the new version. You do nothing.

If you want updates to install even while Zeus are connected, start with `UPDATE_ANYTIME=1`. To switch updates
off for a session, start with `NO_UPDATE=1`.

## Your computer and the GPU

The start window also opens Kronos in its own app window (Chrome or Edge, no tabs) with your graphics card forced on for the map.
Sign in there as Kronos. To skip it, start with `NO_APP=1`. If you open the site in a normal browser tab instead, make sure
"Use graphics acceleration when available" is on in its settings.


The server itself is light: it holds the committees and sends updates. The heavy part, drawing the map, runs in
each browser, so the stage display on your computer uses your graphics card. Committees save to `data/` on your
disk and survive restarts, which Render free does not do.

Keep the computer awake and plugged in during a session (turn off sleep), and keep the window open.
