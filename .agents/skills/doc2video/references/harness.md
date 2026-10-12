# 任务执行与恢复

完整制作及已有视频修改时使用本页。Skill 指导内容创作；harness 记录项目状态、执行脚本、校验产物和报告下一步。它依托宿主 AI，不会自行生成讲稿或调用模型。所有命令沿用同一个工作区和项目 ID。

## 查看进度

```text
node "<Skill目录>/scripts/workspace.mjs" task-status --project "<项目ID>"
node "<Skill目录>/scripts/workspace.mjs" task-resume --project "<项目ID>"
```

两者都只读。`task-status` 返回阶段状态；`task-resume` 还读取分享目标和接续说明，返回首个可处理阶段的材料、指南与检查要求，由宿主 AI 检查原因后继续执行，不自动重放脚本。依赖环境暂时缺失时仍可查看状态。接续说明按 [context.md](context.md) 维护。

恢复结果中的 `summary` 包含 `brief.md` 和 `context.md` 摘要；`warnings` 提示缺失、未填写或截断的材料。`next.materials` 是工程内材料路径，`next.guide` 是随 Skill 安装位置解析的指南路径，`next.criteria` 说明检查要求。失败时提供 `error`、`errorCode`、`failurePhase`、`log` 和 `durationMs`；`next.retry` 给出当前输入的尝试次数与执行上限。`next.command` 保存上次尝试的参数，尚未执行的阶段没有既有命令；重新渲染时不能直接沿用已有输出名。

阶段依次为 `brief`、`outline`、`storyboard`、`audio:<场景ID>`、`visuals`、`render`、`review`。无声分镜跳过 audio。概念上的六步制作流程不变，配音与画面是制作阶段内的两个执行步骤。

状态包括 `pending`、`running`、`interrupted`、`failed`、`stale`、`blocked`、`completed`、`needs-review`。`artifactStatus` 保留产物自身状态；例如前置分镜尚未重新确认时，其他幕的音频可以是 `blocked`，但自身仍是 `completed`，无需重做。只有所有阶段均完成，`complete` 才为 true。

## 登记材料与执行

AI 写好目标、章节和分镜后，逐步登记：

```text
node "<Skill目录>/scripts/workspace.mjs" task-checkpoint --project "<项目ID>" --stage brief
node "<Skill目录>/scripts/workspace.mjs" task-checkpoint --project "<项目ID>" --stage outline
node "<Skill目录>/scripts/workspace.mjs" task-checkpoint --project "<项目ID>" --stage storyboard
```

brief、outline 检查非空文件并记录内容指纹，不自动证明目标合理；storyboard 运行结构和原文引用检查，不自动证明技术正确。AI 仍需按相应指南审查内容。

可复用的制作代码保存在本项目 `scripts/`。执行 Node.js 脚本时由 harness 管理尝试记录：

```text
node "<Skill目录>/scripts/workspace.mjs" task-run --project "<项目ID>" --stage audio:cache-hit --script scripts/synthesize-scene.mjs --args '["cache-hit"]'
```

上面的脚本名称是示例，必须先按 audio.md 编写实际脚本；harness 不包含该文件。参数通过字符串数组传入，不使用 shell 拼接。脚本只能修改当前阶段应产生的材料，逐幕执行时保持其他音频文件不变。Python/edge-tts 仍由制作脚本按 audio.md 使用私有 uv 环境调用。

脚本结束后自动检查产物，成功后登记内容指纹。已有材料也可用 `task-checkpoint --stage audio:<ID>` 登记。首次登记旧工程表示对现有文件建立基线，不能追溯证明它们当初的生成输入；已有文件也必须通过当前检查。

`task-run` 和 `task-checkpoint` 的执行及产物校验共用一次超时预算，默认 1800 秒，可通过 `--timeout-seconds <1至86400的整数>` 调整。超时记录 `TASK_TIMEOUT`，终止受管命令并保留日志、产物和失败阶段；等待命令退出后才释放工作区锁。渲染、TypeScript 和媒体检查同样受限。普通 `preview` 等调试命令不使用此预算。它限制本地命令耗时，不代表宿主模型的 token 或服务费用上限。

| 阶段 | 约定材料与检查 |
| --- | --- |
| brief / outline | `source.md` 及对应 Markdown 非空；内容意义由 AI 审查 |
| storyboard | `storyboard.json` 的结构、发音映射、章节与原文引用 |
| audio:ID | `tts-config.json`（TTS 模式）、`output/audio-manifest.json`、该幕音频与服务原始 SRT；核对实际配音文本、配置、路径、实测时长并解码 |
| visuals | 分镜 ready 检查、`src/captions.json` 标准字幕与非重叠时间边界、TypeScript；记录 `src/`、`public/`、`tsconfig.json` |
| render | 实际 MP4 的尺寸、帧率、帧数、时长、所需音轨及完整解码；当前要求全片按分镜连续排期 |
| review | `output/chapters.md` 对应实际排期；`output/review.json`、`output/review.md` 和引用证据绑定实际 MP4 的 SHA-256 |

