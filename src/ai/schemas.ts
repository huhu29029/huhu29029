import { z } from "zod";

const stringArray = z.array(z.string());
const chapterValue = z.union([z.string(), z.number()]);
const branchStatusValues = ["new", "progressing", "paused", "resolved"] as const;
const conflictTypeValues = ["protagonist", "interpersonal", "social", "class", "system", "potential"] as const;
const conflictStatusValues = ["active", "resolved", "potential"] as const;
const nodeTypeValues = [
  "world",
  "main_character",
  "protagonist_group",
  "protagonist",
  "role",
  "supporting_character",
  "main_plot",
  "branch_plot",
  "foreshadowing",
  "twist",
  "conflict"
] as const;
const edgeTypeValues = ["related", "causes", "reveals", "conflicts", "supports", "belongs_to", "leads_to"] as const;

const MainEventSchema = z.object({
  title: z.string(),
  chapters: z.array(chapterValue),
  chapter_range: z.string(),
  summary: z.string(),
  protagonist_action: z.string(),
  plot_progress: z.string(),
  result: z.string(),
  related_characters: stringArray,
  conflict_summary: z.string()
});

const BranchCandidateSchema = z.object({
  title: z.string(),
  chapters: z.array(chapterValue),
  status: z.enum(branchStatusValues),
  summary: z.string(),
  related_characters: stringArray,
  need_follow_up: z.boolean()
});

export const Stage1PlotSchema = z.object({
  main_events: z.array(MainEventSchema).max(12),
  main_plot_progress: z.string(),
  branch_candidates: z.array(BranchCandidateSchema),
  important_characters: stringArray,
  faction_change_candidates: stringArray,
  key_event_markers: stringArray
});

export const Stage2CastSchema = z.object({
  protagonist_name: z.string(),
  protagonist_group: z.array(
    z.object({
      name: z.string(),
      reason: z.string(),
      relationship_to_protagonist: z.string(),
      faction_relation: z.string(),
      is_long_term_partner: z.boolean(),
      is_temporary_partner: z.boolean(),
      is_hostile: z.boolean()
    })
  ),
  supporting_characters: z.array(
    z.object({
      name: z.string(),
      reason: z.string(),
      relationship_to_protagonist: z.string(),
      faction: z.string(),
      is_hostile: z.boolean()
    })
  )
});

const CoreCharacterSchema = z.object({
  name: z.string(),
  identity: z.string(),
  social_class: z.string(),
  faction_relation: z.string(),
  relationship_to_protagonist: z.string(),
  gender: z.string(),
  hair_color: z.string(),
  eye_color: z.string(),
  body_type: z.string(),
  clothing_style: z.string(),
  appearance: z.string(),
  personality: stringArray,
  action_logic: stringArray,
  current_goal: z.string(),
  current_state: z.string(),
  speech_style: z.string(),
  quote_example: z.string()
});

export const Stage3CharacterDetailsSchema = z.object({
  characters: z.array(CoreCharacterSchema.extend({ is_core_group: z.boolean() }))
});

const ConflictItemSchema = z.object({
  type: z.enum(conflictTypeValues),
  content: z.string(),
  related_main_event: z.string(),
  status: z.enum(conflictStatusValues)
});

export const Stage4WorldConflictsSchema = z.object({
  worldbuilding: z.object({
    background: z.string(),
    social_structure: stringArray,
    power_system: stringArray,
    protagonist_position: z.string(),
    new_settings: stringArray
  }),
  conflicts: z.array(ConflictItemSchema)
});

const SupportingCharacterSchema = z.object({
  name: z.string(),
  identity: z.string(),
  relationship_to_protagonist: z.string(),
  faction: z.string(),
  current_role: z.string(),
  current_state: z.string(),
  is_dead: z.boolean(),
  death_info: z.string()
});

export const GenerateOutlineResultSchema = z.object({
  protagonist: z.object({
    name: z.string(),
    identity: z.string(),
    social_class: z.string(),
    personality: stringArray,
    action_logic: stringArray,
    appearance: z.string(),
    current_goal: z.string(),
    current_situation: z.string()
  }),
  protagonist_group: z.array(CoreCharacterSchema),
  main_events: z.array(MainEventSchema),
  supporting_characters: z.array(SupportingCharacterSchema),
  worldbuilding: Stage4WorldConflictsSchema.shape.worldbuilding,
  conflicts: z.object({
    protagonist_conflicts: stringArray,
    interpersonal_conflicts: stringArray,
    social_conflicts: stringArray,
    class_conflicts: stringArray,
    system_conflicts: stringArray,
    unknown_or_uncertain_conflicts: stringArray,
    items: z.array(ConflictItemSchema).optional()
  }),
  main_plot: z.object({
    current_main_plot: z.string(),
    previous_progress: z.string(),
    new_progress: z.string(),
    new_goals: stringArray,
    new_crises: stringArray,
    deviation_from_existing_outline: z.string()
  }),
  branch_plots: z.array(BranchCandidateSchema.extend({ chapter_range: z.string() })),
  outline_text_updates: z.object({
    world: z.string(),
    main_characters: z.string(),
    roles: z.string(),
    main_plot: z.string(),
    branch_plot: z.string(),
    conflicts: z.string()
  }),
  mindmap_suggestions: z.object({
    nodes: z.array(
      z.object({
        node_type: z.enum(nodeTypeValues),
        title: z.string(),
        description: z.string()
      })
    ),
    edges: z.array(
      z.object({
        source_title: z.string(),
        target_title: z.string(),
        edge_type: z.enum(edgeTypeValues),
        label: z.string()
      })
    )
  })
});

export type Stage1PlotPayload = z.infer<typeof Stage1PlotSchema>;
export type Stage2CastPayload = z.infer<typeof Stage2CastSchema>;
export type Stage3CharacterDetailsPayload = z.infer<typeof Stage3CharacterDetailsSchema>;
export type Stage4WorldConflictsPayload = z.infer<typeof Stage4WorldConflictsSchema>;
export type GenerateOutlineResultPayload = z.infer<typeof GenerateOutlineResultSchema>;
export type GenerateOutlineParsedPayload = GenerateOutlineResultPayload & {
  mindmapSkipped?: boolean;
  normalizeWarnings?: string[];
};

export const ChapterSummarySchema = z.object({
  chapter_summary: z.string(),
  world_updates: stringArray,
  character_updates: stringArray,
  main_plot_updates: stringArray,
  foreshadowing: stringArray
});

export type ChapterSummaryPayload = z.infer<typeof ChapterSummarySchema>;

export const WritingStyleProfileSchema = z.object({
  dialogue_style: z.string(),
  scene_description_style: z.string(),
  sentence_structure_style: z.string(),
  emotion_style: z.string(),
  humor_style: z.string(),
  taboo_style: z.string(),
  style_summary: z.string(),
  example_features: stringArray
});

export type WritingStyleProfilePayload = z.infer<typeof WritingStyleProfileSchema>;

const CorpusStylePartSchema = z.object({
  summary: z.string(),
  features: stringArray,
  rules_for_polish: stringArray,
  examples: stringArray
});

export const CorpusStyleChunkResultSchema = z.object({
  appearance_style: CorpusStylePartSchema,
  action_style: CorpusStylePartSchema,
  environment_style: CorpusStylePartSchema,
  dialogue_style: CorpusStylePartSchema,
  psychology_style: CorpusStylePartSchema,
  paragraph_style: CorpusStylePartSchema,
  rhetoric_style: CorpusStylePartSchema,
  pacing_style: CorpusStylePartSchema,
  setting_delivery_style: CorpusStylePartSchema,
  vocabulary_style: z.object({
    summary: z.string(),
    frequent_words: stringArray,
    signature_words: stringArray,
    risky_repeated_words: stringArray,
    rules_for_polish: stringArray
  })
});

const CorpusStyleProfileDimensionSchema = z.object({
  summary: z.string(),
  rules_for_polish: stringArray,
  examples: stringArray
});

export const CorpusStyleProfileSchema = z.object({
  profile_summary: z.string(),
  dimensions: z.object({
    appearance: CorpusStyleProfileDimensionSchema,
    action: CorpusStyleProfileDimensionSchema,
    environment: CorpusStyleProfileDimensionSchema,
    dialogue: CorpusStyleProfileDimensionSchema,
    psychology: CorpusStyleProfileDimensionSchema,
    paragraph: CorpusStyleProfileDimensionSchema,
    rhetoric: CorpusStyleProfileDimensionSchema,
    pacing: CorpusStyleProfileDimensionSchema,
    setting_delivery: CorpusStyleProfileDimensionSchema,
    vocabulary: z.object({
      summary: z.string(),
      signature_words: stringArray,
      risky_repeated_words: stringArray,
      rules_for_polish: stringArray
    }),
    polish_rules: z.object({
      summary: z.string(),
      must_keep: stringArray,
      should_avoid: stringArray,
      prompt_rules: stringArray
    })
  })
});

