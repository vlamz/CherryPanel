/**
 * Shared Minecraft console player event parser.
 * Used by both PlayerCount.vue (Console tab) and Dashboard.vue.
 *
 * SECURITY: Regexes are anchored to the start of the line and require
 * the INFO log prefix so that player chat messages cannot be used to
 * spoof join/leave events (e.g. typing "]: Vlam_ joined the game").
 *
 * Valid Minecraft usernames: [a-zA-Z0-9_], 2-16 chars.
 * Chat format is always:  [time INFO]: <Name> message
 *   → name starts with '<', excluded by [a-zA-Z0-9_] group.
 * Using [^\]]* after INFO prevents skipping to a fake ]: inside chat text.
 */

const textDecoder = new TextDecoder('utf-8')

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[0-9;]*m/g

// Secure join/leave: line must start with timestamp bracket and contain INFO
// Format: [time INFO]: PlayerName action   (Paper/Purpur/Spigot)
//      or [time] [thread/INFO]: PlayerName action  (Vanilla)
const JOIN_RE = /^\[.*INFO[^\]]*\]:\s+([a-zA-Z0-9_]{2,16}) joined the game/
const QUIT_RE = /^\[.*INFO[^\]]*\]:\s+([a-zA-Z0-9_]{2,16}) (?:left the game|lost connection)/
const LIST_RE = /There are (\d+) of a max of (\d+) players online(?:: (.+))?/

export function decodeLogs(logs) {
  try {
    const b64 = Array.isArray(logs) ? logs.join('') : logs
    const bin = atob(b64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return textDecoder.decode(bytes)
  } catch {
    return ''
  }
}

export function parseConsoleLine(raw) {
  const line = raw.replace(ANSI_RE, '').replace(/\r/g, '')
  let m
  if ((m = line.match(JOIN_RE))) return { type: 'join', name: m[1] }
  if ((m = line.match(QUIT_RE))) return { type: 'leave', name: m[1] }
  if ((m = line.match(LIST_RE))) {
    return {
      type: 'list',
      max: parseInt(m[2]),
      names: m[3] ? m[3].split(',').map(s => s.trim()).filter(Boolean) : []
    }
  }
  return null
}
