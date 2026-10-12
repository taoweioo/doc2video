import { cp, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

async function main() {
  const { values } = parseArgs({ options: {
    to: { type: 'string' }, help: { type: 'boolean' },
  } });
  if (values.help) {
    console.log('node scripts/install.mjs --to <安装父目录>\n只安装 doc2video；首次使用自动初始化用户主目录中的 doc2video-workspace。已有目标不覆盖。');
    return;
  }
  const source = fileURLToPath(new URL('../.agents/skills/doc2video/', import.meta.url));
  if (!values.to?.trim()) throw new Error('请用 --to 指定当前 AI 助手可读取的 Skill 安装父目录。');
  const parent = resolve(values.to);
  const target = join(parent, 'doc2video');
  await mkdir(parent, { recursive: true });
  // Claim the target first. A second install cannot merge into or overwrite it.
  try {
    await mkdir(target);
  } catch (error) {
    if (error.code === 'EEXIST') throw new Error(`目标已存在，未覆盖：${target}`);
    throw error;
  }
  await cp(source, target, { recursive: true, force: false, errorOnExist: true });
  console.log(`已安装 doc2video：${target}\n请让 AI 读取 SKILL.md；首次使用由内置脚本准备私有工作区，无需安装其他 Skill。`);
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
