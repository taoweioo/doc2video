import {readFile,realpath} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {validateStoryboard} from './validate-storyboard.mjs';

const cell=value=>String(value).replace(/\r?\n/g,' ').replace(/\|/g,'\\|');
const time=(frame,fps)=>{
  const ms=Math.round(frame*1000/fps);
  return `${String(Math.floor(ms/3600000)).padStart(2,'0')}:${String(Math.floor(ms/60000)%60).padStart(2,'0')}:${String(Math.floor(ms/1000)%60).padStart(2,'0')}.${String(ms%1000).padStart(3,'0')}`;
};

export function chapterMarkdown(board) {
  if(!Number.isSafeInteger(board.fps)||board.fps<=0||!board.scenes?.length)throw new Error('章节索引需要有效帧率和场景');
  const rows=[];let frame=0;
  for(const scene of board.scenes){
    if(!Number.isSafeInteger(scene.durationInFrames)||scene.durationInFrames<=0)throw new Error('章节索引需要实际场景帧数');
    const chapter=board.version===2?board.chapters.find(c=>c.id===scene.chapterId):{id:scene.id,title:scene.onScreen[0],objective:scene.purpose||scene.narration||'本幕演示'};
    if(!chapter)throw new Error(`章节不存在：${scene.chapterId}`);
    let row=rows.at(-1);
    if(row?.id!==chapter.id){row={...chapter,start:frame};rows.push(row);}
    frame+=scene.durationInFrames;row.end=frame;
  }
  return `# 章节索引\n\n按 storyboard.json 的实际帧数顺序累加；修改排期后重新生成。\n\n| 开始 | 结束 | 章节 | 学习目标 |\n| --- | --- | --- | --- |\n${rows.map(r=>`| ${time(r.start,board.fps)} | ${time(r.end,board.fps)} | ${cell(r.title)} | ${cell(r.objective)} |`).join('\n')}\n`;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(await realpath(resolve(process.argv[1]))).href){
  try{
    if(process.argv.length!==3)throw new Error('用法：node chapters.mjs <storyboard.json>；输出写入项目 output/chapters.md');
    const board=JSON.parse(await readFile(process.argv[2],'utf8'));
    const errors=await validateStoryboard(board);if(errors.length)throw new Error(errors.join('\n'));
    process.stdout.write(chapterMarkdown(board));
  }catch(e){console.error(e.message);process.exitCode=1;}
}
