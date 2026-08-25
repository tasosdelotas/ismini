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

## Requirements

- **Linux** (any distro — tested on Ubuntu, works anywhere with a shell)
- **Node.js 18+**
- **LM Studio** running with a model loaded

> Windows & macOS: not yet. The agent core is platform-agnostic (pure Node.js), but the launcher scripts, desktop integration, and sudo handling are Linux-specific for now.

## Setup

```bash
# 1. Make sure LM Studio is running with a model loaded
lms server start --port 1234   # or use the desktop app

# 2. Edit config.json to match your setup
nano config.json

# 3. Run it — starts the web UI at http://127.0.0.1:8787
./ismini        # starts the server
./ismini-web    # starts the server + opens your browser
# — custom port:
node web.js --port 9000

# Optional: desktop launcher icon (app menu + Desktop)
./install.sh              # remove it again with: ./uninstall.sh
```

The whole app is this folder — copy it anywhere (it needs only Node.js + LM Studio), and `./install.sh` points your desktop launcher at wherever it lives.

**Single-file install:** grab `ismini-installer.run` from [Releases](../../releases) — run it once and it places `~/ismini` plus the Desktop icon. Nothing else.

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
| **New chat** button | Clear the conversation (start fresh) |
| **Pause** button | Interrupt the agent mid-loop — type a suggestion to redirect it |
| `Ctrl+C` on the server | Stop ismini |

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
- **Or skip root entirely:** set `"tools.sudo": false` in `config.json` and every command runs as the normal user.

Note: even with sudo enabled, ismini still blocks system power actions (`reboot`, `shutdown`, `poweroff`) and other destructive patterns.

## Architecture

- `web.js` — Web UI server: local HTTP + SSE streaming, model auto-detection, per-turn health check (binds 127.0.0.1 only)
- `web/index.html` — Browser chat client
- `agent.js` — Core agent loop: prompt → LM Studio → tools → repeat (with streaming), context truncation, loop guards, exec safety
- `tools/web-search.js` — DuckDuckGo HTML parsing + local content fetch (parallel, 25s cap each)
- `tools/web-fetch.js` — Direct fetch + local HTML→text (no third-party readers)
- `config.json` — Configuration (model endpoint, agent, tools)
- `ismini` — Bash launcher so you can run it from any directory
- `ismini-web` — Launcher that also opens your browser

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
