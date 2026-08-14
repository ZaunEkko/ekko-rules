# Ekko Rules 本地自托管订阅

在自己的电脑上用 Docker Compose 启动前端和转换引擎。输入一次真实订阅，得到可重复刷新的订阅地址。只在电脑使用时可以保持固定的 `localhost`：

```text
http://localhost:8787/sub/<随机 ID>
```

也可以让同一局域网内的手机、平板或路由器使用运行 Docker 的电脑 IP：

```text
http://192.168.1.100:8787/sub/<同一个随机 ID>
```

稳定的是 `/sub/<随机 ID>` 档案路径；前面的访问地址可以在 Web UI 中切换。普通停止、重启或 `docker compose down` 不会改变档案 ID、真实订阅映射和高级选项。

Web 端口默认像常见 Docker 服务一样发布到宿主机所有网卡，所以同一可信局域网可以直接访问；转换引擎端口仍然只存在于 Compose 内部网络。本项目不应直接暴露为公网转换服务。

## 运行要求

- Docker Desktop，或带 Compose v2 的 Docker Engine；
- 能够从 Docker 拉取基础镜像；
- 默认发布宿主机端口 `8787`，本机和同一可信局域网均可访问；可在 `.env` 中修改绑定地址和端口。

## 快速启动

Windows 首次部署推荐运行 `setup.cmd`。它会启动 Compose，并为当前 Windows 用户注册局域网 IP 登录任务：

```bash
git clone https://github.com/ZaunEkko/ekko-rules.git
cd ekko-rules/selfhost

# Windows：首次运行一次
setup.cmd

# macOS / Linux
sh ./start.sh
```

`setup.cmd` 完成后不需要每次开机再次运行。Compose 中的 Web 与转换器都使用 `restart: unless-stopped`：Docker Desktop 自动恢复容器，Windows 登录任务自动恢复局域网 IP 检测，用户仍然可以在 Docker Desktop 中可视化启动、停止和重启容器。

若启动时电脑尚未联网或暂时识别不到局域网 IP，Compose 仍会正常启动；后台检测器会等待可用网络，并在识别成功后自动刷新 Web UI 中的局域网地址。

局域网地址元数据超过 30 秒未刷新就会视为失效，避免换网或断网后继续复制旧 IP。转换期间的原始订阅只写入 Web 容器的临时内存文件系统，容器停止后不会作为 Docker 数据卷保留。

三个 Windows 入口的区别：

| 入口 | 启动 Docker | 自动识别当前 IP | 以后登录自动恢复检测 |
|---|---|---|---|
| `setup.cmd` | 是 | 是 | **是，只需首次运行一次** |
| `start.cmd` | 是 | 是 | 否，仅当前登录会话 |
| `docker compose up --build -d` | 是 | 容器无法读取 Windows 物理网卡 | 否 |

只需要基础转换、不安装宿主机助手时，可以始终直接运行：

```bash
docker compose up --build -d
```

只有需要修改端口、访问密码等设置时才复制 `.env.example`。已经位于仓库根目录且是 Windows 首次部署时：

```bash
cd selfhost
setup.cmd
```

