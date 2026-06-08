/**
 * Shared multi-game console player event parser.
 * Used by Dashboard.vue (real-time WebSocket) and PlayerCount.vue (Console tab).
 *
 * SECURITY (Minecraft):
 *   ALL three patterns (JOIN, QUIT, LIST) are anchored to the INFO log prefix.
 *   Player chat lines carry "<Name> …" between "]: " and the message body,
 *   so the anchor prevents spoofing join/leave/list events from chat.
 *   e.g. "<Vlam_> joined the game" or "<x> There are 5 out of maximum 20…"
 *   cannot match because the "<Name> " block sits between "]: " and the text.
 *   Valid MC usernames: [a-zA-Z0-9_] 2–16 chars; chat prefixes with '<' which is excluded.
 *
 * Other games use a "try-all-patterns" approach — Minecraft's strict security is not
 * needed there because console injection is far less of a concern on those servers.
 *
 * Supported games / server types:
 *   minecraft / minecraft-java / minecraft-bedrock  → _parseMinecraft  (strict, anchored)
 *   srcds  → Source Engine (CS:GO, TF2, GMod), Unturned, Rust, DST, 7D2D, ARK, Squad, ...
 *   terraria  → TShock / Vanilla / tModLoader
 *   factorio  → Factorio
 *   valheim   → Valheim
 *   zomboid   → Project Zomboid
 *   eco       → Eco
 *   custom    → Vintage Story (and any other custom runner)
 *   (fallback) → generic case-insensitive "joined/connected" pattern
 */

const textDecoder = new TextDecoder('utf-8')

// eslint-disable-next-line no-control-regex
const ANSI_RE    = /\x1b\[[0-9;]*m/g
// Minecraft §X colour codes (§0-§9, §a-§f, §k-§o, §r) — used by Essentials etc.
const MC_COLOR_RE = /§[0-9a-fk-orA-FK-OR]/g

// ─── Minecraft (strict, anchored) ────────────────────────────────────────────
const MC_JOIN = /^\[.*INFO[^\]]*\]:\s+([a-zA-Z0-9_]{2,16}) joined the game/
const MC_QUIT = /^\[.*INFO[^\]]*\]:\s+([a-zA-Z0-9_]{2,16}) (?:left the game|lost connection)/

// MC_LIST — ANCHORED to INFO prefix (see SECURITY note at top of file).
// Groups: 1 = current, 2 = max, 3 = player names string (may be empty).
// Supported vanilla/plugin variants:
//   "There are X of a max of Y players online: p1, p2"   ← vanilla 1.7 – 1.21
//   "There are X of a maximum of Y players online"        ← some proxy/forks
//   "There are X out of maximum Y players online."        ← Essentials / EssentialsX
//   "There are X out of a maximum of Y players online."   ← CMI, some other plugins
//   "There are currently X …" (any of the above)         ← Purpur & config variants
const MC_LIST = /^\[.*INFO[^\]]*\]:\s+There are (?:currently )?(\d+) (?:(?:out )?of (?:a |the )?max(?:imum)?(?:\s+of)?) (\d+) players online[.:]?\s*(.*)/i

function _parseMinecraft(line) {
  // Strip §X Minecraft colour codes before matching.
  // ANSI_RE (applied upstream) handles \x1b[...m sequences;
  // §X codes are a separate encoding used by Essentials and other plugins.
  const clean = line.replace(MC_COLOR_RE, '')
  let m
  if ((m = clean.match(MC_JOIN))) return { type: 'join', name: m[1] }
  if ((m = clean.match(MC_QUIT))) return { type: 'leave', name: m[1] }
  if ((m = clean.match(MC_LIST))) {
    return {
      type: 'list',
      max: parseInt(m[2]),
      names: m[3] ? m[3].split(',').map(s => s.trim()).filter(Boolean) : []
    }
  }
  return null
}

// ─── Non-Minecraft: ordered pattern list ─────────────────────────────────────
//
// Each entry: { joinRe, quitRe, joinGroup?, quitGroup? }
// joinGroup/quitGroup default to 1 (first capture group = player name).
//
// Patterns are tried in order; first match wins.