export type CorpusStyleChunkResultPayload = z.infer<typeof CorpusStyleChunkResultSchema>;
export type CorpusStyleProfilePayload = z.infer<typeof CorpusStyleProfileSchema>;

export function parseCorpusStyleChunkJson(raw: string) {
  return CorpusStyleChunkResultSchema.parse(normalizeCorpusStyleChunk(JSON.parse(extractJsonText(raw))));
}

export function parseCorpusStyleProfileJson(raw: string) {
  return CorpusStyleProfileSchema.parse(normalizeCorpusStyleProfile(JSON.parse(extractJsonText(raw))));
}

const PolishAnalysisIssueSchema = z.object({
  id: z.string(),
  type: z.enum(["description", "dialogue", "action", "pacing", "character", "scene", "ai_taste", "structure", "wording", "ending", "other"]),
  severity: z.enum(["low", "medium", "high"]),
  original_quote: z.string(),
  problem: z.string(),
  rewrite_direction: z.string()
});

export const PolishAnalysisSchema = z.object({
  overall_assessment: z.string(),
  issues: z.array(PolishAnalysisIssueSchema),
  polish_strategy: z.object({
    main_goal: z.string(),
    keep: stringArray,
    avoid: stringArray,
    focus: stringArray
  }),
  estimated_change_level: z.enum(["light", "medium", "heavy"])
});

export type PolishAnalysisPayload = z.infer<typeof PolishAnalysisSchema>;

const PolishSuggestionSchema = z.object({
  id: z.string(),
  type: z.enum([
    "style",
    "character",
    "plot",
    "wording",
    "pacing",
    "ai_taste",
    "length",
    "structure",
    "concrete_detail",
    "dialogue_interaction",
    "scene_camera",
    "body_language",
    "description_specificity",
    "metaphor_overuse",
    "plain_description",
    "ending_overextension",
    "ai_negation_pattern",
    "negation_pattern",
    "light_action_template",
    "repeated_emphasis_template",
    "blunt_explanation_template",
    "object_description_template",
    "ai_wording_template"
  ]),
  severity: z.enum(["low", "medium", "high"]),
  original_quote: z.string().optional(),
  content: z.string(),
  recommended_prompt_addition: z.string()
});

const AITasteEvidenceSchema = z.object({
  id: z.string(),
  type: z.string(),
  pattern_type: z.string().optional(),
  quote: z.string(),
  reason: z.string(),
  rewrite_advice: z.string().optional(),
  suggestion_id: z.string().optional()
});

export const PolishReviewResultSchema = z.object({
  overall_score: z.number(),
  ai_taste_score: z.number(),
  style_consistency_score: z.number(),
  character_consistency_score: z.number(),
  plot_consistency_score: z.number(),
  length_control_score: z.number(),
  copyright_risk_score: z.number().optional(),
  over_literary_score: z.number().optional(),
  style_overload_score: z.number().optional(),
  character_voice_shift_score: z.number().optional(),
  metaphor_overuse_score: z.number().optional(),
  plain_description_score: z.number().optional(),
  ending_overextension_score: z.number().optional(),
  ai_negation_pattern_score: z.number().optional(),
  light_action_template_score: z.number().optional(),
  repeated_emphasis_template_score: z.number().optional(),
  object_description_template_score: z.number().optional(),
  analysis_follow_score: z.number().optional(),
  unnecessary_rewrite_score: z.number().optional(),
  unnecessary_rewrite_evidence: z.array(z.object({
    quote: z.string(),
    reason: z.string(),
    rewrite_advice: z.string()
  })).optional(),
  ai_taste_evidence: z.array(AITasteEvidenceSchema).optional(),
  suggestions: z.array(PolishSuggestionSchema),
  accepted_parts: stringArray,
  risk_warnings: stringArray
});

export type PolishReviewResultPayload = z.infer<typeof PolishReviewResultSchema>;

const FullTextDetectionSuggestionSchema = z.object({
  id: z.string(),
  type: z.string(),
  severity: z.enum(["low", "medium", "high"]),
  chapter_title: z.string(),
  excerpt: z.string(),
  issue: z.string(),
  reason: z.string(),
  suggestion: z.string()
});

export const FullTextDetectionResultSchema = z.object({
  overall_summary: z.string(),
  risk_level: z.enum(["low", "medium", "high"]),
  suggestions: z.array(FullTextDetectionSuggestionSchema),
  global_recommendations: stringArray
});

export type FullTextDetectionResultPayload = z.infer<typeof FullTextDetectionResultSchema>;

export function parseWritingStyleProfileJson(content: string) {
  return WritingStyleProfileSchema.parse(normalizeWritingStyleProfile(JSON.parse(extractJsonText(content))));
}

export function parsePolishReviewJson(content: string) {
  return PolishReviewResultSchema.parse(normalizePolishReview(JSON.parse(extractJsonText(content))));
}

export function parsePolishAnalysisJson(content: string) {
  return PolishAnalysisSchema.parse(normalizePolishAnalysis(JSON.parse(extractJsonText(content))));
}

export function parseFullTextDetectionJson(content: string) {
  return FullTextDetectionResultSchema.parse(normalizeFullTextDetection(JSON.parse(extractJsonText(content))));
}

export const LiteraryImageSuggestionSchema = z.object({
  selected_corpus_summary: z.string(),
  scene_mood: z.string(),
  key_images: stringArray,
  style_reference_notes: z.array(
    z.object({
      work_title: z.string(),
      reference_type: z.enum(["style", "theme", "image", "rhythm", "allusion"]),
      note: z.string(),
      copyright_safe: z.boolean()
    })
  ),
  public_domain_references: z.array(
    z.object({
      source_type: z.enum(["classical_poetry", "public_domain_literature", "myth", "historical_allusion"]),
      source_name: z.string(),
      reference: z.string(),
      usage_suggestion: z.string()
    })
  ),
  original_sentence_suggestions: z.array(
    z.object({
      target_effect: z.string(),
      suggested_sentence: z.string(),
      note: z.string()
    })
  ),
  warnings: stringArray
});

export type LiteraryImageSuggestionPayload = z.infer<typeof LiteraryImageSuggestionSchema>;

export function parseLiteraryImageSuggestionJson(content: string) {
  const input = record(JSON.parse(extractJsonText(content)));
  return LiteraryImageSuggestionSchema.parse({
    selected_corpus_summary: text(input.selected_corpus_summary || input.summary),
    scene_mood: text(input.scene_mood || input.mood),
    key_images: array(input.key_images || input.images).map(text).filter(Boolean),
    style_reference_notes: array(input.style_reference_notes).map((item) => {
      const row = record(item);
      const type = text(row.reference_type);
      return {
        work_title: text(row.work_title || row.title),
        reference_type: includes(["style", "theme", "image", "rhythm", "allusion"] as const, type) ? type : "style",
        note: text(row.note || row.content),
        copyright_safe: bool(row.copyright_safe ?? true)
      };
    }),
    public_domain_references: array(input.public_domain_references).map((item) => {
      const row = record(item);
      const type = text(row.source_type);
      return {
        source_type: includes(["classical_poetry", "public_domain_literature", "myth", "historical_allusion"] as const, type) ? type : "classical_poetry",
        source_name: text(row.source_name || row.title),
        reference: text(row.reference),
        usage_suggestion: text(row.usage_suggestion || row.suggestion)
      };
    }),
    original_sentence_suggestions: array(input.original_sentence_suggestions).map((item) => {
      const row = record(item);
      return {
        target_effect: text(row.target_effect || row.effect),
        suggested_sentence: text(row.suggested_sentence || row.sentence),
        note: text(row.note)
      };
    }),
    warnings: array(input.warnings).map(text).filter(Boolean)
  });
}

function normalizeWritingStyleProfile(value: unknown) {
  const input = record(value);
  return {
    dialogue_style: text(input.dialogue_style || input.dialogueStyle),
    scene_description_style: text(input.scene_description_style || input.sceneDescriptionStyle),
    sentence_structure_style: text(input.sentence_structure_style || input.sentenceStructureStyle),
    emotion_style: text(input.emotion_style || input.emotionStyle),
    humor_style: text(input.humor_style || input.humorStyle),
    taboo_style: text(input.taboo_style || input.tabooStyle),
    style_summary: text(input.style_summary || input.styleSummary || input.summary),
    example_features: array(input.example_features || input.exampleFeatures).map(text).filter(Boolean)
  };
}

