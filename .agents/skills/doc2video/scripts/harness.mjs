import {readFile, writeFile, rename, rm, mkdir, readdir, lstat, open} from 'node:fs/promises';
import {createHash, randomUUID} from 'node:crypto';
import {createReadStream, appendFileSync} from 'node:fs';
import {join, resolve, relative, sep, isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runProcess as execute} from './process.mjs';
import {validateStoryboard} from './validate-storyboard.mjs';
import {getSpeechText, normalizeSpeechText} from './speech-text.mjs';
import {chapterMarkdown} from './chapters.mjs';

const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const json = async file => JSON.parse(await readFile(file, 'utf8'));
const alive = pid => { try { process.kill(pid, 0); return true; } catch (e) { return e.code !== 'ESRCH'; } };
const isMissing = e => e.code === 'ENOENT';
const retryLimit = stage => stage.startsWith('audio:') ? 2 : 3;

async function local(project, name) {
  if (typeof name !== 'string' || !name || name.includes('\\') || name.includes(':') || isAbsolute(name)) throw new Error(`项目相对路径无效：${name}`);
  const file = resolve(project, name), rel = relative(project, file);
  if (!rel || rel.startsWith(`..${sep}`) || rel === '..') throw new Error(`路径越界：${name}`);
  let part = project;
  for (const bit of rel.split(sep)) {
    part = join(part, bit);
    const info = await lstat(part).catch(e => {if (!isMissing(e)) throw e;});
    if (info?.isSymbolicLink()) throw new Error(`任务产物不得经过符号链接：${name}`);
  }
  return file;
}
async function fileHash(project, name) {
  const file = await local(project, name);
  const info = await lstat(file).catch(e => {if (!isMissing(e)) throw e;});
  if (!info) return null;
  if (!info.isFile()) throw new Error(`不是普通文件：${name}`);
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
async function files(project, names) {
  const result = {};
  for (const name of names) result[name] = await fileHash(project, name);
  return result;
}
async function tree(project, name) {
  const dir = await local(project, name);
  const entries = await readdir(dir, {withFileTypes:true}).catch(e => {if (isMissing(e)) return []; throw e;});
  const result = {};
  for (const item of entries.sort((a,b)=>a.name.localeCompare(b.name))) {
    const next = `${name}/${item.name}`;
    if (item.isDirectory()) Object.assign(result, await tree(project, next));
    else Object.assign(result, await files(project, [next]));
  }
  return result;
}
async function save(project, state) {
  const target = await local(project, 'harness.json'), tmp = `${target}.${randomUUID()}.tmp`;
  try { await writeFile(tmp, JSON.stringify(state,null,2)+'\n', {flag:'wx'}); await rename(tmp,target); }
  finally { await rm(tmp,{force:true}); }
}
async function load(project) {
  const marker = await json(await local(project,'project.json'));
  if (marker.owner !== 'doc2video') throw new Error('不是 doc2video 项目。');
  const state = await json(await local(project,'harness.json')).catch(e => {if(isMissing(e)) return {schemaVersion:1,projectId:marker.id,steps:{},history:[]};throw e;});
  if (state.schemaVersion !== 1 || state.projectId !== marker.id || !state.steps || !Array.isArray(state.history)) throw new Error('harness 状态无效。');
  return state;
}
const editorial = board => board && {...board,scenes:board.scenes?.map(({audio,durationInFrames,leadFrames,tailFrames,...s})=>s)};
async function context(project) {
  let board, boardError;
  try { board=await json(await local(project,'storyboard.json')); if(!Array.isArray(board?.scenes)||!board.scenes.every(s=>s&&typeof s.id==='string'&&/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s.id)))throw new Error('scenes 必须为包含有效 ID 的场景数组'); }
  catch(e){board=undefined;boardError=e.message;}
  const audioIds=board?.narrationMode==='none'?[]:(board?.scenes??[]).map(s=>`audio:${s.id}`);
  const deps={brief:[],outline:['brief'],storyboard:['outline'],...Object.fromEntries(audioIds.map(id=>[id,['storyboard']])),visuals:['storyboard',...audioIds],render:['visuals'],review:['render']};
  return {board,boardError,deps};
}
async function audioData(project, board, id) {
  const scene=board.scenes.find(s=>s.id===id), config=board.narrationMode==='tts'?await json(await local(project,'tts-config.json')):null;
  const manifest=await json(await local(project,'output/audio-manifest.json'));
  const entries=manifest.filter(row=>row.sceneId===id);
  if(entries.length!==1)throw new Error(`音频 manifest 需要唯一 sceneId：${id}`);
  return {scene,config,entry:entries[0]};
}
async function fingerprint(project, stage, ctx, record={}) {
  const {board}=ctx;
  let inputs, outputs;
  if(stage==='brief'){inputs=await files(project,['source.md']);outputs=await files(project,['brief.md']);}
  else if(stage==='outline'){inputs=await files(project,['source.md','brief.md']);outputs=await files(project,['outline.md']);}
  else if(stage==='storyboard'){inputs=await files(project,['source.md','brief.md','outline.md']);outputs={editorial:editorial(board)};}
  else if(stage.startsWith('audio:')){
    const {scene,config,entry}=await audioData(project,board,stage.slice(6));
    inputs={speech:board.narrationMode==='tts'?getSpeechText(scene):scene.narration,config,mode:board.narrationMode};
    outputs={entry:{text:entry.text,config:entry.config,audio:entry.audio,subtitle:entry.subtitle,durationSeconds:entry.durationSeconds},files:await files(project,[entry.audio,entry.subtitle])};
  }else if(stage==='visuals'){
    inputs={board,audio:await files(project,(board?.scenes??[]).flatMap(s=>s.audio?[`public/${s.audio.src}`]:[]))};
    outputs={src:await tree(project,'src'),public:await tree(project,'public'),config:await files(project,['tsconfig.json'])};
  }else if(stage==='render'){
    inputs={board,src:await tree(project,'src'),public:await tree(project,'public'),config:await files(project,['project.json','tsconfig.json']),composition:record.composition??'DocumentVideo'};
    outputs=await files(project,[`output/${record.output??'video.mp4'}`]);
  }else if(stage==='review'){
    inputs={board,source:await files(project,['source.md','brief.md','outline.md']),video:await files(project,[`output/${record.output??'video.mp4'}`])};
    const review=await json(await local(project,'output/review.json'));
    outputs={review,files:await files(project,['output/review.md','output/chapters.md',...new Set((review.checks??[]).flatMap(c=>c.evidence??[]))])};
  }
  const recipe=record.script?{script:record.script,args:record.args??[],hash:await fileHash(project,record.script)}:null;
  return {inputs:digest({protocol:1,inputs,recipe}),outputs:digest(outputs)};
}
export async function taskStatus(project) {
  const state=await load(project),ctx=await context(project),steps={};
  for(const [stage,deps] of Object.entries(ctx.deps)){
    const record=state.steps[stage];
    let status=record?.status??'pending',reason, snapshot;
    if(status==='running')status=alive(record.pid)?'running':'interrupted';
    try{
      snapshot=await fingerprint(project,stage,ctx,record);
      if(['completed','needs-review'].includes(status) && (record.inputs!==snapshot.inputs||record.outputs!==snapshot.outputs)){status='stale';reason='输入或产物内容已变化';}
    }catch(e){if(['completed','needs-review'].includes(status))status='stale';reason=e.message;}
    const artifactStatus=status;
    const blockedBy=deps.filter(dep=>steps[dep].status!=='completed');
    if(blockedBy.length && status!=='running'){status='blocked';reason=`前置阶段未完成：${blockedBy.join(', ')}`;}
    steps[stage]={status,artifactStatus,reason,blockedBy,attempts:record?.attempts??0,error:record?.error,errorCode:record?.errorCode,failurePhase:record?.failurePhase,log:record?.log,validation:record?.validation,durationMs:record?.durationMs,command:record?.command};
  }
  const next=Object.entries(steps).find(([,s])=>!['completed','blocked'].includes(s.status));
  return {project,tracked:!!state.updatedAt,boardError:ctx.boardError,steps,next:next?{stage:next[0],...next[1]}:null,complete:Object.values(steps).every(s=>s.status==='completed')};
}
const stageGuides={
  brief:{guide:'planning.md',materials:['source.md','brief.md'],criteria:['明确受众、目标、范围和必要前提；程序只检查文件非空，内容需审查。']},
  outline:{guide:'planning.md',materials:['source.md','brief.md','outline.md'],criteria:['目标都有章节承接，前置知识先于结论，省略有依据。']},
  storyboard:{guide:'storyboard.md',materials:['source.md','brief.md','outline.md','storyboard.json'],criteria:['结构与引用通过校验；口播保留技术前提，画面能说明讲解目的。']},
  audio:{guide:'audio.md',materials:['storyboard.json','output/audio-manifest.json'],criteria:['音频及原始字幕对应当前配音输入，路径、实测时长和解码有效；听感另行审查。']},
  visuals:{guide:'remotion.md',materials:['storyboard.json','src/','public/','tsconfig.json'],criteria:['实际排期、标准字幕、素材和 TypeScript 通过检查；先查看代表片段的动作与阅读时间。']},
  render:{guide:'remotion.md',materials:['storyboard.json','src/','public/','project.json'],criteria:['使用新的输出名；全片尺寸、帧率、帧数、音轨和解码符合分镜。']},
  review:{guide:'review.md',materials:['source.md','brief.md','outline.md','storyboard.json','output/chapters.md','output/review.md','output/review.json'],criteria:['章节索引对应实际排期；审查绑定当前视频，内容、视觉、听感分别记录证据；未检查项保留 needs-review。']},
};
async function briefing(project,name) {
  try {
    const file=await local(project,name),handle=await open(file,'r');
    try {
      const info=await handle.stat();if(!info.isFile())throw new Error('不是普通文件');
      const buffer=Buffer.alloc(16384),{bytesRead}=await handle.read(buffer,0,buffer.length,0),text=buffer.subarray(0,bytesRead).toString('utf8');
      return {file:name,status:!text.trim()?'empty':text.includes('<!-- doc2video-context-template')?'template':'present',text,truncated:info.size>bytesRead};
    } finally {await handle.close();}
  } catch(e){return {file:name,status:isMissing(e)?'missing':'unreadable',error:isMissing(e)?undefined:e.message};}
}
export async function taskResume(project) {
  const status=await taskStatus(project),state=await load(project),ctx=await context(project);
  const [brief,note]=await Promise.all([briefing(project,'brief.md'),briefing(project,'context.md')]);
  const warnings=[];
  if(note.status!=='present')warnings.push('接续说明缺失、未填写或无法读取；先核对现有材料，再补充 context.md，不推测历史决定。');
  if(brief.truncated||note.truncated)warnings.push('摘要最多读取每份材料的 16 KiB；需要完整内容时继续读取原文件。');
  let next=status.next;
  if(next){
    const kind=next.stage.startsWith('audio:')?'audio':next.stage,guide=stageGuides[kind],record=state.steps[next.stage];
    let sameInput=false;
    if(record)try{sameInput=record.inputs===await inputFingerprint(project,next.stage,ctx,record);}catch{}
    const used=sameInput&&['failed','running'].includes(record?.status)?record.attempts??0:0;
    const limit=retryLimit(next.stage),retry={used,limit,allowed:next.status!=='running'&&used<limit};
    const action=next.status==='running'?'任务仍在运行，先读取日志，不重复执行。':!retry.allowed?'相同输入与脚本已达到执行上限，先检查日志并修复原因。':next.status==='needs-review'?'完成尚未检查的审查项；不能把未观看或未听审改成通过。':['failed','interrupted','stale'].includes(next.status)?'检查变化或失败原因，修复受影响材料后重新检查；保留有效成果。':'读取本阶段材料与指南，准备产物并检查后登记。';
    const materials=[...guide.materials];
    if(kind==='audio'&&ctx.board?.narrationMode==='tts')materials.push('tts-config.json');
    if(kind==='render'||kind==='review')materials.push(`output/${state.steps.render?.output??'video.mp4'}`);
    next={...next,action,retry,...guide,materials,guide:fileURLToPath(new URL(`../references/${guide.guide}`,import.meta.url))};
  }
  return {...status,next,summary:{brief,context:note},warnings,contextTemplate:fileURLToPath(new URL('../assets/context-template.md',import.meta.url)),contextGuide:fileURLToPath(new URL('../references/context.md',import.meta.url)),authority:'正文和配置以对应文件为准，实际进度以上述重新核对的状态为准；context.md 是接续说明，不能用来跳过检查。'};
}
async function probe(project,name,options) {
  return JSON.parse(await execute('ffprobe',['-v','error','-show_streams','-show_format','-of','json',await local(project,name)],options));
}
async function nonempty(project,name) {
  const value=await readFile(await local(project,name),'utf8');if(!value.trim())throw new Error(`文件为空：${name}`);return value;
}
async function validate(project,stage,ctx,record,services,processOptions) {
  const {board}=ctx;
  if(stage==='brief'||stage==='outline'){
    await nonempty(project,'source.md');await nonempty(project,`${stage}.md`);return {files:'nonempty',semanticReview:'not automated'};
  }
  const errors=await validateStoryboard(board,{source:await nonempty(project,'source.md'),ready:['visuals','render','review'].includes(stage),publicDir:join(project,'public')});
  if(errors.length)throw new Error(errors.join('\n'));
  if(stage==='storyboard')return {};
  if(stage.startsWith('audio:')){
    const {scene,config,entry}=await audioData(project,board,stage.slice(6));
    if(entry.text!==(board.narrationMode==='tts'?getSpeechText(scene):scene.narration))throw new Error('音频 manifest 与当前口播不一致');
    if(config&&digest(entry.config)!==digest(config))throw new Error('音频 manifest 与 TTS 配置不一致');
    if(entry.audio!==`public/${scene.audio?.src}`)throw new Error('音频 manifest 路径与分镜不一致');
    const media=await probe(project,entry.audio,processOptions),duration=Number(media.format.duration);
    if(!media.streams.some(s=>s.codec_type==='audio')||!Number.isFinite(duration)||duration<=0)throw new Error('没有有效音频轨');
    if(Math.abs(duration-scene.audio.durationSeconds)>.1||Math.abs(duration-entry.durationSeconds)>.1)throw new Error('音频实测时长与记录不一致');
    await execute('ffmpeg',['-v','error','-i',await local(project,entry.audio),'-f','null','-'],processOptions);
    const srt=await nonempty(project,entry.subtitle);
    const text=srt.trim().split(/\r?\n\s*\r?\n/).map(block=>block.split(/\r?\n/).slice(2).join('')).join('');
    if(normalizeSpeechText(text)!==normalizeSpeechText(entry.text))throw new Error('原始字幕与配音输入不一致');
    return {durationSeconds:duration,decode:'passed'};
  }
  if(stage==='visuals'){
    if(board.narrationMode!=='none'){
      const captions=await json(await local(project,'src/captions.json'));
      for(const scene of board.scenes){
        const rows=captions[scene.id];
        if(!Array.isArray(rows)||normalizeSpeechText(rows.map(c=>c.text).join(''))!==normalizeSpeechText(scene.narration))throw new Error(`显示字幕不匹配：${scene.id}`);
        let end=0;
        for(const c of rows){if(!Number.isFinite(c.startMs)||!Number.isFinite(c.endMs)||c.startMs<end||c.endMs<=c.startMs||c.endMs>scene.audio.durationSeconds*1000+100)throw new Error(`字幕时间无效：${scene.id}`);end=c.endMs;}
      }
    }
    await services.check(processOptions);return {typescript:'passed'};
  }
  if(stage==='render'){
    const name=`output/${record.output??'video.mp4'}`,media=await probe(project,name,processOptions),video=media.streams.find(s=>s.codec_type==='video');
    const expectedFrames=board.scenes.reduce((n,s)=>n+s.durationInFrames,0);
    if(!video||video.width!==board.width||video.height!==board.height||Number(video.nb_frames)!==expectedFrames||Math.abs(Number(video.duration)-expectedFrames/board.fps)>1/board.fps)throw new Error('成片尺寸、帧数或时长与分镜不一致');
    const [num,den]=video.r_frame_rate.split('/').map(Number);if(num/den!==board.fps)throw new Error('成片帧率与分镜不一致');
    if(board.narrationMode!=='none'&&!media.streams.some(s=>s.codec_type==='audio'))throw new Error('成片缺少配音轨');
    await execute('ffmpeg',['-v','error','-i',await local(project,name),'-f','null','-'],processOptions);return {media,decode:'passed'};
  }
  const review=await json(await local(project,'output/review.json'));
  if(review.video!==`output/${record.output??'video.mp4'}`||review.videoSha256!==await fileHash(project,review.video))throw new Error('审查记录未绑定当前视频内容');
  if(!Array.isArray(review.checks))throw new Error('审查需要 checks 数组');
  for(const id of ['content','visual','listening']){
    const rows=review.checks.filter(c=>c.id===id),c=rows[0];
    if(rows.length!==1||!['passed','needs-fix','not-reviewed','not-applicable'].includes(c.status)||!c.note?.trim())throw new Error(`审查项目无效：${id}`);
    if(c.status==='not-applicable'&&(id!=='listening'||board.narrationMode!=='none'))throw new Error(`此审查项不能标为不适用：${id}`);
    if(c.status==='passed'&&(!c.reviewer?.trim()||!Array.isArray(c.evidence)||!c.evidence.length))throw new Error(`审查通过需要审查者和证据：${id}`);
    for(const path of c.evidence??[])if(!await fileHash(project,path))throw new Error(`审查证据不存在：${path}`);
  }
  await nonempty(project,'output/review.md');
  if((await nonempty(project,'output/chapters.md')).trim()!==chapterMarkdown(board).trim())throw new Error('章节索引与当前分镜排期不一致；使用 chapters.mjs 重新生成 output/chapters.md');
  if(review.checks.some(c=>c.status==='needs-fix'))throw new Error('审查仍有待修复问题');
  return {needsReview:review.checks.some(c=>c.status==='not-reviewed')};
}

