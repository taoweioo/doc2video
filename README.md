# doc2video

将 Markdown 或纯文本技术文档制作成适合开发者团队分享的视频。你提供文档，AI 组织章节、编写口播、设计技术演示，并使用 Remotion 导出 MP4，同时保留可编辑的分镜和视频工程。

适合技术学习分享、原理讲解、方案介绍和经验复盘。制作时保留原文的观点、技术前提和深度，按内容与会议时间安排时长。

## 使用条件

- 支持读取 Skill、读写本地文件和执行命令的 AI 助手。
- Node.js 20+、npm、Git，以及可下载依赖的网络环境。
- FFprobe 和 FFmpeg，用于测量媒体时长和检查导出结果。
- 使用默认中文配音时还需要 uv，由它在工作区内准备 Python 3.12 和 edge-tts 7.2.8。

Skill 不绑定特定模型或客户端。只有聊天能力的助手可以协助策划和写稿，完整视频制作需要本地工具执行能力。目前仅在 macOS 本地环境实测，其他操作系统和 AI 客户端仍需验证。

## 安装

下载或克隆本仓库，在仓库根目录执行：

```bash
node scripts/install.mjs --to "<你的 AI 助手支持的 Skill 安装父目录>"
```

安装器会在指定目录下创建 `doc2video/`。目标目录已经存在时会停止，不覆盖原文件。也可以直接将完整的 `.agents/skills/doc2video/` 目录复制到助手支持的 Skill 安装目录。

安装后按助手的要求刷新 Skill，或让助手读取安装目录中的 `SKILL.md`。无需另装 Remotion Skill，也无需在仓库根目录执行 `npm install`。

首次制作时，AI 会在用户主目录下创建 `doc2video-workspace/`，准备固定版本的 Remotion 指南和运行依赖。浏览器会在首次渲染时下载；配音依赖在首次配音时准备。

## 开始制作

向 AI 提供文档文件或粘贴正文，并说明分享需求，例如：

```text
使用 doc2video，把这份技术文档做成团队分享视频。
同事有开发基础，但不熟悉这个主题。保留原理、例子和适用边界，
带中文配音和字幕，直接导出 MP4，供会议播放后讨论。
```

你可以指定受众、时长、重点和配音方式，也可以要求先审阅口播与分镜。未指定时，默认面向有开发基础、尚不熟悉主题的同事，沿用原文语言，以 1920 × 1080、30 fps 制作，时长以讲清内容为准。

默认风格为 `technical-motion`（技术动态图解），通过对象、连线、代码和状态变化解释技术内容，无需额外选择风格。内置动效组件与场景模板随 Skill 提供。

中文配音默认使用晓晓，语速为正常速度；要求男声时使用云希。默认配音通过 edge-tts 调用在线服务，口播文本会发送到该服务。你也可以提供录音、指定其他配音服务，或要求无声视频。其他语言需要明确对应音色。

## 制作流程与交付物

| 阶段 | 主要产物 |
| --- | --- |
| 理解原始文档 | 原文副本 `source.md` |
| 明确分享目标 | 受众、范围与内容取舍 `brief.md` |
| 组织章节与讲解步骤 | 章节大纲 `outline.md` |
| 设计口播与技术演示 | 可编辑讲稿、分镜与排期 `storyboard.json` |
| 制作画面、配音和字幕 | Remotion 源码、素材与 MP4 |
| 检查成片 | 检查记录与章节索引 |

内容由 AI 根据文档创作，本地程序负责记录进度、关联产物和执行检查。导出成功后仍需检查讲解内容、画面、配音与同步；未完成的检查会保留为 `needs-review`。

所有作品保存在用户主目录下的工作区中，与 Skill 安装目录分开：

```text
doc2video-workspace/
  projects/<项目ID>/
    source.md           原文副本
    brief.md            分享目标
    outline.md          章节大纲
    storyboard.json     口播、分镜与排期
    context.md          关键决定与接续说明
    src/                可编辑的视频源码
    public/             配音与素材
    output/             视频、字幕、章节索引与检查记录
  runtime/              固定版本的运行环境
  vendor/               配套的 Remotion 指南
  cache/                下载与制作缓存
```

## 修改或继续制作

向 AI 提供项目 ID 或项目目录，并描述要调整的内容，例如：

```text
继续 doc2video 项目 <项目ID>，把第二章的重试机制解释得更详细，
保留其他章节，更新相关画面、配音和字幕后重新导出。
```

AI 会先读取项目状态和接续说明，再处理需要更新的材料。画面调整不会自动触发重新配音；口播变化时会更新对应配音及后续排期。新导出文件使用新名称，保留旧版本。

需要手动查看状态时，将下方占位符替换为实际路径和项目 ID：

```bash
node "<Skill目录>/scripts/workspace.mjs" status
node "<Skill目录>/scripts/workspace.mjs" task-resume --project "<项目ID>"
```

## 升级与卸载

更新 Skill 时，按原安装方式替换 Skill 目录；安装脚本不会覆盖已有目录。需要准备新版 Skill 配套的制作环境时，让 AI 执行升级，或手动运行：

```bash
node "<Skill目录>/scripts/workspace.mjs" upgrade
```

升级后的新项目使用新环境，已有项目保留原环境版本。不要在受管运行环境中执行 `npm update`。

清理缓存或移除运行环境时，先预览范围：

```bash
node "<Skill目录>/scripts/workspace.mjs" clean-cache
node "<Skill目录>/scripts/workspace.mjs" remove-env
```

确认范围后追加 `--yes` 执行。`clean-cache` 只清理缓存；`remove-env` 移除受管指南、依赖、浏览器和缓存，保留项目及作品，但项目需要恢复对应环境后才能继续渲染。

卸载 Skill 时，用原安装工具移除安装目录，工作区与作品仍会保留。如需同时移除运行环境，先执行 `remove-env`，再卸载 Skill。

## 详细说明

- [完整制作流程](.agents/skills/doc2video/SKILL.md)
- [工作区与环境管理](.agents/skills/doc2video/references/workspace.md)
- [中文配音配置与接入](.agents/skills/doc2video/references/audio.md)
- [视频风格](.agents/skills/doc2video/references/styles.md)
- [内置动效与场景模板](.agents/skills/doc2video/references/motion-library.md)
- [成片检查要求](.agents/skills/doc2video/references/review.md)
