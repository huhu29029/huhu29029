import type {
  Chapter,
  CorpusStyleProfileState,
  SaveStyleRetrievalSnippetInput,
  StyleRetrievalDimensionType,
  StyleRetrievalSnippet,
  StyleSnippetSearchResult
} from "../types/domain";

export const styleRetrievalDimensionLabels: Record<StyleRetrievalDimensionType, string> = {
  appearance: "\u5916\u8c8c\u63cf\u5199",
  action: "\u52a8\u4f5c\u63cf\u5199",
  environment: "\u73af\u5883\u63cf\u5199",
  dialogue: "\u5bf9\u8bdd\u98ce\u683c",
  psychology: "\u5fc3\u7406\u63cf\u5199",
  paragraph: "\u6bb5\u843d\u7ed3\u6784",
  rhetoric: "\u4fee\u8f9e\u4e60\u60ef",
  pacing: "\u53d9\u4e8b\u8282\u594f",
  setting_delivery: "\u8bbe\u5b9a\u6295\u653e",
  humor: "\u559c\u5267\u5410\u69fd",
  conflict: "\u51b2\u7a81\u573a\u666f",
  mixed: "\u6df7\u5408\u7247\u6bb5"
};

export const styleRetrievalDimensionOrder = Object.keys(styleRetrievalDimensionLabels) as StyleRetrievalDimensionType[];

type BuildStyleSnippetOptions = {
  chapters: Chapter[];
  corpusProfiles: CorpusStyleProfileState[];
};

type SearchFilters = {
  dimensions: Set<StyleRetrievalDimensionType>;
  limit: number;
  minScore: number;
  query: string;
};

const keywordGroups: Record<StyleRetrievalDimensionType, string[]> = {
  appearance: ["\u773c\u775b", "\u5934\u53d1", "\u8863\u670d", "\u8896\u53e3", "\u8138", "\u624b\u6307", "\u8eab\u5f62", "\u88d9\u6446", "\u5236\u670d", "\u53d1\u8272", "\u77b3\u8272", "\u5916\u8c8c"],
  action: ["\u8d70", "\u63a5", "\u62ff", "\u628a", "\u4f4e\u5934", "\u4f38\u624b", "\u8f6c\u8eab", "\u5750\u4e0b", "\u7ad9\u8d77", "\u6572", "\u6309", "\u62ac", "\u6362", "\u505c\u4f4f"],
  environment: ["\u623f\u95f4", "\u8d70\u5eca", "\u7a97", "\u706f", "\u8857\u9053", "\u5929\u7a7a", "\u96e8", "\u98ce", "\u96ea", "\u95e8", "\u5899", "\u5730\u677f", "\u5149", "\u5b9e\u9a8c\u5ba4"],
  dialogue: ["\u201c", "\u201d", "\"", "\u95ee\u9053", "\u8bf4\u9053", "\u56de\u7b54", "\u53cd\u95ee", "\u6253\u65ad", "\u6c89\u9ed8"],
  psychology: ["\u5fc3\u60f3", "\u89c9\u5f97", "\u610f\u8bc6\u5230", "\u6000\u7591", "\u5bb3\u6015", "\u7d27\u5f20", "\u5fc3\u865a", "\u5c34\u5c2c", "\u6123\u4f4f", "\u4e0d\u5b89"],
  paragraph: ["\u6bb5\u843d", "\u505c\u987f", "\u8282\u594f", "\u77ed\u53e5", "\u957f\u53e5"],
  rhetoric: ["\u50cf", "\u4eff\u4f5b", "\u4e0d\u662f", "\u800c\u662f", "\u6bd4\u55bb", "\u53cd\u590d"],
  pacing: ["\u5ffd\u7136", "\u7acb\u523b", "\u7ec8\u4e8e", "\u968f\u540e", "\u4e0e\u6b64\u540c\u65f6", "\u7247\u523b", "\u534a\u664c"],
  setting_delivery: ["\u7b49\u7ea7", "\u534f\u4f1a", "\u5236\u5ea6", "\u8003\u8bd5", "\u89c4\u5219", "\u5408\u540c", "\u6743\u9650", "\u6559\u4f1a", "\u9b54\u6cd5", "\u795e\u660e", "\u5b66\u9662", "\u91cd\u70b9\u73ed"],
  humor: ["\u5410\u69fd", "\u6253\u5de5", "\u5e7f\u544a\u724c", "\u901a\u884c\u8bc1", "\u751f\u4ea7\u7ebf", "\u79bb\u8c31", "\u91cd\u70b9\u73ed", "\u592a", "\u53c8\u662f"],
  conflict: ["\u51b2\u7a81", "\u8d28\u95ee", "\u5a01\u80c1", "\u53cd\u9a73", "\u4e89\u5435", "\u5bf9\u5cd9", "\u654c\u4eba", "\u6740", "\u5371\u9669", "\u5ba1\u5224"],
  mixed: []
};

