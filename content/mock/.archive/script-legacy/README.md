# 旧单文件 script.json 归档

归档时间: 2026-06-10 09:17
归档原因: 旧管线时代的"单文件剧本容器"已被多文件目录（meta.json + clues.json + characters/* + scenes.json + props.json + ...）替代

## 内容

- `script.json.2026-06-10` — 最新一份单文件剧本容器（包含 visual.asset 但分文件已同步到等价状态）
- `script.json.bak.2026-06-10` — 拆分多文件前的备份（2026-06-09 22:21）
- `script.json.bak-manual-reconcile.2026-06-10` — 早期人工 reconcile 的备份（2026-06-10 04:44）

## 检索方式（如果以后需要查历史）

- 不要再用 script.json 作为运行时数据源
- 旧管线 (visual-pipeline 旧版) 期望单文件，新版 (cli --dir) 读多文件目录
- 若发现某个分文件数据与历史脚本对不上，可从这三个备份之一反查

## 之后

- 内容 / _mock 目录下不再有 script.json
- 生图管线、运行时数据加载、未来新功能都应直接读多文件目录
- 清理：30 天后（2026-07-10）可考虑删除