打开 [http://127.0.0.1:8787](http://127.0.0.1:8787)：

1. 粘贴真实订阅地址；
2. 选择目标客户端，按需展开高级选项；
3. 复制固定 URL，或用手机扫描本地生成的二维码后导入客户端。Mihomo / Clash 默认生成 `clash://install-config` 二维码供系统相机唤起客户端；也可切换到“客户端内扫码”，在应用的“从 QR 码导入”入口扫描原始 URL。两条路径最终都创建同一个可更新的远程订阅。

Web 端口 `8787` 默认发布到宿主机所有网卡，与常见 Docker Web 服务一致；转换引擎的 `25500` 端口仅存在于 Compose 网络。只在本机使用时仍然打开和复制 `localhost` 地址即可。

## 手机与路由器使用局域网订阅

默认部署已经允许可信局域网访问，不需要重新配置端口。Windows 首次运行 `setup.cmd` 后，登录任务会读取当前默认物理网卡，并在开机登录及网络变化后持续更新 Web UI 中的局域网 IP。手机或路由器可以访问例如：

```text
http://192.168.1.100:8787
```

地址工具位于“本地订阅地址”列表上方。第一次点击 `使用局域网 <当前 IP>` 后，页面会记住“局域网模式”。以后电脑换到新的 Wi-Fi 或有线网络，只要宿主机助手识别到新 IP，页面就会在下一次状态刷新时自动更新所有档案的显示、复制与二维码；`本机 localhost`、`当前访问地址`、自定义前缀和曾用地址不会被自动覆盖。

下面这些环境变量都是可选的：

```dotenv
WEB_BIND_HOST=0.0.0.0
WEB_PORT=8787
LAN_BASE_URL=http://192.168.1.100:8787
ACCESS_PASSWORD=可选的本地管理密码
```

- `WEB_BIND_HOST` 默认已经是 `0.0.0.0`；只有明确希望禁止局域网访问时才改为 `127.0.0.1`。
- `LAN_BASE_URL` 仅用于预设页面显示、复制和二维码中的地址前缀，留空时使用打开 Web UI 的地址；它不参与后端授权或订阅校验。只要某个地址能访问本服务，就可以用该地址拼接同一个 `/sub/<随机 ID>`。
- `ACCESS_PASSWORD` 是可选的管理保护，设置后会保护创建、读取列表和删除操作；手机或路由器访问 `/sub/<随机 ID>` 时不需要额外请求头。

Web UI 提供：

- `本机 localhost`：只在电脑客户端使用时保持最稳定；
- `当前访问地址`：页面通过局域网 IP 打开时直接采用该 IP；
- `使用局域网 <当前 IP>`：立即切换，并在此后自动跟随宿主机探测到的新 IP；
- 自定义前缀：在家里、公司等网络切换后直接输入新的电脑 IP；
- 曾用地址：在当前浏览器保留最近 8 个前缀，一键切换所有档案的显示、复制与二维码。

Mihomo / Clash 的二维码默认使用客户端远程安装 scheme。用系统相机扫描后请选择 Mihomo / Clash 客户端打开；切换到“客户端内扫码”时，二维码内容就是同一个原始订阅 URL，应在客户端内置扫码入口扫描。弹窗会分别展示真实二维码内容与底层远程订阅地址，避免两个入口看起来相同。

换网络不会改变 `/sub/<随机 ID>`，Web UI 与二维码会在局域网模式下自动显示新 IP；但已经导入手机或路由器的旧 URL 无法跨网络自己修改主机部分。到达新网络后，请用自动更新后的二维码重新导入一次，或只修改客户端中的地址前缀。若希望完全避免修改，可在路由器中为电脑设置固定 DHCP 地址、使用可靠的局域网主机名，或使用 Tailscale 等具有稳定地址的虚拟局域网。

Docker Desktop 通常会直接完成端口发布，就像其他 Compose Web 服务一样。如果手机打不开电脑 IP，先确认两台设备位于同一局域网且 Windows 当前网络属于“专用网络”；只有仍被拦截时，才需要在系统防火墙中允许 Docker Desktop 或 TCP `8787`。不要在路由器上把该端口转发到公网。

自动识别不从浏览器或容器猜测 IP：容器只能看到 Docker 虚拟网卡，现代浏览器也不会可靠暴露本机地址。Windows 登录任务在宿主机读取实际默认路由，把结果写入忽略版本控制的 `.runtime/lan-address.json`；它不启动网络服务、不额外监听端口、不读取真实订阅，也不会把地址发送到外部。若直接运行 `docker compose up`，页面仍可通过当前访问地址或自定义前缀正常使用。

不再需要自动识别时，双击：

```text
uninstall-helper.cmd
```

它只取消 Windows 登录任务并停止当前 IP 检测器，不停止 Docker、不删除固定订阅和数据卷。之后仍可继续用 Docker Desktop 或 `docker compose up -d` 管理服务。仓库移动到新目录后，应在新目录重新运行一次 `setup.cmd`，让登录任务使用新路径。

常用管理命令：

| 操作 | 命令 | 固定地址是否保留 |
|---|---|---|
| 查看状态 | `docker compose ps` | 是 |
| 查看日志 | `docker compose logs -f web subconverter` | 是 |
| 停止服务 | `docker compose down` | 是 |
| 更新并重建 | `docker compose up --build -d` | 是 |
| 删除服务和全部本地档案 | `docker compose down -v` | **否，无法恢复** |

### 开机后 Docker 已运行，但页面没有新的局域网 IP

先确认当前 Windows 用户至少成功运行过一次 `setup.cmd`。该命令会注册名为 `Ekko Rules LAN address watcher` 的当前用户登录任务；它与 Docker 容器相互独立，因此通过 Docker Desktop 重启容器不会移除检测器。仓库被移动或登录任务被系统清理后，在当前目录重新运行一次 `setup.cmd` 即可更新任务路径。

## 固定地址怎样更新

本地 URL 是可重复请求的转换入口，不是一次性缓存文件。

```text
客户端刷新 /sub/<随机 ID>
        ↓
本地服务重新拉取真实订阅
        ↓
转换成完整配置并立即返回
```

- Docker 停止时，客户端已经导入的现有配置仍可继续使用；
- 重新启动 Docker 后，同一个本地 URL 可以再次更新；
- `docker compose down` 会保留固定地址；
- `docker compose down -v` 会删除保存地址的 Docker 数据卷。

## 输出格式

所有入口都生成带 Ekko Rules 的完整配置，而不只是孤立节点列表。

| 输出 | 常见客户端 | 文件 |
|---|---|---|
| Mihomo / Clash | Clash Verge Rev、Mihomo Party、FlClash | YAML |
| sing-box | sing-box、SFI、SFA | JSON |
| Surge 4+ | Surge for macOS / iOS | CONF |
| Quantumult X | Quantumult X | CONF |
| Loon | Loon | CONF |
| Surfboard | Surfboard | CONF |
| Quantumult | Quantumult | CONF |
| Mellow | Mellow | CONF |

输入协议由锁定的转换引擎自动识别，页面不会让用户逐个选择协议。已用合成节点验证 Mihomo 与 sing-box 输出可以保留 AnyTLS、VLESS Reality、Hysteria2 和 TUIC。其他输出仍会先识别这些输入，再按目标客户端本身的协议与字段能力过滤；转换器不能让一个客户端支持它尚未实现的协议。

## 高级选项

高级选项会随固定地址保存，每次客户端刷新同一个 URL 时继续生效：

- Emoji 国旗；
- 强制启用 UDP、TCP Fast Open 或 TLS 1.3；
- 为 Mihomo / sing-box 的 VLESS、VMess 节点强制使用 XUDP；关闭时保留订阅与转换引擎的自动判断；
- 跳过证书验证（默认关闭）；
- 节点名称排序、协议类型前缀和不支持节点过滤；
- 包含/排除节点正则和节点重命名规则；
- 拉取上游订阅时使用的自定义 User-Agent；
- 可完全关闭的自动更新；开启后可设置 1 到 168 小时的刷新间隔；
- sing-box IPv6 开关，直接控制 FakeIP、TUN IPv6 地址与 AAAA 解析。

Mihomo 输出始终使用客户端要求的新字段名，完整配置始终展开 Ekko Rules，因此这两项不再重复提供开关。“插入默认节点”依赖额外预置节点源，本项目不会替用户注入第三方节点；Mihomo 已随完整配置提供 DNS 接管与加密上游，也不沿用旧版 Subconverter Web 的模板型 DoH 按钮。

Mihomo 固定地址每次被客户端刷新时，都会在本机即时拉取真实订阅并把节点直接内联到完整配置中。生成结果不会包含真实机场订阅 URL，也不会再引用仅容器内部可达的 provider 地址；客户端拿到一个文件即可获得节点、DNS、策略组与规则。

订阅响应会通过 `Profile-Title` 和 `Content-Disposition` 同时传递用户填写的名称，避免客户端用随机 ID 命名。创建成功后页面不会清空真实订阅、名称或高级选项，用户可以直接微调后再次生成。

固定地址也会把上游返回的 `Subscription-Userinfo` 中 `upload`、`download`、`total` 和 `expire` 数字字段安全透传给客户端，用于显示已用流量、套餐容量和到期时间。刷新时会沿用非浏览器订阅客户端的 User-Agent；从 Web UI 创建时会使用目标客户端的安全默认值，避免机场把普通浏览器识别成网页访问。若机场本身没有返回这些字段，本地服务不会从节点配置中猜测或伪造套餐信息。

自动更新使用独立开关，默认关闭；更新间隔始终是正常的 `1` 到 `168` 小时数值，只有开关启用后才会生效。关闭时服务不会下发 `Profile-Update-Interval` 响应头；固定地址依然长期有效，需要更新时在客户端手动刷新即可。

## 保存什么

为了让固定 URL 跨普通重启继续有效，服务会在本机 Docker 命名卷 `profiles_data` 中保存最少映射：

- 随机 ID；
- 显示名称；
- 真实订阅地址；
- 输出格式；
- 高级选项；
- 创建时间。

不会保存生成后的配置、节点快照、转换历史或请求正文日志。页面和 `GET /api/profiles` 也不会返回真实订阅地址。

随机 ID 相当于本地订阅的访问凭据，请不要公开分享。若在 `.env` 中设置 `ACCESS_PASSWORD`，它会保护创建、读取列表和删除操作；客户端使用的 `/sub/<随机 ID>` 仍依靠随机 ID 自身访问，确保订阅客户端可以直接更新。

## 安全边界

- 真实订阅通过同源 JSON 请求体提交，不进入浏览器地址栏；
- 网关只接受 HTTP(S) 源地址，阻止环回、私网、链路本地和常见元数据地址；
- 源响应有超时与大小限制，重定向默认拒绝；
- 非 Mihomo 输出由网关先拉取，再通过短生命周期内部文件交给引擎；
- 临时订阅正文每次转换结束后立即删除；
- Web 与转换引擎以非 root 用户运行，根文件系统只读；引擎缓存使用限额内存盘；
- Web 端口默认对宿主机和可信局域网发布；可选 `ACCESS_PASSWORD` 用于保护管理操作。

这个 Compose 面向个人电脑和可信局域网使用，不应直接作为公网转换服务发布。

## 常见问题

### 固定地址返回 502 或无法刷新

先确认 Docker 正在运行：

```bash
docker compose ps
docker compose logs --tail=100 web subconverter
```

如果服务健康但仍返回 502，通常是上游订阅当时不可用、需要在机场后台重新启用，或机场限制了获取订阅所需的客户端 User-Agent。重新启用上游后直接刷新原固定地址，不需要重新创建档案。

### 客户端没有显示流量、容量或到期时间

这些信息来自上游响应的 `Subscription-Userinfo`。本地服务只安全透传 `upload`、`download`、`total` 和 `expire`；机场没有返回时无法从节点列表中可靠推算。

### 某些节点没有出现在目标配置中

输入协议会自动识别，但每种输出只能表达目标客户端实际支持的协议和字段。优先使用 Mihomo 或 sing-box 接收 AnyTLS、VLESS Reality、Hysteria2、TUIC 等现代协议；同时检查是否启用了“不支持节点过滤”、包含/排除正则或节点重命名规则。

### 另一台设备打不开 `127.0.0.1` 地址

`127.0.0.1` 永远指向当前设备自身。默认部署已经监听局域网，但手机或路由器必须把订阅前缀改成运行 Docker 的电脑 IP，例如 `http://192.168.1.100:8787`。如果仍无法打开，再检查 Wi-Fi 客户端隔离、Windows 网络类型和防火墙；不要把端口映射到公网。

## API

| 方法 | 路径 | 用途 |
|---|---|---|
| `GET` | `/api/health` | 服务与引擎状态 |
| `GET` | `/api/capabilities` | 输出格式和本地档案行为 |
| `GET` | `/api/profiles` | 列出不含源地址的本地档案 |
| `POST` | `/api/profiles` | 验证订阅并创建固定地址 |
| `DELETE` | `/api/profiles/<id>` | 删除固定地址 |
| `GET` | `/sub/<id>` | 客户端完整配置更新入口 |
| `GET` | `/sub/<id>/nodes` | 旧版 Mihomo provider 配置的兼容节点入口 |
| `GET` | `/sub/<id>?download=1` | 下载当前完整配置 |
| `POST` | `/api/convert` | 不保存档案的一次性下载入口 |

创建档案：

```json
{
  "name": "手机主力订阅",
  "subscriptionUrl": "https://example.com/sub",
  "target": "clash",
  "options": {
    "emoji": true,
    "udp": true,
    "filterUnsupported": true,
    "autoUpdate": false,
    "updateIntervalHours": 24
  }
}
```

`autoUpdate` 明确控制是否自动更新；`updateIntervalHours` 只接受 `1` 到 `168`，并且只在开关启用时使用。

## 更新规则快照

仓库规则变更后，在仓库根目录执行：

```bash
node selfhost/scripts/sync-rulesets.mjs
cd selfhost
docker compose up --build -d
```

规则文件在镜像构建时复制进去，转换请求不会临时从 GitHub 拉取规则。

## 验证

应用单测与构建：

```bash
cd selfhost/app
npm install
npm test
npm run typecheck
npm run build
```

完整 Docker 验证：

```bash
cd selfhost
node scripts/e2e-local.mjs
```

端到端脚本会验证 8 种完整输出、Mihomo 与 sing-box 的 AnyTLS 等现代协议、Emoji/UDP/筛选/重命名等高级选项、真实源地址不出现在 Mihomo 完整配置中、Mihomo 配置语法，以及固定 URL 在普通 Compose 重启后的可用性。可通过 `MIHOMO_BIN` 指定本机 Mihomo 可执行文件。

## 第三方组件

转换引擎使用 [Aethersailor/SubConverter-Extended](https://github.com/Aethersailor/SubConverter-Extended) `v1.3.0`，Docker 基础镜像固定到多架构镜像摘要；Emoji 映射同步自该版本随附规则。规则策略、分组、DNS 与完整基础配置由 Ekko Rules 的本地快照定义。