export function buildStyleSnippets({ chapters, corpusProfiles }: BuildStyleSnippetOptions): SaveStyleRetrievalSnippetInput[] {
  const snippets: SaveStyleRetrievalSnippetInput[] = [];
  chapters.forEach((chapter) => {
    splitChapterIntoSnippets(chapter).forEach((text, index) => {
      const classified = classifySnippet(text);
      snippets.push({
        sourceType: "chapter",
        sourceId: `${chapter.id}:${index}`,
        chapterId: chapter.id,
        chapterTitle: chapter.title,
        volumeId: chapter.volumeId,
        dimensionType: classified.dimension,
        snippetText: text,
        summary: makeSummary(text),
        tags: classified.tags,
        metrics: getSnippetMetrics(text),
        contentHash: simpleHash(`${chapter.id}:${text}`)
      });
    });
  });

  corpusProfiles.forEach((profileState) => {
    profileState.examples.forEach((example) => {
      const classified = classifySnippet(`${example.originalExcerpt}\n${example.usageRule}`);
      snippets.push({
        sourceType: "corpus_example",
        sourceId: example.id,
        dimensionType: (example.dimensionType === "vocabulary" || example.dimensionType === "polish_rules" ? "rhetoric" : example.dimensionType) as StyleRetrievalDimensionType,
        snippetText: example.originalExcerpt,
        summary: example.analysisNote,
        tags: unique([...classified.tags, profileState.profile.profileName]),
        metrics: getSnippetMetrics(example.originalExcerpt),
        contentHash: simpleHash(`${example.id}:${example.originalExcerpt}`)
      });
    });

    profileState.dimensions.forEach((dimension) => {
      const rules = safeJsonArray(dimension.rulesJson);
      if (rules.length === 0 && !dimension.summary) return;
      const text = [dimension.summary, ...rules.slice(0, 5)].filter(Boolean).join("\n");
      snippets.push({
        sourceType: "style_profile",
        sourceId: dimension.id,
        dimensionType: (dimension.dimensionType === "vocabulary" || dimension.dimensionType === "polish_rules" ? "rhetoric" : dimension.dimensionType) as StyleRetrievalDimensionType,
        snippetText: text,
        summary: dimension.summary,
        tags: unique([profileState.profile.profileName, ...rules.flatMap(extractKeywords)]),
        metrics: getSnippetMetrics(text),
        contentHash: simpleHash(`${dimension.id}:${text}`)
      });
    });
  });

  const seen = new Set<string>();
  return snippets.filter((snippet) => {
    const key = `${snippet.sourceType}:${snippet.contentHash}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return Boolean(snippet.snippetText.trim());
  });
}

export function searchStyleSnippets(snippets: StyleRetrievalSnippet[], filters: SearchFilters): StyleSnippetSearchResult[] {
  const queryKeywords = extractKeywords(filters.query);
  const queryClass = classifySnippet(filters.query);
  return snippets
    .map((snippet) => {
      const tags = safeJsonArray(snippet.tagsJson);
      const snippetKeywords = extractKeywords(`${snippet.snippetText} ${snippet.summary} ${tags.join(" ")}`);
      let score = 0;
      const reasons: string[] = [];
      const keywordHits = queryKeywords.filter((keyword) => snippet.snippetText.includes(keyword) || snippet.summary.includes(keyword) || tags.includes(keyword));
      if (keywordHits.length > 0) {
        score += keywordHits.length * 18;
        reasons.push(`\u5173\u952e\u8bcd\u547d\u4e2d\uff1a${keywordHits.slice(0, 4).join(" / ")}`);
      }
      const tagHits = queryKeywords.filter((keyword) => tags.some((tag) => tag.includes(keyword) || keyword.includes(tag)));
      if (tagHits.length > 0) {
        score += tagHits.length * 10;
        reasons.push("\u6807\u7b7e\u76f8\u8fd1");
      }
      if (filters.dimensions.has(snippet.dimensionType)) {
        score += 18;
        reasons.push(`\u7c7b\u578b\u5339\u914d\uff1a${styleRetrievalDimensionLabels[snippet.dimensionType]}`);
      }
      if (queryClass.dimension === snippet.dimensionType) {
        score += 14;
        reasons.push("\u67e5\u8be2\u8bed\u4e49\u7c7b\u578b\u76f8\u8fd1");
      }
      const similarity = jaccard(queryKeywords, snippetKeywords);
      score += Math.round(similarity * 35);
      if (similarity > 0.12) reasons.push("\u6587\u672c\u5173\u952e\u8bcd\u76f8\u4f3c");
      if (snippet.sourceType === "corpus_example") score += 5;
      if (snippet.sourceType === "style_profile") score += 3;
      return {
        snippetId: snippet.id,
        score,
        sourceType: snippet.sourceType,
        chapterTitle: snippet.chapterTitle,
        dimensionType: snippet.dimensionType,
        snippetText: snippet.snippetText,
        summary: snippet.summary,
        tags,
        matchReason: reasons.join("\uff1b") || "\u57fa\u7840\u76f8\u5173",
        usageRule: buildUsageRule(snippet)
      };
    })
    .filter((result) => result.score >= filters.minScore && filters.dimensions.has(result.dimensionType))
    .sort((a, b) => b.score - a.score)
    .slice(0, filters.limit);
}

export function getSelectedStyleReferencesForPolish(results: StyleSnippetSearchResult[]) {
  return results.slice(0, 5).map((result) => ({
    snippet_text: result.snippetText,
    dimension_type: result.dimensionType,
    usage_rule: result.usageRule
  }));
}

function splitChapterIntoSnippets(chapter: Chapter) {
  const paragraphs = chapter.content
    .replace(/\r\n/g, "\n")
    .split(/\n{1,}/)
    .map((item) => item.trim())
    .filter(Boolean);
  const snippets: string[] = [];
  let buffer = "";
  paragraphs.forEach((paragraph) => {
    const next = buffer ? `${buffer}\n${paragraph}` : paragraph;
    if (countText(next) < 80) {
      buffer = next;
      return;
    }
    if (countText(next) > 300) {
      if (buffer) snippets.push(buffer);
      splitLongText(paragraph).forEach((part) => snippets.push(part));
      buffer = "";
      return;
    }
    snippets.push(next);
    buffer = "";
  });
  if (buffer && countText(buffer) >= 30) snippets.push(buffer);
  return snippets.map((item) => item.slice(0, 300));
}

function splitLongText(text: string) {
  const sentences = text.split(/(?<=[\u3002\uff01\uff1f!?])/).map((item) => item.trim()).filter(Boolean);
  const result: string[] = [];
  let buffer = "";
  sentences.forEach((sentence) => {
    const next = buffer + sentence;
    if (countText(next) > 260 && buffer) {
      result.push(buffer);
      buffer = sentence;
    } else {
      buffer = next;
    }
  });
  if (buffer) result.push(buffer);
  return result;
}

function classifySnippet(text: string): { dimension: StyleRetrievalDimensionType; tags: string[] } {
  const scores = styleRetrievalDimensionOrder.map((dimension) => ({
    dimension,
    score: keywordGroups[dimension].filter((keyword) => text.includes(keyword)).length
  }));
  const dialogueRatio = (text.match(/[\u201c\u201d\u300c\u300d\"]/g)?.length ?? 0) / Math.max(text.length, 1);
  if (dialogueRatio > 0.015) scores.find((item) => item.dimension === "dialogue")!.score += 3;
  const winner = scores.sort((a, b) => b.score - a.score)[0];
  const dimension = winner.score > 0 ? winner.dimension : "mixed";
  const tags = unique([
    ...keywordGroups[dimension].filter((keyword) => text.includes(keyword)),
    ...extractKeywords(text).slice(0, 8)
  ]);
  return { dimension, tags };
}

function getSnippetMetrics(text: string) {
  const length = countText(text);
  const dialogueMarks = text.match(/[\u201c\u201d\u300c\u300d\"]/g)?.length ?? 0;
  const actionHits = keywordGroups.action.filter((keyword) => text.includes(keyword)).length;
  const descriptionHits = [...keywordGroups.environment, ...keywordGroups.appearance].filter((keyword) => text.includes(keyword)).length;
  const sentences = text.split(/[\u3002\uff01\uff1f!?]/).filter(Boolean);
  return {
    dialogue_ratio: Number((dialogueMarks / Math.max(length, 1)).toFixed(3)),
    action_density: Number((actionHits / Math.max(sentences.length, 1)).toFixed(3)),
    description_density: Number((descriptionHits / Math.max(sentences.length, 1)).toFixed(3)),
    sentence_length_avg: Number((length / Math.max(sentences.length, 1)).toFixed(1))
  };
}

function buildUsageRule(snippet: StyleRetrievalSnippet) {
  if (snippet.sourceType === "style_profile") return snippet.summary || "\u63d0\u53d6\u8be5\u89c4\u5219\u4f5c\u4e3a\u6da6\u8272\u7ea6\u675f\u3002";
  return `\u53c2\u8003\u5176${styleRetrievalDimensionLabels[snippet.dimensionType]}\u65b9\u5f0f\uff0c\u4fdd\u7559\u539f\u6587\u5267\u60c5\u548c\u4eba\u7269\u5173\u7cfb\u3002`;
}

function extractKeywords(text: string) {
  return unique(
    text
      .split(/[\s,\uff0c\u3002\uff01\uff1f\uff1b;\uff1a\u201c\u201d'"<>()[\]\u3010\u3011]+/)
      .map((item) => item.trim())
      .filter((item) => item.length >= 2 && item.length <= 12)
  ).slice(0, 20);
}

function makeSummary(text: string) {
  const firstSentence = text.split(/[\u3002\uff01\uff1f!?]/).find(Boolean)?.trim();
  return firstSentence ? firstSentence.slice(0, 80) : text.slice(0, 80);
}

function safeJsonArray(value: string | undefined) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function countText(value: string) {
  return value.replace(/\s/g, "").length;
}

function jaccard(a: string[], b: string[]) {
  if (a.length === 0 || b.length === 0) return 0;
  const left = new Set(a);
  const right = new Set(b);
  const intersection = [...left].filter((item) => right.has(item)).length;
  const union = new Set([...a, ...b]).size;
  return union ? intersection / union : 0;
}

function simpleHash(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(16);
}

function unique(values: string[]) {
  return Array.from(new Set(values.map((item) => item.trim()).filter(Boolean)));
}