function normalizeCorpusStylePart(value: unknown) {
  const input = record(value);
  return {
    summary: text(input.summary || input.analysis || input.description),
    features: arrayText(input.features || input.feature || input.traits),
    rules_for_polish: arrayText(input.rules_for_polish || input.rules || input.polish_rules || input.rulesForPolish),
    examples: arrayText(input.examples).map((item) => firstChars(item, 200))
  };
}

function normalizeCorpusStyleChunk(value: unknown) {
  const input = record(value);
  const vocabulary = record(input.vocabulary_style || input.vocabulary || input.high_frequency_words);
  return {
    appearance_style: normalizeCorpusStylePart(input.appearance_style || input.appearance),
    action_style: normalizeCorpusStylePart(input.action_style || input.action),
    environment_style: normalizeCorpusStylePart(input.environment_style || input.environment),
    dialogue_style: normalizeCorpusStylePart(input.dialogue_style || input.dialogue),
    psychology_style: normalizeCorpusStylePart(input.psychology_style || input.psychology),
    paragraph_style: normalizeCorpusStylePart(input.paragraph_style || input.paragraph),
    rhetoric_style: normalizeCorpusStylePart(input.rhetoric_style || input.rhetoric),
    pacing_style: normalizeCorpusStylePart(input.pacing_style || input.pacing),
    setting_delivery_style: normalizeCorpusStylePart(input.setting_delivery_style || input.setting_delivery),
    vocabulary_style: {
      summary: text(vocabulary.summary || vocabulary.analysis),
      frequent_words: arrayText(vocabulary.frequent_words || vocabulary.frequentWords),
      signature_words: arrayText(vocabulary.signature_words || vocabulary.signatureWords),
      risky_repeated_words: arrayText(vocabulary.risky_repeated_words || vocabulary.riskyRepeatedWords),
      rules_for_polish: arrayText(vocabulary.rules_for_polish || vocabulary.rules || vocabulary.rulesForPolish)
    }
  };
}

function normalizeCorpusProfileDimension(value: unknown) {
  const input = record(value);
  return {
    summary: text(input.summary || input.analysis || input.description),
    rules_for_polish: arrayText(input.rules_for_polish || input.rules || input.polish_rules || input.rulesForPolish),
    examples: arrayText(input.examples).map((item) => firstChars(item, 200))
  };
}

function normalizeCorpusStyleProfile(value: unknown) {
  const input = record(value);
  const dimensions = record(input.dimensions);
  const vocabulary = record(dimensions.vocabulary || input.vocabulary);
  const polishRules = record(dimensions.polish_rules || dimensions.polishRules || input.polish_rules);
  return {
    profile_summary: text(input.profile_summary || input.summary || input.profileSummary),
    dimensions: {
      appearance: normalizeCorpusProfileDimension(dimensions.appearance),
      action: normalizeCorpusProfileDimension(dimensions.action),
      environment: normalizeCorpusProfileDimension(dimensions.environment),
      dialogue: normalizeCorpusProfileDimension(dimensions.dialogue),
      psychology: normalizeCorpusProfileDimension(dimensions.psychology),
      paragraph: normalizeCorpusProfileDimension(dimensions.paragraph),
      rhetoric: normalizeCorpusProfileDimension(dimensions.rhetoric),
      pacing: normalizeCorpusProfileDimension(dimensions.pacing),
      setting_delivery: normalizeCorpusProfileDimension(dimensions.setting_delivery || dimensions.settingDelivery),
      vocabulary: {
        summary: text(vocabulary.summary),
        signature_words: arrayText(vocabulary.signature_words || vocabulary.signatureWords),
        risky_repeated_words: arrayText(vocabulary.risky_repeated_words || vocabulary.riskyRepeatedWords),
        rules_for_polish: arrayText(vocabulary.rules_for_polish || vocabulary.rules || vocabulary.rulesForPolish)
      },
      polish_rules: {
        summary: text(polishRules.summary),
        must_keep: arrayText(polishRules.must_keep || polishRules.mustKeep),
        should_avoid: arrayText(polishRules.should_avoid || polishRules.shouldAvoid),
        prompt_rules: arrayText(polishRules.prompt_rules || polishRules.promptRules || polishRules.rules_for_polish)
      }
    }
  };
}

function normalizePolishReview(value: unknown) {
  const input = record(value);
  const suggestions = array(input.suggestions).map((item, index) => {
    const itemRecord = record(item);
    const type = normalizeSuggestionType(text(itemRecord.type));
    const severity = normalizeSeverity(text(itemRecord.severity));
    const content = text(itemRecord.content || itemRecord.suggestion || itemRecord.summary);
    return {
      id: text(itemRecord.id) || `suggestion-${index + 1}`,
      type,
      severity,
      original_quote: text(itemRecord.original_quote || itemRecord.originalQuote || itemRecord.quote || itemRecord.excerpt),
      content,
      recommended_prompt_addition:
        text(itemRecord.recommended_prompt_addition || itemRecord.recommendedPromptAddition) ||
        defaultPolishPromptAddition(type, content)
    };
  });
  return {
    overall_score: numberFromUnknown(input.overall_score || input.overallScore),
    ai_taste_score: numberFromUnknown(input.ai_taste_score || input.aiTasteScore),
    style_consistency_score: numberFromUnknown(input.style_consistency_score || input.styleConsistencyScore),
    character_consistency_score: numberFromUnknown(input.character_consistency_score || input.characterConsistencyScore),
    plot_consistency_score: numberFromUnknown(input.plot_consistency_score || input.plotConsistencyScore),
    length_control_score: numberFromUnknown(input.length_control_score || input.lengthControlScore),
    copyright_risk_score: numberFromUnknown(input.copyright_risk_score || input.copyrightRiskScore),
    over_literary_score: numberFromUnknown(input.over_literary_score || input.overLiteraryScore),
    style_overload_score: numberFromUnknown(input.style_overload_score || input.styleOverloadScore),
    character_voice_shift_score: numberFromUnknown(input.character_voice_shift_score || input.characterVoiceShiftScore),
    metaphor_overuse_score: numberFromUnknown(input.metaphor_overuse_score || input.metaphorOveruseScore),
    plain_description_score: numberFromUnknown(input.plain_description_score || input.plainDescriptionScore),
    ending_overextension_score: numberFromUnknown(input.ending_overextension_score || input.endingOverextensionScore),
    ai_negation_pattern_score: numberFromUnknown(input.ai_negation_pattern_score || input.aiNegationPatternScore),
    light_action_template_score: numberFromUnknown(input.light_action_template_score || input.lightActionTemplateScore),
    repeated_emphasis_template_score: numberFromUnknown(
      input.repeated_emphasis_template_score || input.repeatedEmphasisTemplateScore
    ),
    object_description_template_score: numberFromUnknown(
      input.object_description_template_score || input.objectDescriptionTemplateScore
    ),
    analysis_follow_score: numberFromUnknown(input.analysis_follow_score || input.analysisFollowScore),
    unnecessary_rewrite_score: numberFromUnknown(input.unnecessary_rewrite_score || input.unnecessaryRewriteScore),
    unnecessary_rewrite_evidence: array(input.unnecessary_rewrite_evidence || input.unnecessaryRewriteEvidence).map((item) => {
      const row = record(item);
      return {
        quote: text(row.quote || row.excerpt || row.original_quote),
        reason: text(row.reason || row.problem),
        rewrite_advice: text(row.rewrite_advice || row.advice || row.suggestion)
      };
    }),
    ai_taste_evidence: array(input.ai_taste_evidence || input.aiTasteEvidence || input.evidence).map((item, index) => {
      const row = record(item);
      return {
        id: text(row.id) || `evidence-${index + 1}`,
        type: text(row.type || row.category),
        pattern_type: text(row.pattern_type || row.patternType || row.type),
        quote: text(row.quote || row.original_quote || row.excerpt || row.text),
        reason: text(row.reason || row.issue || row.content),
        rewrite_advice: text(row.rewrite_advice || row.rewriteAdvice || row.advice || row.suggestion),
        suggestion_id: text(row.suggestion_id || row.suggestionId)
      };
    }),
    suggestions,
    accepted_parts: array(input.accepted_parts || input.acceptedParts).map(text).filter(Boolean),
    risk_warnings: array(input.risk_warnings || input.riskWarnings).map(text).filter(Boolean)
  };
}

