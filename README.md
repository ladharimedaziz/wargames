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

**Stage Zeus.** Sign in, press **Stage display**, and move that window to the projector. Double-click it for full screen, and click it once to turn on sound effects (there is no background music). Delegates only ever see this window. On the display itself you can click a country or scroll to zoom in, which reveals its cities and roads. Clicks never zoom out (so a double-click for full screen is safe); press Esc or scroll out instead.

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
| `us helicopter strike iraq` · `russia air assault ukraine` | Gunships hit forces behind the front, or troops land behind it |
| `civil war syria 40 Free Army` | A rebel faction takes 40% of the country, with defecting troops |
| `tension 7` · `tension up` · `tension down 2` | Set world tension (the display plays the tension meter) |
| `us paratroopers afghanistan` · `us invade afghanistan` | Paratroop drop. An invasion with no land border falls back to sailing the nearest fleet in, or to an airborne drop for countries with strategic airlift |
| `us b-2 strike iran` · `us b2 moab afghanistan` · `us strike iran with 2 f-117` · `us b-52 strike iran 3` · `us b-1b iran energy` | Named US aircraft, each with its own model and run. The B-2 and F-117 are stealthy precision strikes; only the B-2 can carry the MOAB |

The bar shows what it understood before you press Enter. **Navies.** Fleets sail as a wedge of warships and carrier groups as a carrier with escorts circling it. American groups carry real names: each carrier strike group is named after its carrier (USS Gerald R. Ford, USS George Washington in Japan, and so on), and surface groups take the numbered fleet of the waters they are in (2nd, 3rd, 4th, 5th, 6th or 7th Fleet). The US country card lists them under **US Navy at sea**.

**Blockades.** **Blockade a sea** closes a strait or sea zone. **Blockade a country** (`us blockade iran 3`) sends warships to the target's coast, spreading them across its coastal waters; it works on any country with a coastline, cuts its trade harder the more of its coast is closed, and shows on every map as a red cordon crawling along the coast with the water around it glowing. A sea-zone blockade glows around the zone. **Lift blockade** ends both.

Orders wait in the queue until **Resolve turn**, unless a Zeus forces them: **Force now** in the order composer, **Now** on a queued order, or **Force all now** for the whole queue resolves them straight away without ending the turn (a nuclear launch always waits for the turn). Then the engine runs strikes, interceptions, invasions, the economy and the AI countries, and the display animates the result.

The engine writes the news and airs it on the stage straight away. Untick **Auto-air** in the News desk to review headlines before they air. Endings are suggested there too, and the Zeus decides whether to play one.

Countries start in their real-world alliances (NATO, the GCC, CSTO, the Saudi–Pakistan pact, US treaty partners and more), with real rivalries reflected in starting relations. Militaries match reality as closely as the game allows: real force sizes, plus a quality multiplier for land, air and sea, so the US Navy (eleven supercarriers, forward-deployed fleets) is in a class of its own. Economies start from real figures too: each country has its own inflation, public approval, stability, industry, energy security, reserves and growth rate, and recovers toward its own normal rather than a universal 100%.

**War fronts.** Ground is held cell by cell on a fine grid (about 30 km squares), so a front is a real, fluid line: it grows out of the shared border with salients and pockets, both sides push the same line, and a counter-attack retakes the defender's own land first. The percentage is the share of the defender's land held. Invasions from further away sweep in from the landing point. In the country card, a Zeus chooses how each front behaves: **Battle decides** (the engine), **Advance**, **Hold** or **Fall back**, and can move it right now by ±10 or ±25. Pushing an occupied country's front back liberates it.

**Drawing ground.** Under *War fronts*, **✎ Draw** opens a brush on the map: paint the ground a side takes (only inside countries it is at war with), or switch to **Give back** to hand painted ground back to its country. Pick the brush size, from XS (a single cell) to XL; strokes follow the pointer smoothly. Scroll to zoom and right-drag to pan while drawing.

**Helicopters.** A **Heli strike** sends gunships against forces just behind the front and nudges the line forward; an **Air assault** lands troops behind the enemy's lines, opening a pocket. Either can lose a helicopter to air defences. Helicopters fly from bases in a friendly neighbour, or off a carrier or assault ship offshore. US strikes use AH-64 Apaches; insertions use CH-47 Chinooks.

**Civil war.** **✊ Start a civil war** in the country card (or the command bar) splits a country: a rebel faction with its own name rises far from the capital, holds the share you chose, and takes part of the army and air force with it.

**Look of the map.** In *Stage*, **☾ Night mode** turns the map dark with glowing city lights that fade with blackouts, damage and occupation. **✈ Show strikes** has jets fly precision strikes along active fronts every few seconds, purely for the audience. A city close to enemy-held ground flickers with muzzle flashes, shell bursts and tracers, and a capital under attack gets a "Battle for…" tag. *Stage* also has the **World tension** slider (the ▲▼ arrows in the top bar do the same). Countries with landing fleets (the US, China, Russia, the UK, France, Japan and others, or anyone with a carrier) can invade across the sea; the display shows the landing craft hitting the beach.

**US reach.** The US starts with its real overseas air bases (UK, Germany, Italy, Turkey, the Gulf, Japan, Korea and more, with bomber bases in the UK and Australia), so it can bomb any country. **Airspace** only closes in wars both sides can fight in the air, and only over a country the enemy can actually reach: a war in Afghanistan leaves civilian flights alone.

**Joining wars.** Computer-run countries no longer jump into wars on their own: a request to join a friend's war lands in the **News desk** marked *Needs approval*, and the Zeus approves or declines it.

**Coat of arms.** When a country is selected or zoomed to, on any map (including a click on the stage display), its coat of arms rises out of its territory with a gold ring and a sweep of light. A few countries the source set leaves out, such as Iran and Turkey, show their flag on a shield. Turn it off or on from the Zeus panel only: **⚜ Arms** in a country card, or **⚜ Coats of arms** in *Stage*.

**Saves.** Press **Ctrl+S** anywhere in the panel, or name a save under *Saves*. Manual saves are kept until you delete them; the automatic rewind point before each turn can be switched off.

**Map detail.** Zooming in reveals towns and bases, then roads and highways between them (they stop at the edge of each city). The country in focus shows its towns and roads as soon as the camera moves in. Blackouts and outbreaks stay visible on the map with a label until Kronos ends them.

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

- **Enter** any committee with full Zeus powers, plus the **Sandbox**: tension and oil dials, any country's stats, spawn or remove forces, force wars or peace, hold chokepoints open or closed, close airspace, weather, disasters, smite, and change the clock. Sandbox powers animate on every map: each act of god has its own look (an earthquake shakes the screen with seismic rings and a seismograph, floods spread water under rain, an outbreak jumps city to city, a blackout puts the lights out, a coup closes on the capital, an oil discovery erupts), spawned forces land in a column of light, the unstoppable strike falls from the sky, storms bring lightning, and ending a war shows a ceasefire. Blackouts and outbreaks stay until Kronos ends them: per country, or all at once with **☣ End all outbreaks** and **⚡ Restore all power** under World dials.
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
