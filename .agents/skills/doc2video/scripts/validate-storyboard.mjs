import { readFile, realpath, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep, win32 } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { getSpeechText } from './speech-text.mjs';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' && value.trim().length > 0;
const positive = value => typeof value === 'number' && Number.isFinite(value) && value > 0;
const integer = value => Number.isSafeInteger(value) && value >= 0;
const id = value => text(value) && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
const normalize = value => value.replace(/\s+/gu, ' ').trim();
const within = (root, file) => {
  const rel = relative(root, file);
  return rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
};

export async function validateStoryboard(board, { source, ready = false, publicDir } = {}) {
  const errors = [];
  if (!object(board)) return ['分镜必须为 JSON 对象。'];
  if (![1, 2].includes(board.version)) errors.push('version 必须为 1 或 2。');
  for (const key of ['title', 'language', 'audience']) {
    if (!text(board[key])) errors.push(`${key} 必须为非空文本。`);
  }
  if ((board.version === 1 || board.style !== undefined) && !text(board.style)) errors.push('style 必须为非空文本。');
  const chapters = new Map();
  const usedChapters = new Set();
  let lastChapter = -1;
  if (board.version === 2) {
    if (!Array.isArray(board.chapters) || !board.chapters.length) errors.push('chapters 必须为非空数组。');
    else for (const [index, chapter] of board.chapters.entries()) {
      if (!object(chapter)) { errors.push(`chapters[${index}] 必须为对象。`); continue; }
      if (!id(chapter.id)) errors.push(`chapters[${index}].id 格式错误。`);
      else if (chapters.has(chapter.id)) errors.push(`chapters[${index}].id 重复：${chapter.id}`);
      else chapters.set(chapter.id, index);
      for (const key of ['title', 'objective']) {
        if (!text(chapter[key])) errors.push(`chapters[${index}].${key} 必须为非空文本。`);
      }
    }
  }
  for (const key of ['width', 'height', 'fps']) {
    if (!integer(board[key]) || board[key] === 0) errors.push(`${key} 必须为正整数。`);
  }
  const mode = board.narrationMode;
  if (!['tts', 'provided', 'none'].includes(mode)) errors.push('narrationMode 必须为 tts、provided 或 none。');
  if (!Array.isArray(board.scenes) || !board.scenes.length) return [...errors, 'scenes 必须为非空数组。'];
  const ids = new Set();
  const original = typeof source === 'string' ? normalize(source) : undefined;
  let root;
  if (ready && mode !== 'none') {
    if (!publicDir) errors.push('配音制作检查需要 --public-dir。');
    else {
      try {
        root = await realpath(publicDir);
        if (!(await stat(root)).isDirectory()) { root = undefined; errors.push('public-dir 必须为目录。'); }
      } catch { errors.push(`public-dir 不可读取：${publicDir}`); }
    }
  }
  for (const [index, scene] of board.scenes.entries()) {
    const at = `scenes[${index}]`;
    if (!object(scene)) { errors.push(`${at} 必须为对象。`); continue; }
    if (!id(scene.id)) errors.push(`${at}.id 格式错误。`);
    else if (ids.has(scene.id)) errors.push(`${at}.id 重复：${scene.id}`);
    else ids.add(scene.id);
    if (board.version === 2) {
      if (!text(scene.purpose)) errors.push(`${at}.purpose 必须为非空文本。`);
      if (!chapters.has(scene.chapterId)) errors.push(`${at}.chapterId 引用的章节不存在。`);
      else {
        const position = chapters.get(scene.chapterId);
        if (position < lastChapter) errors.push(`${at} 未按章节顺序连续排列。`);
        lastChapter = position;
        usedChapters.add(scene.chapterId);
      }
    }
    for (const key of ['sourceQuotes', 'onScreen']) {
      if (!Array.isArray(scene[key]) || !scene[key].length || !scene[key].every(text)) {
        errors.push(`${at}.${key} 必须为非空文本数组。`);
      }
    }
    if (original !== undefined && Array.isArray(scene.sourceQuotes)) {
      for (const quote of scene.sourceQuotes) {
        if (text(quote) && !original.includes(normalize(quote))) errors.push(`${at} 的引用无法在原文找到：${quote}`);
      }
    }
    if (typeof scene.narration !== 'string' || (mode !== 'none' && !text(scene.narration))) errors.push(`${at}.narration 缺少口播文本。`);
    if (scene.speechReplacements !== undefined) {
      if (mode !== 'tts') errors.push(`${at}.speechReplacements 仅用于 tts 模式。`);
      else try { getSpeechText(scene); } catch (error) { errors.push(`${at}: ${error.message}`); }
    }
    if (!text(scene.visual)) errors.push(`${at}.visual 缺少视觉说明。`);
    if (!positive(scene.estimatedSeconds)) errors.push(`${at}.estimatedSeconds 必须大于 0。`);
    if (!ready) continue;
    for (const key of ['durationInFrames', 'leadFrames', 'tailFrames']) {
      if (!integer(scene[key]) || (key === 'durationInFrames' && scene[key] === 0)) errors.push(`${at}.${key} 帧数无效。`);
    }
    if (mode === 'none') {
      if (scene.audio !== undefined) errors.push(`${at} 无声模式不应包含 audio。`);
      if (scene.leadFrames + scene.tailFrames >= scene.durationInFrames) errors.push(`${at} 留白占满了整个场景。`);
      continue;
    }
    if (!object(scene.audio)) { errors.push(`${at}.audio 缺失。`); continue; }
    const { src, durationSeconds } = scene.audio;
    if (!positive(durationSeconds)) errors.push(`${at}.audio.durationSeconds 必须为实际测量的正数。`);
    if (positive(durationSeconds) && integer(board.fps) && integer(scene.leadFrames) && integer(scene.tailFrames) && integer(scene.durationInFrames)) {
      const required = scene.leadFrames + Math.ceil(durationSeconds * board.fps) + scene.tailFrames;
      if (scene.durationInFrames < required) errors.push(`${at} 时长不足，需要至少 ${required} 帧。`);
    }
    if (!text(src) || isAbsolute(src) || win32.isAbsolute(src) || src.includes('\\') || /^[a-z][a-z0-9+.-]*:/i.test(src)) {
      errors.push(`${at}.audio.src 必须为 public 内的相对路径。`);
      continue;
    }
    if (src.split('/').includes('..')) { errors.push(`${at}.audio.src 不得越出 public。`); continue; }
    if (root) {
      try {
        const file = await realpath(resolve(root, src));
        if (!within(root, file)) { errors.push(`${at}.audio.src 不得通过符号链接越出 public。`); continue; }
        const info = await stat(file);
        if (!info.isFile() || info.size === 0) errors.push(`${at} 音频不是非空文件：${src}`);
      } catch { errors.push(`${at} 音频文件不存在或不可读取：${src}`); }
    }
  }
  for (const chapterId of chapters.keys()) {
    if (!usedChapters.has(chapterId)) errors.push(`章节 ${chapterId} 没有场景。`);
  }
  return errors;
}

async function main() {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    source: { type: 'string' }, ready: { type: 'boolean' },
    'public-dir': { type: 'string' }, help: { type: 'boolean' },
  } });
  if (values.help) {
    console.log('node validate-storyboard.mjs <storyboard.json> [--source <原文>] [--ready --public-dir <public目录>]');
    return;
  }
  if (positionals.length !== 1) throw new Error('请提供一个 storyboard.json 路径。');
  const board = JSON.parse(await readFile(positionals[0], 'utf8'));
  const source = values.source ? await readFile(values.source, 'utf8') : undefined;
  const errors = await validateStoryboard(board, { source, ready: values.ready, publicDir: values['public-dir'] });
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(`分镜通过${values.ready ? '制作' : '草稿'}校验：${board.scenes.length} 幕。${source === undefined ? '未提供原文，未校验引用。' : '引用检查通过。'}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(await realpath(resolve(process.argv[1]))).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
