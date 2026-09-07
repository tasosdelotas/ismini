<p align="center">
  <img src="web/favicon-256.png" alt="ismini" width="96" height="96">
</p>

# ismini — Minimal Local Agent Runtime

A stripped-down local agent runtime. No gateway, no plugins, no cloud, no dependencies. Just a local agent with a minimal web UI that talks to LM Studio and runs tools on your machine.

## What it does

- Sends your messages to LM Studio (local LLM server) — **auto-detects whichever model is loaded** every turn, so you can hot-swap models mid-session and the limits adapt
- Automatically uses tools: read / write / edit / delete files, exec shell commands (with sudo), web search + fetch
- One live session per run — history lives in memory and dies with the process
- Context window enforcement (default 64k, capped to the loaded model's real context) — approximate via char/token ratios
- **Safe truncation**: the kept window is always anchored at a user message, so long sessions never send a malformed conversation (prevents chat-template 500s on some LLMs)
- Streaming output — typewriter effect as text arrives
- **Pause & Redirect** — mid-loop, hit Pause to interrupt the agent, type a suggestion, and it picks up from where it left off with your correction
- Minimal local web UI — a clean browser chat at `http://127.0.0.1:8787`: no login, no accounts, binds to localhost only
- Connection health check on every request (handles LM Studio restarts mid-session)
- Loop guards: repetition stripping, empty-output hard-stop, per-response and per-run timeouts
- Model-agnostic — works with whatever model is loaded in LM Studio (auto-detected every turn)
- Web tools fully local — DuckDuckGo HTML search + direct fetch + local HTML→text parsing (no third-party readers)
- **No vision** — point it at an image file and it declines gracefully, asking you to describe it (instead of choking on binary data)
- **📄 / 📁 File & folder pickers** — one click opens your desktop's native file or folder dialog; the chosen path lands in the chat input (nothing is opened or uploaded — just the path). Needs `zenity` (GNOME) or `kdialog` (KDE) — if neither exists, type the path instead

## Requirements

- **Linux** (any distro — tested on Ubuntu, works anywhere with a shell)
- **Node.js 18+**
- **LM Studio** running with a model loaded

> Windows & macOS: not yet. The agent core is platform-agnostic (pure Node.js), but the launcher scripts, desktop integration, and sudo handling are Linux-specific for now.

## Setup

```bash
# 1. Make sure LM Studio is running with a model loaded

# 2. Get the app — download the source zip from Releases, extract it, then install:
./install.sh      # places the app in ~/ismini + Desktop icon (undo: ./uninstall.sh)
```

**Run it** — click the ismini desktop icon.

The whole app is one folder — it needs only Node.js (https://nodejs.org/) + LM Studio, so you can also skip `./install.sh` and run it straight from wherever you extracted it by running `ismini-web` as a standalone app. `./install.sh` just gives it a canonical home (`~/ismini`) plus the Desktop icon and app-menu entry.

## Config (`config.json`)

| Field | Description | Current value |
|-------|-------------|---------------|
| `model.baseUrl` | LM Studio API URL | `http://localhost:1234/v1` |
| `model.apiKey` | API key (if auth enabled) | `""` |
| `agent.contextWindow` | Context budget in tokens (capped to the loaded model's context) | `65536` |
| `agent.maxTokens` | Max output tokens | `8192` |
| `agent.timeoutSeconds` | Overall run timeout (seconds) | `3600` |
| `agent.systemPrompt` | Base system prompt | see config.json |
| `tools.enabled` | Which tools to expose to the model | all 7 |
| `tools.sudo` | Allow `exec` to use sudo | `true` |

**No `modelId` field on purpose** — ismini asks LM Studio which model is loaded every turn and adapts (context window, max tokens, tool support). Swap models in LM Studio and ismini follows automatically.

## Memory

**No conversation persistence.** The conversation lives only in memory — **New chat** clears it, and stopping the server ends it. The model does not remember previous runs.

## Controls

| Control | What it does |
|---------|--------------|
| **sudo: ON/OFF** toggle (header) | Auto-sudo for `exec` commands. Green = ON (commands get the `sudo -n` prefix), red = OFF (runs as your normal user — a `sudo` the model writes itself is stripped or blocked, so OFF really means OFF). Saved to config.json, applies immediately — no restart |
| **New chat** button | Clear the conversation (start fresh) |
| **📄 File** button (left of the input) | Opens your desktop's native file picker — the chosen file's path is inserted into the message box. Nothing is opened or uploaded |
| **📁 Folder** button (left of the input) | Opens your desktop's native folder picker — the chosen folder's path is inserted into the message box |
| **Pause** button | Interrupt the agent mid-loop — type a suggestion to redirect it |
| `Ctrl+C` on the server | Stop ismini |

**If the 📁 button doesn't work on your machine** (no native dialog found), install one of these — or just type the path:

```bash
sudo apt install zenity      # Debian/Ubuntu/Mint
sudo dnf install zenity      # Fedora
sudo pacman -S zenity        # Arch/Manjaro
# (or kdialog instead, on any distro)
```

That's it — the web UI is intentionally minimal.

## Tools

| Tool | Description |
|------|-------------|
| `read` | Read file contents (`path`) |
| `write` | Write/overwrite a file (`path`, `content`) |
| `edit` | Find-and-replace in a file (`path`, `oldText`, `newText`) — replaces ALL occurrences (warns if >5 matches) |
| `delete` | Delete a file (`path`) |
| `exec` | Run shell commands (`command`) — sudo auto-prefixed when `tools.sudo` is true; opt out per command with `sudo: false`. Dangerous commands (reboot, rm -rf /, etc.) are blocked |
| `web_search` | Search DuckDuckGo (`query`) — top 3 results fetched locally (in parallel) with extracted text |
| `web_fetch` | Fetch and read a URL (`url`) — local HTML→text parsing; JS shells and anti-bot walls are reported honestly instead of silently failing |

## Sudo (privileged commands)

By default (`"tools.sudo": true`), `exec` auto-prefixes commands with `sudo -n`. The `-n` means "never ask for a password" — ismini runs commands from a background process with no terminal, so sudo can't prompt for one. In practice:

- **Works out of the box if the user has passwordless sudo** (a `NOPASSWD` rule in sudoers — typical on single-user machines).
- **Otherwise** the command fails with `sudo: a password is required`, and ismini tells you the fix. One-time setup:
  ```bash
  sudo visudo -f /etc/sudoers.d/ismini
  # add one line (replace <user> with your username):
  <user> ALL=(ALL) NOPASSWD: ALL
  ```
  After that, sudo commands (e.g. `sudo apt update`) just work.
- **Or skip root entirely:** set `"tools.sudo": false` in `config.json` — or click the **sudo: ON/OFF** toggle in the web UI header (same effect: saved to config.json, applies immediately) — and every command runs as the normal user.

Note: even with sudo enabled, ismini still blocks system power actions (`reboot`, `shutdown`, `poweroff`) and other destructive patterns.

## Architecture

- `web.js` — Web UI server: local HTTP + SSE streaming, model auto-detection, per-turn health check, native file-picker endpoint (zenity/kdialog) (binds 127.0.0.1 only)
- `web/index.html` — Browser chat client
- `agent.js` — Core agent loop: prompt → LM Studio → tools → repeat (with streaming), context truncation, loop guards, exec safety
- `tools/web-search.js` — DuckDuckGo HTML parsing + local content fetch (parallel, 25s cap each)
- `tools/web-fetch.js` — Direct fetch + local HTML→text (no third-party readers)
- `config.json` — Configuration (model endpoint, agent, tools)
- `ismini-web` — Launcher: starts the server (if not running) and opens your browser
- `install.sh` / `uninstall.sh` — install to `~/ismini` + Desktop icon, and remove it all again

## Why does this exist?

You want a local agent that:
- Talks to your local LLM (LM Studio)
- Can read/write files and run commands
- Has no gateway daemon, no plugins, no cloud — one small web UI, zero dependencies
- Zero npm/external package dependencies — only Node.js built-ins
- Web tools are fully local: DuckDuckGo HTML for search + direct fetch with local HTML→text parsing (no third-party readers)
  - This means web tool output depends on the target sites being reachable
  - For fully offline operation, disable web tools via config: `"tools": { "enabled": ["read", "write", "edit", "exec"] }`
- No cloud dependency — all data stays local

## Design

- One session per run: the whole conversation lives in memory (`agent.messages`) and dies with the process — no IDs, no files, nothing to clean up
- **New chat** clears it mid-run; restart the server for a fresh start
- Context window enforced on every API call — truncated window always anchored at a user message (chat-template safe)
- Model auto-detection every turn — hot-swap models in LM Studio mid-session and limits adapt
- Connection health check before every request
- Zero dependencies — only Node.js built-ins (tested on Node 22)

## Author & License

Developed by **Tasos Delotas** — [tasosdelotas@gmail.com](mailto:tasosdelotas@gmail.com)

Licensed under the [MIT License](LICENSE).
