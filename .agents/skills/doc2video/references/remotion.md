# 使用私有 Remotion 环境

## 读取指南

项目创建后，从命令返回的 `guides` 路径读取 `GUIDE.md`，再读取其中相关的本地参考文件。指南来自固定 commit 的官方 `remotion-best-practices`，完整性由工作区脚本检查，不把它安装或触发为第二个 Skill。

| 内容 | 私有指南中的入口 |
| --- | --- |
| composition 与视频布局 | `remotion-create` |
| 帧驱动动画、媒体和排期 | `remotion-markup` |
| 字幕 | `remotion-captions` |
| 预览 | `remotion-studio` |
| 导出与单帧 | `remotion-render` |
| API 查询 | `remotion-docs` |

这些名称代表供 AI 阅读的指南，不是可直接调用的函数。不要按名称搜索并加载用户已有的 Remotion Skill。

项目已经由本 Skill 的模板创建，共享依赖已安装。不要重复执行官方指南里的 `create-video`、全局 Skill 安装或 `remotion add/upgrade` 命令。初始化、版本与目录规则见 [workspace.md](workspace.md)。当前任务只改项目自己的 `src/`、文稿与素材。

## 使用内置组件

新建工程同时复制 [动效与场景模板库](motion-library.md)，返回 `motionLibrary.path`。从该目录导入选中的组件，按 catalog 中的 `propsFile` 配置真实内容和动作排期；不要再次安装上游社区 CLI。旧工程可用 `motion-install --project <ID>` 补齐，重复执行保留工程已有修改。

## 从分镜实现画面

`storyboard.json` 是本 Skill 的中间格式，Remotion 不会自动读取。根据它实现 composition，固定工程入口为 `src/index.tsx`，默认 composition ID 为 `DocumentVideo`；若改名，渲染时显式指定实际 ID。

每个场景保留稳定 ID，画面依照 `visual` 实现，音频和字幕与场景对应。使用实际音频时长和留白计算帧数，更新 composition 总帧数。素材放在本项目 `public/` 中，通过 `staticFile()` 引用。

读取分镜所在章节的 outline 和原文细节，实现 `purpose` 对应的技术演示。先验证一个有代表性的机制或代码过程：旁白讲到的对象是否出现、关键状态是否完整、观众是否有时间理解。随后再扩展其他章节。直接从分镜取口播与帧数，或生成只读数据；不要在组件中维护另一份可独立修改的文稿和时间线。

基本视觉一致性由本片的字体、间距、对象标识和强调方式维持，不要求固定主题或布局。代码选取有解释价值的片段，配合执行位置、数据流或状态变化；架构箭头有明确方向与含义。为字幕留出空间，复杂图示分步展开，避免靠缩小文字塞满画面。

按 [视频风格](styles.md) 确定的指南实现画面；具体配色、镜头与素材规则由对应指南维护。风格 ID 不会自动改变 composition，Agent 需要将分镜实现为项目代码。后续评估 Remotion 官方或社区方案时，核对技术表达能力、版本兼容性、许可和依赖要求，记录出处。新增运行依赖仍需按配套版本发布，不在单次任务中随意修改共享环境。

动画由帧驱动，随机效果固定种子。字体和素材在渲染前就绪。长文本应拆分、改写，不能截断关键内容。场景之间的视觉转场不要截掉配音句尾。

## 先粗排代表片段，再精修

在代表片段中先用基本形状、标签、关键状态和真实配音完成粗排（animatic），验证讲解顺序和时间是否容得下动作，再精修曲线、镜头和细节。直接在本项目 composition 中迭代，不默认另建一套工程或要求用户审批。只有简单动作的短片可与制作检查合并。

按口播从头播放该片段，检查新概念能否及时找到对应对象、动作结果是否留得住、切换后是否仍能追踪关系。若画面不解释内容，先改 `visual`；若动作挤在一起，先调整步骤、口播或停留，再更新排期，不仅靠加快动画解决。

使用 [motion.md](motion.md) 的配方时，复制并读取随包参数，按固定 Remotion 版本实现。参数文件不是自动渲染器，代码仍需验证；不要用网页 CSS 动画替代可按帧捕获的实现。

## 检查、预览与导出

使用当前 Skill 的工作区脚本执行，脚本根据 `project.json` 选择私有环境及浏览器，不依赖当前工作目录或全局命令：

```text
node "<Skill目录>/scripts/workspace.mjs" check --project "<项目ID>"
node "<Skill目录>/scripts/workspace.mjs" still --project "<项目ID>" --frame 60 --output preview.png
node "<Skill目录>/scripts/workspace.mjs" render --project "<项目ID>" --composition DocumentVideo --output video.mp4
node "<Skill目录>/scripts/workspace.mjs" preview --project "<项目ID>"
```

`check` 检查 TypeScript；仍需运行分镜草稿和 `--ready` 校验，并进行语义与视觉检查。`still` 默认第 30 帧，选择实际时间线中的代表性帧；检查首幕、最长文字、典型关系、转场和结尾。`preview` 启动 Studio，使用日志返回的实际 URL；预览进程结束后再执行其他受管操作。

以上是调试命令，不更新任务状态。完整制作按 [harness.md](harness.md) 登记 `visuals`，再执行 `task-run --project <ID> --stage render --output <新文件名>.mp4`。harness 使用相同私有环境并检查实际输出，失败记录保存在项目内。

浏览器首次需要时下载到私有运行环境的 `node_modules/.remotion/`。打包、渲染临时文件和 npm 缓存集中在工作区中。下载失败时按具体错误处理，不能静默使用外部浏览器或用户自己的 Remotion Skill。

结果固定写入项目 `output/`，已存在的文件拒绝覆盖，重做时使用新文件名。只有用户请求生成视频或导出 MP4 才执行完整渲染；只要求写稿或预览时交付对应阶段。

输出后按 [review.md](review.md) 检查讲解效果、技术文件和时间线，生成真实章节索引，记录实际跳过的检查。不能只凭输出文件名声称制作完成。

## 官方资料

版本行为不确定时查阅与私有环境版本对应的官方资料，不把当前文档的新 API 直接套进锁定版本。

- [Remotion Skills](https://www.remotion.dev/docs/ai/skills)
- [renderMedia](https://www.remotion.dev/docs/renderer/render-media)
- [renderStill](https://www.remotion.dev/docs/renderer/render-still)
- [浏览器准备](https://www.remotion.dev/docs/renderer/ensure-browser)
- [Studio WebMCP](https://www.remotion.dev/docs/ai/webmcp)：可选辅助，不影响 Skill 通用性。
