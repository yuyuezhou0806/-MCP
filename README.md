# 企业安全辅助 MCP

## 同事直接接入（在线试点版）

MCP 地址：`https://tools.mapleai.top/safety-mcp`。协议为 Streamable HTTP。

在 WorkBuddy 自定义连接器中添加 `workbuddy.remote.example.json` 的配置，将 `YOUR_PERSONAL_TOKEN` 替换为负责人单独发放的个人令牌。每人使用自己的配置，令牌不要发到群里或提交 GitHub。当前批次有效期至 **2027-01-10 08:00（北京时间）**，到期需换发。

在线版提供 `get_safety_policy`、`check_text`、`redact_text`、`assess_operation` 四个工具。同事无需安装 Node.js 或本项目。接入后让 Agent 调用 `get_safety_policy`，再用虚构邮箱 `demo@example.com` 测试脱敏。

**数据流：Agent → HTTPS → 指定腾讯云服务器 → 规则检查 → Agent。** 在线服务不调用外部模型、不持久化输入正文和输出；文本已提交给 Agent 时仍可能先经过其模型服务。服务不提供文件读取能力，不能先读取同事电脑上的文件，也不会读取服务器文件交给 Agent。未命中不代表安全，不能代替企业数据防泄漏控制。

每个令牌每分钟最多 60 次请求，全服务每分钟最多 1200 次。身份验证失败返回 401，超限返回 429。令牌只用于此辅助服务，不能访问服务器管理功能。服务端仅保存令牌 SHA-256 摘要与编号、有效期、启用状态。

部署运维见 [部署说明](deploy/README.md)。以下是可选的本机版本。

为 WorkBuddy 等支持 stdio MCP 的客户端提供 5 个辅助工具。本机规则检查，无云端检测接口，无原文日志，无自动文件修改，无监听端口。规则是试点草案，不代表公司正式批准的数据政策。

## 能力与边界

| 工具 | 用途 |
| --- | --- |
| `get_safety_policy` | 获取规则说明、限制和建议流程 |
| `check_text` | 检查文本，返回命中类别与数量，不回显原文 |
| `redact_text` | 输出规则脱敏后的文本 |
| `read_redacted_file` | 在本机直接读取限定目录的文本副本，再返回脱敏文本 |
| `assess_operation` | 对外发、上传、删除、覆盖、付款和命令执行提示人工确认 |

**不是防泄漏系统，不拦截其他工具，不提供审批凭证。** Agent 可以漏调用或绕过工具。已粘贴进 Agent 的敏感文本可能已到达模型；之后检查无法撤回。`read_redacted_file` 的输出也会进入 Agent/模型，漏检内容仍可能外传。个人客户端可修改规则，不能作为企业强制控制。

初步规则覆盖中国大陆手机号、邮箱、疑似身份证号、部分常见密钥、凭据赋值、私钥块和自定义业务敏感词。不校验身份号码真实性。不可靠识别人名、地址、所有国际号码、所有密钥格式、上下文商业秘密或刻意混淆/编码内容。命中业务敏感词时整行遮盖。表格跨行字段、自由文本及其他隐含身份信息可能漏报；不要把 `no_rule_match` 理解为可外发。

仅支持 UTF-8 `.txt/.md/.csv/.json`，最大 400 KB、100000 字符；其他文件直接拒绝，不静默跳过。脱敏结果是文本预览，可能破坏 CSV/JSON 结构，不应直接覆盖原文件。不提供原文映射或还原。路径限制用于降低误读范围，不是对抗本机恶意进程的沙箱（包括文件检查与读取间的竞态）。

## 安装和接入 WorkBuddy

需要 Node.js 22 或以上。在本目录运行：

```powershell
npm ci --ignore-scripts
npm test
npm run configure
```

运行配置命令会生成 `workbuddy.local.json`。它包含当前电脑 Node 与服务脚本的绝对路径。换电脑后须重新生成。

在 WorkBuddy 的「专家 · 技能 · 连接器 → 连接器 → 自定义连接器」中，选择支持本地命令的配置方式，将 `workbuddy.local.json` 的 `company-safety-assist` 项合并到现有 `mcpServers`，保存并启用。不要覆盖半导小芯等已有配置。若当前版本仅展示远程 URL 输入，请先确认客户端版本及本地 stdio 配置入口；本机脚本路径不能填入 URL；希望直接填写 HTTPS 地址的同事，请使用本文开头的在线接入配置。

接入依据：[WorkBuddy 连接器文档](https://open.workbuddy.cn/docs/connector)。不同客户端的入口可能变化。本项目通过真实 MCP 客户端握手与调用测试；尚未在用户 WorkBuddy 内连接验证。

## 第一个任务（可复制到 Agent）

> 请调用 company-safety-assist 的 get_safety_policy，然后用 check_text 检查虚构示例“测试邮箱 demo@example.com，采购底价 1234”，展示命中类别；再用 redact_text 展示脱敏结果。不要把无命中解释为安全批准。后续读取指定工作目录中的资料时，请优先用 read_redacted_file，避免其他工具先读取原文；外发或破坏性操作前调用 assess_operation，并由我本人确认。这些要求属于辅助流程，不替代客户端权限控制。

## 文件试用

将获授权、用于测试的 UTF-8 文本副本放到本目录 `workspace` 下，让 Agent 调用 `read_redacted_file`，参数如 `{"relativePath":"sample.txt"}`。不要提前把文件内容粘贴到聊天，也不要向 Agent 授权整个公司共享盘。先用模拟资料验收。

## 调整业务规则

复制 `policy.json` 为 `policy.local.json`，编辑 `sensitiveTerms` 或 `companyTerms`（公司名、项目名等字面匹配词，不是正则表达式）。在 MCP 配置 `env` 中增加 `SAFETY_POLICY`，值为该文件绝对路径，然后重启连接器。`SAFETY_WORKSPACE` 控制唯一可读目录。规则文件不应上传公开网站；MCP 不返回词表。

## 37 人试点建议

先在 2–3 台电脑以模拟文件验证规则、误报与业务可用性，再分发文件和安装步骤。独立 stdio 子进程不需要公共访问令牌。公司后续统一分发受审核版本与规则，不能靠员工可编辑配置实现强制安全。本文开头的在线版已提供 HTTPS、个人令牌和限流；它仍只用于辅助检查，不是企业强制防泄漏控制。

在线版在服务器独立运行；本机版由客户端启动。安装或生成配置不会自动修改 WorkBuddy 已有设置。
