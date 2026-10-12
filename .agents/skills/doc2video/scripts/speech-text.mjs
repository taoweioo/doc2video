// Standard narration is the source; pronunciation changes are explicit per scene.
const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const normalizeSpeechText = text => text.normalize('NFC').replace(/\s+/gu, '')
  .replace(/[，。；！？,;!?]/gu, '').replace(/(?<!\d)\.|\.(?!\d)/gu, '').replaceAll('：', ':');

function rulesFor(scene) {
  if (typeof scene.narration !== 'string') throw new Error('narration 必须为文本。');
  const rules = scene.speechReplacements ?? [];
  if (!Array.isArray(rules)) throw new Error('speechReplacements 必须为数组。');
  const texts = new Set(), spoken = new Set();
  for (const rule of rules) {
    if (!rule || typeof rule.text !== 'string' || !rule.text.trim() || typeof rule.spoken !== 'string' || !rule.spoken.trim()) throw new Error('每项发音映射需要非空 text 和 spoken。');
    if (texts.has(rule.text) || spoken.has(rule.spoken)) throw new Error('发音映射的 text 或 spoken 重复，无法唯一还原。');
    if (!scene.narration.includes(rule.text)) throw new Error(`标准讲稿中没有映射术语：${rule.text}`);
    texts.add(rule.text); spoken.add(rule.spoken);
  }
  return rules;
}
function replace(text, rules, from, to) {
  if (!rules.length) return text;
  const sorted = [...rules].sort((a,b) => b[from].length-a[from].length);
  const tokens = sorted.map(r => /^[\x00-\x7F]+$/.test(r[from])
    ? `(?<![\\w.])${escape(r[from])}(?![\\w.])` : escape(r[from]));
  const values = new Map(sorted.map(r => [r[from], r[to]]));
  return text.replace(new RegExp(tokens.join('|'), 'gu'), match => values.get(match));
}
export function getSpeechText(scene) {
  const rules = rulesFor(scene);
  const speech = replace(scene.narration, rules, 'text', 'spoken');
  if (replace(speech, rules, 'spoken', 'text') !== scene.narration) throw new Error('发音映射无法无歧义还原；请缩小范围或使用更完整的短语。');
  return speech;
}
export function restoreCaptionText(captions, scene) {
  const speech = getSpeechText(scene), rules = rulesFor(scene);
  if (normalizeSpeechText(captions.map(c => c.text).join('')) !== normalizeSpeechText(speech)) throw new Error('服务字幕与实际配音输入不一致。');
  const display = captions.map(c => ({...c, text:replace(c.text, rules, 'spoken', 'text')}));
  if (normalizeSpeechText(display.map(c => c.text).join('')) !== normalizeSpeechText(scene.narration)) throw new Error('显示字幕未还原标准讲稿；检查跨字幕边界的术语，不猜测数字或参数。');
  // Keep service timing and segment boundaries, but use the author's punctuation.
  const standard = scene.narration.normalize('NFC');
  const characters = [...standard.matchAll(/[^\s，。；！？,;!?]/gu)].filter(m =>
    m[0] !== '.' || (/\d/.test(standard[m.index-1] ?? '') && /\d/.test(standard[m.index+1] ?? '')));
  let count = 0, start = 0;
  return display.map(c => {
    count += Array.from(normalizeSpeechText(c.text)).length;
    const end = characters[count]?.index ?? standard.length;
    const text = standard.slice(start, end).trim();
    start = end;
    return {...c, text};
  });
}

// A real Edge response overlapped adjacent sentence cues by 50 ms.
// Repair only small display overlaps; preserve service SRT and report every change.
export function normalizeCaptionTiming(captions) {
  const display=captions.map(c=>({...c})),corrections=[];
  for(let i=0;i<display.length;i++){
    const c=display[i],previous=display[i-1];
    if(!Number.isFinite(c.startMs)||!Number.isFinite(c.endMs)||c.startMs<0||c.endMs<=c.startMs)throw new Error('字幕时间无效');
    if(previous&&previous.endMs>c.startMs){
      const overlapMs=previous.endMs-c.startMs;
      if(overlapMs>100||c.startMs<=previous.startMs)throw new Error('字幕时间重叠过大或顺序异常，需要核对原始字幕');
      corrections.push({index:i-1,fromEndMs:previous.endMs,toEndMs:c.startMs,overlapMs});
      previous.endMs=c.startMs;
    }
  }
  return {captions:display,corrections};
}
