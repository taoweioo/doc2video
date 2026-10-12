import {mkdtemp, lstat, rm, mkdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {bundle} from '@remotion/bundler';
import {ensureBrowser, selectComposition, renderMedia, renderStill} from '@remotion/renderer';

const runtime = dirname(fileURLToPath(import.meta.url));
const root = resolve(runtime, '../..');
const [command, project, compositionId, outputName, frameText] = process.argv.slice(2);
const entryPoint = join(project, 'src/index.tsx');
const invoke = args => new Promise((res, rej) => {
  const child = spawn(process.execPath, args, {cwd: runtime, env: process.env, stdio: 'inherit'});
  const interrupt = () => child.kill('SIGINT');
  process.once('SIGINT', interrupt);
  child.once('error', rej);
  child.once('exit', (code, signal) => {
    process.removeListener('SIGINT', interrupt);
    if (code === 0) res(); else rej(new Error(`子命令失败：${signal ?? code}`));
  });
});
async function main() {
  if (command === 'check') {
    await invoke([join(runtime, 'node_modules/typescript/bin/tsc'), '--project', join(project, 'tsconfig.json'), '--noEmit']);
    return;
  }
  if (command === 'preview') {
    await invoke([join(runtime, 'node_modules/@remotion/cli/remotion-cli.js'), 'studio', entryPoint, '--public-dir', join(project, 'public'), '--no-open']);
    return;
  }
  if (!['still', 'render'].includes(command)) throw new Error('未知制作命令。');
  const output = join(project, 'output', outputName);
  if (await lstat(output).catch(e => {if (e.code === 'ENOENT') return null; throw e;})) throw new Error(`输出已存在，未覆盖：${output}`);
  const frame = Number(frameText);
  if (command === 'still' && (!Number.isInteger(frame) || frame < 0)) throw new Error('帧号必须是非负整数。');
  await mkdir(join(root, 'cache/tmp'), {recursive: true});
  const stage = await mkdtemp(join(root, 'cache/render-'));
  try {
    // cwd is the private runtime: Remotion stores its browser below its own node_modules/.remotion.
    await ensureBrowser();
    const serveUrl = await bundle({entryPoint, rootDir: project, publicDir: join(project, 'public'), outDir: join(stage, 'bundle'), enableCaching: false, rspack: true});
    const composition = await selectComposition({serveUrl, id: compositionId});
    if (command === 'still') {
      await renderStill({serveUrl, composition, frame, output, imageFormat: 'png'});
    } else {
      let last = -1;
      await renderMedia({serveUrl, composition, outputLocation: output, codec: 'h264', crf: 20, overwrite: false, concurrency: 2, onProgress: ({progress}) => {
        const percent = Math.floor(progress * 100 / 10) * 10;
        if (percent !== last) {console.log(`渲染 ${percent}%`); last = percent;}
      }});
    }
    console.log(`输出：${output}`);
  } finally { await rm(stage, {recursive: true, force: true}); }
}
main().catch(e => {console.error(e.stack ?? e.message);process.exitCode = 1;});