function normalizePolishAnalysis(value: unknown) {
  const input = record(value);
  const strategy = record(input.polish_strategy || input.strategy);
  return {
    overall_assessment: text(input.overall_assessment || input.assessment || input.summary),
    issues: array(input.issues).map((item, index) => {
      const row = record(item);
      return {
        id: text(row.id) || `issue-${index + 1}`,
        type: normalizePolishAnalysisIssueType(text(row.type || row.category)),
        severity: normalizeSeverity(text(row.severity)),
        original_quote: text(row.original_quote || row.quote || row.excerpt),
        problem: text(row.problem || row.issue || row.reason),
        rewrite_direction: text(row.rewrite_direction || row.direction || row.suggestion || row.advice)
      };
    }),
    polish_strategy: {
      main_goal: text(strategy.main_goal || strategy.goal),
      keep: arrayText(strategy.keep),
      avoid: arrayText(strategy.avoid),
      focus: arrayText(strategy.focus)
    },
    estimated_change_level: normalizeChangeLevel(text(input.estimated_change_level || input.change_level))
  };
}

function normalizePolishAnalysisIssueType(value: string): z.infer<typeof PolishAnalysisIssueSchema>["type"] {
  if (includes(["description", "dialogue", "action", "pacing", "character", "scene", "ai_taste", "structure", "wording", "ending", "other"] as const, value)) return value;
  if (/描写|形容|细节/.test(value)) return "description";
  if (/对话|台词/.test(value)) return "dialogue";
  if (/动作|肢体/.test(value)) return "action";
  if (/节奏/.test(value)) return "pacing";
  if (/人物|角色|OOC/i.test(value)) return "character";
  if (/场景|环境|景物/.test(value)) return "scene";
  if (/AI|模板/.test(value)) return "ai_taste";
  if (/结构/.test(value)) return "structure";
  if (/用词|句子|措辞/.test(value)) return "wording";
  if (/结尾|升华|预告/.test(value)) return "ending";
  return "other";
}

function normalizeChangeLevel(value: string): "light" | "medium" | "heavy" {
  if (value === "heavy" || /重|大|高/.test(value)) return "heavy";
  if (value === "medium" || /中/.test(value)) return "medium";
  return "light";
}

function normalizeFullTextDetection(value: unknown) {
  const input = record(value);
  return {
    overall_summary: text(input.overall_summary || input.summary || input.overall),
    risk_level: normalizeDetectionRisk(text(input.risk_level || input.risk || input.severity)),
    suggestions: array(input.suggestions || input.issues).map((item, index) => {
      const row = record(item);
      return {
        id: text(row.id) || `issue-${index + 1}`,
        type: text(row.type || row.category) || "general",
        severity: normalizeSeverity(text(row.severity || row.risk_level)),
        chapter_title: text(row.chapter_title || row.chapter || row.location),
        excerpt: text(row.excerpt || row.original || row.text),
        issue: text(row.issue || row.problem || row.title),
        reason: text(row.reason || row.cause || row.analysis),
        suggestion: text(row.suggestion || row.fix || row.rewrite_advice)
      };
    }),
    global_recommendations: arrayText(input.global_recommendations || input.recommendations || input.summary_suggestions)
  };
}

function normalizeDetectionRisk(value: string): "low" | "medium" | "high" {
  if (value === "high" || /高|严重/.test(value)) return "high";
  if (value === "medium" || /中/.test(value)) return "medium";
  return "low";
}