音频 manifest 是数组，每幕恰好一条，字段为 `sceneId`、`text`、`config`、`audio`、`subtitle`、`durationSeconds`。`text` 是派生后的实际配音输入；`config` 在 TTS 模式与项目配置一致；路径如 `public/audio/cache-hit.mp3`。录音模式也记录转写文本和 SRT，程序只检查它们与标准讲稿的一致性，不自动验证音频语义。

字幕约定为 `src/captions.json`，以场景 ID 为键，每条至少有 `text`、`startMs`、`endMs`。时间相对于该幕音频，不含 `leadFrames`。语音识别、发音听感和动画是否贴合口播仍需审查。

## 渲染与检查

```text
node "<Skill目录>/scripts/workspace.mjs" task-checkpoint --project "<项目ID>" --stage visuals
node "<Skill目录>/scripts/workspace.mjs" task-run --project "<项目ID>" --stage render --output video-v2.mp4
```

render 使用登记的私有 Remotion 环境，不需要 `--script`；可指定 `--composition`，但必须是分镜对应的完整成片。单幕样片继续使用 `still`、`render --composition Scene-...`，不将单幕登记为全片完成。产物名不得覆盖已有文件。

旧的 `check`、`still`、`render`、`preview` 仍可用于调试，但不会自动更新 harness 状态。旧成片可通过 `task-checkpoint --stage render --output <已有文件名>` 建立基线。修改后通过 `task-run --stage render` 生成新的可追溯版本。

审查记录示例：

```json
{
  "video": "output/video-v2.mp4",
  "videoSha256": "实际视频文件的 SHA-256",
  "checks": [
    {"id":"content","status":"passed","reviewer":"agent","evidence":["output/review.md"],"note":"逐章核对原文，记录实际问题和结论"},
    {"id":"visual","status":"passed","reviewer":"agent","evidence":["output/qa/keyframes.png"],"note":"已查看关键帧；连续播放范围另记"},
    {"id":"listening","status":"not-reviewed","note":"本次没有完成连续听审"}
  ]
}
```

示例仅说明结构，不得直接复制为已通过的结论。只有实际检查后才写 `passed`；存在问题写 `needs-fix`，没有检查写 `not-reviewed`。仅无声分镜的 `listening` 可以写 `not-applicable` 并说明原因。然后执行 `task-checkpoint --stage review`。有待修复问题会失败，有未检查项保留 `needs-review`，不会自动完成。可按用户要求交付预览，但必须说明尚未验收的项目。

## 修改、失败和中断

- 先执行 `task-resume`。从上游变化开始重新审查并 checkpoint，再处理真正过期的产物。
- 标准口播变化后按实际派生的语音输入判断音频是否失效；只修改技术拼写而读音未变时可以复用音频。字幕与画面仍需重新检查。
- 新音频测量结果可补入分镜的 `audio`、`durationInFrames`、`leadFrames`、`tailFrames`，不会让分镜的内容检查失效；实际排期变化会让画面与成片需要重新检查。
- 只修改画面代码，不会使音频失效。改动原文或分享目标时，先重新确认后续内容，不因为旧文件仍存在就复用。
- `harness.json` 原子写入，保留当前步骤、输入输出指纹和历史尝试；脚本输出及时写入 `output/task-logs/`。进程强制退出后，状态查询将已结束的运行标记为 `interrupted`，重试时保留该次历史。
- 同一输入与脚本连续失败时，配音最多执行 2 次（首次及一次重试），其他阶段最多 3 次。系统不会自行重试；临时故障才考虑重试，配置错误先修复。超过后先诊断并修改实际输入或脚本，不通过改名规避限制。checkpoint 只检查已有文件，不执行生产脚本。
- task 写命令仅自动恢复具有本机标记、且原进程与登记的直接子进程确定已结束的遗留工作区锁。活动进程、未知主机、旧版无主机信息或无效标记仍会阻止操作，需要核对后处理。受控超时会终止进程组（Windows 使用进程树终止）；制作脚本必须等待子任务，不自行启动脱离管理的后台进程。宿主被强制结束时，不能保证任意后代进程已经退出。
- 失败保留文件，不自动覆盖或删除半成品。中断后若目标 MP4 已存在，核对它是否完整；重新渲染使用新文件名。

指纹只覆盖约定的正文、配置、脚本、参数、项目源码及本地素材。新外部输入应先落入工程并明确纳入对应材料；harness 不会自动发现任意脚本读取的所有文件，也不能保证在线 TTS 重跑生成完全相同的音频。当前先验证单宿主本地制作，不声称已经完成所有客户端适配。
