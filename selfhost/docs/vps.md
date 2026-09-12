# 部署到自己的 VPS

本地与局域网部署见 [`../README.md`](../README.md)。这一份是把同一套服务放到自己的服务器上，让手机、路由器和任何网络下的客户端都能刷新同一个固定订阅地址。

服务仍然只服务于自己：随机 ID 相当于订阅凭据，管理页面由访问密码保护，不要把地址公开分享，也不要当作公共转换站发布。

**开放形态之所以人人独立，是因为它什么都不存**，而不是因为做了用户隔离：没有账号、没有会话、也没有可枚举的列表，每个人手上只有自己那条链接。代价是真实订阅写在链接里——页面会明确提示不要转发。需要"真实订阅不进 URL"的人，请在自己机器上跑 `lan` 形态。

## 与本地部署的区别

服务器上只跑**开放形态**（`SELFHOST_MODE=public`）：不保存任何东西，每个访问者在浏览器里拼出自己的链接，互相看不到对方的内容。想让真实订阅留在自己机器上、用固定 `/sub/<随机 ID>` 地址的人，跑本地那套（`SELFHOST_MODE=lan`，默认）即可——不存在"把别人的订阅存在公网服务器上"的第三种形态。

| | 本地（`lan`，默认） | 服务器（`public`） |
|---|---|---|
| 启动 | `docker compose up --build -d` | 同左，外加一个 nginx 站点 |
| 存档案 | 是，`/sub/<随机 ID>` 固定地址 | **否，全部 404** |
| 真实订阅 | 只在本机数据卷，不进 URL | 写在访问者自己的链接里 |
| 访问密码 | 可选 | 无意义，已忽略 |
| 限速 | 关闭 | 每 IP 管理 30/分、订阅 60/分 |

> 只想要一条条照做的操作清单，见 [上线清单](deploy-checklist.md)。

## 准备

- 一台可以访问 GitHub 与机场订阅的 VPS；
- 一个解析到该 VPS 的域名，`80` 与 `443` 可从公网直达（签发证书需要）；
- 这台机器上已有 nginx（或其它反向代理）负责 TLS；
- Docker Engine 与 Compose v2；
- 内存建议 1 GB 以上。`next build` 在 1 GB 机器上可能被 OOM 杀掉，先加交换分区，或改用下面「自动部署」里发布好的镜像。

```bash
# Docker（官方脚本）
curl -fsSL https://get.docker.com | sh

# 1 GB 机器建议先加 2 GB swap 再构建
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

## 部署

本项目不自带反向代理:服务只监听 `127.0.0.1:8787`,TLS、证书与访问控制交给这台机器上已有的 nginx。

```bash
git clone https://github.com/ZaunEkko/ekko-rules.git
cd ekko-rules/selfhost
cp .env.vps.example .env    # 至少确认 SELFHOST_MODE=public、PUBLIC_BASE_URL、WEB_BIND_HOST=127.0.0.1
chmod 600 .env
docker compose up --build -d
curl -s http://127.0.0.1:8787/api/health
```

返回 `"deploy_mode": "public"`、`"stores_profiles": false` 且 `deployment_error` 为 `null` 就说明起来了。

然后照 [`nginx/sub.example.com.conf`](../nginx/sub.example.com.conf) 加一个站点,把域名换成自己的,反代到 `127.0.0.1:8787`,用既有方式签发证书(例如 `certbot --nginx -d sub.example.com`),最后 `nginx -t && systemctl reload nginx`。

那份配置和普通反代站点只有一处结构性差异,**这一处不能省**:

```nginx
log_format sub_noquery '$remote_addr - $remote_user [$time_local] '
                       '"$request_method $uri $server_protocol" '
                       '$status $body_bytes_sent "-" "$http_user_agent"';
```

开放站的查询串里带着访客的真实机场订阅地址。用默认的 `combined` 格式,每一次订阅刷新都会把别人的凭据写进磁盘日志,日志轮转和备份会一路带着走。`sub_noquery` 只记录 `$uri`。

如果 nginx 在 Cloudflare 后面,请按示例用 `X-Forwarded-For $http_cf_connecting_ip`(**覆盖**而非追加)——应用按最右一段取客户端 IP 做限速,追加会让所有人共用 CF 节点的 IP 桶,限速形同虚设。同时注意 Cloudflare 会终止 TLS,能看到每一条订阅地址;这是开放站与普通站点的实质差别,要不要接受由你判断。

### 一套服务挂多个域名

同一个部署可以同时响应多个域名，访客从哪个域名打开，生成的链接就用哪个域名——不需要为每个域名各起一份服务。

```dotenv
PUBLIC_BASE_URL=https://sub.example.com
PUBLIC_ALT_ORIGINS=https://sub.example.net,https://convert.example.org
```

`PUBLIC_BASE_URL` 是规范域名（`/api/health` 展示、以及取不到当前 origin 时的兜底），`PUBLIC_ALT_ORIGINS` 里的域名同样被管理接口的 Host 校验接受。nginx 侧把这些域名写进同一个 `server_name`，或各写一个 vhost 反代到同一个 `127.0.0.1:8787`，证书按各自域名签发即可。

多挂一个域名的实际价值是冗余：这类站点被 DNS 污染是常态，留一个备用域名可以只改解析而不动服务。

## 防火墙

只放行 SSH 与 nginx 用的 80 / 443：

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

Docker 发布端口时会写入 `DOCKER-USER` 链，可能绕过 `ufw`。这套部署里应用端口绑定在 `127.0.0.1`，不会因为这个特性意外对外开放；**请不要把 `WEB_BIND_HOST` 改成 `0.0.0.0`**。

## 自动部署（CI / CD）

服务器不需要向 GitHub 开放任何入口，也不需要把 SSH 私钥交给 CI：**镜像由 CI 构建并推到 GHCR，服务器只负责拉。**

```text
打 tag selfhost-v1.2.3
        ↓
