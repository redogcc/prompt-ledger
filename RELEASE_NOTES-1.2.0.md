# Prompt Ledger 1.2.0 · Outcome Layer

发布日期：2026-11-22

提示词账本 1.2.0 把「记录对话」推进到「看见结果」：每一轮不只有动作，还有完成事项、产出物、影响文件和验证；每个完成事项都能追溯到具体文件，并且可以直接预览、打开和定位。

## 1.2.0 亮点

- **结果卡**：完成事项 / 产出物 / 影响文件 / 校验 / 失败动作，一屏回答“得到了什么”。
- **产出物预览**：图片、视频、PDF、文本和代码在面板内直接预览；支持用默认应用打开、在 Finder 中显示、复制路径。
- **证据映射**：从模型交付说明里的链接和路径，把完成事项映射到具体文件 chip；映射不到时明确标注，不硬编。
- **会话成果页**：按回合聚合产出物、影响文件和校验，不再只显示工具调用流水。
- **历史回填**：从 durable Session log 重建历史动作，幂等写入封存 prompt，不改提示词正文。
- **安全边界**：只能读取该 prompt 已捕获的 action target；内嵌预览上限 64 MB，大文件走默认应用。
- **本地优先**：SQLite、append-only、SHA-256 审计链不变。

## 介绍片

- 48 秒 / 1920×1080 / 30fps / H.264 + AAC
- 文件：prompt-ledger-1.2.0-promo.mp4
- 海报：prompt-ledger-1.2.0-poster.jpg
- 故事板：prompt-ledger-1.2.0-storyboard.jpg

## 安装

1. 下载 prompt-ledger-1.2.0.zip
2. 解压到本地目录
3. 在 DSH 中执行 plugin_manager install_bundle，target 指向解压后的目录
4. 完全退出并重新打开 DSH（Host 需要重新加载）
5. 打开左侧「提示词账本」；历史会话在「成果」页点「补齐历史」

## 验证

- npm test：10/10 通过
- npm run check：通过
- 视频：48.0s / 1440 帧 / 全片解码通过
- 干净解压：语法、动作捕获、target 解析、审计链、无数据库/凭据泄漏检查通过

## 资产清单

- prompt-ledger-1.2.0.zip
- prompt-ledger-1.2.0.sha256
- prompt-ledger-1.2.0-promo.mp4
- prompt-ledger-1.2.0-poster.jpg
- prompt-ledger-1.2.0-storyboard.jpg
- SHA256SUMS

## English summary

Prompt Ledger 1.2.0 adds an outcome layer: result cards with completed items, outputs, project-level changes and verification; secure in-panel previews for images, video, PDF and text; item-to-file evidence mapping; session-level outcome views; and idempotent historical backfill. Local-first SQLite and the SHA-256 audit chain remain unchanged.
