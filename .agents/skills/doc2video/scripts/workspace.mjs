import {cp, lstat, mkdir, mkdtemp, open, readFile, readdir, realpath, rename, rm, symlink, writeFile} from 'node:fs/promises';
import {writeFileSync} from 'node:fs';
import {AsyncLocalStorage} from 'node:async_hooks';
import {createHash, randomUUID} from 'node:crypto';
import {runProcess} from './process.mjs';
import {homedir, hostname} from 'node:os';
import {basename, dirname, join, relative, resolve, sep} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {parseArgs} from 'node:util';
import {taskStatus, taskResume, taskCheckpoint} from './harness.mjs';
import {motionCatalog,installMotionLibrary} from './motion-library.mjs';

const assets = fileURLToPath(new URL('../assets/', import.meta.url));
const OWNER = 'doc2video';
const readJSON = async path => JSON.parse(await readFile(path, 'utf8'));
const hash = data => createHash('sha256').update(data).digest('hex');
const exists = async path => lstat(path).catch(e => { if (e.code === 'ENOENT') return null; throw e; });
const idOK = id => typeof id === 'string' && /^[a-z0-9][a-z0-9.-]{0,100}$/.test(id) && !id.includes('..');
export const defaultWorkspace = () => join(homedir(), 'doc2video-workspace');
const operationScope = new AsyncLocalStorage();
function recordChild(pid) {
  const lock = operationScope.getStore();
  if (lock?.active) writeFileSync(lock.path, JSON.stringify({...lock.owner, childPid:pid}));
}