function numberFromUnknown(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeSuggestionType(value: string): z.infer<typeof PolishSuggestionSchema>["type"] {
  const cleanValue = value.trim();
  const knownTypes = [
    "style",
    "character",
    "plot",
    "wording",
    "pacing",
    "ai_taste",
    "length",
    "structure",
    "concrete_detail",
    "dialogue_interaction",
    "scene_camera",
    "body_language",
    "description_specificity",
    "metaphor_overuse",
    "plain_description",
    "ending_overextension",
    "ai_negation_pattern",
    "negation_pattern",
    "light_action_template",
    "repeated_emphasis_template",
    "blunt_explanation_template",
    "object_description_template",
    "ai_wording_template"
  ];
  if (knownTypes.includes(cleanValue)) return cleanValue as z.infer<typeof PolishSuggestionSchema>["type"];
  if (/\u65ad\u53e5|\u4e0d\u662f.*\u771f\u7684|\u4e0d\u662f\u5f62\u5bb9|\u4e0d\u662f\u6bd4\u55bb|\u4e0d\u662f\u5938\u5f20|\u4e0d\u662f\u9519\u89c9|\u4e0d\u662f\u73a9\u7b11/.test(cleanValue)) return "blunt_explanation_template";
  if (/\u9ad8\u9891|\u865a\u8bcd|\u60c4\u7136|\u5206\u660e|\u4eff\u4f5b|\u4f3c\u4e4e|\u67d0\u79cd|AI.?(\u7528\u8bcd|\u8154)/i.test(cleanValue)) return "ai_wording_template";
  if (/\u5148\u5426\u5b9a|\u8fde\u7eed\u5426\u5b9a|\u4e0d\u662f.*\u800c\u662f|\u5e76\u975e.*\u800c\u662f/.test(cleanValue)) return "negation_pattern";
  if (/\u91cd\u590d\u5f3a\u8c03|\u592a.*\u4e86|\u5f88\u4e0d\u5bf9|\u53c8\u662f|\u77ed\u53e5\u5f3a\u8c03/.test(cleanValue)) return "repeated_emphasis_template";
  if (/\u8f7b\u52a8\u4f5c|\u5f88\u8f7b|\u6781\u8f7b|\u538b\u5f97\u5f88\u8f7b|\u653e\u5f97\u5f88\u8f7b/.test(cleanValue)) return "light_action_template";
  if (/\u7269\u54c1\u63cf\u5199|\u7269\u4ef6\u63cf\u5199|\u9053\u5177\u63cf\u5199|\u9759\u9759\u8eba\u7740|\u8f7b\u8f7b\u6643\u52a8|\u5fae\u5fae\u98a4\u52a8/.test(cleanValue)) return "object_description_template";
  if (/\u8fc7\u5ea6\u6bd4\u55bb|\u6bd4\u55bb\u6ee5\u7528|\u660e\u55bb|\u6697\u55bb|\u6587\u827a\u611f/.test(cleanValue)) return "metaphor_overuse";
  if (/\u767d\u63cf|\u5177\u4f53\u753b\u9762|\u5177\u4f53\u63cf\u5199|\u53ef\u89c1/.test(cleanValue)) return "plain_description";
  if (/\u7ed3\u5c3e|\u5347\u534e|\u9884\u544a|\u7eed\u5199|\u603b\u7ed3|\u6536\u675f/.test(cleanValue)) return "ending_overextension";
  if (/\u4eba\u7269|\u89d2\u8272|ooc/i.test(cleanValue)) return "character";
  if (/\u5267\u60c5|\u4e8b\u5b9e/i.test(cleanValue)) return "plot";
  if (/\u8282\u594f/i.test(cleanValue)) return "pacing";
  if (/\u5b57\u6570|\u957f\u5ea6/i.test(cleanValue)) return "length";
  if (/\u7ed3\u6784/i.test(cleanValue)) return "structure";
  if (/\u5177\u4f53|\u7ec6\u8282/.test(cleanValue)) return "concrete_detail";
  if (/\u4e92\u52a8|\u6253\u65ad|\u53f0\u8bcd/.test(cleanValue)) return "dialogue_interaction";
  if (/\u666f\u7269|\u955c\u5934|\u7f57\u5217|\u573a\u666f/.test(cleanValue)) return "scene_camera";
  if (/\u52a8\u4f5c|\u80a2\u4f53|\u76b1\u7709|\u6505\u62f3|\u5782\u773c/.test(cleanValue)) return "body_language";
  if (/\u5f62\u5bb9\u8bcd|\u7a7a\u6cdb|\u63cf\u5199/.test(cleanValue)) return "description_specificity";
  if (/AI|\u6a21\u677f|\u673a\u68b0/i.test(cleanValue)) return "ai_taste";
  if (/\u7528\u8bcd|\u53e5\u5f0f/i.test(cleanValue)) return "wording";
  return "style";
}

function defaultPolishPromptAddition(type: z.infer<typeof PolishSuggestionSchema>["type"], fallback: string) {
  const additions: Partial<Record<z.infer<typeof PolishSuggestionSchema>["type"], string>> = {
    negation_pattern:
      "\u8bf7\u51cf\u5c11\u201c\u4e0d\u662f\u2026\u2026\u4e0d\u662f\u2026\u2026\u800c\u662f\u2026\u2026\u201d\u8fd9\u7c7b\u8fde\u7eed\u5426\u5b9a\u540e\u8f6c\u6298\u80af\u5b9a\u7684\u6a21\u677f\u53e5\uff0c\u4ec5\u4fdd\u7559\u771f\u6b63\u6709\u68d7\u6216\u7b26\u5408\u89d2\u8272\u53e3\u543b\u7684\u5c11\u6570\u4f8b\u5b50\u3002",
    blunt_explanation_template:
      "\u8bf7\u907f\u514d\u201c\u4e0d\u662f\u5f62\u5bb9\u3002\u662f\u771f\u7684\u2026\u2026\u201d\u8fd9\u7c7b\u65ad\u53e5\u5f0f\u89e3\u91ca\u6a21\u677f\uff0c\u6539\u7528\u884c\u52a8\u3001\u573a\u666f\u6216\u4eba\u7269\u53cd\u5e94\u628a\u5224\u65ad\u5199\u51fa\u6765\u3002",
    ai_wording_template:
      "\u8bf7\u5220\u51cf\u9ad8\u9891 AI \u8154\u865a\u8bcd\u548c\u62bd\u8c61\u603b\u7ed3\uff0c\u6539\u7528\u5177\u4f53\u53ef\u89c1\u7684\u52a8\u4f5c\u3001\u573a\u666f\u7ec6\u8282\u6216\u4eba\u7269\u4e92\u52a8\u8868\u8fbe\u3002",
    light_action_template:
      "\u8bf7\u907f\u514d\u201c\u628a\u58f0\u97f3\u538b\u5f97\u5f88\u8f7b / \u628a\u52a8\u4f5c\u653e\u5f97\u5f88\u8f7b\u201d\u8fd9\u7c7b\u6a21\u677f\u8868\u8fbe\uff0c\u6539\u7528\u5177\u4f53\u52a8\u4f5c\u3001\u58f0\u97f3\u53d8\u5316\u6216\u4eba\u7269\u53cd\u5e94\u4f53\u73b0\u8f7b\u5fae\u7a0b\u5ea6\u3002",
    repeated_emphasis_template:
      "\u8bf7\u5220\u9664\u201cX\u3002\u592aX\u4e86\u3002\u201d\u8fd9\u7c7b\u91cd\u590d\u5f3a\u8c03\u53e5\u5f0f\uff0c\u6539\u7528\u5177\u4f53\u7ec6\u8282\u3001\u52a8\u4f5c\u6216\u573a\u666f\u53cd\u5e94\u8868\u8fbe\u5224\u65ad\u3002",
    object_description_template:
      "\u8bf7\u907f\u514d\u7269\u54c1\u63cf\u5199\u56fa\u5b9a\u4e3a\u201c\u5f62\u72b6 + \u989c\u8272 + \u8868\u9762\u7eb9\u8def + \u8f7b\u8f7b\u6643\u52a8/\u9759\u9759\u8eba\u7740\u201d\u7684\u7ed3\u6784\uff0c\u8ba9\u7269\u54c1\u901a\u8fc7\u4eba\u7269\u4f7f\u7528\u3001\u89e6\u611f\u3001\u91cd\u91cf\u3001\u529f\u80fd\u6216\u5267\u60c5\u4f5c\u7528\u81ea\u7136\u8fdb\u5165\u6587\u672c\u3002"
  };
  return additions[type] ?? fallback;
}

function normalizeSeverity(value: string): z.infer<typeof PolishSuggestionSchema>["severity"] {
  if (value === "high" || /\u9ad8|\u4e25\u91cd/.test(value)) return "high";
  if (value === "medium" || /\u4e2d|\u4e00\u822c/.test(value)) return "medium";
  return "low";
}

const WorldFactSchema = z.object({
  title: z.string(),
  category: z.string(),
  content: z.string()
});

const SimpleMainEventSchema = z.object({
  title: z.string(),
  chapter_range: z.string(),
  summary: z.string(),
  result: z.string(),
  related_characters: stringArray
});

const SimpleCharacterSchema = z.object({
  name: z.string(),
  identity: z.string(),
  relationship_to_protagonist: z.string(),
  current_status: z.string(),
  reason_for_group_candidate: z.string().optional(),
  camp_relation: z.string().optional(),
  is_dead: z.boolean().optional(),
  death_info: z.string().optional()
});

const SimpleBranchSchema = z.object({
  title: z.string(),
  chapter_range: z.string(),
  status: z.string(),
  summary: z.string(),
  related_characters: stringArray
});

export const SimpleChunkOutlineSchema = z.object({
  chapter_range: z.string(),
  summary: z.string(),
  main_events: z.array(SimpleMainEventSchema),
  protagonist_group_candidates: z.array(SimpleCharacterSchema),
  supporting_characters: z.array(SimpleCharacterSchema),
  world_facts: z.array(WorldFactSchema),
  branch_plots: z.array(SimpleBranchSchema),
  conflicts: z.array(ConflictItemSchema)
});

export const FinalKnowledgeBaseSchema = z.object({
  worldbuilding: z.object({
    background: z.string(),
    social_structure: stringArray,
    power_system: stringArray,
    protagonist_position: z.string(),
    new_settings: stringArray
  }),
  protagonist_group: z.array(CoreCharacterSchema.extend({
    camp_relation: z.string().optional(),
    clothing_habit: z.string().optional(),
    appearance_features: z.string().optional(),
    sample_line: z.string().optional()
  })),
  supporting_characters: z.array(SupportingCharacterSchema),
  main_events: z.array(SimpleMainEventSchema.extend({ conflict_summary: z.string() })),
  branch_events: z.array(SimpleBranchSchema),
  conflicts: z.array(ConflictItemSchema),
  mindmap_suggestions: z.object({
    nodes: z.array(
      z.object({
        node_type: z.enum(nodeTypeValues),
        title: z.string(),
        description: z.string()
      })
    ),
    edges: z.array(
      z.object({
        source_title: z.string(),
        target_title: z.string(),
        edge_type: z.enum(edgeTypeValues),
        label: z.string()
      })
    )
  })
});

export const MindmapGenerationSchema = z.object({
  nodes: z.array(
    z.object({
      node_type: z.enum(nodeTypeValues),
      title: z.string(),
      description: z.string(),
      importance: z.string(),
      related_chapter_range: z.string(),
      group: z.string()
    })
  ),
  edges: z.array(
    z.object({
      source_title: z.string(),
      target_title: z.string(),
      edge_type: z.enum(edgeTypeValues),
      label: z.string()
    })
  ),
  layout_hints: z.object({
    main_axis: stringArray,
    upper_lane: stringArray,
    lower_lane: stringArray,
    side_lane: stringArray
  })
});

export type SimpleChunkOutlinePayload = z.infer<typeof SimpleChunkOutlineSchema>;
export type FinalKnowledgeBasePayload = z.infer<typeof FinalKnowledgeBaseSchema>;
export type MindmapGenerationPayload = z.infer<typeof MindmapGenerationSchema>;

export const RefineOutlineSectionResultSchema = z.object({
  section_type: z.string(),
  keyword: z.string(),
  found: z.boolean(),
  confidence: z.string(),
  matched_chapters: z.array(
    z.object({
      chapter_id: z.string(),
      chapter_title: z.string(),
      reason: z.string()
    })
  ),
  refined_content: z.string(),
  structured_patch: z.object({
    items: z.array(z.unknown())
  }),
  merge_suggestion: z.object({
    mode: z.string(),
    reason: z.string()
  }),
  warnings: stringArray
});

export type RefineOutlineSectionResultPayload = z.infer<typeof RefineOutlineSectionResultSchema>;

export function parseChapterSummaryJson(raw: string) {
  return ChapterSummarySchema.parse(JSON.parse(extractJsonText(raw)));
}

export function parseSimpleChunkOutlineJson(raw: string) {
  return SimpleChunkOutlineSchema.parse(normalizeSimpleChunkOutlineResult(JSON.parse(extractJsonText(raw))));
}

export function parseFinalKnowledgeBaseJson(raw: string) {
  return FinalKnowledgeBaseSchema.parse(normalizeFinalKnowledgeBaseResult(JSON.parse(extractJsonText(raw))));
}

export function parseMindmapGenerationJson(raw: string) {
  return MindmapGenerationSchema.parse(normalizeMindmapResult(JSON.parse(extractJsonText(raw))));
}

export function parseRefineOutlineSectionJson(raw: string) {
  return RefineOutlineSectionResultSchema.parse(normalizeRefineOutlineSectionResult(JSON.parse(extractJsonText(raw))));
}

export function normalizeRefineOutlineSectionResult(raw: unknown): RefineOutlineSectionResultPayload {
  const input = record(raw);
  const mergeSuggestion = record(input.merge_suggestion);
  return {
    section_type: text(input.section_type || input.sectionType),
    keyword: text(input.keyword),
    found: bool(input.found),
    confidence: text(input.confidence) || "medium",
    matched_chapters: array(input.matched_chapters || input.matchedChapters).map((value) => {
      const item = record(value);
      return {
        chapter_id: text(item.chapter_id || item.chapterId || item.id),
        chapter_title: text(item.chapter_title || item.chapterTitle || item.title),
        reason: text(item.reason || item.summary)
      };
    }),
    refined_content: text(input.refined_content || input.refinedContent || input.content),
    structured_patch: {
      items: array(record(input.structured_patch || input.structuredPatch).items)
    },
    merge_suggestion: {
      mode: text(mergeSuggestion.mode) || "merge",
      reason: text(mergeSuggestion.reason)
    },
    warnings: arrayText(input.warnings)
  };
}

export function normalizeSimpleChunkOutlineResult(raw: unknown): SimpleChunkOutlinePayload {
  const input = record(raw);
  return {
    chapter_range: normalizeChapterRange(input.chapter_range, []),
    summary: text(input.summary),
    main_events: array(input.main_events).map((value) => {
      const item = normalizeMainEvent(value);
      return {
        title: item.title,
        chapter_range: item.chapter_range,
        summary: item.summary,
        result: item.result,
        related_characters: item.related_characters
      };
    }),
    protagonist_group_candidates: array(input.protagonist_group_candidates || input.protagonist_group).map(normalizeSimpleCharacter),
    supporting_characters: array(input.supporting_characters).map(normalizeSimpleCharacter),
    world_facts: array(input.world_facts).map(normalizeWorldFact),
    branch_plots: array(input.branch_plots || input.branch_candidates).map(normalizeSimpleBranch),
    conflicts: array(input.conflicts).map(normalizeConflictItem)
  };
}

export function normalizeFinalKnowledgeBaseResult(raw: unknown): FinalKnowledgeBasePayload {
  const input = record(raw);
  const worldbuilding = record(input.worldbuilding);
  const rawProtagonistGroup = array(input.protagonist_group).map(normalizeCoreCharacter);
  const protagonistName = text(input.protagonist_name || record(input.protagonist).name);
  const protagonist_group = ensureProtagonistInGroup(
    rawProtagonistGroup.filter((item) => isCoreGroupCandidate(item)),
    protagonistName,
    [...rawProtagonistGroup, ...array(input.supporting_characters).map(normalizeSupportingCharacter)]
  );
  return {
    worldbuilding: {
      background: text(worldbuilding.background),
      social_structure: conciseArrayText(worldbuilding.social_structure, 8),
      power_system: conciseArrayText(worldbuilding.power_system, 8),
      protagonist_position: text(worldbuilding.protagonist_position),
      new_settings: conciseArrayText(worldbuilding.new_settings, 8)
    },
    protagonist_group,
    supporting_characters: array(input.supporting_characters).map(normalizeSupportingCharacter),
    main_events: array(input.main_events).map((value) => {
      const item = normalizeMainEvent(value);
      return {
        title: item.title,
        chapter_range: item.chapter_range,
        summary: item.summary,
        result: item.result,
        related_characters: item.related_characters,
        conflict_summary: item.conflict_summary
      };
    }),
    branch_events: array(input.branch_events || input.branch_plots).map(normalizeSimpleBranch),
    conflicts: array(input.conflicts).map(normalizeConflictItem).filter((item) => item.status === "active" || item.status === "potential"),
    mindmap_suggestions: {
      nodes: array(record(input.mindmap_suggestions).nodes).map(normalizeMindMapNode),
      edges: array(record(input.mindmap_suggestions).edges).map(normalizeMindMapEdge)
    }
  };
}

export function normalizeMindmapResult(raw: unknown): MindmapGenerationPayload {
  const input = record(raw);
  const hints = record(input.layout_hints);
  return {
    nodes: array(input.nodes).map((value) => {
      const item = record(value);
      const description = text(item.description || item.summary || item.content);
      return {
        node_type: mapNodeType(text(item.node_type || item.type)),
        title: text(item.title || item.name) || firstChars(text(item.summary || item.content), 20) || "未命名节点",
        description,
        importance: text(item.importance) || "medium",
        related_chapter_range: text(item.related_chapter_range || item.chapter_range),
        group: text(item.group)
      };
    }),
    edges: array(input.edges).map((value) => {
      const item = record(value);
      return {
        source_title: text(item.source_title || item.source || item.from),
        target_title: text(item.target_title || item.target || item.to),
        edge_type: mapEdgeType(text(item.edge_type || item.type)),
        label: text(item.label)
      };
    }),
    layout_hints: {
      main_axis: arrayText(hints.main_axis),
      upper_lane: arrayText(hints.upper_lane),
      lower_lane: arrayText(hints.lower_lane),
      side_lane: arrayText(hints.side_lane)
    }
  };
}

export function normalizeStage1Result(raw: unknown): Stage1PlotPayload {
  const input = record(raw);
  return {
    main_events: array(input.main_events).map(normalizeMainEvent).filter(isStoryEvent).slice(0, 12),
    main_plot_progress: text(input.main_plot_progress),
    branch_candidates: array(input.branch_candidates).map(normalizeBranchCandidate),
    important_characters: array(input.important_characters).map(normalizeNameLikeText).filter(Boolean),
    faction_change_candidates: array(input.faction_change_candidates).map(normalizeFactionChangeText).filter(Boolean),
    key_event_markers: array(input.key_event_markers).map(normalizeKeyEventMarkerText).filter(Boolean)
  };
}

export function parseStage1PlotJson(raw: string) {
  return Stage1PlotSchema.parse(normalizeStage1Result(JSON.parse(extractJsonText(raw))));
}

export function parseStage2CastJson(raw: string) {
  return Stage2CastSchema.parse(JSON.parse(extractJsonText(raw)));
}

export function parseStage3CharacterDetailsJson(raw: string) {
  return Stage3CharacterDetailsSchema.parse(normalizeStage3CharacterDetailsResult(JSON.parse(extractJsonText(raw))));
}

export function normalizeStage3CharacterDetailsResult(raw: unknown): Stage3CharacterDetailsPayload {
  const input = record(raw);
  return {
    characters: array(input.characters).map((value) => {
      const item = record(value);
      return {
        ...normalizeCoreCharacter(value),
        name: text(item.name || item.character || item.title) || "未命名角色",
        identity: text(item.identity || item.role),
        faction_relation: text(item.faction_relation || item.faction),
        relationship_to_protagonist: text(item.relationship_to_protagonist || item.relationship),
        gender: text(item.gender || item.sex),
        hair_color: text(item.hair_color || item.hair),
        eye_color: text(item.eye_color || item.eyes),
        body_type: text(item.body_type || item.figure),
        clothing_style: text(item.clothing_style || item.clothing),
        appearance: text(item.appearance || item.appearance_features || item.description),
        personality: arrayText(item.personality),
        action_logic: arrayText(item.action_logic),
        current_goal: text(item.current_goal || item.goal),
        current_state: text(item.current_state || item.status),
        speech_style: text(item.speech_style),
        quote_example: text(item.quote_example || item.example_line || item.line),
        is_core_group: typeof item.is_core_group === "boolean" ? item.is_core_group : true
      };
    })
  };
}

export function parseStage4WorldConflictsJson(raw: string) {
  return Stage4WorldConflictsSchema.parse(JSON.parse(extractJsonText(raw)));
}

export function parseGenerateOutlineJson(raw: string): GenerateOutlineParsedPayload {
  const normalized = normalizeGenerateOutlineResult(JSON.parse(extractJsonText(raw)));
  try {
    return GenerateOutlineResultSchema.parse(normalized);
  } catch (error) {
    const textOnly = GenerateOutlineResultSchema.parse({ ...record(normalized), mindmap_suggestions: { nodes: [], edges: [] } });
    return {
      ...textOnly,
      mindmapSkipped: true,
      normalizeWarnings: [`Mind map suggestion format was invalid and has been skipped: ${String(error)}`]
    };
  }
}

export function normalizeGenerateOutlineResult(raw: unknown): unknown {
  const input = record(raw);
  const protagonist = record(input.protagonist);
  const worldbuilding = record(input.worldbuilding);
  const conflicts = record(input.conflicts);
  const mainPlot = record(input.main_plot);
  const updates = record(input.outline_text_updates);
  const mindmap = record(input.mindmap_suggestions);
  return {
    protagonist: {
      name: text(protagonist.name),
      identity: text(protagonist.identity),
      social_class: text(protagonist.social_class),
      personality: arrayText(protagonist.personality),
      action_logic: arrayText(protagonist.action_logic),
      appearance: text(protagonist.appearance),
      current_goal: text(protagonist.current_goal),
      current_situation: text(protagonist.current_situation)
    },
    protagonist_group: array(input.protagonist_group).map(normalizeCoreCharacter),
    main_events: array(input.main_events).map(normalizeMainEvent),
    supporting_characters: array(input.supporting_characters).map(normalizeSupportingCharacter),
    worldbuilding: {
      background: text(worldbuilding.background),
      social_structure: arrayText(worldbuilding.social_structure),
      power_system: arrayText(worldbuilding.power_system),
      protagonist_position: text(worldbuilding.protagonist_position),
      new_settings: arrayText(worldbuilding.new_settings)
    },
    conflicts: {
      protagonist_conflicts: arrayText(conflicts.protagonist_conflicts),
      interpersonal_conflicts: arrayText(conflicts.interpersonal_conflicts),
      social_conflicts: arrayText(conflicts.social_conflicts),
      class_conflicts: arrayText(conflicts.class_conflicts),
      system_conflicts: arrayText(conflicts.system_conflicts),
      unknown_or_uncertain_conflicts: arrayText(conflicts.unknown_or_uncertain_conflicts),
      items: array(conflicts.items).map(normalizeConflictItem)
    },
    main_plot: {
      current_main_plot: text(mainPlot.current_main_plot),
      previous_progress: text(mainPlot.previous_progress),
      new_progress: text(mainPlot.new_progress),
      new_goals: arrayText(mainPlot.new_goals),
      new_crises: arrayText(mainPlot.new_crises),
      deviation_from_existing_outline: text(mainPlot.deviation_from_existing_outline)
    },
    branch_plots: array(input.branch_plots).map((value) => ({
      ...normalizeBranchCandidate(value),
      chapter_range: normalizeChapterRange(record(value).chapter_range, record(value).chapters)
    })),
    outline_text_updates: {
      world: text(updates.world),
      main_characters: text(updates.main_characters),
      roles: text(updates.roles),
      main_plot: text(updates.main_plot),
      branch_plot: text(updates.branch_plot),
      conflicts: text(updates.conflicts)
    },
    mindmap_suggestions: {
      nodes: array(mindmap.nodes).map(normalizeMindMapNode),
      edges: array(mindmap.edges).map(normalizeMindMapEdge)
    }
  };
}

export function conflictsToArrays(items: Stage4WorldConflictsPayload["conflicts"]) {
  const active = items.filter((item) => item.status === "active" || item.status === "potential");
  const format = (item: (typeof active)[number]) =>
    item.related_main_event ? `${item.content}（关联：${item.related_main_event}）` : item.content;
  return {
    protagonist_conflicts: active.filter((item) => item.type === "protagonist").map(format),
    interpersonal_conflicts: active.filter((item) => item.type === "interpersonal").map(format),
    social_conflicts: active.filter((item) => item.type === "social").map(format),
    class_conflicts: active.filter((item) => item.type === "class").map(format),
    system_conflicts: active.filter((item) => item.type === "system").map(format),
    unknown_or_uncertain_conflicts: active.filter((item) => item.type === "potential").map(format)
  };
}

function normalizeMainEvent(value: unknown): Stage1PlotPayload["main_events"][number] {
  if (typeof value === "string" || typeof value === "number") {
    return {
      title: String(value),
      chapters: [],
      chapter_range: "",
      summary: "",
      protagonist_action: "",
      plot_progress: "",
      result: "",
      related_characters: [],
      conflict_summary: ""
    };
  }
  const item = record(value);
  return {
    title: text(item.title || item.name || item.summary),
    chapters: array(item.chapters).map((chapter) => (typeof chapter === "number" ? chapter : text(chapter))),
    chapter_range: normalizeChapterRange(item.chapter_range, item.chapters),
    summary: text(item.summary || item.content),
    protagonist_action: text(item.protagonist_action),
    plot_progress: text(item.plot_progress),
    result: text(item.result),
    related_characters: arrayText(item.related_characters || item.characters || item.related_roles),
    conflict_summary: text(item.conflict_summary || item.conflict || item.conflicts)
  };
}

function isStoryEvent(event: Stage1PlotPayload["main_events"][number]): boolean {
  const textToCheck = `${event.title}\n${event.summary}\n${event.plot_progress}\n${event.result}`;
  const nonStoryPatterns = [
    /作者[后後]记/,
    /后记/,
    /创作说明/,
    /存稿/,
    /读者/,
    /求票/,
    /月票/,
    /推荐票/,
    /感言/,
    /上架/,
    /请假/,
    /番外说明/,
    /剧情总结/,
    /预告第二卷/,
    /讨论.*感情线/
  ];
  return !nonStoryPatterns.some((pattern) => pattern.test(textToCheck));
}

function normalizeBranchCandidate(value: unknown): Stage1PlotPayload["branch_candidates"][number] {
  if (typeof value === "string" || typeof value === "number") {
    return {
      title: String(value),
      chapters: [],
      status: "new",
      summary: "",
      related_characters: [],
      need_follow_up: true
    };
  }
  const item = record(value);
  const status = text(item.status);
  return {
    title: text(item.title || item.name || item.summary),
    chapters: array(item.chapters).map((chapter) => (typeof chapter === "number" ? chapter : text(chapter))),
    status: includes(branchStatusValues, status) ? status : "new",
    summary: text(item.summary || item.content),
    related_characters: arrayText(item.related_characters),
    need_follow_up: typeof item.need_follow_up === "boolean" ? item.need_follow_up : true
  };
}

function normalizeWorldFact(value: unknown): z.infer<typeof WorldFactSchema> {
  if (typeof value === "string" || typeof value === "number") {
    const content = String(value);
    return { title: firstChars(content, 24), category: normalizeWorldFactCategory("", content), content };
  }
  const item = record(value);
  const content = text(item.content || item.summary || item.description);
  const title = text(item.title || item.name || item.summary) || firstChars(content, 24);
  return {
    title,
    category: normalizeWorldFactCategory(text(item.category), `${title} ${content}`),
    content
  };
}

function normalizeWorldFactCategory(category: string, content: string) {
  const raw = category.toLowerCase();
  if (["social_structure", "organization", "organisation", "rule", "hierarchy", "class", "society", "government", "church", "guild", "association"].includes(raw)) return "social_structure";
  if (["power_system", "magic", "artifact", "race", "supernatural", "ability", "ritual", "relic", "monster"].includes(raw)) return "power_system";
  if (["protagonist_position", "protagonist_identity", "protagonist_status", "economy", "rank", "identity"].includes(raw)) return "protagonist_position";
  if (["background", "history", "location", "era"].includes(raw)) return "background";
  if (/协会|教会|政府|学院|贵族|邪教|组织|制度|阶层|职业|监管|收容|家族|公会/.test(content)) return "social_structure";
  if (/魔法|魔女|巫师|等级|收容物|神明|眷属|血族|秘境|仪式|污染|梦境|能力|道具|魔导|超凡/.test(content)) return "power_system";
  if (/主角|身份|阶层|学徒|正式魔女|贫困|经济|收入|委托|阵营|所属|认证|等级/.test(content)) return "protagonist_position";
  if (/新历|时代|城市|小镇|边境|王国|帝国|地区|世界/.test(content)) return "background";
  return raw || "other";
}

function conciseArrayText(value: unknown, limit: number) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of arrayText(value).flatMap((line) => line.split(/\n|[；;]/))) {
    const textValue = item.replace(/^[-*•\s]+/, "").trim();
    if (!textValue) continue;
    const key = textValue.replace(/[，。；：:;,.\s]/g, "").slice(0, 40);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(textValue);
    if (result.length >= limit) break;
  }
  return result;
}

