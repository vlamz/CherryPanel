import { AnsiUp } from 'ansi_up'

const decoder = new TextDecoder('utf-8')

const ansiup = new AnsiUp()
ansiup.ansi_to_html('[m')

function handleCarriageReturn(line) {
  if (line.indexOf('\r') !== -1) {
    const parts = line.split('\r')
    let result = parts.shift()
    parts.map(part => {
      result = part + result.substring(part.length)
    })
    return result
  }
  return line
}

function markDaemon(line, panelName) {
  if (line.trim().indexOf('[DAEMON]') === 0) {
    return `<span class="daemon-marker" data-name="${panelName}"></span>` + line.substring(8)
  }
  return line
}

// Linkify URLs in already-processed HTML — only matches bare text URLs, not inside tags/attrs
function linkify(html) {
  // Replace URLs that are NOT inside HTML tag attributes (not preceded by = or ")
  return html.replace(/(?<![="'`])(https?:\/\/[^\s<>"']+)/g, (url) => {
    // Clean trailing punctuation
    const clean = url.replace(/[.,;:!?)]+$/, '')
    const tail = url.slice(clean.length)
    return `<span class="console-link" data-href="${clean}" title="Bağlantıyı aç: ${clean}">${clean}</span>${tail}`
  })
}

function handleLine(line, panelName) {
  return linkify(markDaemon(handleCarriageReturn(line), panelName))
}

function decode(lastIncomplete, b64) {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length + lastIncomplete.length)
  for (let i = 0; i < bytes.length; i++) {
    if (i < lastIncomplete.length) {
      bytes[i] = lastIncomplete[i]
    } else {
      bytes[i] = bin.charCodeAt(i - lastIncomplete.length)
    }
  }
  let decoded = decoder.decode(bytes)
  let incomplete = new Uint8Array(0)
  if (decoded.slice(-1) === '???') {
    for (let i = 0; i < 3; i++) {
      if (decoder.decode(bytes.slice(i-3)) === '???') {
        decoded = decoded.slice(0, -1)
        incomplete = bytes.slice(i-3)
        break
      }
    }
  }
  return { decoded, incomplete }
}

let lastIncompleteLine = null
let lastIncompleteChar = new Uint8Array(0)

onmessage = function (e) {
  if (e.data.logs.length === 0) return
  const { decoded, incomplete } = decode(lastIncompleteChar, Array.isArray(e.data.logs) ? e.data.logs.join('') : e.data.logs)
  lastIncompleteChar = incomplete
  let newLines = decoded.replaceAll('\r\n', '\n')
  const endOnNewline = newLines.endsWith('\n')
  newLines = newLines.split('\n')
  if (endOnNewline) newLines.pop()

  const updates = []

  newLines.map((line, i) => {
    line = ansiup.ansi_to_html(line)
    if (lastIncompleteLine) line = lastIncompleteLine.line + line

    if (lastIncompleteLine) {
      updates.push({ op: 'update', content: handleLine(line, e.data.panelName) })
      if ((newLines.length - 1) === i && !endOnNewline) {
        lastIncompleteLine = { line }
      } else {
        lastIncompleteLine = null
      }
    } else {
      updates.push({ op: 'append', content: handleLine(line, e.data.panelName) })
      if ((newLines.length - 1) === i && !endOnNewline) {
        lastIncompleteLine = { line }
      }
    }
  })

  postMessage(updates)
}
