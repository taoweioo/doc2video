# 工作区管理

Skill 安装与视频制作分开。默认工作区为用户主目录下的 `doc2video-workspace`，无需用户选择。所有脚本路径相对本 Skill 安装目录；命令由当前 AI 宿主执行，没有特定工具名称要求。

## 首次使用和状态

`create` 自动调用初始化；单独准备环境可运行 `init`。初始化只下载和安装 `assets/dependencies.json` 指定的版本，不查找用户已有 Remotion Skill、npm 全局包或其他项目。官方指南保存在 `vendor/<环境ID>/`，入口改为 `GUIDE.md`，不会注册成独立 Skill。

```text
node "<Skill目录>/scripts/workspace.mjs" init
node "<Skill目录>/scripts/workspace.mjs" status
node "<Skill目录>/scripts/workspace.mjs" create --name docker-basics --source "<文档路径>"
```

使用命令返回的 `project`、`id` 和 `guides`，不要猜测唯一后缀。`init` 表示指南及 npm 环境准备完成；首次渲染才准备浏览器，不能把初始化成功报告为视频已生成。

项目文件保存在 `projects/<ID>/`：

- `project.json`：环境版本登记，不由 AI 任意修改。
- `harness.json`：程序维护的阶段状态、材料版本和历史尝试；首次登记时创建。
- `context.md`：创建工程时提供模板，由 AI 持续记录关键决定、未解决问题和下一步建议，见 [context.md](context.md)。
- `source.md`、`brief.md`、`outline.md`、`storyboard.json`：原文、分享目标、章节计划和制作分镜，由 AI 按制作阶段补齐。
- `src/index.tsx`：固定入口，由 AI 按文档实现并注册真实 composition。
- `public/`：配音、字体、图片等素材。
- `output/`：视频、字幕、实际章节时间索引和检查结果。
- `node_modules`：脚本建立的私有环境链接，不手动替换。

只把视频代码和素材写入项目，不修改共享 `runtime/` 中的程序、依赖、模板或 `vendor/` 中的指南。不要执行官方指南里针对全局 Skill 的安装和升级建议；工程初始化、依赖管理、输出位置以本 Skill 为准，动画和 Remotion API 使用私有指南。

## 升级

更新 Skill 本身不更改已有工作区。用户要求升级制作环境时运行：

```text
node "<Skill目录>/scripts/workspace.mjs" upgrade
```

它安装当前 Skill 发布版本配套的指南 commit 和 npm 锁文件，检查完成后切换新项目的默认环境，不直接获取上游最新版本。已创建项目仍指向旧环境。升级失败不切换当前版本，不覆盖项目代码。

需要新增 npm 包或更换 Remotion 版本时，更新并验证本 Skill 的配套环境后再发布；不能让一次视频任务执行 `npm update` 或随意向共享环境安装包。维护者修改依赖、运行脚本或模板时应发布新的环境 ID，避免同一 ID 表示不同内容。

## 清理与卸载

以下命令默认只打印计划，不删除文件。用户已经授权相应清理范围时，可以先查看计划，再带 `--yes` 执行，无需重复要求确认。

```text
node "<Skill目录>/scripts/workspace.mjs" clean-cache
node "<Skill目录>/scripts/workspace.mjs" remove-env
```

`clean-cache` 处理工作区缓存；`remove-env` 处理登记的全部私有指南、运行依赖、浏览器及缓存。两者都保留 `projects/`。卸载 Skill 由原安装工具处理；需要同时移除制作环境时先执行 `remove-env`。

环境移除后保留项目版本记录和依赖链接。当前发布版本的环境可通过 `init` 恢复；旧项目应使用对应的 Skill 发布版本恢复，不能静默改成新版本。用户主动要求删除作品属于单独的数据删除任务，管理脚本没有删除项目的命令。

只清理本工具管理的目录，不清理用户的系统浏览器、共享 npm 缓存或其他 Skill。未登记目录、根目录符号链接、无效归属标记会阻止清理，先调查具体原因，不绕过保护。

## 失败与并发

下载或 npm 安装失败时不发布半成品，安装临时目录会清理；缓存保留以便重试。不要通过换用用户已有 Skill 掩盖私有依赖失败。

同一工作区使用操作锁，渲染、预览、升级和清理不会同时执行。先结束当前预览再渲染。异常退出留下 `.operation.lock` 时，核对记录的进程已经结束后才移除锁。不要通过清理锁强行并行操作。

`--workspace` 可以将命令定向到隔离测试目录，但不作为普通用户必须填写的配置。默认不自动迁移之前生成的视频目录，也不重定位已有工作区；项目依赖链接使用创建时的实际路径。