function isCoreGroupCandidate(character: z.infer<typeof CoreCharacterSchema>) {
  const textValue = `${character.faction_relation} ${character.relationship_to_protagonist}`;
  if (/敌对|反派|邪教|敌人|对立|监管者|委托人|旁观|临时|不稳定|利用|威胁|入侵/.test(textValue)) return false;
  return /主角|同阵营|同行|长期|合作|同盟|队友|搭档|伙伴|主角团|核心|共同推进|稳定|盟友/.test(textValue) || !textValue.trim();
}

function ensureProtagonistInGroup(
  group: z.infer<typeof CoreCharacterSchema>[],
  protagonistName: string,
  candidates: Array<z.infer<typeof CoreCharacterSchema> | z.infer<typeof SupportingCharacterSchema>>
) {
  if (!protagonistName || group.some((item) => item.name === protagonistName)) return group;
  const source = candidates.find((item) => item.name === protagonistName);
  return [
    normalizeCoreCharacter({
      ...source,
      name: protagonistName,
      faction_relation: text(record(source).faction_relation) || "主角本人",
      relationship_to_protagonist: "主角"
    }),
    ...group
  ];
}

function normalizeSimpleCharacter(value: unknown): z.infer<typeof SimpleCharacterSchema> {
  if (typeof value === "string" || typeof value === "number") {
    return { name: String(value), identity: "", relationship_to_protagonist: "", current_status: "" };
  }
  const item = record(value);
  return {
    name: text(item.name || item.character || item.title),
    identity: text(item.identity || item.role),
    relationship_to_protagonist: text(item.relationship_to_protagonist || item.relationship),
    current_status: text(item.current_status || item.current_state || item.status),
    reason_for_group_candidate: text(item.reason_for_group_candidate || item.reason),
    camp_relation: text(item.camp_relation || item.faction_relation || item.camp),
    is_dead: bool(item.is_dead),
    death_info: text(item.death_info)
  };
}

