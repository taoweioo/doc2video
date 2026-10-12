import React from 'react';
/** 显式覆盖社区默认字体与主题；字体必须由宿主提供，不联网下载。 */
export function MotionTheme({children,style}:{children:React.ReactNode;style?:React.CSSProperties}){
 const variables={
  '--onda-glass-background':'rgba(255,254,250,0.94)','--onda-spotlight':'rgba(51,103,205,0.12)',
  '--onda-highlight':'#CFE0FC','--onda-code-keyword':'#7945AC','--onda-code-string':'#26713D',
  '--onda-code-number':'#9D4A1C','--onda-code-tag':'#087F75','--onda-add':'#26713D','--onda-remove':'#A53039','--onda-bg':'#F5F3EC','--onda-surface':'#FFFEFA','--onda-surface-2':'#E8ECE5',
  '--onda-border':'#C5CEC8','--onda-border-lit':'#9DB0A5','--onda-text':'#192D3C',
  '--onda-dim':'#586970','--onda-faint':'#63727B','--onda-accent':'#3367CD','--onda-accent-soft':'#087F75',
  '--onda-font-display':'"PingFang SC", "Microsoft YaHei", sans-serif',
  '--onda-font-body':'"PingFang SC", "Microsoft YaHei", sans-serif',
 } as React.CSSProperties;
 return <div style={{position:'absolute',inset:0,background:'#F5F3EC',fontFamily:'var(--onda-font-body)',...variables,...style}}>{children}</div>;
}
