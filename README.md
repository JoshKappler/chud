# chud

A weird little 8-bit goblin who lives on your desktop and works for you.
Say "hey chud" and talk. He answers out loud (OpenAI Realtime over WebRTC,
`gpt-realtime-2.1`), spins up Claude Code agents for real work, opens files,
apps and URLs, and reports back when agents finish.

## Setup

```sh
npm install
echo 'OPENAI_API_KEY=sk-...' > .env
npm start
```

First launch asks for microphone access. The goblin floats above every
window and every Space.

## Wake engines

`wakeEngine` in `config.json` picks how "hey chud" is detected:

- `"openai"` (default): an always-on Realtime transcription session with
  `keywords` biased toward "chud". Accurate on the custom word and cheap
  per hour, but it streams everything the mic hears to OpenAI, and open
  sessions roll over every 55 minutes.
- `"local"`: Vosk running on the machine; nothing leaves the box until the
  wake phrase opens a session. Needs `npm run get-model` once (40MB).
  "chud" is out of vocabulary, so it matches "hey" plus near-homophones
  (`wakeAliases`); tune that list if he ignores you or wakes too easily.

## Using him

- Say "hey chud" or just "chud", or left-tap him, to start a session.
  While he is listening, tap him again and he stops listening and answers
  right then; tap while he is answering to hang up, or say "thanks, chud"
  (he hangs up after a goodbye grunt). Punches, drags and fling catches
  never start one. The local Vosk engine keeps its own homophone lists
  (`localWakeAliases`) since it cannot spell chud.
- Turn-taking is tuned for a noisy room (`vad` in `config.json`):
  near-field noise reduction plus a loudness gate keep far voices from
  holding his ear, and he answers about half a second after your voice
  stops. Raise `threshold` if office chatter still reaches him, lower it
  if he misses your quiet speech; `silenceMs` is how long he waits before
  deciding you are done.
- Drag him anywhere; he drifts around the screen edges like flotsam.
  Fling him and he ricochets off the screen edges until the water drag
  slows him back into his drift.
- Yank him around fast and G forces take his face. His skin runs on
  real kinematics (`lib/skinphys.js`): the window's motion is
  differentiated into acceleration, jerk, snap, crackle and pop, and the
  skin lags on a base-excited spring, so a yank reaches it the frame it
  happens. It stretches up to double his breadth on a wild fling, snaps
  back with an overshoot wobble when he stops, squashes flat on hard
  reversals, and flutters under violent shaking. His ears flop with
  every swing and stream flat at speed, the mouth purses as speed
  builds, then lips flap and a black sagging gap opens on each eye's
  trailing side. The window carries a transparent
  margin so the tail always fits; only the head square catches the
  mouse.
- Right click to punch him. Hard wall bounces and held drag-bashes into a
  monitor edge hurt too, and he hits like a water balloon: the impact
  side plasters flat onto the wall and the harder the hit the flatter he
  goes, down to a smear a few pixels thick and twice his usual breadth
  before he rebounds. Twenty damage stages: bruises, cuts and blood
  through stage 9, the skin falls away patch by patch from stage 10, his
  eyes pop from their sockets at 15 and swing on their optic threads
  until only his skull is left at 20, cracked crown, gap teeth and empty
  sockets. Each hit plays a wet crunch and a preset guttural scream, four
  takes per severity band, never the same one twice in a row
  (assets/grunts, regenerate with scripts/make-grunts.js), instant and
  offline, and splats scarlet blood, bone chips and skin flakes: behind
  him for a punch, sprayed and smeared on the monitor edge for an impact,
  each smear fading on its own clock with no cap on how many pile up (a
  persistent click-through overlay per display holds them). He heals one
  stage every `healSeconds` (default 2). Alt + right click for the menu.
- The session closes itself after `idleSeconds` with no voice (default 10).
- The badge counts agent results that arrived while disconnected; he reports
  them next time you talk.

The thought bubble at his ear shows what he is doing: `?` listening, `!`
answering, `...` thinking, `~` agents working in the background, nothing
when idle. Faces: sleepy idle, ears-up listening, mouth synced to his voice
while talking, grumpy when something fails or he is beaten up.

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

- `npm run say` is a quick voice check: one spoken goblin response through
  the speakers, no mic or window needed. Pass a custom ask after `--`.

- `config.json` holds the model, voice, persona, wake engine and agent
  settings. `voiceFx` pitch-shifts and gravels everything he says locally
  (pitch 0.8 = 20% down; gravel 0 to 1); `npm run say` applies the same
  effect so you can audition changes.
- `claudeArgs` defaults to `--dangerously-skip-permissions`, matching the
  local shell alias. Remove it there if you want agents to run restricted.
- The OpenAI key stays in the main process; the renderer only ever sees
  short-lived ephemeral secrets.
