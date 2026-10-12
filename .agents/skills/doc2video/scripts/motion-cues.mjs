import {normalizeSpeechText} from './speech-text.mjs';

/** 将讲稿短语定位到真实字幕区间；句内偏移是制作安排，不声称逐字对齐。 */
export function resolveMotionCue(captions, {text, fps, leadFrames = 0, offsetRatio = 0, durationFrames = 0, holdFrames = 0}) {
  if (!Number.isInteger(fps) || fps < 1 || !Number.isInteger(leadFrames) || leadFrames < 0 ||
      !Number.isFinite(offsetRatio) || offsetRatio < 0 || offsetRatio > 1 ||
      ![durationFrames, holdFrames].every(n => Number.isInteger(n) && n >= 0)) {
    throw new Error('动作排期参数无效');
  }
  const needle = typeof text === 'string' ? normalizeSpeechText(text) : '';
  if (!needle || !Array.isArray(captions) || !captions.length) throw new Error('需要提示短语与真实字幕');
  let joined = '', previousEnd = 0;
  const ranges = captions.map(c => {
    if (typeof c.text !== 'string' || !Number.isFinite(c.startMs) || !Number.isFinite(c.endMs) || c.startMs < previousEnd || c.endMs <= c.startMs) {
      throw new Error('字幕时间或文字无效，先按配音规则修正');
    }
    const start = joined.length;
    joined += normalizeSpeechText(c.text);
    previousEnd = c.endMs;
    return {start, end: joined.length, startMs: c.startMs, endMs: c.endMs};
  });
  const index = joined.indexOf(needle);
  if (index < 0) throw new Error(`找不到动作提示：${text}`);
  if (joined.indexOf(needle, index + 1) >= 0) throw new Error(`动作提示不唯一，请使用更完整的短语：${text}`);
  const first = ranges.find(r => r.start <= index && r.end > index);
  const last = ranges.find(r => r.start < index + needle.length && r.end >= index + needle.length);
  const captionStartFrame = leadFrames + Math.ceil(first.startMs * fps / 1000);
  const captionEndFrame = leadFrames + Math.floor(last.endMs * fps / 1000);
  const frame = leadFrames + Math.ceil((first.startMs + (last.endMs - first.startMs) * offsetRatio) * fps / 1000);
  if (frame + durationFrames + holdFrames > captionEndFrame) throw new Error(`动作与停留超出提示区间：${text}`);
  return {frame, captionStartFrame, captionEndFrame, durationFrames, holdFrames};
}
