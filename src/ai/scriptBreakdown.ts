import type { AiSceneCandidate } from '../domain/ai';
import { sha256Text } from '../utils/sha256';

const headingPattern = /^(?:(INT\.?|EXT\.?|INT\.?\/EXT\.?|EXT\.?\/INT\.?)\s+|(?:内景|外景|内外景)\s*[:：]?)(.+)$/i;
const timeWords = ['DAY', 'NIGHT', 'MORNING', 'EVENING', 'DAWN', 'DUSK', '白天', '夜', '早晨', '清晨', '傍晚', '黄昏'];

function classifyHeading(line: string) {
  const upper = line.toUpperCase();
  const interiorExterior = upper.includes('INT') && upper.includes('EXT') || line.includes('内外景') ? 'MIXED' : upper.includes('INT') || line.includes('内景') ? 'INT' : upper.includes('EXT') || line.includes('外景') ? 'EXT' : 'UNKNOWN';
  const timeOfDay = timeWords.find((word) => upper.includes(word.toUpperCase())) ?? 'UNSPECIFIED';
  let location = line.replace(/^(INT\.?|EXT\.?|INT\.?\/EXT\.?|EXT\.?\/INT\.?)\s*/i, '').replace(/^(内景|外景|内外景)\s*[:：]?/, '').trim();
  for (const word of timeWords) location = location.replace(new RegExp(`\\s*[-—–]\\s*${word}$`, 'i'), '').trim();
  return { interiorExterior: interiorExterior as AiSceneCandidate['interiorExterior'], timeOfDay, location: location || 'UNKNOWN' };
}

function isCharacterCue(line: string): boolean {
  if (!line || line.length > 40 || headingPattern.test(line)) return false;
  if (/^[A-Z][A-Z0-9 _.'-]{1,38}(?:\s*\([^)]*\))?$/.test(line)) return true;
  return /^[\u4e00-\u9fff]{1,8}(?:\s*\([^)]*\))?$/.test(line) && !/[，。！？：]/.test(line);
}

function extractProps(line: string): string[] {
  const out: string[] = [];
  const labelled = line.match(/(?:PROP|PROPS|道具)\s*[:：]\s*(.+)$/i)?.[1];
  if (labelled) out.push(...labelled.split(/[,，、]/).map((v) => v.trim()).filter(Boolean));
  for (const match of line.matchAll(/\[PROP\s*[:：]\s*([^\]]+)\]/gi)) out.push(match[1].trim());
  return out;
}

export function breakDownScript(script: string, now = new Date().toISOString()): AiSceneCandidate[] {
  const normalized = script.replace(/\r\n?/g, '\n').trim();
  if (!normalized) return [];
  const hash = sha256Text(normalized);
  const lines = normalized.split('\n').map((line) => line.trim());
  const groups: { heading: string; lines: string[] }[] = [];
  let current = { heading: 'UNHEADED SCENE', lines: [] as string[] };
  for (const line of lines) {
    if (!line) continue;
    if (headingPattern.test(line)) {
      if (current.lines.length || groups.length) groups.push(current);
      current = { heading: line, lines: [] };
    } else current.lines.push(line);
  }
  if (current.lines.length || !groups.length) groups.push(current);

  return groups.map((group, index) => {
    const classified = classifyHeading(group.heading);
    const characters = [...new Set(group.lines.filter(isCharacterCue).map((line) => line.replace(/\s*\([^)]*\)$/, '').trim()))];
    const props = [...new Set(group.lines.flatMap(extractProps))];
    const beats = group.lines.filter((line) => !isCharacterCue(line) && !extractProps(line).length).filter((line) => line.length > 2).slice(0, 12);
    const dialogueLines = group.lines.filter((line, i) => i > 0 && isCharacterCue(group.lines[i - 1])).length;
    const recommendedShotCount = Math.min(100, Math.max(1, Math.ceil((beats.length + dialogueLines) / 3)));
    return {
      id: `scene-${String(index + 1).padStart(3, '0')}-${hash.slice(0, 8)}`,
      sourceScriptHashSha256: hash,
      ordinal: index + 1,
      heading: group.heading,
      location: classified.location,
      timeOfDay: classified.timeOfDay,
      interiorExterior: classified.interiorExterior,
      characters,
      beats,
      props,
      recommendedShotCount,
      createdAt: now,
    };
  });
}
