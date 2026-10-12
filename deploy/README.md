# 在线版部署与维护

本项目支持本机 stdio 和带预发个人令牌的 Streamable HTTP 两种模式。不是 OAuth 授权服务器，客户端需支持自定义 Authorization 请求头。

当前部署使用独立 Node.js 24.16.0 运行时、systemd DynamicUser、只读文件系统及网络仅限回环。Nginx 仅在现有 tools.mapleai.top HTTPS 站点增加精确路径 `/safety-mcp`，转发至 `127.0.0.1:4318`。没有新增公网监听端口。首页及其他配置保留。

## 管理位置

- 代码：`/opt/company-safety-mcp/app`
- 专用 Node：`/opt/company-safety-mcp/node`
- 服务：`company-safety-mcp.service`
- 令牌摘要：`/etc/company-safety-mcp/tokens.json`（root 600）
- 原站点配置备份：`/home/ubuntu/.local/state/company-safety-mcp-20261012/nginx-before.conf`

`tokens.json` 是数组，每项包含 `id`、`sha256`、`enabled` 和 ISO 8601 `expiresAt`。摘要为 32 字节随机令牌的 SHA-256；不存原始令牌。更改后执行 `sudo systemctl restart company-safety-mcp`，systemd 会重新载入凭据文件。禁用用户设 `enabled:false`；换发时生成新随机令牌并替换对应摘要。原始令牌与个人接入配置应由负责人离线保管、单独发放，不能放进 Git、网站目录或日志。

## 检查与停止

```bash
sudo systemctl status company-safety-mcp
curl -I https://tools.mapleai.top/safety-mcp # 未认证应返回 401
sudo systemctl restart company-safety-mcp
sudo systemctl disable --now company-safety-mcp
```

暂停服务后 MCP 路径会返回网关错误，导航首页不受影响。移除代理路由时先对比当前站点配置，避免用旧备份覆盖之后的无关更新。

## 初次安装脚本

`install.sh` 是当前个人服务器首次部署记录，需要预先上传 `app.tar.gz`、令牌摘要和脚本到它指定的状态目录，并要求 sudo、Nginx 站点与证书已存在。不是任意服务器通用一键安装器，不可重复运行。下载 Node 后验证官方 SHA-256，安装失败会停用服务并恢复原站点配置。更新应单独备份和测试，不运行初次安装脚本。

## 数据处理与限制

应用不记录请求正文、令牌、模型输出；Nginx MCP 路径关闭 access log，禁用请求/响应临时落盘缓冲；应用没有数据写入功能，禁用 core dump。运行期间文本存在内存中；主机操作系统、托管平台和调用方仍有各自的数据处理边界，不能承诺零留痕。

规则仅用于辅助。远程模式不注册 `read_redacted_file`。没有跨员工会话或数据存储。未知或无命中内容返回需人工复核的语义，不颁发安全许可。试点前应告知员工数据会到达公司指定服务器，先用模拟资料验证。

## 验证

`npm test` 覆盖文本规则、越界文件/链接、真实 stdio MCP，以及 HTTP 无效凭据、撤销、Origin、体积限制和远程工具隔离。发布后再以模拟文本验证 HTTPS 握手、工具发现和脱敏；不使用真实客户资料做连通性测试。
