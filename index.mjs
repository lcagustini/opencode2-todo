// @ts-check

import { readTodos, writeTodos } from './store.mjs'

const STATUSES = ['pending', 'in_progress', 'completed']

/** @param {{content: string, status: string, priority?: string}[]} todos */
const render = (todos) =>
  todos.map((t, i) => `${i + 1}. [${t.status}] ${t.content}${t.priority ? ` (${t.priority})` : ''}`).join('\n')

// sessionID -> the ancestor list it adopted and whose file it writes through, or false when no
// ancestor has one. Caching the negative result matters: a session with no todos would
// otherwise walk the chain on every model call just to discover it has no parent.
const adopted = new Map()

/**
 * A subagent gets its own session, so it starts with no list of its own. Adopt the nearest
 * ancestor's, and report which session owns it so a write can go back up.
 * ponytail: the depth cap is a cycle guard, and a restart costs one re-walk. Drop the cache to
 * make inheritance live (a long background subagent would then track the parent's progress).
 */
async function listFor(ctx, sessionID) {
  const own = readTodos(sessionID)
  if (own.length > 0) return { todos: own, inherited: false, owner: sessionID }
  if (adopted.has(sessionID)) {
    const entry = adopted.get(sessionID)
    return entry === false
      ? { todos: [], inherited: false, owner: sessionID }
      : { todos: entry.todos, inherited: true, owner: entry.owner }
  }

  let id = sessionID
  let list = []
  let owner = sessionID
  for (let depth = 0; depth < 8 && id; depth++) {
    const info = await ctx.session.get({ sessionID: id })
    id = info?.parentID
    if (!id) break
    list = readTodos(id)
    if (list.length > 0) {
      owner = id
      break
    }
  }

  adopted.set(sessionID, list.length > 0 ? { todos: list, owner } : false)
  return { todos: list, inherited: list.length > 0, owner }
}

/**
 * A subagent's write means "here is the status of the items I was handed", not "here is the
 * whole plan" — it is working from a snapshot and must not revert what the parent did since.
 * So match on content and patch status/priority; new items are appended, nothing is removed.
 * ponytail: read-modify-write is not locked, so two children writing in the same tick can lose
 * one update. Merge in a worker if that ever shows up.
 */
function mergeInto(ownerList, incoming) {
  const merged = ownerList.map((todo) => ({ ...todo }))
  for (const todo of incoming) {
    const hit = merged.find((item) => item.content === todo.content)
    if (!hit) merged.push(todo)
    else Object.assign(hit, todo)
  }
  return merged
}

export default {
  id: 'todowrite',
  setup: async (ctx) => {
    await ctx.tool.transform((tools) => {
      tools.add({
        name: 'todowrite',
        description:
          'Replace the session todo list. Send the whole list every call, not a diff. Keep one item per step, and only one in_progress at a time. The list shows in the TUI sidebar. In a subagent, the list is shared with the parent session: your call patches the items it handed you (matched on text, so new items are appended and nothing is removed) instead of replacing the whole list.',
        input: {
          type: 'object',
          properties: {
            todos: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  content: { type: 'string', description: 'Imperative step description' },
                  status: { type: 'string', enum: STATUSES },
                  priority: { type: 'string', enum: ['low', 'medium', 'high'] },
                },
                required: ['content', 'status'],
                additionalProperties: false,
              },
            },
          },
          required: ['todos'],
          additionalProperties: false,
        },
        execute: async (input, context) => {
          const todos = (input?.todos ?? []).map((t) => ({
            content: String(t.content),
            status: String(t.status),
            ...(t.priority ? { priority: String(t.priority) } : {}),
          }))
          const { owner } = await listFor(ctx, context.sessionID)

          if (owner !== context.sessionID) {
            if (todos.length === 0)
              return { content: 'Ignored: a subagent cannot clear the parent session list.' }
            const merged = mergeInto(readTodos(owner), todos)
            writeTodos(owner, merged)
            // Keep this session's view current, or it reasons from the pre-write snapshot.
            adopted.set(context.sessionID, { todos: merged, owner })
            return {
              content: `Updated the parent session list in place:\n${render(merged)}\nRemoving items is the parent session's call; add what you discovered.`,
            }
          }

          writeTodos(owner, todos)
          return { content: todos.length ? render(todos) : 'Todo list cleared.' }
        },
      })
    });

    // Re-inject the stored list so it survives compaction and restarts. A subagent adopts its
    // parent's list on its first call, so this works even for agents that may not call todowrite.
    await ctx.session.hook('context', async (event) => {
      const { todos, inherited } = await listFor(ctx, event.sessionID);
      if (todos.length === 0) return;
      const label = inherited
        ? 'Todo list shared with the parent session (your todowrite calls patch it in place)'
        : 'Current todo list';
      event.system.push({ type: 'text', text: `${label}:\n${render(todos)}` });
    });
  },
};