export async function taskCheckpoint(project,stage,options={},services={}) {
  const timeoutSeconds=options.timeoutSeconds??1800;
  if(!Number.isSafeInteger(timeoutSeconds)||timeoutSeconds<1||timeoutSeconds>86400)throw new Error('timeout-seconds 必须为 1 到 86400 的整数');
  const state=await load(project),ctx=await context(project);
  if(!ctx.deps[stage])throw new Error(`未知任务阶段：${stage}`);
  const status=await taskStatus(project);
  if(status.steps[stage].blockedBy.length)throw new Error(status.steps[stage].reason);
  if(status.steps[stage].status==='running')throw new Error('阶段仍在运行');
  if(options.script && !options.script.startsWith('scripts/'))throw new Error('执行脚本必须位于项目 scripts/');
  if(options.args&&!Array.isArray(options.args)||options.args?.some(arg=>typeof arg!=='string'))throw new Error('args 必须为字符串数组');
  if(options.output&&(!/^[^/\\:]+\.mp4$/.test(options.output)||options.output.startsWith('.')))throw new Error('output 必须为普通 MP4 文件名');
  const previous=state.steps[stage];
  const output=stage==='review'?state.steps.render.output:options.output;
  const record={status:'running',pid:process.pid,attemptId:randomUUID(),startedAt:new Date().toISOString(),script:options.script,args:options.args??[],output:output??'video.mp4',composition:options.composition??'DocumentVideo'};
  // Missing outputs are normal before execution. Input fingerprints are captured separately below.
  const before=await inputFingerprint(project,stage,ctx,record);
  record.inputs=before;record.attempts=previous?.inputs===before&&['failed','running'].includes(previous.status)?(previous.attempts??0)+1:1;
  const limit=retryLimit(stage);
  if(options.execute&&record.attempts>limit)throw new Error(`同一输入已尝试 ${limit} 次；检查错误并修改输入或执行脚本后再继续。`);
  record.command={operation:options.execute?'task-run':'task-checkpoint',stage,script:record.script,args:record.args,output:record.output,composition:record.composition,timeoutSeconds};
  if(previous?.status==='running')state.history.push({stage,...previous,status:'interrupted',finishedAt:record.startedAt});
  await mkdir(await local(project,'output/task-logs'),{recursive:true});
  record.log=`output/task-logs/${record.attemptId}.txt`;
  const logFile=await local(project,record.log);
  await writeFile(logFile,`stage=${stage} startedAt=${record.startedAt}\n`,{flag:'wx'});
  state.steps[stage]=record;state.updatedAt=record.startedAt;await save(project,state);
  const log=text=>appendFileSync(logFile,text);
  const controller=new AbortController(),started=Date.now();
  const timer=setTimeout(()=>controller.abort(Object.assign(new Error(`阶段执行超时（${timeoutSeconds} 秒）；已停止命令并保留产物和日志。`),{code:'TASK_TIMEOUT'})),timeoutSeconds*1000);timer.unref();
  const processOptions={signal:controller.signal,log,onChild:services.onChild,env:services.env};
  let phase=options.execute?'execution':'validation';
  try{
    if(options.execute){
      if(stage==='render')await services.render(record.output,record.composition,processOptions);
      else if(record.script)await execute(process.execPath,[await local(project,record.script),...record.args],{cwd:project,...processOptions});
      else throw new Error('此阶段执行需要 --script；已完成产物可使用 task-checkpoint');
    }
    controller.signal.throwIfAborted();phase='validation';
    // Scripts may fill measured timing in storyboard; editorial and speech inputs remain stable.
    const afterCtx=await context(project);
    if(before!==await inputFingerprint(project,stage,afterCtx,record))throw new Error('执行期间输入已变化，不能将产物登记为当前版本');
    const checking=await fingerprint(project,stage,afterCtx,record);
    record.validation=await validate(project,stage,afterCtx,record,services,processOptions);
    const after=await fingerprint(project,stage,await context(project),record);
    if(before!==after.inputs)throw new Error('校验期间输入已变化，需要重新检查当前版本');
    if(checking.outputs!==after.outputs)throw new Error('校验期间产物已变化，不能将未检查的版本登记为完成');
    controller.signal.throwIfAborted();
    record.outputs=after.outputs;record.status=record.validation.needsReview?'needs-review':'completed';
  }catch(e){record.status='failed';record.error=e.message;record.errorCode=e.code;record.failurePhase=phase;}
  finally{clearTimeout(timer);record.durationMs=Date.now()-started;}
  record.finishedAt=new Date().toISOString();delete record.pid;
  log(`\n${record.error??JSON.stringify(record.validation)}\n`);
  state.history.push({stage,...record});state.updatedAt=record.finishedAt;await save(project,state);
  if(record.status==='failed')throw new Error(record.error);
  return taskStatus(project);
}

async function inputFingerprint(project,stage,ctx,record){
  // Inputs can be known before a producer creates its output; avoid requiring a manifest then.
  if(stage.startsWith('audio:')){
    const scene=ctx.board.scenes.find(s=>s.id===stage.slice(6));
    const config=ctx.board.narrationMode==='tts'?await json(await local(project,'tts-config.json')):null;
    const recipe=record.script?{script:record.script,args:record.args??[],hash:await fileHash(project,record.script)}:null;
    return digest({protocol:1,inputs:{speech:ctx.board.narrationMode==='tts'?getSpeechText(scene):scene.narration,config,mode:ctx.board.narrationMode},recipe});
  }
  if(stage==='review'){
    const inputs={board:ctx.board,source:await files(project,['source.md','brief.md','outline.md']),video:await files(project,[`output/${record.output??'video.mp4'}`])};
    const recipe=record.script?{script:record.script,args:record.args??[],hash:await fileHash(project,record.script)}:null;
    return digest({protocol:1,inputs,recipe});
  }
  return (await fingerprint(project,stage,ctx,record)).inputs;
}
