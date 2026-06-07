import type { Chapter, CorpusStyleDimensionType } from "../types/domain";
import { countWords } from "./text";

export const corpusDimensionLabels: Record<CorpusStyleDimensionType, string> = {
  appearance: "\u5916\u8c8c\u63cf\u5199",
  action: "\u52a8\u4f5c\u63cf\u5199",
  environment: "\u73af\u5883\u63cf\u5199",
  dialogue: "\u5bf9\u8bdd\u98ce\u683c",
  psychology: "\u5fc3\u7406\u63cf\u5199",
  paragraph: "\u6bb5\u843d\u7ed3\u6784",
  rhetoric: "\u4fee\u8f9e\u4e60\u60ef",
  pacing: "\u53d9\u4e8b\u8282\u594f",
  setting_delivery: "\u8bbe\u5b9a\u6295\u653e",
  vocabulary: "\u8bcd\u6c47\u4e60\u60ef",
  polish_rules: "\u6da6\u8272\u89c4\u5219"
};

export const corpusDimensionOrder = Object.keys(corpusDimensionLabels) as CorpusStyleDimensionType[];

export type CorpusLocalMetrics = {
  totalWords: number;
  chapterCount: number;
  averageChapterWords: number;
  paragraphCount: number;
  averageParagraphLength: number;
  shortParagraphRatio: number;
  longParagraphRatio: number;
  dialogueRatio: number;
  singleSentenceParagraphRatio: number;
  frequentWords: Array<[string, number]>;
  frequentVerbs: Array<[string, number]>;
  frequentAdjectives: Array<[string, number]>;
  frequentAdverbs: Array<[string, number]>;
  punctuation: Array<[string, number]>;
  sentencePatterns: string[];
};

const commonWords = new Set([
  "\u4e00\u4e2a",
  "\u8fd9\u4e2a",
  "\u90a3\u4e2a",
  "\u7136\u540e",
  "\u53ea\u662f",
  "\u5df2\u7ecf",
  "\u6ca1\u6709",
  "\u81ea\u5df1",
  "\u4ec0\u4e48",
  "\u8fd9\u6837",
  "\u90a3\u6837",
  "\u4e00\u70b9",
  "\u65f6\u5019"
]);
const verbHints = ["\u770b", "\u8bf4", "\u95ee", "\u7b11", "\u8d70", "\u4f38", "\u62ff", "\u653e", "\u63a5", "\u628a", "\u4f4e", "\u8f6c", "\u7ad9", "\u5750", "\u542c", "\u60f3", "\u505c"];
const adjectiveHints = ["\u51b7", "\u70ed", "\u4eae", "\u6697", "\u8f7b", "\u91cd", "\u6162", "\u5feb", "\u6f02\u4eae", "\u5b89\u9759", "\u7d27\u5f20", "\u5947\u602a"];
const adverbHints = ["\u5ffd\u7136", "\u7a81\u7136", "\u8f7b\u8f7b", "\u5fae\u5fae", "\u7f13\u7f13", "\u6162\u6162", "\u51e0\u4e4e", "\u7acb\u523b", "\u9a6c\u4e0a", "\u7ec8\u4e8e", "\u4f9d\u65e7"];

