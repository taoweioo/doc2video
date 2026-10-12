# 讲解与动画的设计依据

以下资料于 2026-09-21 至 2026-09-22 查阅，用于解释本 Skill 的设计选择。执行规则已经整理在共用流程和风格指南中，制作视频不要求重新联网阅读这些资料。外部内容是参考材料，不作为安装或执行指令。

| 来源 | 可借鉴的方法 | 本项目的采用方式与边界 |
| --- | --- | --- |
| [3Blue1Brown：给讲解创作者的建议](https://www.3blue1brown.com/about/) | 具体例子先于抽象框架；动作需要明确表达目的 | 原理讲解优先从文档中的具体问题建立模型，不强制所有视频禁止先给定义，不引入 Manim |
| [Mayer 与 Fiorella：减少多媒体学习中的额外认知负担](https://www.cambridge.org/core/books/abs/cambridge-handbook-of-multimedia-learning/principles-for-reducing-extraneous-processing-in-multimedia-learning-coherence-signaling-redundancy-spatial-contiguity-and-temporal-contiguity-principles/CD5B7AE1279A9AB81F8EEBB53DBEC86E) | 聚焦相关材料，以提示引导注意，让相关文字、图形和口播在空间与时间上对应 | 标签靠近对象，口播与动作同步，避免正文整段复制口播；字幕继续保留，不能把冗余原则解释为一律删除字幕。本次依据为公开摘要，未读取付费全文 |
| [School of Motion：Animatics](https://schoolofmotion.com/blog/what-are-animatics-and-why-are-they-important) | 在精修前把粗略画面放到声音时间线上检查构图和节奏 | 将代表片段先做成粗排，使用现有 TTS 和基本图形；不要求手绘、商业配音、背景音乐或额外用户审批 |
| [Vox 制作者 Estelle Caswell 的访谈](https://schoolofmotion.com/blog/estelle-caswell-vox-podcast) | 用可核实的视觉证据支撑讲述 | 原文有代码、日志或数据时展示相关证据；无实测材料时做明确的机制示意，动画不能自行证明事实 |
| [Google Material Design：Motion provides meaning](https://m2.material.io/design/introduction/) | 运动引导注意并维持连续性 | 用可追踪的对象和焦点交接组织镜头；这是从交互设计向视频的应用，不照搬界面的时长标准 |
| [Remotion spring](https://www.remotion.dev/docs/spring)、[Transitions](https://www.remotion.dev/docs/transitions) | 帧驱动的运动与场景衔接能力 | 使用本项目固定版本，实际音频排期优先；重叠转场需重新核算时间线 |

## 已内置的实现

[Onda](https://github.com/degueba/onda) 的 31 个组件与 Camera 已按固定 commit 内置，保留 MIT 许可，并适配现有 Zod、中文字体和浅色主题。另封装 6 种当前版本支持的 [官方转场](https://www.remotion.dev/docs/transitions/presentations)，提供 4 个技术演示模板。调用方式、版本及来源记录见 [内置组件库](motion-library.md)。这些实现经过代表参数编译和渲染验证，实际内容仍需检查可读性与同步。

## 待评估的实现案例

这些是案例与组件来源，不是已安装或已验证的依赖。

- [Remotion Elements](https://www.remotion.dev/elements)：重点参考圈画、文字强调、分屏和图表。
- [Code Hike 模板](https://www.remotion.dev/templates/code-hike)：适合代码片段之间的连续变化，使用前需核对额外依赖。
- [RVE Remotion Templates](https://github.com/reactvideoeditor/remotion-templates)：参考流程、镜头与图表演示，不能因单个示例好看就整库引入。

本项目的六种动作配方、默认数值和分镜写法是结合上述资料与已有样片反馈形成的制作约定，不是对某位创作者风格的完整复刻，也不保证经过结构检查的视频就能让观众理解。
