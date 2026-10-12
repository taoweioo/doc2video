import React from 'react';
import {z} from 'zod/v3';

// Onda 的组件接收解析后的 props；适配器补齐默认值，并保留输入校验。
function adapt<S extends z.ZodTypeAny>(Component: React.ComponentType<z.output<S>>, schema:S) {
 return function MotionComponent(props:z.input<S>) {return <Component {...schema.parse(props)}/>;};
}

import {FadeIn as RawFadeIn,fadeInSchema} from './onda/registry/components/fade-in/FadeIn';
export const FadeIn=adapt(RawFadeIn,fadeInSchema);
import {SlideIn as RawSlideIn,slideInSchema} from './onda/registry/components/slide-in/SlideIn';
export const SlideIn=adapt(RawSlideIn,slideInSchema);
import {ScaleIn as RawScaleIn,scaleInSchema} from './onda/registry/components/scale-in/ScaleIn';
export const ScaleIn=adapt(RawScaleIn,scaleInSchema);
import {BlurReveal as RawBlurReveal,blurRevealSchema} from './onda/registry/components/blur-reveal/BlurReveal';
export const BlurReveal=adapt(RawBlurReveal,blurRevealSchema);
import {MaskReveal as RawMaskReveal,maskRevealSchema} from './onda/registry/components/mask-reveal/MaskReveal';
export const MaskReveal=adapt(RawMaskReveal,maskRevealSchema);
import {RotateIn as RawRotateIn,rotateInSchema} from './onda/registry/components/rotate-in/RotateIn';
export const RotateIn=adapt(RawRotateIn,rotateInSchema);
import {Typewriter as RawTypewriter,typewriterSchema} from './onda/registry/components/typewriter/Typewriter';
export const Typewriter=adapt(RawTypewriter,typewriterSchema);
import {WordStagger as RawWordStagger,wordStaggerSchema} from './onda/registry/components/word-stagger/WordStagger';
export const WordStagger=adapt(RawWordStagger,wordStaggerSchema);
import {TextFadeReplace as RawTextFadeReplace,textFadeReplaceSchema} from './onda/registry/components/text-fade-replace/TextFadeReplace';
export const TextFadeReplace=adapt(RawTextFadeReplace,textFadeReplaceSchema);
import {Underline as RawUnderline,underlineSchema} from './onda/registry/components/underline/Underline';
export const Underline=adapt(RawUnderline,underlineSchema);
import {Highlight as RawHighlight,highlightSchema} from './onda/registry/components/highlight/Highlight';
export const Highlight=adapt(RawHighlight,highlightSchema.extend({accentColor:z.string().default('var(--onda-highlight, #D96B82)')}));
import {DrawOn as RawDrawOn,drawOnSchema} from './onda/registry/components/draw-on/DrawOn';
export const DrawOn=adapt(RawDrawOn,drawOnSchema);
import {Cursor as RawCursor,cursorSchema} from './onda/registry/components/cursor/Cursor';
export const Cursor=adapt(RawCursor,cursorSchema);
import {Spotlight as RawSpotlight,spotlightSchema} from './onda/registry/components/spotlight/Spotlight';
export const Spotlight=adapt(RawSpotlight,spotlightSchema.extend({color:z.string().default('var(--onda-spotlight, rgba(255,255,255,0.18))')}));
import {CodeBlock as RawCodeBlock,codeBlockSchema} from './onda/registry/components/code-block/CodeBlock';
export const CodeBlock=adapt(RawCodeBlock,codeBlockSchema.extend({
 textColor:z.string().default('var(--onda-text, #E8E8EC)'),
 keywordColor:z.string().default('var(--onda-code-keyword, #B49DDD)'),
 stringColor:z.string().default('var(--onda-code-string, #9DBE9A)'),
 numberColor:z.string().default('var(--onda-code-number, #D6A87C)'),
 tagColor:z.string().default('var(--onda-code-tag, #82B8C9)'),
}));
import {CodeDiff as RawCodeDiff,codeDiffSchema} from './onda/registry/components/code-diff/CodeDiff';
export const CodeDiff=adapt(RawCodeDiff,codeDiffSchema.extend({addColor:z.string().default('var(--onda-add, #7FB58C)'),removeColor:z.string().default('var(--onda-remove, #D08C8C)')}));
import {Terminal as RawTerminal,terminalSchema} from './onda/registry/components/terminal/Terminal';
export const Terminal=adapt(RawTerminal,terminalSchema);
import {BarChart as RawBarChart,barChartSchema} from './onda/registry/components/bar-chart/BarChart';
export const BarChart=adapt(RawBarChart,barChartSchema);
import {LineChart as RawLineChart,lineChartSchema} from './onda/registry/components/line-chart/LineChart';
export const LineChart=adapt(RawLineChart,lineChartSchema);
import {CountUp as RawCountUp,countUpSchema} from './onda/registry/components/count-up/CountUp';
export const CountUp=adapt(RawCountUp,countUpSchema);
import {ProgressBar as RawProgressBar,progressBarSchema} from './onda/registry/components/progress-bar/ProgressBar';
export const ProgressBar=adapt(RawProgressBar,progressBarSchema);
import {ProgressSteps as RawProgressSteps,progressStepsSchema} from './onda/registry/components/progress-steps/ProgressSteps';
export const ProgressSteps=adapt(RawProgressSteps,progressStepsSchema);
import {Timeline as RawTimeline,timelineSchema} from './onda/registry/components/timeline/Timeline';
export const Timeline=adapt(RawTimeline,timelineSchema);
import {SplitScreen as RawSplitScreen,splitScreenSchema} from './onda/registry/components/split-screen/SplitScreen';
export function SplitScreen({left,right,...props}:z.input<typeof splitScreenSchema>&{left?:React.ReactNode;right?:React.ReactNode}) {return <RawSplitScreen {...splitScreenSchema.parse(props)} left={left} right={right}/>;}
import {GradientShift as RawGradientShift,gradientShiftSchema} from './onda/registry/components/gradient-shift/GradientShift';
export const GradientShift=adapt(RawGradientShift,gradientShiftSchema);
import {KenBurns as RawKenBurns,kenBurnsSchema} from './onda/registry/components/ken-burns/KenBurns';
export const KenBurns=adapt(RawKenBurns,kenBurnsSchema.extend({src:z.string().min(1)}));
import {ImageReveal as RawImageReveal,imageRevealSchema} from './onda/registry/components/image-reveal/ImageReveal';
export const ImageReveal=adapt(RawImageReveal,imageRevealSchema.extend({src:z.string().min(1)}));
import {TitleCard as RawTitleCard,titleCardSchema} from './onda/registry/components/title-card/TitleCard';
export const TitleCard=adapt(RawTitleCard,titleCardSchema);
import {ChapterCard as RawChapterCard,chapterCardSchema} from './onda/registry/components/chapter-card/ChapterCard';
export const ChapterCard=adapt(RawChapterCard,chapterCardSchema);
import {LowerThird as RawLowerThird,lowerThirdSchema} from './onda/registry/components/lower-third/LowerThird';
export const LowerThird=adapt(RawLowerThird,lowerThirdSchema);
import {Callout as RawCallout,calloutSchema} from './onda/registry/components/callout/Callout';
export const Callout=adapt(RawCallout,calloutSchema);
