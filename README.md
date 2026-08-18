# dsh-lan-exposure

**English** | [简体中文](#) · [English version →](README.en.md)

将 dsh 的 Web GUI 安全地暴露到局域网：手机、平板等同一 WiFi 下的设备可直接访问，并与电脑端实时同步。

dsh 出于安全考虑，其 Web 服务只监听 `127.0.0.1`（回环地址，拒绝 `0.0.0.0`）。本插件在 dsh 进程**内部**启动一个反向代理，监听 `0.0.0.0:8080` 并将请求转发到 dsh 的回环端口 `127.0.0.1:3080`，从而让局域网设备可以访问。

## 特性

- **进程内反向代理**：随 dsh 一起启动/停止，无需额外部署任何服务
- **实时同步**：完整支持 WebSocket / SSE 升级，聊天、状态等实时数据在手机上同样流畅
- **实时连接指示器**：页面右下角注入状态徽章，绿点表示已监听，并显示当前连接设备数（按 IP 去重）
- **内置状态接口**：`GET /api/dsh-lan-exposure/status`，返回监听端口、目标地址与当前连接列表
- **兼容手机浏览器**：自动注入 `crypto.randomUUID` polyfill，解决手机在非安全上下文（`http://<局域网IP>`）下的兼容问题
- **可选 Basic 认证**：通过环境变量开启，防止同网段他人随意访问
- **零依赖**：仅使用 Node.js 内置模块，随插件包加载，无 `node_modules` 解析问题

## 工作原理

```
手机 / 平板               电脑（运行 dsh）
─────────                ──────────────
http://<LAN IP>:8080  →  插件反向代理 (0.0.0.0:8080)
                          ↓ 重写 Host / Origin 头
                         dsh Web 服务 (127.0.0.1:3080)
```

代理会重写 `Host` 与 `Origin` 请求头，让 dsh 的信任机制放行局域网设备；同时拦截 HTML 响应，注入连接状态徽章与兼容性补丁。

## 安装

在 dsh 仓库根目录执行：

```bash
pnpm dsh plugin --profile web add github:liuwudi123/dsh-lan-exposure
```

## 启动

```bash
pnpm dsh web --host 127.0.0.1 --port 3080
```

看到以下日志说明插件已激活：

```
[dsh-lan-exposure] listening on http://0.0.0.0:8080 -> http://127.0.0.1:3080
[dsh-lan-exposure] phone URL: http://<你的LAN IP>:8080
```

## 从手机访问

1. 在电脑上打开命令行，执行 `ipconfig`，找到 **WLAN** 下的 **IPv4 地址**（例如 `10.170.9.172`）。
2. 手机连接**同一个 WiFi**，在浏览器打开 `http://<电脑IP>:8080`（例如 `http://10.170.9.172:8080`）。
3. 手机与电脑在侧边栏打开**同一个会话**，即可实时同步。

## 效果预览

![示例](images/example.png)

手机通过 `http://<电脑IP>:8080` 访问 dsh 的效果——页面右下角会显示实时连接信息（绿点 = 已监听，含当前设备数）：

![效果图](images/screenshot.png)

## 配置（可选）

所有配置通过环境变量读取（插件加载时一次性生效）：

| 环境变量 | 默认值 | 说明 |
|---|---|---|
| `DSH_LAN_ENABLED` | `true` | 是否启用插件（设为 `false` 可关闭） |
| `DSH_LAN_PORT` | `8080` | 对外监听端口（手机访问的端口） |
| `DSH_LAN_LISTEN_HOST` | `0.0.0.0` | 对外监听地址 |
| `DSH_LAN_TARGET_HOST` | `127.0.0.1` | dsh 回环监听地址 |
| `DSH_LAN_TARGET_PORT` | `3080` | dsh 回环端口（须与 `dsh web --port` 一致） |
| `DSH_LAN_AUTH_USER` | 未设置 | 开启 Basic 认证时的用户名 |
| `DSH_LAN_AUTH_PASS` | 未设置 | 开启 Basic 认证时的密码 |

> `DSH_LAN_AUTH_USER` 与 `DSH_LAN_AUTH_PASS` **两者同时设置**时认证才会生效。

### 示例：改用 18080 端口

**Bash / Linux / macOS：**

```bash
DSH_LAN_PORT=18080 pnpm dsh web --host 127.0.0.1 --port 3080
```

**PowerShell / Windows：**

```powershell
$env:DSH_LAN_PORT = "18080"; pnpm dsh web --host 127.0.0.1 --port 3080
```

### 示例：开启 Basic 认证

**Bash：**

```bash
DSH_LAN_AUTH_USER=admin DSH_LAN_AUTH_PASS=secret pnpm dsh web --host 127.0.0.1 --port 3080
```

**PowerShell：**

```powershell
$env:DSH_LAN_AUTH_USER = "admin"; $env:DSH_LAN_AUTH_PASS = "secret"; pnpm dsh web --host 127.0.0.1 --port 3080
```

开启后，手机访问时会弹出用户名 / 密码提示。

## 更新

重新拉取最新版本即可：

```bash
pnpm dsh plugin --profile web add github:liuwudi123/dsh-lan-exposure
```

## 卸载

```bash
pnpm dsh plugin --profile web remove @dsh-lan-exposure/lan
```

## 常见问题

- **手机打不开页面**：确认手机与电脑在同一 WiFi；检查防火墙是否放行对应端口；DHCP 可能让 IP 变化，重新执行 `ipconfig` 获取最新地址。
- **改了端口不生效**：`DSH_LAN_PORT`（或 `DSH_LAN_TARGET_PORT`）需要和 `dsh web --port` 配套修改，改完重启 dsh。
- **页面上的状态点**：绿点 = 已监听，显示当前连接设备数（按 IP 去重，一台设备开两条通道也只算一台）；红点 = 未监听或状态获取失败。
- **实时消息不同步**：确认是通过 WebSocket 走的代理升级通道，浏览器访问地址务必用 `http://<LAN IP>:8080` 而非 `http://127.0.0.1:8080`。
- **想完全关闭插件**：设置 `DSH_LAN_ENABLED=false` 后重启 dsh。

## 安全提示

- 默认**无鉴权**，请仅在**可信 WiFi** 下使用。
- 如需公网访问，建议套一层 **Tailscale / cloudflared** 隧道，不要直接暴露端口到公网。
- 若有同网段不可信设备，务必开启 Basic 认证（`DSH_LAN_AUTH_USER` / `DSH_LAN_AUTH_PASS`）。

## 许可

MIT
