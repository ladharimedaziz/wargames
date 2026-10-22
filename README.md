# The World Engine

A live crisis-simulation website for MUN. Four committees run at once. Each committee has two Zeus accounts: the **Stage Zeus** projects the stage display, and the **Back Room Zeus** works the panel. **Kronos** oversees everything and can step into any committee at any time.

Every change shows up instantly on every screen of that committee. The server holds the real state, so no data lives in the browsers.

## Put it online (Render, free)

1. Push this folder to a GitHub repository.
2. On [render.com](https://render.com), choose **New → Blueprint** and pick the repository. Render reads `render.yaml` and creates the service.
3. When Render asks for `KRONOS_PASSWORD`, type the password you want for Kronos. You can also leave it empty and use the generated one.
4. Wait for the first deploy, then open the logs. On start, the server prints every account and its password.

Kronos can also see every password at any time: sign in as Kronos and open **Accounts**.

> **Render free sleeps and forgets.** A free service sleeps after 15 minutes without visitors, and its disk is wiped on every restart or deploy.
> - Open panels ping the server every 4 minutes, so it stays awake while you run a session.
> - Every Zeus browser keeps a copy of its committee. If the server comes back with an older world, the panel offers to restore it.
> - Before a session, open the site once to wake it (the first load can take about 30 seconds).
> - Use **Saves → Download save** on a panel to keep a file copy. **Load save file** puts it back.
> - Do not deploy during a session. A deploy restarts the server.
>
> For a disk that survives restarts, move to a paid Render plan, add a persistent disk mounted at `/opt/render/project/src/data`, and keep `DATA_DIR` pointing there.

## Accounts

| Account | Who | Can do |
|---|---|---|
| `kronos` | Director of Simulations | Everything, in every committee, plus the sandbox |
| `ww3-stage`, `ww3-backroom` | WW3 Crisis Zeus pair | Run WW3 |
| `bravo-stage`, `bravo-backroom` | Committee Bravo Zeus pair | Run Bravo |
| `charlie-stage`, `charlie-backroom` | Court of Justice Zeus pair | Run the court |
| `delta-stage`, `delta-backroom` | Committee Delta Zeus pair | Run Delta |

Passwords are made from `SESSION_SECRET`, so they stay the same across restarts while that secret is unchanged. If Kronos gives an account a new password, that change is stored on disk, and on Render free it reverts to the original after a restart.

Kronos can rename committees, reset any committee as a world or court committee, and kick any account.

## Running a committee

**Stage Zeus.** Sign in, press **Stage display**, and move that window to the projector. Double-click it for full screen, and click it once to turn on sound effects (there is no background music). Delegates only ever see this window. On the display itself you can click a country or scroll to zoom in, which reveals its major cities; press Esc to zoom back out.

**Back Room Zeus.** The chair tells you what a delegate decided. Type it into the command bar at the bottom of the map, the way the chair said it:

| Type | Does |
|---|---|
| `russia strike ukraine 3 bombers energy escort 2` | Air strike with chosen units, target type and fighter escort. Bombers fly a carpet-bombing run, fighters a precision strike, missiles a salvo; military strikes hit bases and the front, industry and energy strikes hit major cities, capital strikes hit the capital |
| `iran blockade hormuz 2` | Blockade a sea zone with two fleets |
| `us sail to south china sea carrier` | Move a carrier group |
| `china invade taiwan 3` | Send three army groups (needs a land border, or a fleet offshore for a naval landing) |
| `us evacuate sudan` | Evacuate citizens from a crisis zone (NEO), for countries with the airlift or ships to do it |
| `uk sanction russia` · `us lift sanctions iran` | Economic pressure |
| `saudi aid yemen 20` · `us arms ukraine fighter` | Money and arms transfers |
| `israel cyber iran radar` · `uk spy russia sabotage` | Covert operations |
| `egypt ceasefire israel` · `russia peace ukraine $50` | Diplomacy, including peace with reparations |
| `france roe forward` · `india alert` | Posture and nuclear alert |
| `timer 5:00 Unmoderated caucus` | Labelled countdown on the display |
| `news Oil tankers turn back` · `breaking Embassy stormed` | Queue a headline, or air one now |
| `player saudi uae qatar` · `ai russia` | Hand countries to delegates or to the computer |
| `bloc A usa uk` · `focus iran` · `resolve` | Blocs, zoom the display, resolve the turn |

The bar shows what it understood before you press Enter. Orders wait in the queue until **Resolve turn**. Then the engine runs strikes, interceptions, invasions, the economy and the AI countries, and the display animates the result.

The engine writes the news. Headlines wait in the **News desk** until a Zeus airs them, unless auto-air is on. Endings are suggested there too, and the Zeus decides whether to play one.

Countries start in their real-world alliances (NATO, the GCC, CSTO, the Saudi–Pakistan pact, US treaty partners and more), with real rivalries reflected in starting relations. Militaries match reality as closely as the game allows: real force sizes, plus a quality multiplier for land, air and sea, so the US Navy (eleven supercarriers, forward-deployed fleets) is in a class of its own. Economies start from real figures too: each country has its own inflation, public approval, stability, industry, energy security, reserves and growth rate, and recovers toward its own normal rather than a universal 100%.

**War fronts.** When neighbours are at war their shared border glows with shelling, and once ground is taken the real border bends: the attacker's territory grows out of the border, unevenly, with salients and pockets, and the percentage is the share of the defender's land held. Invasions from further away sweep in from the landing point. In the country card, a Zeus chooses how each front behaves: **Battle decides** (the engine), **Advance**, **Hold** or **Fall back**, and can move it right now by ±10 or ±25. Pushing an occupied country's front back liberates it. Countries with landing fleets (the US, China, Russia, the UK, France, Japan and others, or anyone with a carrier) can invade across the sea; the display shows the landing craft hitting the beach.

Nuclear weapons only work at tension 10. The nuclear ending is a quiet black screen, with nothing graphic.

### Stage scenes

**Disguise** (the dull "Global Fisheries Summit" cover story) → **Reveal** (glitches into WORLD WAR III) → **Intro** (globe and stakes) → **Live map**. Also **Polls**, **Relations web**, **UN vote**, **Treaty**, **Report** (charts and awards), **Endings**, and **Standby**. The display can show English, Arabic, or both.

### Court of Justice

The court panel runs phases, seats, a speaking queue, a speech clock, objections, evidence, the scales and the verdict. Keyboard shortcuts:

| Key | Does |
|---|---|
| `1`–`9` | Give the floor to that seat |
| `N` | Next in the queue |
| `Space` | Pause or resume the speech clock |
| `O` then `1`–`9` | Objection from the other side, then pick the grounds |
| `S` / `R` | Sustained / overruled |
| `G` | Gavel |
| `X` | Clear the floor |
| `←` `→` | Previous / next phase |

## Kronos

Kronos's home shows every committee live. From there Kronos can:

- **Enter** any committee with full Zeus powers, plus the **Sandbox**: tension and oil dials, any country's stats, spawn or remove forces, force wars or peace, hold chokepoints open or closed, close airspace, weather, disasters, smite, and change the clock.
- **Eye**: shows the small "KRONOS IS WATCHING..." eye on every screen of that committee.
- **Freeze**: locks the Zeus panels.
- **Pause every stage display** (for prayer, with a timer) and **Broadcast** a message to every Zeus and display.
- Read and answer every Zeus message. Each Zeus pair messages Kronos under its committee name.
- Save points, rewind, download, and restore for every committee.
- **Reset every committee** at once. Each committee keeps its name and type, and gets a "Before reset" save point first.

## Running it on a computer

```bash
npm install
npm start          # http://localhost:3000
npm test           # engine, command bar and account tests
npm run test:e2e   # browser smoke test (needs Playwright's Chromium, or set CHROMIUM_PATH)
```

Settings, all optional when running on a computer: `PORT`, `SESSION_SECRET`, `KRONOS_PASSWORD`, `DATA_DIR`.

## Notes

- The map data comes from Natural Earth through `world-atlas`. Country figures are rounded approximations for gameplay, not official statistics.
- The simulation never portrays current heads of state. Countries act as states.