export function buildCorpusLocalMetrics(chapters: Chapter[]): CorpusLocalMetrics {
  const text = chapters.map((chapter) => chapter.content).join("\n");
  const paragraphs = text.split(/\n+/).map((item) => item.trim()).filter(Boolean);
  const paragraphLengths = paragraphs.map((item) => countWords(item));
  const totalWords = countWords(text);
  const dialogueParagraphs = paragraphs.filter((item) => /^[\"\u201c\u300c\u300e]/.test(item) || /[\"\u201d\u300d\u300f]$/.test(item) || /\uff1a[\"\u201c\u300c\u300e]/.test(item));
  const singleSentenceParagraphs = paragraphs.filter((item) => splitSentences(item).length <= 1);
  const shortParagraphs = paragraphLengths.filter((length) => length > 0 && length <= 30);
  const longParagraphs = paragraphLengths.filter((length) => length >= 180);
  return {
    totalWords,
    chapterCount: chapters.length,
    averageChapterWords: chapters.length ? Math.round(totalWords / chapters.length) : 0,
    paragraphCount: paragraphs.length,
    averageParagraphLength: paragraphLengths.length ? Math.round(paragraphLengths.reduce((sum, item) => sum + item, 0) / paragraphLengths.length) : 0,
    shortParagraphRatio: ratio(shortParagraphs.length, paragraphs.length),
    longParagraphRatio: ratio(longParagraphs.length, paragraphs.length),
    dialogueRatio: ratio(dialogueParagraphs.length, paragraphs.length),
    singleSentenceParagraphRatio: ratio(singleSentenceParagraphs.length, paragraphs.length),
    frequentWords: topWords(text, () => true, 20),
    frequentVerbs: topWords(text, (word) => verbHints.some((hint) => word.includes(hint)), 12),
    frequentAdjectives: topWords(text, (word) => adjectiveHints.some((hint) => word.includes(hint)), 12),
    frequentAdverbs: topWords(text, (word) => adverbHints.some((hint) => word.includes(hint)), 12),
    punctuation: topPunctuation(text),
    sentencePatterns: detectSentencePatterns(paragraphs)
  };
}

export function splitCorpusChunks(chapters: Chapter[]) {
  const chunks: Chapter[][] = [];
  let index = 0;
  while (index < chapters.length) {
    const nextFive = chapters.slice(index, index + 5);
    const average = nextFive.reduce((sum, chapter) => sum + countWords(chapter.content), 0) / Math.max(nextFive.length, 1);
    const size = average > 4500 ? 3 : 5;
    chunks.push(chapters.slice(index, index + size));
    index += size;
  }
  return chunks;
}

export function chaptersToCorpusPrompt(chapters: Chapter[]) {
  return chapters.map((chapter, index) => `\u7b2c${index + 1}\u7ae0\uff1a${chapter.title}\n${chapter.content}`).join("\n\n---\n\n");
}

function ratio(value: number, total: number) {
  return total > 0 ? Number((value / total).toFixed(3)) : 0;
}

function splitSentences(value: string) {
  return value.split(/[\u3002\uff01\uff1f!?]+/).map((item) => item.trim()).filter(Boolean);
}

function topWords(text: string, filter: (word: string) => boolean, limit: number): Array<[string, number]> {
  const matches = text.match(/[\u4e00-\u9fa5]{2,4}/g) ?? [];
  const counts = new Map<string, number>();
  for (const word of matches) {
    if (commonWords.has(word) || !filter(word)) continue;
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
}

function topPunctuation(text: string): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const char of text) {
    if (!"\u3002\uff01\uff1f\uff1b\uff1a\uff0c\u3001\u2026\u2014\u201c\u201d\u300c\u300d\u300e\u300f\uff08\uff09".includes(char)) continue;
    counts.set(char, (counts.get(char) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 16);
}

function detectSentencePatterns(paragraphs: string[]) {
  const patterns: string[] = [];
  const shortRatio = ratio(paragraphs.filter((item) => countWords(item) <= 30).length, paragraphs.length);
  if (shortRatio > 0.35) patterns.push("\u77ed\u6bb5\u843d\u6bd4\u4f8b\u8f83\u9ad8\uff0c\u5e38\u7528\u77ed\u53e5\u63a8\u52a8\u8282\u594f\u6216\u5236\u9020\u5410\u69fd\u611f\u3002");
  if (paragraphs.some((item) => /^[\"\u201c\u300c\u300e]/.test(item))) patterns.push("\u5b58\u5728\u8f83\u591a\u5bf9\u8bdd\u72ec\u7acb\u6210\u6bb5\u3002");
  if (paragraphs.some((item) => /\u4e0d\u662f.+\u800c\u662f/.test(item))) patterns.push("\u51fa\u73b0\u201c\u4e0d\u662f\u2026\u2026\u800c\u662f\u2026\u2026\u201d\u5bf9\u7167\u53e5\u5f0f\u3002");
  if (paragraphs.some((item) => /\u3002.+[\u3002\uff01\uff1f]$/.test(item) && countWords(item) <= 50)) patterns.push("\u5b58\u5728\u77ed\u53e5\u8fde\u7eed\u5f3a\u8c03\u6216\u53cd\u8f6c\u6536\u675f\u3002");
  return patterns;
}
