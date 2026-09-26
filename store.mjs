// @ts-check

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

// Shared between the server plugin (writes) and the TUI plugin (reads): plugin storage is
// server-scoped and the TUI cannot see it.
const DIR = join(process.env.XDG_DATA_HOME ?? join(homedir(), '.local', 'share'), 'opencode', 'todo')

/** @param {string} sessionID */
export const todoPath = (sessionID) => join(DIR, `${sessionID}.json`)

/** @param {string} sessionID @param {{content: string, status: string, priority?: string}[]} todos */
export function writeTodos(sessionID, todos) {
  mkdirSync(DIR, { recursive: true })
  writeFileSync(todoPath(sessionID), JSON.stringify(todos))
}

/** @param {string} sessionID */
export function readTodos(sessionID) {
  try {
    const parsed = JSON.parse(readFileSync(todoPath(sessionID), 'utf8'))
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}
