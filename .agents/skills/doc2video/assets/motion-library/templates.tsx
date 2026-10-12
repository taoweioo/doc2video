import React from 'react';
import {useCurrentFrame,useVideoConfig,interpolate,Easing} from 'remotion';
import {CodeDiff,Terminal,WordStagger,SplitScreen,DrawOn} from './components';
import {MotionTheme} from './theme';

/** 示例模板接收真实内容，命令与输出只绘制，不执行。 */
export function CodeChangeScene({title,removed,added}:{title:string;removed:string[];added:string[]}){
 return <MotionTheme><WordStagger text={title} fontSize={64} placement="top"/><CodeDiff placement="center" title="代码差异" lines={[...removed.map(text=>({text,type:'remove' as const})),...added.map(text=>({text,type:'add' as const}))]} delay={20} width={1450} fontSize={40}/></MotionTheme>;
}
export function CommandScene({title,command,output}:{title:string;command:string;output:string[]}){
 return <MotionTheme><WordStagger text={title} fontSize={64} placement="top"/><Terminal placement="center" title="命令演示" command={command} output={output} delay={20} width={1450} fontSize={40}/></MotionTheme>;
}
export function CompareScene({title,left,right}:{title:string;left:React.ReactNode;right:React.ReactNode}){
 return <MotionTheme><WordStagger text={title} fontSize={64} placement="top"/><SplitScreen placement="center" left={left} right={right} delay={18} width={1550} height={590} gap={36}/></MotionTheme>;
}
/** 三节点机制示意。time 是本场景局部帧；速度不表达真实耗时。 */
export function PipelineScene({title,labels,startFrame=20,stepFrames=35}:{title:string;labels:[string,string,string];startFrame?:number;stepFrames?:number}){
 const frame=useCurrentFrame(),{width,height}=useVideoConfig();
 if(!Number.isInteger(startFrame)||startFrame<0||!Number.isInteger(stepFrames)||stepFrames<1)throw new Error('流程动画需要有效帧数');
 const p=interpolate(frame,[startFrame,startFrame+stepFrames,startFrame+stepFrames*2],[0,1,2],{extrapolateLeft:'clamp',extrapolateRight:'clamp',easing:Easing.inOut(Easing.cubic)});
 const y=height*.53,xs=[width*.2,width*.5,width*.8];
 return <MotionTheme><WordStagger text={title} fontSize={64} placement="top"/>
  <DrawOn d={`M ${xs[0]} ${y} L ${xs[2]} ${y}`} viewBox={`0 0 ${width} ${height}`} width={width} height={height} stroke="#819E98" strokeWidth={5} duration={20} placement="center"/>
  <svg width={width} height={height} style={{position:'absolute',inset:0}}>
   {labels.map((label,i)=><g key={i}><circle cx={xs[i]} cy={y} r={105} fill={p>=i?'#E0EEE6':'#F5F3EC'} stroke={p>=i?'#087F75':'#819E98'} strokeWidth={4}/><text x={xs[i]} y={y+13} textAnchor="middle" fill="#192D3C" fontSize={36}>{label}</text></g>)}
   {frame>=startFrame&&p<2?<circle cx={interpolate(p,[0,1,2],xs)} cy={y} r={17} fill="#CB542D"/>:null}
   <text x={width/2} y={height*.79} textAnchor="middle" fill="#63727B" fontSize={30}>机制示意 · 移动表示传递方向，不表示实测速度</text>
  </svg>
 </MotionTheme>;
}
