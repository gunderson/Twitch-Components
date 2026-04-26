# OBS / Twitch components

A local **Node.js** app that serves **browser-based overlays and control panels** for streaming. Pages are built with **Pug** templates, **Sass** styles (compiled on demand), and **Socket.io** for real-time updates. Optional integration with **Streamer.bot** (via `@streamerbot/client`) drives alerts, chat-driven games, and live stream state.

**Package name:** `obs-components` (see `package.json`).

## Requirements

- **Node.js** (LTS recommended)
- **Network:** outbound access for features that call external sites (e.g. Risk leaderboard) and, when used, a running **Streamer.bot** WebSocket

## Quick start

```bash
npm install
npm start
```

The HTTP server defaults to **port 3033** (override with the `PORT` environment variable).

- **Control panel (all controllers):** [http://localhost:3033/](http://localhost:3033/)
- **Individual overlays:** open any `*.html` URL that maps to a file under `src/pug/`, e.g.  
  - `http://localhost:3033/screen-alerts/component.html`  
  - `http://localhost:3033/words-game/component.html`  
  - `http://localhost:3033/stream-status/component.html`

## Architecture (short)

| Layer | Role |
|--------|------|
| `src/server.js` | Express + HTTP; Socket.io; compiles **Sass** → CSS for `*.css` requests; **Pug** → HTML for `*.html` requests; static assets from `src/js`, `src/public`, and `node_modules` (as `/lib`). |
| `src/js/<feature>/service.js` | Server-side state and Socket.io event names; some features also subscribe to **Streamer.bot** events. |
| `src/pug` | `component` (OBS Browser Source) vs `controller` (panel) UIs, plus `index` shell. |
| `src/sass` | Styles; requests like `/countdown/component.css` compile the matching `.sass` file. |

## Features (by module)

| Module | Purpose |
|--------|---------|
| **screen-alerts** | Alert queue and overlay animations for Twitch/YouTube events (follow, sub, bits, raid, YT superchat, etc.) via Streamerbot + test buttons from the controller. |
| **countdown** | Shared countdown timer state; controller sets duration and run/pause; component shows remaining time. |
| **words-game** | Chat word game: Twitch/YouTube chat via Streamerbot, rounds, leaderboards, timing config, controller for hosts. |
| **stream-status** | Local time/time zone on overlay; pushes Twitch/YouTube stream metadata (live, viewers, title, etc.) from selected Streamerbot events. |
| **telestrator** | Host shares screen video to drawer/display via WebRTC; drawer streams live line updates while drawing via Socket.io; clear removes all line state and clears canvases across clients. |
| **risk-rank** | Looks up a player on the Hasbro Risk online leaderboard and maps skill points to a rank name; triggered via Socket.io (`player-rank`). |
| **pegs** | Placeholder or minimal panel (see `src/pug/pegs`). |

Data and assets (word lists, scores, etc.) live under `src/data/` where applicable.

## Configuration

In `src/server.js`, the `settings` object includes (among others):

- `httpPort` — default `3033` if `PORT` is not set
- `playername` / `pageDepth` — used by the Risk rank lookup

Streamer.bot is instantiated as a `StreamerbotClient` with default options; ensure Streamer.bot is running and the WebSocket is reachable from this machine, or you will see connection errors in the console (overlays that do not need Streamer.bot still work for local time and manual controls).

## Development notes

- **No production build step** for JS: browser loads files from `src/js` as served.
- **Sass** is compiled per request; edit `.sass` under `src/sass` and refresh.
- **Pug** HTML routes: request path `foo/bar.html` → `src/pug/foo/bar.pug`.
- **Telestrator debug logging:** controller/drawer/display/server log line event send/receive and draw input lifecycle (`start`/`move`/`end`) for live troubleshooting.

## License

MIT (see `package.json`).

## Product documentation

For goals, scope, and requirements, see [docs/PRD.md](docs/PRD.md).
