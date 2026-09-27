# opencode2-todo

A session-scoped todo list for [opencode](https://opencode.ai). Adds a `todowrite`
tool, stores one list per session as JSON, and re-injects the list into context on
every turn so it survives compaction and restarts.

## Install

```sh
git clone git@github.com:lcagustini/opencode2-todo.git
```

Add the clone to the `plugin` array in `~/.config/opencode/opencode.jsonc`:

```jsonc
{
  "plugin": ["./opencode2-todo"]
}
```

A relative path resolves against the config file's directory. Restart opencode.

Optionally allow the tool up front — useful if you have a `deny` rule for `*`:

```jsonc
"permissions": [{ "action": "todowrite", "resource": "*", "effect": "allow" }]
```

## Use

`todowrite` **replaces** the whole list, so send every item each call — not a diff.
A subagent's call patches the list it was handed instead: items are matched on
`content`, new ones are appended, and nothing is removed.

The updated list is returned as the tool result *and* posted to the chat as a
synthetic message labelled **Todo list**, so the plan is visible in the
transcript without expanding the tool block. A synthetic message is a
user-role line in the context too; `resume: false` keeps it from spending a
turn. A subagent's write posts to the parent session, which is where the
merged list lives.

```jsonc
{ "todos": [{ "content": "Reproduce the bug", "status": "in_progress", "priority": "high" }] }
```

`status` is `pending` / `in_progress` / `completed`; `priority` is `low` / `medium` /
`high`. Keeping one item `in_progress` at a time is convention only, not enforced.

## Subagents

A subagent starts with no list of its own, so on its first `todowrite` it adopts
the nearest ancestor's list and writes back through the session that owns it. A
subagent therefore reports status on the items it was handed instead of declaring
the whole plan. Clearing the list is the owning session's call — a subagent asking
for that is ignored.

Inheritance walks at most 8 ancestors (a cycle guard) and caches the result, so a
long-running subagent keeps working from the snapshot it started with rather than
tracking the parent live.

## The `explore` agent cannot use this

`explore` is built into opencode with a hardcoded tool allowlist — `read`, `grep`,
`glob`, `webfetch`, `websearch` — that is not config-driven, so a plugin-added tool
cannot join it and every call fails with:

```
No tool named "todowrite" is currently available.
```

This is availability, not permission: `explore` already resolves `todowrite` as
`allow`, and adding it to `agent.explore.tools` in the config has no effect (verified
against a fresh server). `explore` is the only built-in agent with a hardcoded
allowlist — `build` works, and `plan` denies only `edit` — so use `general` for any
work that needs to update the list.

## Where the data lives

One file per session, overwritten whole:

```
${XDG_DATA_HOME:-~/.local/share}/opencode/todo/<sessionID>.json
```

Deleting a file drops that session's list. Nothing else is written anywhere.

## `tui.tsx` is not wired up

The file is a sidebar pane for the TUI, exported as `./tui`. It is **not** listed in
the `plugin` array and cannot be: it imports `solid-js`, which is not a dependency
of this package. The tool and the store both work; there is simply no sidebar
rendering the list yet. It needs `solid-js` installed and TSX transform support in
the plugin loader before it will load.