function normalizeSimpleBranch(value: unknown): z.infer<typeof SimpleBranchSchema> {
  const candidate = normalizeBranchCandidate(value);
  const item = record(value);
  return {
    title: candidate.title,
    chapter_range: normalizeChapterRange(item.chapter_range, candidate.chapters),
    status: candidate.status,
    summary: candidate.summary,
    related_characters: candidate.related_characters
  };
}

function normalizeNameLikeText(value: unknown): string {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return text(value);
  }
  const item = record(value);
  return text(item.name || item.character || item.title || item.event || item.summary || item.content);
}

function normalizeFactionChangeText(value: unknown): string {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return text(value);
  }
  const item = record(value);
  const character = text(item.character || item.name || item.title);
  const from = text(item.from || item.previous || item.old_faction);
  const to = text(item.to || item.current || item.new_faction);
  const reason = text(item.reason || item.summary || item.content);
  const transition = from || to ? `${from || "未知"} -> ${to || "未知"}` : "";
  return [character, transition, reason].filter(Boolean).join("：");
}

function normalizeKeyEventMarkerText(value: unknown): string {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return text(value);
  }
  const item = record(value);
  const event = text(item.event || item.title || item.name);
  const chapters = array(item.chapters)
    .map((chapter) => text(chapter))
    .filter(Boolean)
    .join("、");
  const significance = text(item.significance || item.summary || item.content);
  const chapterText = chapters ? `第${chapters}章` : "";
  return [event, chapterText, significance].filter(Boolean).join("：");
}