async function writeJSON(path, data) {
  const tmp = `${path}.${randomUUID()}.tmp`;
  try { await writeFile(tmp, JSON.stringify(data, null, 2) + '\n', {flag: 'wx'}); await rename(tmp, path); }
  finally { await rm(tmp, {force: true}); }
}
async function directory(path) {
  const info = await exists(path);
  if (info && (!info.isDirectory() || info.isSymbolicLink())) throw new Error(`拒绝非普通目录或符号链接：${path}`);
  if (!info) await mkdir(path);
}
async function manifest(root) {
  const info = await exists(root);
  if (!info || info.isSymbolicLink() || !info.isDirectory()) throw new Error(`工作区尚未初始化或根目录无效：${root}`);
  const m = await readJSON(join(root, 'workspace.json'));
  if (m.owner !== OWNER || m.schemaVersion !== 1 || !Array.isArray(m.bundles) || !m.bundles.every(idOK) || (m.activeBundle !== null && !m.bundles.includes(m.activeBundle))) throw new Error('工作区标记无效，拒绝操作。');
  for (const name of ['vendor', 'runtime', 'cache', 'projects']) {
    const info = await exists(join(root, name));
    if (!info?.isDirectory() || info.isSymbolicLink()) throw new Error(`工作区目录无效：${name}`);
  }
  return m;
}
export async function initializeWorkspace(root = defaultWorkspace()) {
  root = resolve(root);
  // Only claim a newly created or entirely empty directory, never adopt user files.
  await mkdir(dirname(root), {recursive: true});
  await directory(root);
  if (await exists(join(root, 'workspace.json'))) return manifest(root);
  if ((await readdir(root)).length) throw new Error(`工作区目录非空且没有有效标记，未接管：${root}`);
  const claim = await open(join(root, '.initializing'), 'wx').catch(() => { throw new Error('工作区正在初始化。'); });
  try {
    for (const name of ['vendor', 'runtime', 'cache', 'projects']) await mkdir(join(root, name));
    const m = {owner: OWNER, schemaVersion: 1, activeBundle: null, bundles: []};
    await writeJSON(join(root, 'workspace.json'), m);
    return m;
  } finally { await claim.close(); await rm(join(root, '.initializing'), {force: true}); }
}
async function acquireLock(root, recover) {
  const path = join(root, '.operation.lock');
  try { return await open(path, 'wx'); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  const busy = () => new Error(`工作区忙碌；请核对 ${path} 中的进程。`);
  if (!recover) throw busy();
  // Serialize recovery so another recovering process cannot remove a newly acquired lock.
  const guardPath = join(root, '.lock-recovery');
  const guard = await open(guardPath, 'wx').catch(() => {throw busy();});
  try {
    const info = await lstat(path).catch(e => {if(e.code!=='ENOENT')throw e;});
    if (!info) return await open(path, 'wx');
    if (!info.isFile() || info.isSymbolicLink()) throw busy();
    const owner = await readJSON(path).catch(() => {throw busy();});
    if (owner.hostname !== hostname() || !Number.isSafeInteger(owner.pid) || owner.pid <= 0) throw busy();
    try { process.kill(owner.pid, 0); throw busy(); }
    catch (error) { if (error.code !== 'ESRCH') throw error; }
    if (owner.childPid) {
      if (!Number.isSafeInteger(owner.childPid) || owner.childPid <= 0) throw busy();
      try { process.kill(owner.childPid, 0); throw busy(); }
      catch (error) { if (error.code !== 'ESRCH') throw error; }
    }
    await rm(path);
    return await open(path, 'wx');
  } finally { await guard.close(); await rm(guardPath, {force:true}); }
}
async function locked(root, fn, {recover = false} = {}) {
  await manifest(root);
  const lockPath = join(root, '.operation.lock');
  const lock = await acquireLock(root, recover);
  const owner = {pid: process.pid, hostname:hostname(), startedAt:new Date().toISOString()};
  const scope = {path:lockPath,owner,active:true};
  try { await lock.writeFile(JSON.stringify(owner)); return await operationScope.run(scope, async () => fn(await manifest(root))); }
  finally { scope.active=false; await lock.close(); await rm(lockPath, {force: true}); }
}
export function managedEnv(root) {
  return {...process.env, npm_config_cache: join(root, 'cache/npm'), npm_config_update_notifier: 'false', npm_config_audit: 'false', TMPDIR: join(root, 'cache/tmp'), TMP: join(root, 'cache/tmp'), TEMP: join(root, 'cache/tmp')};
}
export function run(command, args, options = {}) {
  return runProcess(command,args,{inherit:!options.log,onChild:recordChild,...options});
}
async function hashes(root) {
  const result = {};
  async function walk(dir) {
    for (const item of await readdir(dir, {withFileTypes: true})) {
      const path = join(dir, item.name);
      if (item.isSymbolicLink()) throw new Error(`依赖参考文件不能是符号链接：${path}`);
      if (item.isDirectory()) await walk(path);
      else if (item.isFile()) result[relative(root, path).split(sep).join('/')] = hash(await readFile(path));
    }
  }
  await walk(root);
  return result;
}
export async function copyGuides(source, target) {
  await mkdir(target);
  for (const item of await readdir(source, {withFileTypes: true})) {
    if (item.name === 'agents' || item.name === '.git') continue;
    if (item.isSymbolicLink()) throw new Error('官方指南包含符号链接，停止导入。');
    const dest = join(target, item.name === 'SKILL.md' ? 'GUIDE.md' : item.name);
    if (item.isDirectory()) await copyGuides(join(source, item.name), dest);
    else if (item.name.endsWith('.md')) {
      const text = await readFile(join(source,item.name),'utf8');
      // 只改本地 Markdown 链接，保留外部 URL 及原有锚点。
      await writeFile(dest,text.replace(/(\]\()(?![a-z][a-z0-9+.-]*:)([^\s)]*\/)?SKILL\.md(?=[#?)]|$)/gi,'$1$2GUIDE.md'),{flag:'wx'});
    } else await cp(join(source, item.name), dest, {errorOnExist: true, force: false});
  }
}
export async function releaseSpec() {
  return readJSON(join(assets, 'dependencies.json'));
}
async function provisionBundle({root, stage, spec}) {
  const clone = join(stage, 'upstream');
  const env = managedEnv(root);
  console.log(`下载私有 Remotion 指南：${spec.guidesCommit}`);
  await run('git', ['init', '-q', clone], {env});
  await run('git', ['remote', 'add', 'origin', spec.guidesRepository], {cwd: clone, env});
  await run('git', ['fetch', '--depth=1', 'origin', spec.guidesCommit], {cwd: clone, env});
  await run('git', ['-c', `core.hooksPath=${join(stage, 'no-hooks')}`, 'checkout', '--detach', 'FETCH_HEAD'], {cwd: clone, env});
  await copyGuides(join(clone, spec.guidesPath), join(stage, 'guides'));
  await writeJSON(join(stage, 'guides/SOURCE.json'), {repository: spec.guidesRepository, commit: spec.guidesCommit, originalPath: spec.guidesPath, entryRenamed: 'SKILL.md → GUIDE.md', omitted: ['agents/']});
  await cp(join(assets, 'runtime'), join(stage, 'runtime'), {recursive: true});
  await cp(join(assets, 'project-template'), join(stage, 'runtime/template'), {recursive: true});
  console.log(`安装私有运行环境：${spec.remotionVersion}`);
  // Windows npm.cmd needs a shell; arguments are constant, never user-supplied.
  await run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['ci', '--no-audit', '--no-fund'], {cwd: join(stage, 'runtime'), env, shell: process.platform === 'win32'});
}
async function validateGuideEntry(path, allLinks = false) {
  const content = await readFile(join(path, 'GUIDE.md'), 'utf8');
  if (!/^name:\s*remotion-best-practices\s*$/m.test(content)) throw new Error('私有 Remotion 指南入口无效。');
  for (const match of content.matchAll(/\]\(([^\s)]+)\)/g)) {
    if (/^(?:[a-z][a-z0-9+.-]*:|#)/i.test(match[1])) continue;
    const link = resolve(path, decodeURIComponent(match[1].split('#')[0]));
    if (!link.startsWith(path + sep) || !(await exists(link))?.isFile()) throw new Error(`私有指南引用缺失或越界：${match[1]}`);
  }
  const list = await hashes(path);
  if (Object.keys(list).some(p => p.split('/').includes('SKILL.md'))) throw new Error('私有指南不能暴露 SKILL.md 入口。');
  if (allLinks) for (const name of Object.keys(list).filter(name => name.endsWith('.md'))) {
    const page = await readFile(join(path,name),'utf8');
    for (const match of page.matchAll(/\]\(([^\s)]+)\)/g)) {
      if (/^(?:[a-z][a-z0-9+.-]*:|#)/i.test(match[1])) continue;
      const link = resolve(dirname(join(path,name)),decodeURIComponent(match[1].split('#')[0]));
      if (!link.startsWith(path+sep) || !(await exists(link))?.isFile()) throw new Error(`私有指南引用缺失或越界：${name} → ${match[1]}`);
    }
  }
  return list;
}
async function validateRuntime(path, version) {
  const pkg = await readJSON(join(path, 'package.json'));
  if (pkg.dependencies.remotion !== version) throw new Error('运行环境版本不匹配。');
  const modules = await exists(join(path, 'node_modules'));
  if (!modules?.isDirectory() || modules.isSymbolicLink()) throw new Error('私有 node_modules 不完整。');
  for (const [name, expected] of Object.entries({...pkg.dependencies, ...pkg.devDependencies})) {
    const installed = await readJSON(join(path, 'node_modules', name, 'package.json'));
    if (installed.version !== expected) throw new Error(`运行依赖不匹配：${name}`);
  }
}
export async function checkBundle(root, id) {
  if (!idOK(id)) throw new Error('环境版本 ID 无效。');
  const runtime = join(root, 'runtime', id), guides = join(root, 'vendor', id);
  for (const dir of [runtime, guides]) {
    const info = await exists(dir);
    if (!info?.isDirectory() || info.isSymbolicLink()) throw new Error(`私有环境缺失：${dir}；请运行 init 或 upgrade 恢复。`);
  }
  const mark = await readJSON(join(runtime, 'bundle.json'));
  if (mark.owner !== OWNER || mark.id !== id || !mark.files || !mark.guides || !mark.template || ['package.json', 'package-lock.json', 'run.mjs'].some(name => typeof mark.files[name] !== 'string')) throw new Error('环境归属标记无效。');
  for (const [name, value] of Object.entries(mark.files)) {
    if (!['package.json', 'package-lock.json', 'run.mjs'].includes(name)) throw new Error('环境文件清单无效。');
    if (hash(await readFile(join(runtime, name))) !== value) throw new Error(`环境文件被修改：${name}`);
  }
  const actual = await validateGuideEntry(guides);
  if (JSON.stringify(Object.entries(actual).sort()) !== JSON.stringify(Object.entries(mark.guides).sort())) throw new Error('私有指南文件被修改或缺失。');
  if (JSON.stringify(Object.entries(await hashes(join(runtime, 'template'))).sort()) !== JSON.stringify(Object.entries(mark.template).sort())) throw new Error('共享工程模板被修改或缺失。');
  await validateRuntime(runtime, mark.remotionVersion);
  return {runtime, guides: join(guides, 'GUIDE.md'), id};
}
async function prepare(root, m, {upgrade = false, provision = provisionBundle, spec} = {}) {
  spec ??= await releaseSpec();
  if (!idOK(spec.id) || !/^[0-9a-f]{40}$/.test(spec.guidesCommit)) throw new Error('随包依赖版本记录无效。');
  if (m.activeBundle && !upgrade) return checkBundle(root, m.activeBundle);
  if (m.bundles.includes(spec.id) && await exists(join(root, 'runtime', spec.id))) {
    const ready = await checkBundle(root, spec.id);
    m.activeBundle = spec.id; await writeJSON(join(root, 'workspace.json'), m); return ready;
  }
  for (const path of [join(root, 'runtime', spec.id), join(root, 'vendor', spec.id)]) {
    if (await exists(path)) throw new Error(`目标环境已经存在，未覆盖：${path}`);
  }
  await directory(join(root, 'cache/tmp'));
  const stage = await mkdtemp(join(root, 'cache/install-'));
  let movedRuntime = false, movedGuides = false;
  try {
    await provision({root, stage, spec});
    const guides = await validateGuideEntry(join(stage, 'guides'), true);
    await validateRuntime(join(stage, 'runtime'), spec.remotionVersion);
    const files = {};
    for (const name of ['package.json', 'package-lock.json', 'run.mjs']) files[name] = hash(await readFile(join(stage, 'runtime', name)));
    const template = await hashes(join(stage, 'runtime/template'));
    await writeJSON(join(stage, 'runtime/bundle.json'), {...spec, owner: OWNER, files, guides, template});
    await rename(join(stage, 'guides'), join(root, 'vendor', spec.id)); movedGuides = true;
    await rename(join(stage, 'runtime'), join(root, 'runtime', spec.id)); movedRuntime = true;
    if (!m.bundles.includes(spec.id)) m.bundles.push(spec.id);
    m.activeBundle = spec.id;
    await writeJSON(join(root, 'workspace.json'), m);
  } catch (error) {
    if (movedRuntime) await rm(join(root, 'runtime', spec.id), {recursive: true, force: true});
    if (movedGuides) await rm(join(root, 'vendor', spec.id), {recursive: true, force: true});
    throw error;
  } finally { await rm(stage, {recursive: true, force: true}); }
  return checkBundle(root, spec.id);
}
export async function prepareWorkspace(root = defaultWorkspace(), options = {}) {
  root = resolve(root); await initializeWorkspace(root);
  return locked(root, m => prepare(root, m, options));
}
export async function createProject(root, name = 'video', source, options = {}) {
  root = resolve(root); await initializeWorkspace(root);
  if (!/^[a-z0-9][a-z0-9-]{0,60}$/.test(name)) throw new Error('项目名须为小写字母、数字或连字符。');
  return locked(root, async m => {
    const env = await prepare(root, m, options);
    const id = `${name}-${randomUUID().slice(0, 8)}`;
    const path = join(root, 'projects', id);
    await mkdir(path);
    let motionLibrary;
    try {
      await cp(join(env.runtime, 'template'), path, {recursive: true, force: false, errorOnExist: true});
      for (const dir of ['public', 'output', 'output/qa']) await mkdir(join(path, dir), {recursive: true});
      await symlink(join(env.runtime, 'node_modules'), join(path, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
      if (source) await writeFile(join(path, 'source.md'), await readFile(resolve(source)), {flag: 'wx'});
      await writeFile(join(path, 'context.md'), await readFile(join(assets,'context-template.md')), {flag:'wx'});
      await writeJSON(join(path, 'project.json'), {owner: OWNER, schemaVersion: 1, id, bundle: env.id, createdAt: new Date().toISOString()});
      motionLibrary = await installMotionLibrary(path);
    } catch (error) { await rm(path, {recursive: true, force: true}); throw error; }
    return {id, project: path, guides: env.guides, bundle: env.id, motionLibrary};
  });
}
async function projectDirectory(root, id) {
  if (!idOK(id)) throw new Error('项目 ID 无效。');
  const path = join(root, 'projects', id);
  const info = await exists(path);
  if (!info?.isDirectory() || info.isSymbolicLink()) throw new Error('项目目录无效。');
  const m = await readJSON(join(path, 'project.json'));
  if (m.owner !== OWNER || m.id !== id || !idOK(m.bundle)) throw new Error('项目标记无效。');
  return {path, marker:m};
}
async function projectInfo(root, id) {
  const {path, marker:m} = await projectDirectory(root, id);
  const env = await checkBundle(root, m.bundle);
  const linked = await realpath(join(path, 'node_modules'));
  if (linked !== await realpath(join(env.runtime, 'node_modules'))) throw new Error('项目未连接到其私有运行依赖。');
  return {path, ...env};
}
export async function cleanWorkspace(root, {environment = false, yes = false} = {}) {
  root = resolve(root);
  return locked(root, async m => {
    const targets = ['cache'];
    if (environment) {
      for (const name of ['runtime', 'vendor']) {
        const entries = await readdir(join(root, name));
        if (entries.some(id => !m.bundles.includes(id))) throw new Error(`${name} 包含未登记文件，拒绝清理。`);
        for (const id of entries) {
          const info = await exists(join(root, name, id));
          if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('拒绝清理非普通环境目录。');
          if (name === 'runtime') {
            const mark = await readJSON(join(root, name, id, 'bundle.json'));
            if (mark.owner !== OWNER || mark.id !== id) throw new Error('环境归属标记无效。');
          }
        }
        targets.push(...entries.map(id => join(name, id)));
      }
    }
    if (!yes) return {preview: true, remove: targets.map(p => join(root, p)), preserve: join(root, 'projects'), instruction: '确认后加 --yes 执行；不会删除项目与作品。'};
    for (const target of targets) await rm(join(root, target), {recursive: true, force: true});
    await mkdir(join(root, 'cache'));
    if (environment) { m.activeBundle = null; await writeJSON(join(root, 'workspace.json'), m); }
    return {removed: targets, preserved: join(root, 'projects')};
  });
}
export async function workspaceStatus(root = defaultWorkspace()) {
  root = resolve(root);
  if (!await exists(root)) return {root, initialized: false};
  const m = await manifest(root);
  const current = await releaseSpec();
  const environment = m.activeBundle ? await checkBundle(root, m.activeBundle) : null;
  return {root, initialized: true, ...m, availableBundle: current.id, upgradeAvailable: m.activeBundle !== current.id, environment};
}
async function main() {
  const {values, positionals} = parseArgs({allowPositionals: true, options: {
    workspace: {type: 'string'}, name: {type: 'string'}, source: {type: 'string'}, project: {type: 'string'}, composition: {type: 'string'}, output: {type: 'string'}, frame: {type: 'string'}, yes: {type: 'boolean'}, help: {type: 'boolean'},
    stage: {type: 'string'}, script: {type: 'string'}, args: {type: 'string'}, 'timeout-seconds': {type:'string'},
  }});
  if (values.help) { console.log('node workspace.mjs <init|status|create|upgrade|motion-list|motion-install|check|still|render|preview|clean-cache|remove-env|task-status|task-resume|task-checkpoint|task-run>\n默认：用户主目录/doc2video-workspace。任务命令带 --project，写操作带 --stage；task-run 可带 --script 和 --args JSON 数组。任务写操作可带 --timeout-seconds（默认 1800）。task-resume 读取目标、接续说明与实际状态。渲染带 --output 新文件名。清理默认预览，--yes 执行。'); return; }
  const [cmd] = positionals;
  if (positionals.length !== 1) throw new Error('请提供一个工作区命令，使用 --help 查看。');
  const root = resolve(values.workspace ?? defaultWorkspace());
  let result;
  if (cmd === 'motion-list') result = await motionCatalog();
  else if (cmd === 'motion-install') result = await locked(root, async () => installMotionLibrary((await projectDirectory(root,values.project)).path));
  else if (cmd === 'init' || cmd === 'upgrade') result = await prepareWorkspace(root, {upgrade: cmd === 'upgrade'});
  else if (cmd === 'status') result = await workspaceStatus(root);
  else if (cmd === 'create') result = await createProject(root, values.name, values.source);
  else if (cmd === 'task-status' || cmd === 'task-resume') {
    await manifest(root);
    const p = await projectDirectory(root, values.project);
    result = await (cmd==='task-resume'?taskResume:taskStatus)(p.path);
  }
  else if (cmd === 'task-checkpoint' || cmd === 'task-run') {
    result = await locked(root, async () => {
      const p = await projectInfo(root, values.project);
      await directory(join(root, 'cache/tmp'));
      const invoke = (command, output='video.mp4', composition='DocumentVideo', options={}) => run(process.execPath, [join(p.runtime,'run.mjs'),command,p.path,composition,output,'0'], {cwd:p.runtime,env:managedEnv(root),...options});
      return taskCheckpoint(p.path, values.stage, {execute:cmd==='task-run',script:values.script,args:values.args?JSON.parse(values.args):[],output:values.output,composition:values.composition,timeoutSeconds:values['timeout-seconds']===undefined?undefined:Number(values['timeout-seconds'])}, {check:options=>invoke('check',undefined,undefined,options),render:(output,composition,options)=>invoke('render',output,composition,options),env:managedEnv(root),onChild:recordChild});
    }, {recover:true});
  }
  else if (cmd === 'clean-cache' || cmd === 'remove-env') result = await cleanWorkspace(root, {environment: cmd === 'remove-env', yes: values.yes});
  else if (['check', 'still', 'render', 'preview'].includes(cmd)) {
    result = await locked(root, async () => {
      const p = await projectInfo(root, values.project);
      await directory(join(root, 'cache/tmp'));
      const output = values.output ?? (cmd === 'still' ? 'frame.png' : 'video.mp4');
      const extension = cmd === 'still' ? '.png' : '.mp4';
      if (output !== basename(output) || /[\\/:]/.test(output) || !output.endsWith(extension)) throw new Error(`输出须为项目 output 下的 ${extension} 文件名。`);
      const args = [join(p.runtime, 'run.mjs'), cmd, p.path, values.composition ?? 'DocumentVideo', output, values.frame ?? '30'];
      await run(process.execPath, args, {cwd: p.runtime, env: managedEnv(root)});
      return {project: p.path, command: cmd};
    });
  } else throw new Error(`未知命令：${cmd}`);
  console.log(JSON.stringify(result, null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(await realpath(resolve(process.argv[1]))).href) main().catch(e => { console.error(e.message); process.exitCode = 1; });
