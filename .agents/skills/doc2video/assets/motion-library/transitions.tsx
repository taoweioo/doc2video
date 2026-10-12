import React from 'react';
import {useVideoConfig} from 'remotion';
import {TransitionSeries,linearTiming} from '@remotion/transitions';
import {fade} from '@remotion/transitions/fade';
import {slide} from '@remotion/transitions/slide';
import {wipe} from '@remotion/transitions/wipe';
import {flip} from '@remotion/transitions/flip';
import {clockWipe} from '@remotion/transitions/clock-wipe';
import {iris} from '@remotion/transitions/iris';

export type TransitionEffect='fade'|'slide'|'wipe'|'flip'|'clock-wipe'|'iris';
export type TransitionPairProps={before:React.ReactNode;after:React.ReactNode;effect:TransitionEffect;at:number;durationInFrames:number;transitionFrames?:number};
/** 一幕内部的画面切换。总长度保持 durationInFrames，旁白和字幕放在外部统一时间轴。 */
export function TransitionPair({before,after,effect,at,durationInFrames,transitionFrames=15}:TransitionPairProps){
 const {width,height}=useVideoConfig();
 if(![at,durationInFrames,transitionFrames].every(Number.isInteger)||at<1||transitionFrames<1||at+transitionFrames>durationInFrames)throw new Error('转场需要有效帧数：at >= 1 且 at + transitionFrames <= durationInFrames');
 const timing=linearTiming({durationInFrames:transitionFrames});
 const transition=()=>{switch(effect){
  case 'fade':return <TransitionSeries.Transition presentation={fade()} timing={timing}/>;
  case 'slide':return <TransitionSeries.Transition presentation={slide({direction:'from-right'})} timing={timing}/>;
  case 'wipe':return <TransitionSeries.Transition presentation={wipe({direction:'from-left'})} timing={timing}/>;
  case 'flip':return <TransitionSeries.Transition presentation={flip({direction:'from-right'})} timing={timing}/>;
  case 'clock-wipe':return <TransitionSeries.Transition presentation={clockWipe({width,height})} timing={timing}/>;
  case 'iris':return <TransitionSeries.Transition presentation={iris({width,height})} timing={timing}/>;
 }};
 return <TransitionSeries><TransitionSeries.Sequence durationInFrames={at+transitionFrames}>{before}</TransitionSeries.Sequence>{transition()}<TransitionSeries.Sequence durationInFrames={durationInFrames-at}>{after}</TransitionSeries.Sequence></TransitionSeries>;
}