function normalizeCoreCharacter(value: unknown): z.infer<typeof CoreCharacterSchema> {
  const item = record(value);
  return {
    name: text(item.name || item.character || item.title),
    identity: text(item.identity || item.role),
    social_class: text(item.social_class || item.class),
    faction_relation: text(item.faction_relation || item.camp_relation || item.faction || item.camp),
    relationship_to_protagonist: text(item.relationship_to_protagonist || item.relationship),
    gender: text(item.gender || item.sex),
    hair_color: text(item.hair_color || item.hair),
    eye_color: text(item.eye_color || item.eyes),
    body_type: text(item.body_type || item.figure || item.body),
    clothing_style: text(item.clothing_style || item.clothing_habit || item.clothing),
    appearance: text(item.appearance || item.appearance_features || item.description),
    personality: arrayText(item.personality),
    action_logic: arrayText(item.action_logic),
    current_goal: text(item.current_goal),
    current_state: text(item.current_state || item.current_status || item.status),
    speech_style: text(item.speech_style),
    quote_example: text(item.quote_example || item.sample_line || item.example_line || item.line)
  };
}

function normalizeSupportingCharacter(value: unknown): z.infer<typeof SupportingCharacterSchema> {
  const item = record(value);
  return {
    name: text(item.name || item.character || item.title),
    identity: text(item.identity || item.role),
    relationship_to_protagonist: text(item.relationship_to_protagonist || item.relationship),
    faction: text(item.faction || item.camp),
    current_role: text(item.current_role || item.current_status || item.status),
    current_state: text(item.current_state || item.current_status || item.status),
    is_dead: bool(item.is_dead),
    death_info: text(item.death_info)
  };
}

function normalizeConflictItem(value: unknown): z.infer<typeof ConflictItemSchema> {
  const item = record(value);
  const type = text(item.type);
  const status = text(item.status);
  return {
    type: includes(conflictTypeValues, type) ? type : "potential",
    content: text(item.content),
    related_main_event: text(item.related_main_event),
    status: includes(conflictStatusValues, status) ? status : "active"
  };
}

function normalizeMindMapNode(value: unknown): GenerateOutlineResultPayload["mindmap_suggestions"]["nodes"][number] {
  const item = record(value);
  const mappedType = mapNodeType(text(item.node_type || item.type));
  const title = text(item.title || item.name) || firstChars(text(item.summary), 20) || "未命名节点";
  return {
    node_type: mappedType,
    title,
    description: text(item.description || item.content || item.summary)
  };
}

function normalizeMindMapEdge(value: unknown): GenerateOutlineResultPayload["mindmap_suggestions"]["edges"][number] {
  const item = record(value);
  return {
    source_title: text(item.source_title || item.source || item.from),
    target_title: text(item.target_title || item.target || item.to),
    edge_type: mapEdgeType(text(item.edge_type || item.type)) as GenerateOutlineResultPayload["mindmap_suggestions"]["edges"][number]["edge_type"],
    label: text(item.label)
  };
}

function normalizeChapterRange(rawRange: unknown, rawChapters: unknown): string {
  const range = text(rawRange).trim();
  const chapters = array(rawChapters)
    .map((chapter) => Number(text(chapter) || chapter))
    .filter((chapter) => Number.isFinite(chapter) && chapter > 0);

  if (/第.+章/.test(range)) {
    return range;
  }

  const rangeMatch = range.match(/^(\d+)\s*[-~—–至到]\s*(\d+)$/);
  if (rangeMatch) {
    return `第${rangeMatch[1]}章-第${rangeMatch[2]}章`;
  }

  const singleMatch = range.match(/^(\d+)$/);
  if (singleMatch) {
    return `第${singleMatch[1]}章-第${singleMatch[1]}章`;
  }

  if (chapters.length > 0) {
    const sorted = [...chapters].sort((a, b) => a - b);
    return `第${sorted[0]}章-第${sorted[sorted.length - 1]}章`;
  }

  return range;
}

function mapNodeType(value: string): GenerateOutlineResultPayload["mindmap_suggestions"]["nodes"][number]["node_type"] {
  const map: Record<string, GenerateOutlineResultPayload["mindmap_suggestions"]["nodes"][number]["node_type"]> = {
    世界观: "world",
    主角: "main_character",
    主要人物: "main_character",
    主角团: "protagonist_group",
    人物: "role",
    配角: "role",
    主要角色: "supporting_character",
    角色: "role",
    主线: "main_plot",
    主线剧情: "main_plot",
    支线: "branch_plot",
    支线剧情: "branch_plot",
    伏笔: "foreshadowing",
    线索: "foreshadowing",
    反转: "twist",
    矛盾: "conflict",
    冲突: "conflict"
  };
  if (includes(nodeTypeValues, value)) {
    return value;
  }
  return map[value] ?? "main_plot";
}

function mapEdgeType(value: string): (typeof edgeTypeValues)[number] {
  const map: Record<string, (typeof edgeTypeValues)[number]> = {
    相关: "related",
    导致: "causes",
    揭示: "reveals",
    冲突: "conflicts",
    支持: "supports",
    属于: "belongs_to",
    推进: "leads_to"
  };
  if (includes(edgeTypeValues, value)) {
    return value;
  }
  return map[value] ?? "related";
}

function extractJsonText(raw: string) {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  return start >= 0 && end >= start ? raw.slice(start, end + 1) : raw;
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function array(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === "") return [];
  return [value];
}

function arrayText(value: unknown): string[] {
  return array(value).map(text).filter(Boolean);
}

function text(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function bool(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  const normalized = text(value).trim();
  return ["true", "yes", "是", "已死亡", "死亡"].includes(normalized);
}

function firstChars(value: string, count: number) {
  return value.length > count ? value.slice(0, count) : value;
}

function includes<T extends readonly string[]>(values: T, value: string): value is T[number] {
  return (values as readonly string[]).includes(value);
}