const NON_MC_PATTERNS = [
  // ── Source Engine (CS:GO, TF2, Garry's Mod, Arma 3 w/ RCON logging) ──────
  // Log line: L mm/dd/yyyy - HH:MM:SS: "Name<uid><STEAM_X:X:X><>" connected, address "ip:port"
  // Log line: L mm/dd/yyyy - HH:MM:SS: "Name<uid><STEAM_X:X:X><team>" disconnected (reason "")
  {
    joinRe: /"([^"<]+)<\d+><[A-Z_0-9:]+><[^"]*>"\s+connected,\s+address/,
    quitRe: /"([^"<]+)<\d+><[A-Z_0-9:]+><[^"]*>"\s+disconnected/,
  },

  // ── Unturned ──────────────────────────────────────────────────────────────
  // [04/01/2024 20:00:00] Player "Name" has connected
  // [04/01/2024 20:00:00] Player "Name" has disconnected
  {
    joinRe: /Player\s+"([^"]+)"\s+has\s+connected/i,
    quitRe: /Player\s+"([^"]+)"\s+has\s+disconnected/i,
  },

  // ── Rust ─────────────────────────────────────────────────────────────────
  // [JOIN] Name (76561198xxxxxxxxx)
  // [LEAVE] Name (76561198xxxxxxxxx)
  // Also older format: Name[76561198.../IP:PORT] joined [IP]
  {
    joinRe: /\[JOIN\]\s+(.+?)\s+\(/,
    quitRe: /\[LEAVE\]\s+(.+?)\s+\(/,
  },
  {
    joinRe: /^(.+?)\[\d{17}\/[^\]]+\]\s+joined\s+\[/,
    quitRe: /^(.+?)\[\d{17}\]\s+disconnecting:/,
  },

  // ── Don't Starve Together ─────────────────────────────────────────────────
  // [00:00:00]: [Join Announcement] Name
  // [00:00:00]: [Leave Announcement] Name
  {
    joinRe: /\[Join Announcement\]\s+(.+)/,
    quitRe: /\[Leave Announcement\]\s+(.+)/,
  },

  // ── ARK: Survival Evolved ─────────────────────────────────────────────────
  // 2024.01.01_00.00.00: Name joined this ARK!
  // 2024.01.01_00.00.00: Name left this ARK!
  {
    joinRe: /:\s+(.+?)\s+joined this ARK!/,
    quitRe: /:\s+(.+?)\s+left this ARK!/,
  },

  // ── 7 Days to Die ─────────────────────────────────────────────────────────
  // 2024-01-01T00:00:00 0.000 INF GMSG: Player 'Name' joined the game
  // 2024-01-01T00:00:00 0.000 INF GMSG: Player 'Name' left the game
  {
    joinRe: /GMSG:\s+Player\s+'([^']+)'\s+joined the game/,
    quitRe: /GMSG:\s+Player\s+'([^']+)'\s+left the game/,
  },

  // ── Terraria (TShock / Vanilla / tModLoader) ──────────────────────────────
  // [Server] Name has joined.
  // Name has left.
  {
    joinRe: /(?:\[Server\]\s+)?(.+?)\s+has joined\./,
    quitRe: /(.+?)\s+has left\./,
  },

  // ── Factorio ──────────────────────────────────────────────────────────────
  // 2024-01-01 00:00:00 [JOIN] Name joined the game
  // 2024-01-01 00:00:00 [LEAVE] Name left the game
  {
    joinRe: /\[JOIN\]\s+(.+?)\s+joined the game/,
    quitRe: /\[LEAVE\]\s+(.+?)\s+left the game/,
  },

  // ── Valheim ───────────────────────────────────────────────────────────────
  // 01/01/2024 00:00:00: Got character ZDOID from Name : 12345
  // (leave is tracked via ZDOID ID — name stored in join, matched on disconnect)
  {
    joinRe: /Got character ZDOID from (.+?) :/,
    quitRe: null,  // handled separately below via ZDOID tracking
  },

  // ── Project Zomboid ───────────────────────────────────────────────────────
  // [2024-01-01T00:00:00.000] PlayerConnect: Name, steamID: 12345
  // [2024-01-01T00:00:00.000] Disconnect: Name
  {
    joinRe: /PlayerConnect:\s+([^,]+),/,
    quitRe: /Disconnect:\s+(.+)/,
  },

  // ── Eco ───────────────────────────────────────────────────────────────────
  // [INFO] Name entered the world.
  // [INFO] Name has left the world.
  {
    joinRe: /\[INFO\]\s+(.+?)\s+entered the world\./,
    quitRe: /\[INFO\]\s+(.+?)\s+has left the world\./,
  },

  // ── Vintage Story (custom runner) ─────────────────────────────────────────
  // [Server Event] Player Name joined.
  // [Server Event] Player Name left.
  {
    joinRe: /\[Server Event\]\s+Player\s+(.+?)\s+joined\./,
    quitRe: /\[Server Event\]\s+Player\s+(.+?)\s+left\./,
  },

  // ── Generic fallback ──────────────────────────────────────────────────────
  // Catches "player Name connected/joined" patterns case-insensitively
  {
    joinRe: /(?:player|client)[:\s]+"?(\w[\w ]{1,30})"?\s+(?:joined|connected)/i,
    quitRe: /(?:player|client)[:\s]+"?(\w[\w ]{1,30})"?\s+(?:left|disconnected)/i,
  },
]

