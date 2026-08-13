# chud

A weird little 8-bit goblin who lives on your desktop and works for you.
Say "hey chud" and talk. He answers out loud (OpenAI Realtime over WebRTC,
`gpt-realtime-2.1`), spins up Claude Code agents for real work, opens files,
apps and URLs, and reports back when agents finish.

## Setup

```sh
npm install
npm run get-model        # 40MB Vosk model for local wake phrase detection
echo 'OPENAI_API_KEY=sk-...' > .env
npm start
```

First launch asks for microphone access. The goblin floats above every
window and every Space. Wake phrase detection runs fully local; audio only
goes to OpenAI after "hey chud" opens a session.

## Using him

- Say "hey chud", or click him, to start a session. Click again to hang up.
- Drag him anywhere. Right click for mute / end session / quit.
- The session closes itself after `idleSeconds` of silence (default 90).
- The badge counts agent results that arrived while disconnected; he reports
  them next time you talk.

Faces: sleepy idle, ears-up listening, eyes-up thinking with dots, mouth
synced to his voice while talking, grumpy when something fails.

## What he can do

| Tool | Effect |
|---|---|
| `spawn_agent` | Runs `claude -p <task> --model <model>` in the background |
| `agent_status` / `agent_result` | Check on or read back agent output |
| `open_path` / `reveal_path` | Open in default app / reveal in Finder |
| `open_app` / `open_url` | Open a Mac app or a browser URL |
| `find_files` | Spotlight name search |

Speed tiers map to models in `config.json`: fast = haiku, standard = sonnet,
deep = fable. Agents run in `workspaceDir` (default `~`) and are killed after
`agentTimeoutMinutes`.

## Notes

- `config.json` holds the model, voice, persona, wake word aliases and agent
  settings. "chud" is not in the recognizer vocabulary, so the wake check
  matches a prefix ("hey") plus near-homophones; tune `wakeAliases` if he
  ignores you or wakes too easily.
- `claudeArgs` defaults to `--dangerously-skip-permissions`, matching the
  local shell alias. Remove it there if you want agents to run restricted.
- The OpenAI key stays in the main process; the renderer only ever sees
  short-lived ephemeral secrets.
