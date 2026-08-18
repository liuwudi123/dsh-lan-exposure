# dsh-lan-exposure

把 dsh 的 Web GUI 暴露到局域网，手机 / 平板等同一 WiFi 设备可直接访问，并和电脑实时同步。

dsh 出于安全只监听 `127.0.0.1`（回环），本插件在 dsh 进程内开一个 `0.0.0.0:8080` 的反向代理，让局域网设备能访问到它。

## 安装

在 dsh 仓库根目录执行：

```bash
pnpm dsh plugin --profile web add github:liuwudi123/dsh-lan-exposure
```

## 启动

```bash
pnpm dsh web --host 127.0.0.1 --port 3080
```

看到这行说明插件已激活：

```
[dsh-lan-exposure] listening on http://0.0.0.0:8080 -> http://127.0.0.1:3080
```

## 手机访问

1. 电脑上打开命令行，执行 `ipconfig`，找到 **WLAN** 的 **IPv4 地址**（例如 `10.170.9.172`）。
2. 手机连接**同一个 WiFi**，浏览器打开 `http://<电脑IP>:8080`（例如 `http://10.170.9.172:8080`）。
3. 手机和电脑在侧边栏打开**同一个会话**，两边实时同步。

## 更新

```bash
pnpm dsh plugin --profile web add github:liuwudi123/dsh-lan-exposure
```

重新拉取最新版即可。

## 卸载

```bash
pnpm dsh plugin --profile web remove @dsh-lan-exposure/lan
```

## 配置（可选）

| 环境变量 | 默认 | 说明 |
|---|---|---|
| `DSH_LAN_PORT` | `8080` | 对外监听端口（手机访问的端口） |
| `DSH_LAN_TARGET_PORT` | `3080` | dsh 回环端口（须和 `dsh web --port` 一致） |

例如改用 18080：

```bash
DSH_LAN_PORT=18080 pnpm dsh web --host 127.0.0.1 --port 3080
```

## 常见问题

- **手机打不开**：确认同一 WiFi、防火墙放行对应端口、IP 是否变化（重新 `ipconfig` 查）。
- **改端口**：`DSH_LAN_PORT` 和 `dsh web --port` 要配套修改。
- **页面上的状态点**：绿点 = 已监听，显示当前连接设备数（按 IP 去重，一台设备开两条通道也只算一台）。

## 安全提示

默认无鉴权，仅建议在可信 WiFi 使用；如需公网访问，请套 Tailscale / cloudflared 隧道。