GitHub Actions 构建两个镜像并推送 GHCR
        ↓
VPS 上的 systemd 定时器拉取新镜像
        ↓
镜像有变化才重启容器，并确认 web 起来
```

这个方向的取舍是刻意的：GitHub 里放一把能登录服务器的 SSH 私钥，等于任何能推 main 或利用某个工作流的人都能在你的机器上执行命令。拉模式把这条路径整个去掉，代价是部署不是即时的（默认最多等 10 分钟，可手动触发）。

### 一次性设置

发布镜像（仓库侧）：打一个 `selfhost-v*` tag，或在 Actions 里手动运行 `Publish selfhost images`。tag `selfhost-v1.2.3` 会发布 `1.2.3`、`sha-<短哈希>` 与 `latest` 三个标签。首次发布后把 GHCR 上这两个包设为 public，服务器拉取就不需要任何凭据。

服务器侧：

```bash
sudo git clone https://github.com/ZaunEkko/ekko-rules.git /opt/ekko-rules
cd /opt/ekko-rules/selfhost
sudo cp .env.vps.example .env   # 按需修改
sudo chmod 600 .env

# 用发布的镜像启动，而不是在服务器上构建
sudo docker compose -f compose.yaml -f compose.ghcr.yaml pull
sudo docker compose -f compose.yaml -f compose.ghcr.yaml up -d

# 安装定时更新
sudo chmod +x scripts/vps-update.sh
sudo cp systemd/ekko-selfhost-update.* /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now ekko-selfhost-update.timer
```

`systemd/ekko-selfhost-update.service` 里的路径按仓库实际位置改；上面用的是 `/opt/ekko-rules`。

### 用起来

```bash
# 看下次什么时候检查
systemctl list-timers ekko-selfhost-update.timer

# 立刻更新一次，不等定时器
sudo systemctl start ekko-selfhost-update.service

# 看这次更新做了什么
journalctl -u ekko-selfhost-update.service -n 50
```

`scripts/vps-update.sh` 只有在镜像确实变化时才重启容器，更新后会等 web 进入 running 状态；没起来就以非零退出并打印日志，定时器的 journal 里能看到。

### 固定版本与回滚

默认跟随 `latest`。要可复现或需要回滚时，在 `.env` 里钉住版本：

```dotenv
EKKO_IMAGE_TAG=1.2.3
```

改完执行一次 `sudo systemctl start ekko-selfhost-update.service` 即可切换。回滚就是把这个值改回上一个 tag，不需要改代码或重新构建。

`EKKO_IMAGE_OWNER` 默认是 `zaunekko`，fork 后改成自己的用户名。

### 仍然要自己构建时

不想用 GHCR 就去掉 `-f compose.ghcr.yaml`，回到 `docker compose up --build -d`。

## 运维

```bash
# 状态与日志
docker compose ps
docker compose logs -f web subconverter

# 更新代码与规则快照
git pull
node scripts/sync-rulesets.mjs   # 仓库根目录规则有变化时
docker compose up --build -d

# 备份固定地址映射（含真实订阅地址，请妥善保存）
docker run --rm -v ekko-selfhost_profiles_data:/data -v "$PWD":/backup busybox \
  tar czf /backup/profiles-backup.tgz -C /data .

# 恢复
docker run --rm -v ekko-selfhost_profiles_data:/data -v "$PWD":/backup busybox \
  tar xzf /backup/profiles-backup.tgz -C /data
```

证书由这台机器上原有的 certbot 续期，与本服务无关；重建容器不影响。

开放形态不保存任何档案，`down -v` 只会删掉引擎缓存卷，没有会丢失的数据。

## 安全清单

- `/sub/<随机 ID>` 本身没有密码，随机 ID 就是凭据，只导入自己的客户端；
- 只开放 `22` / `80` / `443`，SSH 使用密钥登录；
- 定期 `docker compose ... up --build -d --pull always` 更新基础镜像；
- 服务器上的 `.env` 与备份包含真实订阅地址，权限保持 `chmod 600`；
- 不要把这个地址分享给他人当作公共转换服务。

## 常见问题

**证书申请失败**：确认域名解析已生效、`/.well-known/acme-challenge/` 在 80 端口的 vhost 里放行，再重跑 `certbot --nginx -d <域名>`。这一步与本服务无关，按这台机器原有的方式排查即可。

**页面提示“管理接口已锁定”**：`PUBLIC_BASE_URL` 带了路径、查询串或凭据。改成纯 origin（例如 `https://sub.example.com`）后重启 `web`。

**返回 429**：触发了限速。正常客户端不会达到默认阈值；确有需要时调大 `.env` 中的 `RATE_LIMIT_SUBSCRIBE_PER_MINUTE`，设为 `0` 可关闭。

**管理页面返回 403 `Request host is not part of this deployment.`**：访问用的域名和 `PUBLIC_BASE_URL` 不一致。管理接口只认这一个域名，用 IP 或旧域名直接打开会被拒绝；改用配置的域名，或同步更新 `.env` 后重启。

**开放站上线前**：先跑一次 `node scripts/verify-remote-configs.mjs`。它会以 `SELFHOST_MODE=public` 起栈，逐套验证远程配置、确认档案接口与引擎交接路由全部 404、并确认恶意配置地址被拒。

**返回 502**：上游机场订阅当时不可用或限制了 User-Agent，和本地部署表现一致，先看 `docker compose ... logs web`。

**构建时被 OOM 杀掉**：先加交换分区，或在本地构建镜像后推送到自己的镜像仓库再在 VPS 拉取。
