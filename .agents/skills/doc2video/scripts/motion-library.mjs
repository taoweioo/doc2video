import {cp,lstat,mkdtemp,readFile,rename,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const source=fileURLToPath(new URL('../assets/motion-library/',import.meta.url));
export const motionCatalog=async()=>JSON.parse(await readFile(join(source,'catalog.json'),'utf8'));
/** 复制随 Skill 分发的版本；重复调用保留工程已有改动，不更新共享运行环境。 */
export async function installMotionLibrary(project){
 const catalog=await motionCatalog();
 if(!/^\d+\.\d+\.\d+$/.test(catalog.version))throw new Error('动效库版本无效');
 const src=join(project,'src'),name=`doc2video-motion-${catalog.version.replaceAll('.','-')}`,target=join(src,name);
 const folder=await lstat(src);if(!folder.isDirectory()||folder.isSymbolicLink())throw new Error('工程 src 必须是普通目录');
 const existing=await lstat(target).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
 if(existing){
  if(!existing.isDirectory()||existing.isSymbolicLink())throw new Error('动效库目标不是普通目录');
  const current=JSON.parse(await readFile(join(target,'catalog.json'),'utf8'));
  if(current.version!==catalog.version)throw new Error('动效库目录版本不一致，未覆盖');
  return {path:target,version:current.version,retained:true};
 }
 const stage=await mkdtemp(join(src,'.motion-stage-'));
 try{await cp(source,join(stage,'library'),{recursive:true,errorOnExist:true,force:false});await rename(join(stage,'library'),target);}
 finally{await rm(stage,{recursive:true,force:true});}
 return {path:target,version:catalog.version,retained:false};
}
