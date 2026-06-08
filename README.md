<div align="center">
  <img src="client/frontend/public/favicon.png" width="80" alt="CherryPanel logo" />
  <h1>CherryPanel</h1>
  <p>A feature-enhanced fork of <a href="https://github.com/pufferpanel/pufferpanel">PufferPanel</a> with multi-game support, real-time player tracking, and a polished dashboard experience.</p>

  <img src="https://img.shields.io/badge/based%20on-PufferPanel-blue?style=flat-square" alt="Based on PufferPanel" />
  <img src="https://img.shields.io/badge/license-Apache%202.0-green?style=flat-square" alt="License" />
  <img src="https://img.shields.io/badge/maintained%20by-vlamz-red?style=flat-square" alt="Maintained by vlamz" />
</div>

---

## Screenshot

![CherryPanel login page](screenshots/login.png)

---

## What is CherryPanel?

CherryPanel is a fork of [PufferPanel](https://pufferpanel.com) — an open-source game server management panel — with a focus on enhanced multi-game support, real-time player visibility, and a better dashboard experience.

It uses the same Go backend as PufferPanel and adds a significantly improved Vue 3 frontend.

> **CherryPanel is a derivative work.** The original PufferPanel codebase is copyright 2025 PufferPanel, licensed under Apache 2.0. All modifications and additions are copyright 2026 Alperen (vlamz).

---

## Features added over PufferPanel

### 🎮 Multi-Game Real-time Player Count
- Live player count on every server card in the Dashboard
- Updates **instantly** when a player joins or leaves — no polling delay
- Uses WebSocket connections to the game server console
- Also fetches initial count from the query API on startup
- **Supported games / server types:**

| Server Type | Games |
|---|---|
| `minecraft` / `minecraft-java` | Minecraft Java / Bedrock, Paper, Purpur, Spigot |
| `srcds` | CS:GO, TF2, Garry's Mod, Arma 3, **Unturned**, Rust, Don't Starve Together, ARK, 7 Days to Die, Squad, Satisfactory |
| `terraria` | Terraria (TShock / Vanilla / tModLoader) |
| `factorio` | Factorio |
| `valheim` | Valheim |
| `zomboid` | Project Zomboid |
| `eco` | Eco |
| `custom` | Vintage Story |
| Generic fallback | Any game with "player joined/connected" style logs |

### 🦵 Game-Aware Kick / Ban
- Player list popup shows **Kick** and **Ban** buttons per player
- Commands are adapted per game type (e.g. `kick "Name"` for SRCDS, `/kick Name` for Terraria, `kickuser "Name"` for Zomboid)
- Kick/Ban buttons are **hidden** when not supported by the game type (e.g. Valheim)

### ▶ Dashboard Start / Stop Buttons
- Each server card has a **▶ Start** button when offline and a **■ Stop** button when online
- Located bottom-right of the card; clicking them does **not** navigate away
- Immediate visual feedback — button is disabled while action is in progress, status refreshes automatically

### 🔒 Chat Manipulation Security (Minecraft)
- Player join/leave detection is anchored to the Minecraft INFO log format
- Players **cannot spoof** join/leave events by typing fake messages in chat
- Valid Minecraft usernames only (`[a-zA-Z0-9_]{2,16}`)

### 📊 Enhanced Dashboard
- **CPU usage** normalized to total system capacity (supports multi-core correctly)
- **RAM usage** with per-server max memory from server definition
- **Performance history chart** with selectable time ranges (1h, 24h, 1w, 1mo)
- Persistent history stored in localStorage (up to 30 days)
- Server grouping with drag-free assignment per server
- Sort by status / name / player count / node

### ⚙️ Configurable Dashboard Settings
- Adjustable **refresh interval** (5s / 10s / 15s / 30s / 60s)
- Configurable **logical CPU count** (for correct CPU % normalization)
- Settings persist across page reloads via localStorage

### 🌐 Full i18n Integration
All Dashboard strings are integrated into the vue-i18n translation system (English + Turkish included).

### 🍒 CherryPanel Branding
- Cherry red as the default accent color (`#A92331`)
- Custom cherry favicon
- Ready to rebrand via PufferPanel's built-in theme settings

---

## Installation

CherryPanel uses the same installation process as PufferPanel. The only difference is that the frontend files are replaced with the CherryPanel build.

### Prerequisites
- A working [PufferPanel v3](https://docs.pufferpanel.com) installation
- Node.js 18+ (only needed if building from source)

### Option A — Replace frontend files only (recommended)

This is the easiest method. You keep PufferPanel's Go backend and only replace the frontend.

1. **Back up your current webroot:**
   ```bash
   cp -r /var/www/pufferpanel /var/www/pufferpanel-backup
   ```

2. **Clone this repository and build:**
   ```bash
   git clone https://github.com/vlamz/CherryPanel.git
   cd CherryPanel/client/frontend
   npm install
   npm run build
   ```

3. **Copy the build output to your webroot** (adjust path as needed):
   ```bash
   sudo cp dist/index.html /var/www/pufferpanel/
   sudo cp -r dist/js/ /var/www/pufferpanel/
   sudo cp -r dist/css/ /var/www/pufferpanel/
   sudo cp dist/favicon.png /var/www/pufferpanel/
   sudo cp dist/favicon.ico /var/www/pufferpanel/
   ```

4. **Reload your browser** — that's it.

> The Go backend (API, daemon, database) remains completely unchanged.
> CherryPanel is a **frontend-only** modification.

---

### Option B — Build from source

```bash
git clone https://github.com/vlamz/CherryPanel.git
cd CherryPanel/client/frontend
npm install
npm run build
# Output is in: client/frontend/dist/
```

---

## Configuration

### CPU normalization
CherryPanel shows CPU usage as a percentage of **total system capacity**. By default it assumes **12 logical CPUs** (6 cores × 2 threads).

To adjust for your server: open the Dashboard → click the **⚙ gear icon** (top right of the server list) → set the correct CPU count.

Run this on your server to find the right number:
```bash
lscpu | grep "^CPU(s):"
```

### Panel branding name
The panel title (shown in the topbar) comes from the PufferPanel backend configuration. Change it in the PufferPanel admin settings under **Settings → Branding**.

### Accent color
The default accent color is cherry red (`#A92331`). Change it per-user in **Preferences → Theme → Base Color**.

---

## Compatibility

| Component | Version |
|-----------|---------|
| PufferPanel backend | v3.x |
| Node.js (build) | 18+ |
| Browsers | All modern browsers |
| Supported game types | minecraft, srcds, terraria, factorio, valheim, zomboid, eco, custom |

---

## Project structure (relevant changes)

```
client/frontend/src/
├── views/
│   └── Dashboard.vue              # Enhanced dashboard (player counts, start/stop buttons, charts, settings)
├── components/server/
│   └── PlayerCount.vue            # Per-server player list with game-aware kick/ban
├── utils/
│   └── consolePlayerParser.js     # Multi-game console parser + getCommandTemplate()
├── lang/
│   ├── en_US/dashboard.json       # English dashboard translations
│   └── tr_TR/dashboard.json       # Turkish dashboard translations
├── themes/default/
│   └── manifest.json              # Default accent color: #A92331 (cherry red)
└── plugins/
    └── i18n.js                    # Dashboard namespace added
client/frontend/
├── index.html                     # CherryPanel title + favicon
└── public/
    ├── favicon.png                # Cherry favicon (64×64, whitespace-cropped)
    └── favicon.ico                # Cherry favicon (legacy)
screenshots/
└── login.png                      # CherryPanel login page screenshot
```

---

## Contributing

Pull requests are welcome. Open an issue first for major changes.

When contributing, try to match the style of the files you're editing. The base PufferPanel code follows its own conventions for most of the codebase.

---

## Credits

- **[PufferPanel](https://github.com/pufferpanel/pufferpanel)** — the original open-source game server panel this project is based on (Apache 2.0)
- **[vlamz](https://github.com/vlamz)** — CherryPanel modifications and additions

---

## License

CherryPanel is distributed under the **Apache License 2.0** — the same license as PufferPanel.

```
Copyright 2026 Alperen (vlamz) — CherryPanel modifications
Copyright 2025 PufferPanel — original work

Licensed under the Apache License, Version 2.0.
See the LICENSE file for the full license text.
```
