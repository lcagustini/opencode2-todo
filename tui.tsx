// @ts-check

import { Plugin } from "@opencode/plugin/tui"
import { createSignal } from "solid-js"
import { readTodos } from "./store.mjs"

// The sidebar column is narrow, so long steps are cut rather than wrapped.
const MAX = 44
const MARK = { completed: "✓", in_progress: "▸", pending: "○" } as const

export default Plugin.define({
  id: "todowrite",
  setup(context: any) {
    // ponytail: 1s poll of a tiny JSON file. The sidebar repaints on its own plenty often, so
    // this only covers the idle case; drop it for a part-event subscription if that matters.
    const [todos, setTodos] = createSignal<any[]>([])
    let current: string | undefined
    const timer = setInterval(() => {
      if (current) setTodos(readTodos(current))
    }, 1000)

    const unregister = context.ui.slot({
      append: "sidebar.content",
      render: (props: any) => {
        current = props?.sessionID
        const list = todos().length ? todos() : readTodos(props?.sessionID ?? "")
        if (list.length === 0) return null
        const done = list.filter((todo: any) => todo.status === "completed").length
        return (
          <box flexDirection="column" paddingTop={1}>
            <text fg={context.theme.text.subdued}>{`Todos ${done}/${list.length}`}</text>
            {list.map((todo: any) => (
              <text
                fg={
                  todo.status === "completed"
                    ? context.theme.text.subdued
                    : todo.status === "in_progress"
                      ? context.theme.text.status.running
                      : context.theme.text.default
                }
              >
                {`${MARK[todo.status as keyof typeof MARK] ?? MARK.pending} ${String(todo.content).slice(0, MAX)}`}
              </text>
            ))}
          </box>
        )
      },
    })

    return () => {
      clearInterval(timer)
      unregister()
    }
  },
})
