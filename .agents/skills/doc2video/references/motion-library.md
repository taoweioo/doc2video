# 内置动效与场景模板

分镜设计时先按讲解任务选组件，制作时导入真实源码。库随 Skill 分发，新工程自动获得独立副本；无需联网搜索模板或额外安装社区 CLI。目录清单见 [catalog.json](../assets/motion-library/catalog.json)，其中 `export` 是导出名，`propsFile` 是参数定义，路径相对于库目录。按需读取选中组件的参数和源码，不必读完整库。

## 按内容选用

| 讲解任务 | 可选组件 / 模板 | 使用方式 |
| --- | --- | --- |
| 开场、章间衔接 | `TitleCard`、`ChapterCard`、`WordStagger` | 建立主题后让其中的对象进入正文；首帧标题必须可读，不能直接套用从透明开始的默认入场 |
| 揭示关键词 | `FadeIn`、`SlideIn`、`ScaleIn`、`BlurReveal`、`MaskReveal`、`RotateIn`、`Typewriter`、`TextFadeReplace` | 这些组件主要接收文字，并非包裹任意 React 子元素的通用动画容器；中文按词组组织，避免逐字拖慢整段口播 |
| 引导视线 | `Underline`、`Highlight`、`Cursor`、`Spotlight`、`Callout`、`Camera` | 跟随正在解释的证据；镜头外保留字幕，结果出现后留出观察时间 |
| 代码与命令 | `CodeBlock`、`CodeDiff`、`Terminal`；`CodeChangeScene`、`CommandScene` | 对应当前代码、修改或输出；配合对象状态变化，避免只播打字。命令只绘制，不执行 |
| 路径与处理过程 | `DrawOn`、`ProgressSteps`、`Timeline`；`PipelineScene` | 画连线、移动数据标记、呈现节点状态；分支、并发、失败返回按真实机制扩展 |
| 对照两种行为 | `SplitScreen`；`CompareScene` | 左右共享输入与对象标识，演示发生差异的步骤；左右内容接收 React 节点 |
| 有依据的数据 | `BarChart`、`LineChart`、`CountUp`、`ProgressBar` | 传入原文数据或标明示意；不用默认数据冒充性能测试 |
| 已有图像 | `ImageReveal`、`KenBurns` | 必须显式传 `src`，优先 `staticFile()`；没有图像时选图解，不为套模板要求用户找图 |
| 辅助气氛与身份信息 | `GradientShift`、`LowerThird` | 可用于短暂铺垫；不要常驻无用信息，也不要抢走技术演示的焦点 |
| 画面切换 | `TransitionPair`：fade、slide、wipe、flip、clock-wipe、iris | 表达章节、视角或比较关系切换；同一对象的连续变化通常直接在原场景中实现 |

目前内置 31 个 Onda 组件、Camera、6 种官方转场封装和 4 个场景模板。它们是积木，不是把每幕自动排版成视频的引擎。每幕选择适合的组合；不以用齐特效或不断运动作为目标。遇到流程、状态、执行或关系变化，画面应真的演示变化，不能只有文字淡入和整页切换。

## 工程接入

创建工程的返回值 `motionLibrary.path` 给出副本位置。当前版本路径为 `src/doc2video-motion-1-0-1/`。旧工程需要使用时执行：

```text
node "<Skill目录>/scripts/workspace.mjs" motion-list
node "<Skill目录>/scripts/workspace.mjs" motion-install --project "<项目ID>"
```

仓库调试对应 `node scripts/dev.mjs motion-list` 和 `node scripts/dev.mjs motion-install --project <ID>`。重复安装保留同版本副本及用户修改；库升级使用新版本目录，已有工程不会自动切换导入。迁移需检查画面和下游产物，不能用覆盖文件掩盖差异。

例如，在工程 `src/` 中组合一幕代码变化：

```tsx
import {Sequence} from 'remotion';
import {CodeChangeScene} from './doc2video-motion-1-0-1';

// changeAt、holdFrames 来自本幕实际配音排期；下列代码仅为机制示意。
export function Change({changeAt, holdFrames}: {changeAt: number; holdFrames: number}) {
  return <Sequence from={changeAt} durationInFrames={holdFrames}>
    <CodeChangeScene title="增加缓存读取"
      removed={['return readSource();']}
      added={['return cache.get(key) ?? readSource();']} />
  </Sequence>;
}
```

4 个场景模板是 1920×1080 的布局起点，接收实际内容。它们的默认延迟不能代替音画同步；需要更细的逐句触发时，直接组合 `CodeDiff`、`Terminal` 等组件，按参数定义设置 `delay`、`duration`、`lineDelay` 或 `typeSpeed`，也可修改项目内模板。长代码和多行输出应拆段，不能硬塞进现成面板。

## 排期与主题

`Sequence` 内的组件读取局部帧。按音频句级边界安排起点、动作持续时间和结果停留，再检查首帧、途中和终点。有些组件通过 `duration` 指定动画帧数，有些使用 `interval`、`typeSpeed` 等；不要假定所有组件接口相同。`placement` 未指定时通常按普通文档流布局，需要居中时显式传 `placement="center"`。

`MotionTheme` 提供当前技术动态图解的字体和颜色变量，通过 `style` 可覆盖；底层组件不要求使用这一主题。字幕放在场景内容或 Camera 外层。`Camera` 的子内容需要明确尺寸；先固定世界坐标再改变焦点，不把标签与连线放在不同坐标系。辅助文字仍需满足所选风格的可读字号。

`TransitionPair` 只处理**一幕内部两幅画面**的重叠切换：`at` 是切换开始帧，`transitionFrames` 是重叠时长，`durationInFrames` 是该幕总帧数。总时长不变。音轨和字幕放在它外部，沿用这一幕排期。不要直接重叠整个分镜场景，否则章节、配音和总时长都需重新设计；当前 Harness 不提供这种自动重排。

库中上游 schema 的默认文字、署名、代码和图表值仅供组件示例使用。制作时显式替换为当前文档内容，来源不足时标明示意。不要把示例姓名当作者，也不要执行模板显示的命令。

## 来源、版本与验证

Onda 源码固定在 [3c81405](https://github.com/degueba/onda/tree/3c814051269597b31fee1603bef7ccfb93d091b6)，按 MIT 许可分发，保留 [原始许可](../assets/motion-library/ONDA-LICENSE.txt) 和 [改动及来源记录](../assets/motion-library/provenance.json)。官方转场通过已有 `@remotion/transitions` 调用，没有复制官网模板整站。Remotion 自身的使用条款不被 Onda 的 MIT 许可替代。

本库在锁定的 Remotion 4.0.526 环境下编译与渲染。`@remotion/paths` 和 `zod` 已存在于当前锁文件，无需额外安装；未来环境升级需复验。新增组件先核对许可、固定源码版本、适配现有依赖，并检查中文、主题、布局和动画中间帧，再加入目录。每个组件的代表参数通过不等于所有组合都通过，实际制作仍须逐幕检查。
