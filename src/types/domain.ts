export type Project = {
  id: string;
  title: string;
  category: string;
  description?: string;
  coverPath?: string;
  createdAt: string;
  updatedAt: string;
  lastEditedAt: string;
};

export type Volume = {
  id: string;
  projectId: string;
  title: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type Chapter = {
  id: string;
  projectId: string;
  volumeId: string;
  title: string;
  content: string;
  sortOrder: number;
  wordCount: number;
  createdAt: string;
  updatedAt: string;
};

export type EditorState = {
  project: Project;
  volumes: Volume[];
  chapters: Chapter[];
};

export type SaveStatus = "editing" | "saving" | "saved" | "failed";

export type TreeSelection = {
  volumeIds: string[];
  chapterIds: string[];
};

export type ImportChapterDraft = {
  title: string;
  content: string;
  wordCount: number;
};

export type CreateProjectInput = {
  title: string;
  category?: string;
  description?: string;
  coverPath?: string;
};

export type UpdateProjectInput = CreateProjectInput;

export type OutlineSectionType = "world" | "main_characters" | "roles" | "main_plot" | "branch_plot" | "conflicts";

export type OutlineNodeType =
  | "world"
  | "main_character"
  | "protagonist_group"
  | "protagonist"
  | "role"
  | "supporting_character"
  | "main_plot"
  | "branch_plot"
  | "foreshadowing"
  | "twist"
  | "conflict";

export type OutlineTextSection = {
  id: string;
  projectId: string;
  sectionType: OutlineSectionType;
  content: string;
  createdAt: string;
  updatedAt: string;
};

export type OutlineMindNode = {
  id: string;
  projectId: string;
  nodeType: OutlineNodeType;
  title: string;
  description: string;
  x: number;
  y: number;
  createdAt: string;
  updatedAt: string;
};

export type OutlineMindEdge = {
  id: string;
  projectId: string;
  sourceNodeId: string;
  targetNodeId: string;
  edgeType: string;
  label?: string;
  createdAt: string;
  updatedAt: string;
};

export type OutlineState = {
  textSections: OutlineTextSection[];
  mindNodes: OutlineMindNode[];
  mindEdges: OutlineMindEdge[];
};

export type AIProviderName = "DeepSeek" | "OpenAI" | "deepseek" | "openai";
export type AIProviderStrategy = "deepseek" | "openai" | "hybrid";

export type AISettings = {
  provider: AIProviderName;
  apiKey: string;
  baseUrl: string;
  model: string;
  thinkingEnabled?: boolean;
  reasoningEffort?: "high" | "max";
  showReasoningContent?: boolean;
  openaiApiKey?: string;
  openaiBaseUrl?: string;
  openaiModel?: string;
  enableHybridAI?: boolean;
  primaryProvider?: "deepseek" | "openai";
  reviewProvider?: "deepseek" | "openai";
  primaryModel?: string;
  reviewModel?: string;
  enableCrossReview?: boolean;
  maxRevisionRounds?: number;
  featureStrategies?: {
    chapterSummary: AIProviderStrategy;
    outlineChunkAnalysis: AIProviderStrategy;
    outlineReduceMerge: AIProviderStrategy;
    outlineFinalMerge: AIProviderStrategy;
    mindmapGeneration: AIProviderStrategy;
    writingStyleAnalysis: AIProviderStrategy;
    chapterPolish: AIProviderStrategy;
  };
  featureChapterSummary?: AIProviderStrategy;
  featureOutlineChunkAnalysis?: AIProviderStrategy;
  featureOutlineReduceMerge?: AIProviderStrategy;
  featureOutlineFinalMerge?: AIProviderStrategy;
  featureMindmapGeneration?: AIProviderStrategy;
  featureWritingStyleAnalysis?: AIProviderStrategy;
  featureChapterPolish?: AIProviderStrategy;
  defaultAnalysisMode?: "simple" | "detailed";
  simpleChunkSize?: number;
  detailedChunkSize?: number;
  analysisConcurrency?: number;
  enableChapterCache?: boolean;
  featureOutlineChunkModel?: string;
  featureOutlineFinalModel?: string;
  featureReviewModel?: string;
  featurePatternMemoryModel?: string;
  featurePolishModel?: string;
};

export type AIUsageLogInput = {
  projectId?: string;
  featureName: string;
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCost: number;
};

export type AITask = {
  id: string;
  projectId?: string;
  taskType: string;
  status: string;
  inputText: string;
  outputText: string;
  createdAt: string;
  finishedAt?: string;
};

export type ChapterAICacheEntry = {
  id: string;
  projectId: string;
  chapterId: string;
  contentHash: string;
  model: string;
  promptVersion: string;
  analysisMode: "simple" | "detailed";
  summaryJson: string;
  createdAt: string;
  updatedAt: string;
};

export type ChapterSummaryResult = {
  chapter_summary: string;
  world_updates: string[];
  character_updates: string[];
  main_plot_updates: string[];
  foreshadowing: string[];
};

export type WritingStyleProfile = {
  id: string;
  projectId: string;
  profileName: string;
  sourceChapterIds: string;
  dialogueStyle: string;
  sceneDescriptionStyle: string;
  sentenceStructureStyle: string;
  emotionStyle: string;
  humorStyle: string;
  tabooStyle: string;
  styleSummary: string;
  exampleFeaturesJson: string;
  createdAt: string;
  updatedAt: string;
};

export type CorpusStyleSourceType = "current_chapter" | "recent_3_chapters" | "volume" | "full_book" | "manual_selection";
export type CorpusStyleAnalysisMode = "simple" | "detailed";
export type CorpusStyleDimensionType =
  | "appearance"
  | "action"
  | "environment"
  | "dialogue"
  | "psychology"
  | "paragraph"
  | "rhetoric"
  | "pacing"
  | "setting_delivery"
  | "vocabulary"
  | "polish_rules";

export type CorpusStyleProfile = {
  id: string;
  projectId: string;
  profileName: string;
  sourceType: CorpusStyleSourceType;
  sourceChapterIds: string;
  analysisMode: CorpusStyleAnalysisMode;
  summary: string;
  createdAt: string;
  updatedAt: string;
};

export type CorpusStyleDimension = {
  id: string;
  profileId: string;
  dimensionType: CorpusStyleDimensionType;
  summary: string;
  rulesJson: string;
  metricsJson: string;
  examplesJson: string;
  createdAt: string;
  updatedAt: string;
};

export type CorpusStyleExample = {
  id: string;
  profileId: string;
  dimensionType: CorpusStyleDimensionType;
  originalExcerpt: string;
  analysisNote: string;
  usageRule: string;
  createdAt: string;
  updatedAt: string;
};

export type CorpusStyleProfileState = {
  profile: CorpusStyleProfile;
  dimensions: CorpusStyleDimension[];
  examples: CorpusStyleExample[];
};

export type SaveCorpusStyleDimensionInput = {
  dimensionType: CorpusStyleDimensionType;
  summary: string;
  rulesJson: string;
  metricsJson: string;
  examplesJson: string;
};

export type SaveCorpusStyleExampleInput = {
  dimensionType: CorpusStyleDimensionType;
  originalExcerpt: string;
  analysisNote: string;
  usageRule: string;
};

export type SaveCorpusStyleProfileInput = {
  id?: string;
  projectId: string;
  profileName: string;
  sourceType: CorpusStyleSourceType;
  sourceChapterIds: string[];
  analysisMode: CorpusStyleAnalysisMode;
  summary: string;
  dimensions: SaveCorpusStyleDimensionInput[];
  examples: SaveCorpusStyleExampleInput[];
};

export type SaveWritingStyleProfileInput = {
  projectId: string;
  profileName: string;
  sourceChapterIds: string[];
  dialogueStyle: string;
  sceneDescriptionStyle: string;
  sentenceStructureStyle: string;
  emotionStyle: string;
  humorStyle: string;
  tabooStyle: string;
  styleSummary: string;
  exampleFeatures: string[];
  overwrite: boolean;
};

export type ChapterVersion = {
  id: string;
  chapterId: string;
  versionType: "original" | "ai_polished" | "manual_backup";
  content: string;
  createdAt: string;
  note?: string;
};

export type StyleCorpusCategory = {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
};

export type StyleCorpusWork = {
  id: string;
  categoryId: string;
  title: string;
  author: string;
  era: string;
  region: string;
  copyrightStatus: "public_domain" | "copyrighted" | "unknown" | "user_provided";
  allowDirectQuote: boolean;
  styleTags: string;
  themeTags: string;
  imageTags: string;
  usageNote: string;
  isBuiltin: boolean;
  isHidden: boolean;
  createdAt: string;
  updatedAt: string;
};

export type StyleCorpusQuote = {
  id: string;
  workId: string;
  originalText: string;
  sourceTitle: string;
  author: string;
  modernExplanation: string;
  sceneTags: string;
  emotionTags: string;
  imageTags: string;
  usageSuggestion: string;
  aiRewriteExample: string;
  createdAt: string;
  updatedAt: string;
};

export type StyleCorpusSearchResult = {
  categories: StyleCorpusCategory[];
  works: StyleCorpusWork[];
  quotes: StyleCorpusQuote[];
};

export type StyleRetrievalDimensionType =
  | "appearance"
  | "action"
  | "environment"
  | "dialogue"
  | "psychology"
  | "paragraph"
  | "rhetoric"
  | "pacing"
  | "setting_delivery"
  | "humor"
  | "conflict"
  | "mixed";

export type StyleRetrievalSourceType =
  | "chapter"
  | "corpus_example"
  | "style_profile"
  | "literary_reference"
  | "user_corpus";

export type StyleRetrievalSnippet = {
  id: string;
  projectId: string;
  sourceType: StyleRetrievalSourceType;
  sourceId: string;
  chapterId?: string;
  chapterTitle?: string;
  volumeId?: string;
  dimensionType: StyleRetrievalDimensionType;
  snippetText: string;
  summary: string;
  tagsJson: string;
  metricsJson: string;
  contentHash: string;
  createdAt: string;
  updatedAt: string;
};

export type SaveStyleRetrievalSnippetInput = {
  sourceType: StyleRetrievalSourceType;
  sourceId: string;
  chapterId?: string;
  chapterTitle?: string;
  volumeId?: string;
  dimensionType: StyleRetrievalDimensionType;
  snippetText: string;
  summary: string;
  tags: string[];
  metrics: Record<string, number | string | boolean>;
  contentHash: string;
};

export type StyleSnippetSearchResult = {
  snippetId: string;
  score: number;
  sourceType: StyleRetrievalSourceType;
  chapterTitle?: string;
  dimensionType: StyleRetrievalDimensionType;
  snippetText: string;
  summary: string;
  tags: string[];
  matchReason: string;
  usageRule: string;
};

export type MemoryLibraryStats = {
  outlineTextSections: number;
  outlineMindNodes: number;
  outlineMindEdges: number;
  chapterSummaries: number;
  globalOutlines: number;
  characters: number;
  plotThreads: number;
  foreshadowing: number;
  consistencyIssues: number;
  writingStyleProfiles: number;
  aiPatternMemory: number;
  styleCorpusCategories: number;
  styleCorpusWorks: number;
  styleCorpusQuotes: number;
};

export type AIPatternMemory = {
  id: string;
  projectId: string;
  patternType: string;
  patternName: string;
  patternKeywords: string;
  patternDescription: string;
  badExamples: string;
  rewriteAdvice: string;
  severity: "low" | "medium" | "high";
  source: "builtin" | "user" | "ai_review" | "ai_summary";
  sourceModel: string;
  hitCount: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SaveAIPatternMemoryInput = {
  id?: string;
  projectId: string;
  patternType: string;
  patternName: string;
  patternKeywords: string[];
  patternDescription: string;
  badExamples: string[];
  rewriteAdvice: string;
  severity: "low" | "medium" | "high";
  source?: "builtin" | "user" | "ai_review" | "ai_summary";
  sourceModel?: string;
  isActive: boolean;
};

export type ReviewPatternInput = {
  patternType: string;
  patternName: string;
  patternKeywords: string[];
  patternDescription: string;
  badExample?: string;
  rewriteAdvice: string;
  severity: "low" | "medium" | "high";
  sourceModel: string;
};

export type CharacterState = "active" | "missing" | "dead" | "unknown";

export type Character = {
  id: string;
  projectId: string;
  name: string;
  role?: string;
  currentState: CharacterState;
  lastSeenChapterId?: string;
  notes?: string;
};

export type PlotThread = {
  id: string;
  projectId: string;
  title: string;
  status: "open" | "resolved" | "dropped";
  notes?: string;
};
