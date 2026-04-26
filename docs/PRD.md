# Product requirements: OBS / Twitch components

**Document type:** PRD (Product Requirements Document)  
**Product:** `obs-components` — local overlay and control server for live streaming  
**Stack:** Node.js, Express, Pug, Sass, Socket.io, Streamer.bot WebSocket client  
**Status:** living document; update when features or integrations change

---

## 1. Product overview

### 1.1 Summary

A single **local web server** hosts:

1. **Overlays (components)** — full-page HTML for **OBS Browser Sources** (or similar), showing graphics that update in real time.
2. **Control panels (controllers)** — operator UI, usually embedded in a single “home” page, to configure games, trigger test alerts, run countdowns, and inspect stream state.

The product prioritizes **low ceremony**: no client build for JavaScript, **Sass and Pug** compiled on the server, and **Socket.io** for pushing state to all connected clients.

### 1.2 Goals

| Goal | Description |
|------|-------------|
| **G1** | One process (`npm start`) brings up HTTP + WebSocket; overlays and panels share the same origin for simple CORS and socket usage. |
| **G2** | Streamer workflows can use **Streamer.bot** as the hub for Twitch/YouTube events without each overlay implementing platform APIs. |
| **G3** | Overlays are **read-mostly, visually stable**, with animations and state driven by the server or clearly separated client rules. |
| **G4** | Host/operator can run everything on the **stream PC** with minimal external services (except where a feature explicitly calls the public web, e.g. leaderboards). |

### 1.3 Non-goals (current)

- **Multi-tenancy** or cloud hosting as a first-class use case; deployment is “run locally or on a LAN box you control.”
- **User accounts** and persistent login for the control panel.
- **Guaranteed** Streamer.bot connectivity; the app should degrade (e.g. static or manual control) when Streamer.bot is offline, per feature.

---

## 2. Personas and use cases

### 2.1 Stream operator (primary)

- Runs OBS (or another browser-capable capture pipeline).
- Adds Browser Sources pointing at `http://<host>:<port>/.../component.html`.
- Uses the **root index** page to drive countdown, words game, alert tests, and stream status.
- **Needs:** clear URLs, no mandatory build, stable timing for on-stream graphics.

### 2.2 Viewer (secondary, indirect)

- Sees the overlay output; does not interact with this app directly except through **chat** where the feature supports it (e.g. word game messages).

### 2.3 Developer (maintainer)

- **Needs:** consistent pattern (`service.js` + `component` + `controller` + pug + sass), discoverable event names, and minimal cross-feature coupling.

---

## 3. Functional requirements

### 3.1 Core platform

| ID | Requirement | Priority |
|----|-------------|----------|
| P-1 | The server serves **static files** (JS, public assets) and compiles **Pug to HTML** for `*.html` requests under `src/pug`. | Must |
| P-2 | The server compiles **Sass to CSS** for requests whose path maps to `src/sass/**/*.sass`. | Must |
| P-3 | **Socket.io** is available to browser clients; the server may broadcast or target events for synchronized overlay/controller state. | Must |
| P-4 | **Environment:** `PORT` overrides the default HTTP port when set. | Should |

### 3.2 Streamer.bot integration (shared)

| ID | Requirement | Priority |
|----|-------------|----------|
| SB-1 | A **single** `StreamerbotClient` instance in the server process may register listeners for Twitch/YouTube (and other) events exposed by Streamer.bot. | Must (where a feature claims Streamerbot support) |
| SB-2 | Feature services expose **`setupStreamerbotListeners(client)`** and avoid duplicating the client instance. | Should |
| SB-3 | If Streamer.bot is **unreachable**, the server **must not** crash; connection errors may be logged. Overlays that only need local UI should still work. | Must |

### 3.3 Module: screen alerts

| ID | Requirement | Priority |
|----|-------------|----------|
| SA-1 | **Toast-style alerts** for defined Twitch/YouTube event types (follow, subscription, bits, raid, YT superchat, etc.) as delivered by Streamer.bot. | Must |
| SA-2 | A **queue** and completion signaling so back-to-back events do not visually overlap incorrectly. | Should |
| SA-3 | The **controller** can **simulate** events for layout and testing without live platform traffic. | Should |

### 3.4 Module: countdown

| ID | Requirement | Priority |
|----|-------------|----------|
| CD-1 | Shared **duration** and **elapsed** state; “run” advances time; “stop/pause” halts. | Must |
| CD-2 | All connected UIs receive **state updates** in sync (e.g. `countdown.state`-style event). | Must |

