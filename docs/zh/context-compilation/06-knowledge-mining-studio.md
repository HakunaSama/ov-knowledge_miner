# 知识挖掘

知识挖掘同时支持 `ov knowledge-mining` 和 Web Studio 的知识挖掘页面。两个客户端都只提交文档来源，并使用同一套内置 Skill 与 OKF 合同。Studio 维护自己的浏览器串行队列，也可以发现或导入 CLI 结果；它不会建立其他物理视图。

两个客户端都会设置 `allow_invalid_okf_output=true`。前两个挖掘检查点仍然是硬门禁；最终 OKF 一致性问题会在最佳可用 checkout 已提交后作为告警返回。

## 前置条件

启动启用了 VikingBot 的 OpenViking 服务，并确认基础模型配置可用：

```bash
openviking-server --with-bot
openviking-server doctor
curl http://localhost:1933/bot/v1/health
```

## 从 CLI 执行知识挖掘

```bash
ov knowledge-mining \
  --documents ./resources/documents \
  --okf-config ./OKF_CONFIG.yaml \
  --to viking://resources/enterprise-wiki \
  --window-files 10 \
  --state-file ./mining-state.json \
  --wait
```

- `--documents` 接受本地文件、目录或现有 `viking://` 文件夹。
- 默认每窗最多 10 份文件；所有窗口串行处理并写入同一个知识库。
- 后续窗口读取同一目标知识库，因此是增量更新，不会清空已完成窗口的结果。
- 单文件超过窗口预算、但未超过 512 MiB 硬上限时，会独占一个窗口；客户端不会物理拆分 PDF。
- 最终 OKF 校验在 `knowledge-mining` 中是非阻断告警；来源覆盖和候选知识两个前置门禁仍必须完成。

## 中断恢复与日志

每个终态窗口都会在远端批次目录留下独立日志，聚合状态同时写入本地原子 JSON 文件。中断后执行：

```bash
ov knowledge-mining --resume-state ./mining-state.json --wait
```

恢复过程会跳过已经完成的窗口和已确认上传的文件。此前成功写入同一目标知识库的页面不会被删除。

典型远端结构：

```text
viking://resources/knowledge-mining/<batch-id>/
├── OKF_CONFIG.yaml
├── windows/<序号>/document-sources/
├── logs/run.json
├── logs/windows/<序号>.json
└── wiki/
    ├── knowledge/<page_role>/<business_domain>/<subdomain>/<可选主题路径>/<页面>.md
    └── _mining/
        ├── run-manifest.json
        ├── evidence-ledger.json
        ├── investigation-report.json
        ├── source-coverage.json
        ├── candidate-knowledge.json
        ├── readlist.json
        └── evidence-history.json
```

主视图是 `wiki/` 中唯一的物理文件树。每个晋升候选对应一个规范知识页；不存在固定分面三联页，也不根据 `view/...` 标签生成派生视图。

## 检查结果

```bash
ov task status <task-id>
ov tree viking://resources/enterprise-wiki
ov read viking://resources/enterprise-wiki/_mining/run-manifest.json
ov read viking://resources/enterprise-wiki/_mining/source-coverage.json
ov read viking://resources/enterprise-wiki/_mining/candidate-knowledge.json
ov read viking://resources/enterprise-wiki/_mining/evidence-ledger.json
```

`source-coverage.json` 以原始上传文件为单位；PDF 解析片段不会被当作不同原文件。最终页面与 `evidence-ledger.json` 保留原始 PDF URI、文件身份和片段证据，因此可以从知识页回溯到真实 PDF 来源。

完整的分批操作说明见 [Agent 分批知识挖掘教程](./08-batched-knowledge-mining-agent-guide.md)。
