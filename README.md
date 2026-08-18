# dsh-lan-exposure

把 dsh 本地 Web GUI（默认只监听 `127.0.0.1:3080`）暴露到局域网，让手机/同网设备访问。

dsh 出于安全**故意不绑定 `0.0.0.0`**，所以跨设备访问必须靠反向代理转发到回环。本插件在 **dsh 进程内**开一个 `0.0.0.0:<port>` 的代理，把请求转发给 `127.0.0.1:3080`，并：

- 改写 `Host` / `Origin` 头，过 dsh 信任围栏；
- 转发 WebSocket / SSE 升级（GUI 实时输出靠它）；
- 给手机浏览器注入 `crypto.randomUUID` polyfill（非安全上下文下缺失）；
- 用 `ctx.effect` 注册生命周期，插件卸载自动关闭。

## 安装（作为 dsh 插件）

在 dsh 仓库根目录执行：

**从 GitHub 安装（推荐，给别人用）**

```cmd
pnpm dsh plugin --profile web add github:<你的用户名>/dsh-lan-exposure
```

**本地开发安装**

```cmd
pnpm dsh plugin --profile web add ../dsh-lan-exposure
```

装完后随 `pnpm dsh web` 自动激活，无需单独启动脚本。本地路径安装是 `link:` 模式，改插件源码后**重启 dsh web 即生效**，无需重新 add。

## 更新

- GitHub 安装：重新 `add` 一次（或 git pull 后重 add）即拉到最新版本。
- 本地安装：改代码 + 重启 dsh web 即可。

## GitHub 标签（Topics，方便被搜到）

建仓后在仓库页 **About → Topics** 添加：

```
dsh  deepseek-harness  deepseek  plugin  cordis  lan  remote  mobile  web-ui  reverse-proxy
```

别人就能通过 `dsh plugin`、`deepseek-harness plugin` 等关键词在 GitHub 搜到本项目。

## 卸载 / 关闭

```cmd
pnpm dsh plugin --profile web remove @dsh-lan-exposure/lan
```

## 配置（环境变量，加载时读取一次）

| 变量 | 默认 | 说明 |
|---|---|---|
| `DSH_LAN_PORT` | `8080` | 手机访问的监听端口 |
| `DSH_LAN_LISTEN_HOST` | `0.0.0.0` | 监听网卡 |
| `DSH_LAN_TARGET_HOST` | `127.0.0.1` | dsh 回环地址 |
| `DSH_LAN_TARGET_PORT` | `3080` | dsh 回环端口 |
| `DSH_LAN_AUTH_USER` / `DSH_LAN_AUTH_PASS` | 不设置=关 | basic-auth（浏览器对 SSE/WS 不自动带凭据，开着会挡实时通道） |

## 使用

1. `pnpm dsh web --host 127.0.0.1 --port 3080`
2. 手机浏览器打开 `http://<电脑LAN IP>:8080`
3. 左侧会话列表点开**和电脑同一个会话**，两边实时同步。

> 安全提示：该代理默认无鉴权。正式"随处可用"建议走 Tailscale / cloudflared 隧道（自带鉴权+加密），不要直接裸奔到公网。