### 3.5 Module: words game

| ID | Requirement | Priority |
|----|-------------|----------|
| WG-1 | Game rules, scoring, and **phases** (pre-game, in-game, post-game) are owned by the **server**; clients reflect authoritative state. | Must |
| WG-2 | **Twitch and YouTube chat** messages are ingested through Streamer.bot where configured. | Should |
| WG-3 | **Moderator/streamer** commands (e.g. start/pause) are supported per existing command design. | Should |
| WG-4 | The **component** and **controller** show synchronized timers and game status. | Must |

### 3.6 Module: stream status

| ID | Requirement | Priority |
|----|-------------|----------|
| SS-1 | **Local time and time zone** are shown in the **browser** (stream PC timezone) without requiring server time sync for basic display. | Must |
| SS-2 | The server subscribes to **selected** Streamer.bot events for **Twitch** and **YouTube** to populate live/offline, viewers, titles, and related fields as events arrive. | Should |
| SS-3 | The **controller** can show **raw payloads** for debugging and for fields not flattened into the summary UI. | Could |

### 3.7 Module: risk rank

| ID | Requirement | Priority |
|----|-------------|----------|
| RR-1 | Given a **player name**, the server fetches the **Hasbro Risk** leaderboard (paginated) and returns **rank, skill points, and leaderboard position** (or a not-found result). | Must |
| RR-2 | The control UI triggers lookup via **Socket.io**; results are broadcast to connected clients. | Should |

### 3.8 Module: telestrator

| ID | Requirement | Priority |
|----|-------------|----------|
| TS-1 | Provide dedicated **controller**, **drawer**, and **display** pages with shared line state over Socket.io. | Must |
| TS-2 | The **drawer** must emit line/stroke updates **during drawing** (incremental updates on the same stroke id), not only at stroke end. | Must |
| TS-3 | The server must treat incoming stroke updates as **upserts by stroke id** so clients receive progressive line growth for active strokes. | Must |
| TS-4 | **Clear screen** must clear canvases and remove all persisted line data so future state reflects an empty drawing set. | Must |
| TS-5 | Telestrator pages and service should provide debug-oriented console logging for line send/receive and draw input lifecycle events (`start`, `move`, `end`). | Should |

### 3.9 Module: pegs

| ID | Requirement | Priority |
|----|-------------|----------|
| PG-1 | Reserved for a **pegs** overlay/controller; current scope may be minimal. | TBD |

---

## 4. Non-functional requirements

| ID | Category | Requirement |
|----|----------|-------------|
| NFR-1 | **Performance** | Overlays should stay responsive; avoid blocking the event loop for long work (external HTTP should use async patterns). |
| NFR-2 | **Operability** | `npm start` is the default run path; one port for HTTP+Socket.io. |
| NFR-3 | **Maintainability** | New features should follow the **service + component + controller + pug + sass** layout unless there is a strong reason to diverge. |
| NFR-4 | **Dependencies** | Prefer stable, well-used libraries; lock versions in `package.json` for reproducible installs. |

---

## 5. System context

```
[ Twitch / YouTube ] --> [ Streamer.bot ] --WebSocket--> [ obs-components server ]
                                                                 |
                    [ OBS Browser Source / Browser ] <--- HTTP + Socket.io
```

- **External web:** some features (e.g. Risk leaderboard) use **HTTP** from the server to third-party sites; subject to those sites’ availability and terms.

---

## 6. Success measures (suggested)

- Operator can go **from clone to on-air overlay** in minutes (install, start, add Browser URL).
- **No build step** required for day-to-day overlay changes (Sass/Pug/JS file edits + refresh).
- **Streamer.bot** events appear in the intended overlay with acceptable latency (sub-second to a few seconds, dependent on Streamer.bot and the platform).

---

## 7. Roadmap and open items

- **Hardening:** optional config file for port, default player name, and Streamer.bot connection options.
- **Testing:** automated tests for critical `service.js` behavior (time permitting).
- **Pegs / other panels:** complete or document intended behavior when scope is defined.
- **Observability:** structured logging or a debug flag for socket and Streamerbot event volume.

---

## 8. Revision history

| Version | Date | Notes |
|--------|------|--------|
| 0.1 | 2026-04-26 | Initial PRD: overview, module requirements, NFR, context diagram. |
| 0.2 | 2026-04-26 | Added telestrator requirements for live stroke streaming, clear semantics, and debug logging. |

---

*This PRD is maintained alongside the repository; change it when you add or remove features.*
