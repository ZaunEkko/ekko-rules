# 上线清单

部署开放转换站的逐条操作。通用说明见 [vps.md](vps.md)，这里只列要做的动作。

把 `sub.example.com` 换成你的域名，`/opt/ekko-rules` 换成实际克隆位置。

## 1. DNS

- `sub.example.com` 的 A 记录指向服务器 IP（有 IPv6 就加 AAAA）
- 先确认解析生效，再签证书：`dig +short sub.example.com`

在 Cloudflare 后面时，橙云可以保留——本项目的 nginx 示例已经按 `CF-Connecting-IP`
取真实访客 IP。但要知道 Cloudflare 会终止 TLS，因而能看到每一条订阅地址；不接受
这一点就改灰云（DNS only）。

## 2. 发布镜像（在仓库侧做一次）

```bash
git tag selfhost-v0.1.0
git push origin selfhost-v0.1.0
```

Actions 里的 `Publish selfhost images` 会构建两个镜像并推到 GHCR。首次发布后到
GitHub 的 Packages 页面把这两个包设为 **public**，服务器拉取才不需要凭据：

- `ekko-rules-selfhost-web`
- `ekko-rules-selfhost-subconverter`

不想用 GHCR 就跳过这一步，第 3 步改用 `docker compose up --build -d`。

## 3. 服务器

```bash
sudo git clone https://github.com/ZaunEkko/ekko-rules.git /opt/ekko-rules
cd /opt/ekko-rules/selfhost
sudo cp .env.vps.example .env
sudo chmod 600 .env
```

编辑 `.env`，至少确认这四项：

```dotenv
SELFHOST_MODE=public
WEB_BIND_HOST=127.0.0.1
PUBLIC_BASE_URL=https://sub.example.com
EKKO_IMAGE_TAG=0.1.0
```

`SELFHOST_MODE` 必须显式写上——`vps-update.sh` 会拒绝没有声明形态的 `.env`，
因为静默落回 `lan` 意味着开始把访问者的订阅存在公网机器上。

启动：

```bash
sudo docker compose -f compose.yaml -f compose.ghcr.yaml pull
sudo docker compose -f compose.yaml -f compose.ghcr.yaml up -d
curl -s http://127.0.0.1:8787/api/health
```

`"deploy_mode":"public"`、`"stores_profiles":false`、`deployment_error` 为 `null`
就算起来了。

## 4. nginx 与证书

照 [`../nginx/sub.example.com.conf`](../nginx/sub.example.com.conf) 建站点，改掉
域名，反代到 `127.0.0.1:8787`。**`log_format sub_noquery` 那段不能省**：默认的
`combined` 会把访客的订阅地址写进磁盘日志。

```bash
sudo cp /opt/ekko-rules/selfhost/nginx/sub.example.com.conf /etc/nginx/sites-available/sub.example.com
sudo sed -i 's/sub\.example\.com/sub.你的域名/g' /etc/nginx/sites-available/sub.example.com
sudo ln -s /etc/nginx/sites-available/sub.example.com /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d sub.你的域名
sudo nginx -t && sudo systemctl reload nginx
```

## 5. 自动更新

```bash
sudo cp /opt/ekko-rules/selfhost/systemd/ekko-selfhost-update.* /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now ekko-selfhost-update.timer
systemctl list-timers ekko-selfhost-update.timer
```

`.service` 里的 `WorkingDirectory` 和 `ExecStart` 按实际路径改。

## 6. 上线前跑一次预检

```bash
cd /opt/ekko-rules/selfhost
node scripts/verify-remote-configs.mjs
```

它会以公开形态起栈，逐套验证远程配置、用一套第三方配置验证 8 种客户端格式、
确认档案接口与引擎交接路由全部 404、再确认恶意配置地址被拒。

## 7. 线上确认

```bash
curl -s https://sub.你的域名/api/health | head -c 400
curl -s https://sub.你的域名/robots.txt
curl -sI https://sub.你的域名/ | grep -i "content-security-policy\|x-frame-options"
```

浏览器打开一遍，粘贴一个真实订阅，确认链接当场拼出、一键导入能唤起客户端、
计数在跳。

## 8. 收尾

- 访问日志确认不含查询串：`sudo tail -5 /var/log/nginx/sub.你的域名.access.log`
- 防火墙只放行 22 / 80 / 443
- README 里的演示动图待补录（当前是一处 HTML 注释占位）