function _parseNonMinecraft(line) {
  for (const { joinRe, quitRe } of NON_MC_PATTERNS) {
    let m
    if (joinRe && (m = line.match(joinRe))) return { type: 'join', name: m[1].trim() }
    if (quitRe && (m = line.match(quitRe))) return { type: 'leave', name: m[1].trim() }
  }
  return null
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function decodeLogs(logs) {
  try {
    const b64 = Array.isArray(logs) ? logs.join('') : logs
    const bin = atob(b64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return textDecoder.decode(bytes)
  } catch (_) {
    return ''
  }
}

/**
 * Parse a single console line for player join/leave/list events.
 * @param {string} raw       - Raw console line (may contain ANSI codes)
 * @param {string} serverType - PufferPanel server type (e.g. 'minecraft', 'srcds', 'terraria')
 * @returns {{ type: 'join'|'leave'|'list', name?: string, max?: number, names?: string[] } | null}
 */
export function parseConsoleLine(raw, serverType = 'minecraft') {
  const line = raw.replace(ANSI_RE, '').replace(/\r/g, '')
  if (!serverType || serverType.startsWith('minecraft')) {
    return _parseMinecraft(line)
  }
  return _parseNonMinecraft(line)
}

/**
 * Returns the kick/ban console command template for a given server type.
 * Use {name} as the placeholder for the player name.
 * Returns null if kick/ban is not supported for that server type.
 *
 * @param {string} serverType
 * @returns {{ kick: string|null, ban: string|null } | null}
 */
export function getCommandTemplate(serverType) {
  if (!serverType) return null
  if (serverType.startsWith('minecraft')) return { kick: 'kick {name}',        ban: 'ban {name}' }
  if (serverType === 'terraria')          return { kick: '/kick {name}',        ban: '/ban {name}' }
  if (serverType === 'factorio')          return { kick: '/kick {name}',        ban: null }
  if (serverType === 'zomboid')           return { kick: 'kickuser "{name}"',   ban: 'banuser "{name}"' }
  if (serverType === 'eco')               return { kick: '/kick {name}',        ban: '/ban {name}' }
  if (serverType === 'custom')            return { kick: '/kick {name}',        ban: null }  // vintage-story
  if (serverType === 'valheim')           return null                                         // no console kick
  if (serverType === 'srcds')             return { kick: 'kick "{name}"',       ban: null }  // best-effort
  return { kick: 'kick {name}', ban: null }  // generic fallback
}
