# dsh-lan-exposure

[![dsh plugin](https://img.shields.io/badge/dsh-plugin-blue)](https://github.com/deepseek-ai/deepseek-harness) [![MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE) [![version](https://img.shields.io/badge/version-0.1.0-lightgrey)](https://github.com/liuwudi123/dsh-lan-exposure)

Expose the [dsh](https://github.com/deepseek-ai/deepseek-harness) Web GUI to your LAN — your phone, tablet, or any same-WiFi device sees the same UI in real time.

## Why

dsh's web GUI only binds to `127.0.0.1` (the CLI explicitly rejects `0.0.0.0` for safety), so phones on the same WiFi can't reach it directly. This plugin runs an **in-process reverse proxy** inside the dsh web process:

- Listens on `0.0.0.0:8080` (configurable) and forwards to `127.0.0.1:3080`
- Rewrites `Host` and `Origin` headers to pass dsh's trust fence
- Bridges WebSocket / SSE upgrades (real-time streaming keeps working)
- Injects a `crypto.randomUUID` polyfill for phone browsers
- Shows a live connection-status badge in the bottom-right of every page
- Exposes a tiny status endpoint the badge polls
- Zero external dependencies (Node built-ins only)
- Self-cleaning lifecycle via `ctx.effect`

You get a phone that mirrors your desktop — same sessions, same streaming output — without touching dsh source.

## Install

In your dsh checkout:

```bash
# from GitHub (recommended)
pnpm dsh plugin --profile web add github:liuwudi123/dsh-lan-exposure

# local development
pnpm dsh plugin --profile web add /path/to/dsh-lan-exposure
```

Then start dsh web:

```bash
pnpm dsh web --host 127.0.0.1 --port 3080
```

You should see in the log:

```
[dsh-lan-exposure] listening on http://0.0.0.0:8080 -> http://127.0.0.1:3080
[dsh-lan-exposure] phone URL: http://<your LAN IP>:8080
```

Open the URL on your phone (same WiFi). The UI is identical; open the **same session** on both for real-time sync.

## Update

- **GitHub install**: re-run `add`, or pull the clone and re-add.
- **Local link install**: edit + restart `dsh web` — the `link:` mode picks up source changes live.

## Uninstall

```bash
pnpm dsh plugin --profile web remove @dsh-lan-exposure/lan
```

## Configuration

All via environment variables, read once on plugin load.

| Variable | Default | Description |
|---|---|---|
| `DSH_LAN_PORT` | `8080` | Port the proxy listens on (phone hits this) |
| `DSH_LAN_LISTEN_HOST` | `0.0.0.0` | Listen address |
| `DSH_LAN_TARGET_HOST` | `127.0.0.1` | dsh's loopback address |
| `DSH_LAN_TARGET_PORT` | `3080` | dsh's loopback port (must match `dsh web --port`) |

`DSH_LAN_TARGET_PORT` must match the port passed to `dsh web --port`. Change both together.

## Connection Status Badge

Every proxied page shows a small black pill in the bottom-right corner:

- **Green** — `已监听 :8080 · N 台设备`. N is the number of **unique IPs** currently connected (a single phone opening two WS channels counts as one device).
- **Red** — `未监听` or `状态获取失败`. Proxy not running or unreachable.

The badge is injected into the page and self-heals against SPA re-renders (mounted to `<html>` root, recreated by `MutationObserver`).

## Compatibility

- dsh master (Node 22+, pnpm 11+)
- dsh versions that reject `--host 0.0.0.0` (the whole reason this plugin exists)
- Tested on Windows + Chrome, iOS Safari, Android WeChat browser

## Security

This proxy has **no authentication by default** — it's intended for trusted WiFi. For cross-network access, don't expose the port directly. Put it behind:

- **Tailscale** (recommended for personal cross-network)
- **cloudflared** (public access with Cloudflare Access auth)
- A reverse proxy with basic auth — note that browsers don't send auth on WS/SSE auto-reconnect, which breaks real-time, so this is not a clean fit.

Don't expose `0.0.0.0:8080` to the public internet without a tunnel.

## How It Works

```
phone browser --HTTP/WS--> 0.0.0.0:8080 (this plugin)
                                  |
                                  |- rewrite Host/Origin -> 127.0.0.1:3080
                                  |- inject crypto.randomUUID polyfill
                                  |- inject connection-monitor script
                                  |- forward body / pipe WebSocket
                                  v
                          dsh web (127.0.0.1:3080)
                                  |
                                  |- emits session events on the mux WS
                                  v
                          phone receives the same events as desktop
```

The "real-time sync" is just two clients (desktop + phone) subscribed to the same server-side session. The plugin's only job is making the phone reachable.

## License

MIT
