# 配音接入规范

本文件规定本项目的默认中文配音实现。执行时读取 [audio-defaults.json](../assets/audio-defaults.json)，使用固定客户端、版本和参数，不临时选择其他配音服务或安装方式。用户明确提供录音、指定其他服务或要求无声视频时，按文末的例外处理。

## 服务与客户端的关系

TTS（Text-to-Speech）将口播文本转换成音频。本项目通过第三方开源客户端 [rany2/edge-tts](https://github.com/rany2/edge-tts) 调用微软 Edge 的在线语音服务。edge-tts 不是微软官方 SDK；无需安装 Edge 浏览器、注册 Azure 或配置 API Key，但需要联网，口播文本会发送到在线服务。

固定接入链路为：

```text
storyboard.json 中的标准 narration + 可选 speechReplacements
    → 派生项目内的逐幕 UTF-8 配音输入
    → uv 运行固定版本 edge-tts
    → 微软 Edge 在线语音服务
    → 每幕 MP3 + 服务返回边界生成的原始 SRT
    → 还原技术拼写的显示字幕（保持原时间边界）
    → 实测音频时长、更新分镜排期
    → Remotion 加载音频、字幕并导出视频
```

客户端处理服务连接、音频接收和字幕生成。不要自行实现微软私有接口、复制连接令牌、拼接 WebSocket 请求，或改用 Azure SDK。这些都不属于本项目的默认接入方式。

## 固定基础配置

默认值由随 Skill 分发的 `assets/audio-defaults.json` 维护。开始制作时，将它复制到项目的 `tts-config.json`，后续命令使用该项目配置；默认配置文件不在视频任务中修改。用户要求改配置时更新项目副本，并记录原因。它由 Agent 读取并映射到下方固定 CLI 参数，edge-tts 本身不会自动读取这个 JSON。

| 配置 | 默认值 | 规则 |
| --- | --- | --- |
| 服务客户端 | `edge-tts` | 不自动更换供应商 |
| 客户端版本 | `7.2.8` | 使用 `edge-tts==7.2.8`，不使用 latest |
| Python | `3.12` | 由 uv 管理，使用当前工作区内的解释器 |
| 默认声音 | 晓晓：`zh-CN-XiaoxiaoNeural` | 用户未指定时直接使用，不询问选声 |
| 可选声音 | 云希：`zh-CN-YunxiNeural` | 用户明确选择云希或男声时切换 |
| 语速 | `+0%` | 用户已确认的正常语速 |
| 音量 | `+0%` | 不自动增强 |
| 音调 | `+0Hz` | 不自动升降 |
| 输出 | MP3 + SRT | 默认客户端输出 24 kHz、48 kbps、单声道 MP3 |

同一视频保持相同音色和参数。不要因为主题变化、个人偏好或换了执行 Agent 自动换声。首次生产可检查关键片段，但沿用这套已确认设置时不重复要求用户试听确认。用户明确要求其他语速时只覆盖该项目配置，不改全局默认。

当前配置针对中文技术分享。其他语言不能套用这两个中文音色，应先明确对应的音色选择；不要静默把原文翻译成中文。

## 运行环境与文件位置

前置工具为 Node.js、uv 和用于音频测量的 FFprobe。需要完整解码检查时使用 FFmpeg。uv 负责下载隔离的 Python 和固定版本的 edge-tts，宿主已有 uv 不重复安装。缺少前置工具时先报告具体缺项，按用户授权准备；不要用全局 pip、系统 Python 或另一套 TTS 绕过。

Remotion 的 `init` 只准备视频环境，不会自动安装 TTS。配音首次运行以下 uv 命令时才准备其依赖；无需先执行 `pip install` 或克隆 edge-tts 仓库。

工作区路径使用创建项目时返回的实际绝对路径：正常使用为用户主目录下的 `doc2video-workspace`，本仓库开发使用仓库下的 `doc2video-workspace`。不根据当前 shell 目录重新猜测工作区。

```text
<工作区>/
  cache/
    uv/                     Python 包及 uv 执行环境缓存
    python/                 uv 下载的 Python
    tmp/                    下载与命令临时文件
  projects/<项目ID>/
    tts-config.json         本项目实际配音配置
    storyboard.json         逐幕口播与排期的编辑来源
    narration/<场景ID>.txt   从分镜导出的 UTF-8 文本
    public/audio/
      <场景ID>.mp3
      <场景ID>.srt           相对本幕音频起点的字幕
    output/
      audio-manifest.json   实际输入、配置、时长与检查记录
```

创建缺少的目录。对每一次 uv 调用显式设置下表环境变量；使用宿主的子进程环境参数、shell 或 PowerShell 的等效写法，不写进用户的 shell 配置。

| 环境变量 | 值 |
| --- | --- |
| `UV_CACHE_DIR` | `<工作区绝对路径>/cache/uv` |
| `UV_PYTHON_INSTALL_DIR` | `<工作区绝对路径>/cache/python` |
| `TMPDIR`、`TMP`、`TEMP` | 均为 `<工作区绝对路径>/cache/tmp` |

uv 会复用这些目录，`clean-cache` 可以删除并按需重建它们；已生成音频和项目配置保留。配音运行期间不并行清理工作区。不要把配音产物放进缓存，也不要往共享 Remotion `runtime/` 安装 Python 包。

## 标准执行步骤

所有占位符换成真实绝对路径，并保留引号。以下命令必须携带上一节的工作区环境变量。

### 1. 检查工具与客户端

检查 `uv --version`、`ffprobe -version`，然后运行：

```text
uv run --no-config --no-project --managed-python --python 3.12 --with edge-tts==7.2.8 edge-tts --version
```

输出应为 `edge-tts 7.2.8`。首次使用或遇到音色错误时查询当前在线音色：

```text
uv run --no-config --no-project --managed-python --python 3.12 --with edge-tts==7.2.8 edge-tts --list-voices
```

确认配置的完整音色 ID 在列表中；不存在时停止并报告，不自行换一个听起来相似的音色。

### 2. 导出口播

先完成 [storyboard.md](storyboard.md) 规定的草稿校验。对每幕用 [speech-text.mjs](../scripts/speech-text.mjs) 的 `getSpeechText(scene)` 从标准讲稿派生配音输入，再写入 UTF-8 的 `narration/<场景ID>.txt`。没有发音映射时原样返回。分镜仍是唯一编辑来源，不独立手改导出稿。

每幕围绕一个完整意思，可以包含几句话；不要为字幕而机械拆成一句一个音频。代码和命令用口播解释行为，不把整段代码直接送去朗读。需要调整解释方式时改标准讲稿；仅为改善读音时用 `speechReplacements`，保留讲稿与显示字幕的技术拼写。edge-tts 不支持任意自定义 SSML，不把其他服务的情绪、停顿标签塞进口播。

### 3. 生成音频与字幕

默认晓晓：

```text
uv run --no-config --no-project --managed-python --python 3.12 --with edge-tts==7.2.8 edge-tts --file "<项目目录>/narration/<场景ID>.txt" --voice zh-CN-XiaoxiaoNeural --rate=+0% --volume=+0% --pitch=+0Hz --write-media "<项目目录>/public/audio/<场景ID>.mp3" --write-subtitles "<项目目录>/public/audio/<场景ID>.srt"
```

选择云希时只将 `--voice` 改为 `zh-CN-YunxiNeural`，并同步 `tts-config.json` 的 `voice`。用户明确调整其他参数时使用项目副本中的值，命令其余部分保持不变。

默认按场景顺序串行合成，避免批量并发请求。命令会写目标文件，因此运行前检查 MP3 和 SRT 是否存在：

- 首次生成使用 `<场景ID>.mp3` 和 `<场景ID>.srt`。
- 只有实际派生的配音输入、客户端版本、音色、语速、音量和音调全部相同，且旧文件通过检查时才可复用。不能仅凭文件存在就跳过。
- 输入或配置变化时使用未占用的版本文件名，例如 `<场景ID>-v2.mp3` 和对应 SRT，更新分镜引用，保留旧版；不要直接覆盖已确认文件。
- 退出码非零、文件为空或缺少字幕时，该段失败，不登记为可用音频。保留诊断；重试使用新文件名，避免把部分写入文件当成成功产物。

### 4. 测量并登记结果

成功生成后，检查 MP3 和 SRT 非空、字幕可解析，并测量实际时长：

```text
ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "<音频实际路径>"
```

结果应为大于 0 的秒数；测量失败时先解决问题，不用字数估算替代。FFmpeg 可用时执行完整解码检查：

```text
ffmpeg -v error -i "<音频实际路径>" -f null -
```

在 `output/audio-manifest.json` 按场景记录：场景 ID、标准讲稿、实际派生的合成文字、客户端版本、音色和参数、音频与字幕的项目相对路径、实测秒数、生成时间、解码检查及听审状态。实际合成文字仅用于追溯与复用判断，不是第二份编辑稿。

更新分镜的 `audio.src`（相对 `public/`）和 `audio.durationSeconds`，补齐配音前后留白与总帧数，执行分镜 `--ready` 校验。帧数计算规则见 [storyboard.md](storyboard.md)。音频文件、排期与检查记录完成后，才算该段生成成功。

## 技术字幕与配音读法

标准讲稿保留 `docker run`、`-d`、`--name`、`8080`、`1.0.1` 等技术写法。普通自然语言如“一个容器”无需改为数字。必要时在本幕配置精确的发音映射：

```json
{
  "narration": "-d 表示后台运行，宿主机端口为 8080。",
  "speechReplacements": [
    {"text": "-d", "spoken": "杠 d"},
    {"text": "8080", "spoken": "八零八零"}
  ]
}
```

制作脚本从 Skill 实际路径导入 `getSpeechText`、`restoreCaptionText`；工程需要独立复现时，将该辅助脚本复制到项目 `scripts/` 再相对导入。它不调用 TTS，也不自动读取配置。

先验证服务原始字幕与派生配音输入一致，再用 `restoreCaptionText(captions, scene)` 还原显示文字。函数保留每条字幕的时间和其他字段，返回新数组，不覆盖原始 SRT；文字按原分段位置从标准讲稿取回，使用标准讲稿的标点，避免服务额外插入的停顿逗号进入画面。显示字幕应与标准讲稿一致，而非逐字等于发音文本。

真实服务可能返回轻微重叠的句级边界。还原文字后使用同一脚本的 `normalizeCaptionTiming(captions)`：不超过 100 毫秒的相邻重叠只缩短前一句显示终点到后一句起点，返回 `{captions, corrections}`。将调整记录保存到工程的 `output/caption-timing.json`，原始 SRT 保持不变。这个阈值是保守的显示修正范围，不代表服务精度；更大重叠、倒序或无效时间必须核对，不自动合并或重排。正常边界不改动。

映射同时匹配、优先较长术语，避免将 `8080` 当作两个 `80`；不全局猜测中文数字。映射有歧义、字幕过期或术语跨越字幕边界时脚本报错，应调整映射或核对边界，不静默替换。参数大小写、版本中的点和端口中的冒号需要保留。

复用音频前比较实际合成文字与配置；标准讲稿仅调整显示拼写且配音输入相同，可以复用音频并重新生成显示字幕。字幕可读性检查覆盖数字、命令、参数和单位。

## 与 Remotion 同步

Remotion 使用 `staticFile(scene.audio.src)` 加载本地音频，在本幕的 `leadFrames` 开始播放；音频参数不再由 Remotion 二次调整。总帧数使用实测结果，给解释过程和画面阅读留足时间。

本客户端默认提供句级边界，CLI 将其写成 SRT；不要声称是逐字对齐。每份 SRT 从本幕音频起点计时，合并为全片字幕时加上本幕起始时间和 `leadFrames / fps`。配音、场景长度或转场调整后，需要重新计算偏移，不直接拼接多个从零开始的字幕文件。

核对字幕与实际口播、长句可读性以及是否超出音频范围。音轨存在、能解码不等于听感自然；按 [review.md](review.md) 检查关键术语、停顿、句尾和场景衔接。无法听审时记录未检查，不填通过。

## 失败处理与明确例外

| 情况 | 处理方式 |
| --- | --- |
| 缺少 uv 或 FFprobe | 报告具体工具缺项，准备工具后再继续，不用另一套语音方案掩盖 |
| Python 或包下载失败 | 保留工作区缓存与诊断，检查网络；不改版本、不改成全局安装 |
| 超时或服务暂不可用 | 对该段最多再试一次；仍失败则停止合成，保留已完成段落 |
| 音色不存在、鉴权或请求被拒绝 | 报告错误，不无限重试、不伪造凭据、不自动切换 Azure 或系统语音 |
| 术语发音或断句不合适 | 修改分镜中的对应口播，再生成该段，保持默认音色和语速，除非用户要求更改 |
| 文档要求离线处理 | 说明 edge-tts 依赖在线服务，等待用户选择离线方案或提供录音，不发送正文 |

只有用户明确提供录音或选择其他 TTS 时，才采用该方案，并在项目中记录偏离默认配置的原因。录音用 `narrationMode: provided`，先核对内容、按语义切分再测量；明确无声时设为 `none`。不要自动用 macOS `say`、付费 API 或其他现成服务作回退。

## 上游来源

- [edge-tts 项目与用法](https://github.com/rany2/edge-tts)：客户端、音色查询、参数和 SSML 限制。
- [PyPI 固定版本 7.2.8](https://pypi.org/project/edge-tts/7.2.8/)：本项目已验证的客户端版本。

依赖升级应由项目维护者单独验证，再更新默认配置与本文件。固定客户端版本无法固定微软在线服务端的行为；出现服务变更时报告问题，不把永久免费、无限调用或服务稳定性作为交付承诺。
