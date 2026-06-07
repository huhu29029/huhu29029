use base64::Engine;
use quick_xml::events::Event;
use quick_xml::Reader;
use rusqlite::{params, params_from_iter, Connection, OptionalExtension, Params, Row, Transaction};
use serde::{Deserialize, Serialize};
use std::io::{Cursor, Read, Write};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Manager;
use zip::write::FileOptions;
use zip::{ZipArchive, ZipWriter};

const SCHEMA: &str = include_str!("../migrations/schema.sql");
const GENERATE_OUTLINE_FALLBACK_PROMPT: &str = r#"你是一个长篇小说结构分析助手。

你必须返回合法 JSON。不要返回 Markdown。不要返回代码块。不要返回解释文字。不要在 JSON 外添加任何内容。
当前版本每次最多读取 10 章。

只能基于输入章节正文和已有大纲进行分析。不允许补充原文没有出现的信息，不允许为了填满字段而编造。
如果没有找到某类信息，必须返回空字符串或空数组。力量体系没有出现时 power_system 返回 []。阶级矛盾没有出现时 class_conflicts 返回 []。社会矛盾没有明确出现时 social_conflicts 返回 []。主角姓名不明确时 name 返回空字符串。关系变化不明确时 relationship_change 返回空字符串。
不要推测十章之后的剧情，不要替作者续写，不要把可能写成确定。

数量限制：protagonist.personality 最多 6 条；protagonist.action_logic 最多 6 条；main_events 最多 8 条；supporting_characters 最多 12 个；worldbuilding.background 最多 300 字；worldbuilding.social_structure 最多 8 条；worldbuilding.power_system 最多 8 条；conflicts 每一类最多 8 条；branch_plots 最多 10 条；outline_text_updates 每个分页最多 800 字；mindmap_suggestions.nodes 最多 20 个；mindmap_suggestions.edges 最多 30 条。

已有大纲：
{{existing_outline}}

本次解析章节：
{{selected_chapters}}

输出 GenerateOutlineResultSchema 对应 JSON：
{
  "protagonist": {
    "name": "",
    "identity": "",
    "social_class": "",
    "personality": [],
    "action_logic": [],
    "current_goal": "",
    "current_situation": ""
  },
  "main_events": [
    {
      "title": "",
      "chapters": [],
      "summary": "",
      "protagonist_action": "",
      "plot_progress": ""
    }
  ],
  "supporting_characters": [
    {
      "name": "",
      "identity": "",
      "relationship_to_protagonist": "",
      "relationship_change": "",
      "current_role": ""
    }
  ],
  "worldbuilding": {
    "background": "",
    "social_structure": [],
    "power_system": [],
    "protagonist_position": "",
    "new_settings": []
  },
  "conflicts": {
    "protagonist_conflicts": [],
    "interpersonal_conflicts": [],
    "social_conflicts": [],
    "class_conflicts": [],
    "system_conflicts": [],
    "unknown_or_uncertain_conflicts": []
  },
  "main_plot": {
    "current_main_plot": "",
    "previous_progress": "",
    "new_progress": "",
    "new_goals": [],
    "new_crises": [],
    "deviation_from_existing_outline": ""
  },
  "branch_plots": [
    {
      "title": "",
      "status": "new",
      "summary": "",
      "related_characters": [],
      "need_follow_up": true
    }
  ],
  "outline_text_updates": {
    "world": "",
    "main_characters": "",
    "roles": "",
    "main_plot": "",
    "branch_plot": "",
    "conflicts": ""
  },
  "mindmap_suggestions": {
    "nodes": [],
    "edges": []
  }
}"#;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct Project {
    id: String,
    title: String,
    category: String,
    description: Option<String>,
    cover_path: Option<String>,
    created_at: String,
    updated_at: String,
    last_edited_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct Volume {
    id: String,
    project_id: String,
    title: String,
    sort_order: i64,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct Chapter {
    id: String,
    project_id: String,
    volume_id: String,
    title: String,
    content: String,
    sort_order: i64,
    word_count: i64,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct EditorState {
    project: Project,
    volumes: Vec<Volume>,
    chapters: Vec<Chapter>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SavedChapter {
    id: String,
    word_count: i64,
    updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ImportChapterDraft {
    title: String,
    content: String,
    word_count: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateProjectInput {
    title: String,
    category: Option<String>,
    description: Option<String>,
    cover_path: Option<String>,
}

type UpdateProjectInput = CreateProjectInput;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AISettings {
    provider: String,
    api_key: String,
    base_url: String,
    model: String,
    thinking_enabled: bool,
    reasoning_effort: String,
    show_reasoning_content: bool,
    openai_api_key: String,
    openai_base_url: String,
    openai_model: String,
    enable_hybrid_ai: bool,
    primary_provider: String,
    review_provider: String,
    primary_model: String,
    review_model: String,
    enable_cross_review: bool,
    max_revision_rounds: i64,
    feature_chapter_summary: String,
    feature_outline_chunk_analysis: String,
    feature_outline_reduce_merge: String,
    feature_outline_final_merge: String,
    feature_mindmap_generation: String,
    feature_writing_style_analysis: String,
    feature_chapter_polish: String,
    default_analysis_mode: String,
    simple_chunk_size: i64,
    detailed_chunk_size: i64,
    analysis_concurrency: i64,
    enable_chapter_cache: bool,
    feature_outline_chunk_model: String,
    feature_outline_final_model: String,
    feature_review_model: String,
    feature_pattern_memory_model: String,
    feature_polish_model: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AIUsageLogInput {
    project_id: Option<String>,
    feature_name: String,
    provider: String,
    model: String,
    prompt_tokens: i64,
    completion_tokens: i64,
    total_tokens: i64,
    estimated_cost: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AITask {
    id: String,
    project_id: Option<String>,
    task_type: String,
    status: String,
    input_text: String,
    output_text: String,
    created_at: String,
    finished_at: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ChapterAICacheEntry {
    id: String,
    project_id: String,
    chapter_id: String,
    content_hash: String,
    model: String,
    prompt_version: String,
    analysis_mode: String,
    summary_json: String,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct WritingStyleProfile {
    id: String,
    project_id: String,
    profile_name: String,
    source_chapter_ids: String,
    dialogue_style: String,
    scene_description_style: String,
    sentence_structure_style: String,
    emotion_style: String,
    humor_style: String,
    taboo_style: String,
    style_summary: String,
    example_features_json: String,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveWritingStyleProfileInput {
    project_id: String,
    profile_name: String,
    source_chapter_ids: Vec<String>,
    dialogue_style: String,
    scene_description_style: String,
    sentence_structure_style: String,
    emotion_style: String,
    humor_style: String,
    taboo_style: String,
    style_summary: String,
    example_features: Vec<String>,
    overwrite: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CorpusStyleProfile {
    id: String,
    project_id: String,
    profile_name: String,
    source_type: String,
    source_chapter_ids: String,
    analysis_mode: String,
    summary: String,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CorpusStyleDimension {
    id: String,
    profile_id: String,
    dimension_type: String,
    summary: String,
    rules_json: String,
    metrics_json: String,
    examples_json: String,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CorpusStyleExample {
    id: String,
    profile_id: String,
    dimension_type: String,
    original_excerpt: String,
    analysis_note: String,
    usage_rule: String,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CorpusStyleProfileState {
    profile: CorpusStyleProfile,
    dimensions: Vec<CorpusStyleDimension>,
    examples: Vec<CorpusStyleExample>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveCorpusStyleDimensionInput {
    dimension_type: String,
    summary: String,
    rules_json: String,
    metrics_json: String,
    examples_json: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveCorpusStyleExampleInput {
    dimension_type: String,
    original_excerpt: String,
    analysis_note: String,
    usage_rule: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveCorpusStyleProfileInput {
    id: Option<String>,
    project_id: String,
    profile_name: String,
    source_type: String,
    source_chapter_ids: Vec<String>,
    analysis_mode: String,
    summary: String,
    dimensions: Vec<SaveCorpusStyleDimensionInput>,
    examples: Vec<SaveCorpusStyleExampleInput>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct StyleRetrievalSnippet {
    id: String,
    project_id: String,
    source_type: String,
    source_id: String,
    chapter_id: Option<String>,
    chapter_title: Option<String>,
    volume_id: Option<String>,
    dimension_type: String,
    snippet_text: String,
    summary: String,
    tags_json: String,
    metrics_json: String,
    content_hash: String,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveStyleRetrievalSnippetInput {
    source_type: String,
    source_id: String,
    chapter_id: Option<String>,
    chapter_title: Option<String>,
    volume_id: Option<String>,
    dimension_type: String,
    snippet_text: String,
    summary: String,
    tags: Vec<String>,
    metrics: serde_json::Value,
    content_hash: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct StyleCorpusCategory {
    id: String,
    name: String,
    description: String,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct StyleCorpusWork {
    id: String,
    category_id: String,
    title: String,
    author: String,
    era: String,
    region: String,
    copyright_status: String,
    allow_direct_quote: bool,
    style_tags: String,
    theme_tags: String,
    image_tags: String,
    usage_note: String,
    is_builtin: bool,
    is_hidden: bool,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct StyleCorpusQuote {
    id: String,
    work_id: String,
    original_text: String,
    source_title: String,
    author: String,
    modern_explanation: String,
    scene_tags: String,
    emotion_tags: String,
    image_tags: String,
    usage_suggestion: String,
    ai_rewrite_example: String,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct StyleCorpusSearchResult {
    categories: Vec<StyleCorpusCategory>,
    works: Vec<StyleCorpusWork>,
    quotes: Vec<StyleCorpusQuote>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExportChapterDraft {
    title: String,
    content: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExportVolumeDraft {
    title: String,
    chapters: Vec<ExportChapterDraft>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct OutlineTextSection {
    id: String,
    project_id: String,
    section_type: String,
    content: String,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct OutlineMindNode {
    id: String,
    project_id: String,
    node_type: String,
    title: String,
    description: String,
    x: f64,
    y: f64,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct OutlineMindEdge {
    id: String,
    project_id: String,
    source_node_id: String,
    target_node_id: String,
    edge_type: String,
    label: Option<String>,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct OutlineState {
    text_sections: Vec<OutlineTextSection>,
    mind_nodes: Vec<OutlineMindNode>,
    mind_edges: Vec<OutlineMindEdge>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct MemoryLibraryStats {
    outline_text_sections: i64,
    outline_mind_nodes: i64,
    outline_mind_edges: i64,
    chapter_summaries: i64,
    global_outlines: i64,
    characters: i64,
    plot_threads: i64,
    foreshadowing: i64,
    consistency_issues: i64,
    writing_style_profiles: i64,
    ai_pattern_memory: i64,
    style_corpus_categories: i64,
    style_corpus_works: i64,
    style_corpus_quotes: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AIPatternMemory {
    id: String,
    project_id: String,
    pattern_type: String,
    pattern_name: String,
    pattern_keywords: String,
    pattern_description: String,
    bad_examples: String,
    rewrite_advice: String,
    severity: String,
    source: String,
    source_model: String,
    hit_count: i64,
    is_active: bool,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveAIPatternMemoryInput {
    id: Option<String>,
    project_id: String,
    pattern_type: String,
    pattern_name: String,
    pattern_keywords: Vec<String>,
    pattern_description: String,
    bad_examples: Vec<String>,
    rewrite_advice: String,
    severity: String,
    source: Option<String>,
    source_model: Option<String>,
    is_active: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReviewPatternInput {
    pattern_type: String,
    pattern_name: String,
    pattern_keywords: Vec<String>,
    pattern_description: String,
    bad_example: Option<String>,
    rewrite_advice: String,
    severity: String,
    source_model: String,
}

#[tauri::command]
fn app_status() -> &'static str {
    "Novel Memory Engine is running"
}

#[tauri::command]
fn list_projects(app: tauri::AppHandle) -> Result<Vec<Project>, String> {
    let connection = open_database(&app)?;
    let mut statement = connection
        .prepare(
            "SELECT id, title, category, description, cover_path, created_at, updated_at,
                    COALESCE(last_edited_at, updated_at, created_at, CURRENT_TIMESTAMP) AS last_edited_at
             FROM projects
             ORDER BY datetime(COALESCE(last_edited_at, updated_at, created_at, CURRENT_TIMESTAMP)) DESC, datetime(created_at) DESC",
        )
        .map_err(|error| error.to_string())?;

    let projects = statement
        .query_map([], project_from_row)
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    Ok(projects)
}

#[tauri::command]
fn create_project(app: tauri::AppHandle, input: CreateProjectInput) -> Result<Project, String> {
    let connection = open_database(&app)?;
    let id = new_id("project");
    let title = clean_title(&input.title, "\u{672a}\u{547d}\u{540d}\u{5c0f}\u{8bf4}");
    let category = clean_title(input.category.as_deref().unwrap_or("\u{7384}\u{5e7b}\u{5c0f}\u{8bf4}"), "\u{7384}\u{5e7b}\u{5c0f}\u{8bf4}");
    let description = input.description.filter(|value| !value.trim().is_empty());
    let cover_path = persist_cover_image(&app, input.cover_path.as_deref())?;

    connection
        .execute(
            "INSERT INTO projects (id, title, category, description, cover_path)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![id, title, category, description, cover_path],
        )
        .map_err(|error| error.to_string())?;

    get_project(&connection, &id)
}

#[tauri::command]
fn update_project(
    app: tauri::AppHandle,
    project_id: String,
    input: UpdateProjectInput,
) -> Result<Project, String> {
    let connection = open_database(&app)?;
    let existing = get_project(&connection, &project_id)?;
    let title = clean_title(&input.title, "\u{672a}\u{547d}\u{540d}\u{5c0f}\u{8bf4}");
    let category = clean_title(input.category.as_deref().unwrap_or("\u{7384}\u{5e7b}\u{5c0f}\u{8bf4}"), "\u{7384}\u{5e7b}\u{5c0f}\u{8bf4}");
    let description = input.description.filter(|value| !value.trim().is_empty());
    let cover_path = match input.cover_path.as_deref() {
        Some(path) if Some(path) != existing.cover_path.as_deref() => persist_cover_image(&app, Some(path))?,
        Some(_) => existing.cover_path,
        None => None,
    };

    connection
        .execute(
            "UPDATE projects
             SET title = ?1,
                 category = ?2,
                 description = ?3,
                 cover_path = ?4,
                 updated_at = CURRENT_TIMESTAMP,
                 last_edited_at = CURRENT_TIMESTAMP
             WHERE id = ?5",
            params![title, category, description, cover_path, project_id],
        )
        .map_err(|error| error.to_string())?;

    get_project(&connection, &project_id)
}

#[tauri::command]
fn delete_project(app: tauri::AppHandle, project_id: String) -> Result<(), String> {
    open_database(&app)?
        .execute("DELETE FROM projects WHERE id = ?1", params![project_id])
        .map(|_| ())
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn read_image_data_url(path: String) -> Result<String, String> {
    let bytes = std::fs::read(&path).map_err(|error| format!("read cover failed: {error}"))?;
    let mime = match Path::new(&path)
        .extension()
        .and_then(|extension| extension.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase()
        .as_str()
    {
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        _ => "image/png",
    };
    let encoded = base64::engine::general_purpose::STANDARD.encode(bytes);
    Ok(format!("data:{mime};base64,{encoded}"))
}

#[tauri::command]
fn get_ai_settings(app: tauri::AppHandle) -> Result<AISettings, String> {
    let connection = open_database(&app)?;
    let settings = connection
        .query_row(
            "SELECT provider, api_key, base_url, model, thinking_enabled, reasoning_effort, show_reasoning_content,
                    openai_api_key, openai_base_url, openai_model,
                    enable_hybrid_ai, primary_provider, review_provider, primary_model, review_model, enable_cross_review, max_revision_rounds,
                    feature_chapter_summary, feature_outline_chunk_analysis, feature_outline_reduce_merge, feature_outline_final_merge,
                    feature_mindmap_generation, feature_writing_style_analysis, feature_chapter_polish,
                    default_analysis_mode, simple_chunk_size, detailed_chunk_size, analysis_concurrency, enable_chapter_cache,
                    feature_outline_chunk_model, feature_outline_final_model, feature_review_model, feature_pattern_memory_model, feature_polish_model
             FROM ai_settings WHERE id = 'default'",
            [],
            |row| {
                Ok(AISettings {
                    provider: row.get(0)?,
                    api_key: row.get(1)?,
                    base_url: row.get(2)?,
                    model: row.get(3)?,
                    thinking_enabled: row.get::<_, i64>(4)? != 0,
                    reasoning_effort: row.get(5)?,
                    show_reasoning_content: row.get::<_, i64>(6)? != 0,
                    openai_api_key: row.get(7)?,
                    openai_base_url: row.get(8)?,
                    openai_model: row.get(9)?,
                    enable_hybrid_ai: row.get::<_, i64>(10)? != 0,
                    primary_provider: row.get(11)?,
                    review_provider: row.get(12)?,
                    primary_model: row.get(13)?,
                    review_model: row.get(14)?,
                    enable_cross_review: row.get::<_, i64>(15)? != 0,
                    max_revision_rounds: row.get(16)?,
                    feature_chapter_summary: row.get(17)?,
                    feature_outline_chunk_analysis: row.get(18)?,
                    feature_outline_reduce_merge: row.get(19)?,
                    feature_outline_final_merge: row.get(20)?,
                    feature_mindmap_generation: row.get(21)?,
                    feature_writing_style_analysis: row.get(22)?,
                    feature_chapter_polish: row.get(23)?,
                    default_analysis_mode: row.get(24)?,
                    simple_chunk_size: row.get(25)?,
                    detailed_chunk_size: row.get(26)?,
                    analysis_concurrency: row.get(27)?,
                    enable_chapter_cache: row.get::<_, i64>(28)? != 0,
                    feature_outline_chunk_model: row.get(29)?,
                    feature_outline_final_model: row.get(30)?,
                    feature_review_model: row.get(31)?,
                    feature_pattern_memory_model: row.get(32)?,
                    feature_polish_model: row.get(33)?,
                })
            },
        )
        .optional()
        .map_err(|error| error.to_string())?;

    Ok(settings.unwrap_or_else(default_ai_settings))
}

#[tauri::command]
fn save_ai_settings(app: tauri::AppHandle, settings: AISettings) -> Result<AISettings, String> {
    let connection = open_database(&app)?;
    let next = AISettings {
        provider: clean_title(&settings.provider, "DeepSeek"),
        api_key: settings.api_key.trim().to_string(),
        base_url: clean_title(&settings.base_url, "https://api.deepseek.com"),
        model: clean_title(&settings.model, "deepseek-v4-flash"),
        thinking_enabled: settings.thinking_enabled,
        reasoning_effort: clean_reasoning_effort(&settings.reasoning_effort),
        show_reasoning_content: settings.show_reasoning_content,
        openai_api_key: settings.openai_api_key.trim().to_string(),
        openai_base_url: clean_title(&settings.openai_base_url, "https://api.openai.com/v1"),
        openai_model: clean_title(&settings.openai_model, "gpt-5.5"),
        enable_hybrid_ai: settings.enable_hybrid_ai,
        primary_provider: clean_provider_strategy(&settings.primary_provider, "deepseek"),
        review_provider: clean_provider_strategy(&settings.review_provider, "openai"),
        primary_model: clean_title(&settings.primary_model, "deepseek-v4-flash"),
        review_model: clean_title(&settings.review_model, "gpt-5.5"),
        enable_cross_review: settings.enable_cross_review,
        max_revision_rounds: settings.max_revision_rounds.clamp(0, 1),
        feature_chapter_summary: clean_feature_strategy(&settings.feature_chapter_summary, "deepseek"),
        feature_outline_chunk_analysis: clean_feature_strategy(&settings.feature_outline_chunk_analysis, "deepseek"),
        feature_outline_reduce_merge: clean_feature_strategy(&settings.feature_outline_reduce_merge, "deepseek"),
        feature_outline_final_merge: clean_feature_strategy(&settings.feature_outline_final_merge, "openai"),
        feature_mindmap_generation: clean_feature_strategy(&settings.feature_mindmap_generation, "deepseek"),
        feature_writing_style_analysis: clean_feature_strategy(&settings.feature_writing_style_analysis, "openai"),
        feature_chapter_polish: clean_feature_strategy(&settings.feature_chapter_polish, "hybrid"),
        default_analysis_mode: clean_title(&settings.default_analysis_mode, "simple"),
        simple_chunk_size: settings.simple_chunk_size.clamp(1, 10),
        detailed_chunk_size: settings.detailed_chunk_size.clamp(1, 10),
        analysis_concurrency: settings.analysis_concurrency.clamp(1, 5),
        enable_chapter_cache: settings.enable_chapter_cache,
        feature_outline_chunk_model: clean_title(&settings.feature_outline_chunk_model, "deepseek-v4-flash"),
        feature_outline_final_model: clean_title(&settings.feature_outline_final_model, "deepseek-v4-pro"),
        feature_review_model: clean_title(&settings.feature_review_model, "deepseek-v4-pro"),
        feature_pattern_memory_model: clean_title(&settings.feature_pattern_memory_model, "deepseek-v4-pro"),
        feature_polish_model: clean_title(&settings.feature_polish_model, "deepseek-v4-flash"),
    };

    connection
        .execute(
            "INSERT INTO ai_settings (
                id, provider, api_key, base_url, model, thinking_enabled, reasoning_effort, show_reasoning_content,
                openai_api_key, openai_base_url, openai_model,
                enable_hybrid_ai, primary_provider, review_provider, primary_model, review_model, enable_cross_review, max_revision_rounds,
                feature_chapter_summary, feature_outline_chunk_analysis, feature_outline_reduce_merge, feature_outline_final_merge,
                feature_mindmap_generation, feature_writing_style_analysis, feature_chapter_polish,
                default_analysis_mode, simple_chunk_size, detailed_chunk_size, analysis_concurrency, enable_chapter_cache,
                feature_outline_chunk_model, feature_outline_final_model, feature_review_model, feature_pattern_memory_model, feature_polish_model
             )
             VALUES ('default', ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26, ?27, ?28, ?29, ?30, ?31, ?32, ?33, ?34)
             ON CONFLICT(id)
             DO UPDATE SET provider = excluded.provider,
                           api_key = excluded.api_key,
                           base_url = excluded.base_url,
                           model = excluded.model,
                           thinking_enabled = excluded.thinking_enabled,
                           reasoning_effort = excluded.reasoning_effort,
                           show_reasoning_content = excluded.show_reasoning_content,
                           openai_api_key = excluded.openai_api_key,
                           openai_base_url = excluded.openai_base_url,
                           openai_model = excluded.openai_model,
                           enable_hybrid_ai = excluded.enable_hybrid_ai,
                           primary_provider = excluded.primary_provider,
                           review_provider = excluded.review_provider,
                           primary_model = excluded.primary_model,
                           review_model = excluded.review_model,
                           enable_cross_review = excluded.enable_cross_review,
                           max_revision_rounds = excluded.max_revision_rounds,
                           feature_chapter_summary = excluded.feature_chapter_summary,
                           feature_outline_chunk_analysis = excluded.feature_outline_chunk_analysis,
                           feature_outline_reduce_merge = excluded.feature_outline_reduce_merge,
                           feature_outline_final_merge = excluded.feature_outline_final_merge,
                           feature_mindmap_generation = excluded.feature_mindmap_generation,
                           feature_writing_style_analysis = excluded.feature_writing_style_analysis,
                           feature_chapter_polish = excluded.feature_chapter_polish,
                           default_analysis_mode = excluded.default_analysis_mode,
                           simple_chunk_size = excluded.simple_chunk_size,
                           detailed_chunk_size = excluded.detailed_chunk_size,
                           analysis_concurrency = excluded.analysis_concurrency,
                           enable_chapter_cache = excluded.enable_chapter_cache,
                           feature_outline_chunk_model = excluded.feature_outline_chunk_model,
                           feature_outline_final_model = excluded.feature_outline_final_model,
                           feature_review_model = excluded.feature_review_model,
                           feature_pattern_memory_model = excluded.feature_pattern_memory_model,
                           feature_polish_model = excluded.feature_polish_model,
                           updated_at = CURRENT_TIMESTAMP",
            params![
                next.provider,
                next.api_key,
                next.base_url,
                next.model,
                if next.thinking_enabled { 1 } else { 0 },
                next.reasoning_effort,
                if next.show_reasoning_content { 1 } else { 0 },
                next.openai_api_key,
                next.openai_base_url,
                next.openai_model,
                if next.enable_hybrid_ai { 1 } else { 0 },
                next.primary_provider,
                next.review_provider,
                next.primary_model,
                next.review_model,
                if next.enable_cross_review { 1 } else { 0 },
                next.max_revision_rounds,
                next.feature_chapter_summary,
                next.feature_outline_chunk_analysis,
                next.feature_outline_reduce_merge,
                next.feature_outline_final_merge,
                next.feature_mindmap_generation,
                next.feature_writing_style_analysis,
                next.feature_chapter_polish,
                next.default_analysis_mode,
                next.simple_chunk_size,
                next.detailed_chunk_size,
                next.analysis_concurrency,
                if next.enable_chapter_cache { 1 } else { 0 },
                next.feature_outline_chunk_model,
                next.feature_outline_final_model,
                next.feature_review_model,
                next.feature_pattern_memory_model,
                next.feature_polish_model
            ],
        )
        .map_err(|error| error.to_string())?;

    get_ai_settings(app)
}

#[tauri::command]
fn read_prompt_file(app: tauri::AppHandle, name: String) -> Result<String, String> {
    let safe_name = name.replace('\\', "/");
    if safe_name.contains("..") || safe_name.contains('/') {
        return Err("invalid prompt name".to_string());
    }

    let mut candidates = Vec::new();
    if let Ok(current_dir) = std::env::current_dir() {
        candidates.push(current_dir.join("prompts").join(&safe_name));
        if let Some(parent_dir) = current_dir.parent() {
            candidates.push(parent_dir.join("prompts").join(&safe_name));
        }
    }
    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.join("prompts").join(&safe_name));
    }

    for path in candidates {
        if path.exists() {
            return std::fs::read_to_string(&path).map_err(|error| format!("read prompt failed: {error}"));
        }
    }

    if safe_name == "generate_outline_from_chapters.md" {
        eprintln!(
            "warning: prompt file not found: {safe_name}; using built-in generate outline fallback prompt"
        );
        return Ok(GENERATE_OUTLINE_FALLBACK_PROMPT.to_string());
    }

    Err(format!("prompt not found: {safe_name}"))
}

#[tauri::command]
fn save_ai_debug_log(content: String) -> Result<String, String> {
    let current_dir = std::env::current_dir().map_err(|error| error.to_string())?;
    let base_dir = if current_dir
        .file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| name.eq_ignore_ascii_case("src-tauri"))
    {
        current_dir
            .parent()
            .map(|path| path.to_path_buf())
            .unwrap_or(current_dir)
    } else {
        current_dir
    };
    let log_dir = base_dir.join("logs");
    std::fs::create_dir_all(&log_dir).map_err(|error| error.to_string())?;
    let path = log_dir.join("last_ai_response.json");
    std::fs::write(&path, content).map_err(|error| error.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn create_ai_task(
    app: tauri::AppHandle,
    project_id: Option<String>,
    task_type: String,
    input_text: String,
) -> Result<AITask, String> {
    let connection = open_database(&app)?;
    let id = new_id("ai-task");
    connection
        .execute(
            "INSERT INTO ai_tasks (id, project_id, task_type, status, input_text)
             VALUES (?1, ?2, ?3, 'running', ?4)",
            params![id, project_id, clean_title(&task_type, "unknown"), input_text],
        )
        .map_err(|error| error.to_string())?;
    get_ai_task(&connection, &id)
}

#[tauri::command]
fn finish_ai_task(
    app: tauri::AppHandle,
    task_id: String,
    status: String,
    output_text: String,
) -> Result<AITask, String> {
    let connection = open_database(&app)?;
    connection
        .execute(
            "UPDATE ai_tasks
             SET status = ?1, output_text = ?2, finished_at = CURRENT_TIMESTAMP
             WHERE id = ?3",
            params![clean_title(&status, "completed"), output_text, task_id],
        )
        .map_err(|error| error.to_string())?;
    get_ai_task(&connection, &task_id)
}

#[tauri::command]
fn log_ai_usage(app: tauri::AppHandle, input: AIUsageLogInput) -> Result<(), String> {
    let connection = open_database(&app)?;
    connection
        .execute(
            "INSERT INTO ai_usage_logs
             (id, project_id, feature_name, provider, model, prompt_tokens, completion_tokens, total_tokens, estimated_cost)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                new_id("ai-usage"),
                input.project_id,
                input.feature_name,
                input.provider,
                input.model,
                input.prompt_tokens,
                input.completion_tokens,
                input.total_tokens,
                input.estimated_cost
            ],
        )
        .map(|_| ())
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn get_chapter_ai_cache(
    app: tauri::AppHandle,
    project_id: String,
    chapter_id: String,
    content_hash: String,
    model: String,
    prompt_version: String,
    analysis_mode: String,
) -> Result<Option<ChapterAICacheEntry>, String> {
    let connection = open_database(&app)?;
    connection
        .query_row(
            "SELECT id, project_id, chapter_id, content_hash, model, prompt_version, analysis_mode, summary_json, created_at, updated_at
             FROM chapter_ai_cache
             WHERE project_id = ?1 AND chapter_id = ?2 AND content_hash = ?3 AND model = ?4 AND prompt_version = ?5 AND analysis_mode = ?6
             ORDER BY datetime(updated_at) DESC LIMIT 1",
            params![project_id, chapter_id, content_hash, model, prompt_version, analysis_mode],
            chapter_ai_cache_from_row,
        )
        .optional()
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn save_chapter_ai_cache(
    app: tauri::AppHandle,
    project_id: String,
    chapter_id: String,
    content_hash: String,
    model: String,
    prompt_version: String,
    analysis_mode: String,
    summary_json: String,
) -> Result<ChapterAICacheEntry, String> {
    let connection = open_database(&app)?;
    let existing_id: Option<String> = connection
        .query_row(
            "SELECT id FROM chapter_ai_cache
             WHERE project_id = ?1 AND chapter_id = ?2 AND content_hash = ?3 AND model = ?4 AND prompt_version = ?5 AND analysis_mode = ?6
             LIMIT 1",
            params![project_id, chapter_id, content_hash, model, prompt_version, analysis_mode],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| error.to_string())?;
    let id = existing_id.unwrap_or_else(|| new_id("chapter-ai-cache"));
    connection
        .execute(
            "INSERT INTO chapter_ai_cache (id, project_id, chapter_id, content_hash, model, prompt_version, analysis_mode, summary_json)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
             ON CONFLICT(project_id, chapter_id, content_hash, model, prompt_version, analysis_mode)
             DO UPDATE SET summary_json = excluded.summary_json, updated_at = CURRENT_TIMESTAMP",
            params![id, project_id, chapter_id, content_hash, model, prompt_version, analysis_mode, summary_json],
        )
        .map_err(|error| error.to_string())?;
    get_chapter_ai_cache(app, project_id, chapter_id, content_hash, model, prompt_version, analysis_mode)?
        .ok_or_else(|| "chapter ai cache save failed".to_string())
}

#[tauri::command]
fn save_chapter_summary(app: tauri::AppHandle, chapter_id: String, summary_text: String) -> Result<(), String> {
    let connection = open_database(&app)?;
    let existing_id: Option<String> = connection
        .query_row(
            "SELECT id FROM chapter_summaries WHERE chapter_id = ?1 ORDER BY datetime(created_at) DESC LIMIT 1",
            params![chapter_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| error.to_string())?;

    if let Some(id) = existing_id {
        connection
            .execute(
                "UPDATE chapter_summaries
                 SET summary_text = ?1, summary = ?1, generated_by = 'ai', updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?2",
                params![summary_text, id],
            )
            .map(|_| ())
            .map_err(|error| error.to_string())
    } else {
        connection
            .execute(
                "INSERT INTO chapter_summaries (id, chapter_id, summary_text, summary, generated_by)
                 VALUES (?1, ?2, ?3, ?3, 'ai')",
                params![new_id("chapter-summary"), chapter_id, summary_text],
            )
            .map(|_| ())
            .map_err(|error| error.to_string())
    }
}

#[tauri::command]
fn list_writing_style_profiles(app: tauri::AppHandle, project_id: String) -> Result<Vec<WritingStyleProfile>, String> {
    let connection = open_database(&app)?;
    let mut statement = connection
        .prepare(
            "SELECT id, project_id, profile_name, source_chapter_ids, dialogue_style, scene_description_style,
                    sentence_structure_style, emotion_style, humor_style, taboo_style, style_summary,
                    example_features_json, created_at, updated_at
             FROM writing_style_profiles
             WHERE project_id = ?1
             ORDER BY datetime(updated_at) DESC",
        )
        .map_err(|error| error.to_string())?;

    let profiles = statement
        .query_map(params![project_id], writing_style_profile_from_row)
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    Ok(profiles)
}

#[tauri::command]
fn save_writing_style_profile(app: tauri::AppHandle, input: SaveWritingStyleProfileInput) -> Result<WritingStyleProfile, String> {
    let connection = open_database(&app)?;
    let profile_name = clean_title(&input.profile_name, "默认风格");
    let existing_id: Option<String> = connection
        .query_row(
            "SELECT id FROM writing_style_profiles WHERE project_id = ?1 AND profile_name = ?2",
            params![input.project_id, profile_name],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| error.to_string())?;
    if existing_id.is_some() && !input.overwrite {
        return Err("同名语言风格 Profile 已存在".to_string());
    }

    let id = existing_id.unwrap_or_else(|| new_id("writing-style"));
    let source_chapter_ids = serde_json::to_string(&input.source_chapter_ids).unwrap_or_else(|_| "[]".to_string());
    let example_features_json = serde_json::to_string(&input.example_features).unwrap_or_else(|_| "[]".to_string());
    connection
        .execute(
            "INSERT INTO writing_style_profiles (
                id, project_id, profile_name, source_chapter_ids, dialogue_style, scene_description_style,
                sentence_structure_style, emotion_style, humor_style, taboo_style, style_summary, example_features_json
             )
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
             ON CONFLICT(project_id, profile_name)
             DO UPDATE SET
                source_chapter_ids = excluded.source_chapter_ids,
                dialogue_style = excluded.dialogue_style,
                scene_description_style = excluded.scene_description_style,
                sentence_structure_style = excluded.sentence_structure_style,
                emotion_style = excluded.emotion_style,
                humor_style = excluded.humor_style,
                taboo_style = excluded.taboo_style,
                style_summary = excluded.style_summary,
                example_features_json = excluded.example_features_json,
                updated_at = CURRENT_TIMESTAMP",
            params![
                id,
                input.project_id,
                profile_name,
                source_chapter_ids,
                input.dialogue_style,
                input.scene_description_style,
                input.sentence_structure_style,
                input.emotion_style,
                input.humor_style,
                input.taboo_style,
                input.style_summary,
                example_features_json
            ],
        )
        .map_err(|error| error.to_string())?;

    connection
        .query_row(
            "SELECT id, project_id, profile_name, source_chapter_ids, dialogue_style, scene_description_style,
                    sentence_structure_style, emotion_style, humor_style, taboo_style, style_summary,
                    example_features_json, created_at, updated_at
             FROM writing_style_profiles
             WHERE project_id = ?1 AND profile_name = ?2",
            params![input.project_id, profile_name],
            writing_style_profile_from_row,
        )
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn list_corpus_style_profiles(app: tauri::AppHandle, project_id: String) -> Result<Vec<CorpusStyleProfile>, String> {
    let connection = open_database(&app)?;
    let mut statement = connection
        .prepare(
            "SELECT id, project_id, profile_name, source_type, source_chapter_ids, analysis_mode, summary, created_at, updated_at
             FROM corpus_style_profiles
             WHERE project_id = ?1
             ORDER BY datetime(updated_at) DESC",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map(params![project_id], corpus_style_profile_from_row)
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    Ok(rows)
}

#[tauri::command]
fn get_corpus_style_profile_state(app: tauri::AppHandle, profile_id: String) -> Result<CorpusStyleProfileState, String> {
    let connection = open_database(&app)?;
    get_corpus_style_profile_state_with_connection(&connection, &profile_id)
}

#[tauri::command]
fn delete_corpus_style_profile(app: tauri::AppHandle, profile_id: String) -> Result<(), String> {
    let connection = open_database(&app)?;
    connection
        .execute("DELETE FROM corpus_style_profiles WHERE id = ?1", params![profile_id])
        .map(|_| ())
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn save_corpus_style_profile(app: tauri::AppHandle, input: SaveCorpusStyleProfileInput) -> Result<CorpusStyleProfileState, String> {
    let mut connection = open_database(&app)?;
    let tx = connection.transaction().map_err(|error| error.to_string())?;
    let profile_id = input.id.unwrap_or_else(|| new_id("corpus-style"));
    let profile_name = clean_title(&input.profile_name, "文风指纹 Profile");
    let source_chapter_ids = serde_json::to_string(&input.source_chapter_ids).unwrap_or_else(|_| "[]".to_string());

    tx.execute(
        "INSERT INTO corpus_style_profiles (id, project_id, profile_name, source_type, source_chapter_ids, analysis_mode, summary)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT(id)
         DO UPDATE SET profile_name = excluded.profile_name,
                       source_type = excluded.source_type,
                       source_chapter_ids = excluded.source_chapter_ids,
                       analysis_mode = excluded.analysis_mode,
                       summary = excluded.summary,
                       updated_at = CURRENT_TIMESTAMP",
        params![profile_id, input.project_id, profile_name, input.source_type, source_chapter_ids, input.analysis_mode, input.summary],
    )
    .map_err(|error| error.to_string())?;

    tx.execute("DELETE FROM corpus_style_dimensions WHERE profile_id = ?1", params![profile_id])
        .map_err(|error| error.to_string())?;
    tx.execute("DELETE FROM corpus_style_examples WHERE profile_id = ?1", params![profile_id])
        .map_err(|error| error.to_string())?;

    for dimension in input.dimensions {
        tx.execute(
            "INSERT INTO corpus_style_dimensions (id, profile_id, dimension_type, summary, rules_json, metrics_json, examples_json)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                new_id("corpus-dim"),
                profile_id,
                dimension.dimension_type,
                dimension.summary,
                dimension.rules_json,
                dimension.metrics_json,
                dimension.examples_json
            ],
        )
        .map_err(|error| error.to_string())?;
    }

    for example in input.examples {
        let excerpt = truncate_text(&example.original_excerpt, 200);
        tx.execute(
            "INSERT INTO corpus_style_examples (id, profile_id, dimension_type, original_excerpt, analysis_note, usage_rule)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                new_id("corpus-example"),
                profile_id,
                example.dimension_type,
                excerpt,
                example.analysis_note,
                example.usage_rule
            ],
        )
        .map_err(|error| error.to_string())?;
    }

    tx.commit().map_err(|error| error.to_string())?;
    let connection = open_database(&app)?;
    get_corpus_style_profile_state_with_connection(&connection, &profile_id)
}

#[tauri::command]
fn replace_style_retrieval_snippets(
    app: tauri::AppHandle,
    project_id: String,
    snippets: Vec<SaveStyleRetrievalSnippetInput>,
) -> Result<Vec<StyleRetrievalSnippet>, String> {
    let mut connection = open_database(&app)?;
    let tx = connection.transaction().map_err(|error| error.to_string())?;
    tx.execute("DELETE FROM style_retrieval_snippets WHERE project_id = ?1", params![&project_id])
        .map_err(|error| error.to_string())?;
    for snippet in snippets {
        let tags_json = serde_json::to_string(&snippet.tags).unwrap_or_else(|_| "[]".to_string());
        let metrics_json = serde_json::to_string(&snippet.metrics).unwrap_or_else(|_| "{}".to_string());
        tx.execute(
            "INSERT OR IGNORE INTO style_retrieval_snippets
             (id, project_id, source_type, source_id, chapter_id, chapter_title, volume_id, dimension_type, snippet_text, summary, tags_json, metrics_json, content_hash)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
            params![
                new_id("style-snippet"),
                &project_id,
                snippet.source_type,
                snippet.source_id,
                snippet.chapter_id,
                snippet.chapter_title,
                snippet.volume_id,
                snippet.dimension_type,
                truncate_text(&snippet.snippet_text, 300),
                snippet.summary,
                tags_json,
                metrics_json,
                snippet.content_hash
            ],
        )
        .map_err(|error| error.to_string())?;
    }
    tx.commit().map_err(|error| error.to_string())?;
    let connection = open_database(&app)?;
    list_style_retrieval_snippets_with_connection(&connection, &project_id)
}

#[tauri::command]
fn list_style_retrieval_snippets(app: tauri::AppHandle, project_id: String) -> Result<Vec<StyleRetrievalSnippet>, String> {
    let connection = open_database(&app)?;
    list_style_retrieval_snippets_with_connection(&connection, &project_id)
}

#[tauri::command]
fn save_chapter_version(
    app: tauri::AppHandle,
    chapter_id: String,
    version_type: String,
    content: String,
    note: Option<String>,
) -> Result<(), String> {
    let connection = open_database(&app)?;
    connection
        .execute(
            "INSERT INTO chapter_versions (id, chapter_id, version_type, content, note)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![new_id("chapter-version"), chapter_id, version_type, content, note],
        )
        .map(|_| ())
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn search_style_corpus(app: tauri::AppHandle, query: String) -> Result<StyleCorpusSearchResult, String> {
    let connection = open_database(&app)?;
    let query = query.trim().to_string();
    let pattern = format!("%{}%", query);
    let categories = list_style_categories(&connection)?;
    let works = if query.is_empty() {
        list_style_works(&connection, "SELECT * FROM style_corpus_works WHERE is_hidden = 0 ORDER BY title LIMIT 80", [])?
    } else {
        let mut statement = connection
            .prepare(
                "SELECT * FROM style_corpus_works
                 WHERE is_hidden = 0 AND (title LIKE ?1 OR author LIKE ?1 OR style_tags LIKE ?1 OR theme_tags LIKE ?1 OR image_tags LIKE ?1 OR usage_note LIKE ?1)
                 ORDER BY title LIMIT 80",
            )
            .map_err(|error| error.to_string())?;
        let rows = statement
            .query_map(params![pattern.clone()], style_work_from_row)
            .map_err(|error| error.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| error.to_string())?;
        rows
    };
    let quotes = if query.is_empty() {
        list_style_quotes(&connection, "SELECT q.* FROM style_corpus_quotes q JOIN style_corpus_works w ON q.work_id = w.id WHERE w.allow_direct_quote = 1 ORDER BY q.source_title LIMIT 60", [])?
    } else {
        let mut statement = connection
            .prepare(
                "SELECT q.* FROM style_corpus_quotes q
                 JOIN style_corpus_works w ON q.work_id = w.id
                 WHERE w.allow_direct_quote = 1 AND (q.original_text LIKE ?1 OR q.source_title LIKE ?1 OR q.author LIKE ?1 OR q.scene_tags LIKE ?1 OR q.emotion_tags LIKE ?1 OR q.image_tags LIKE ?1 OR q.usage_suggestion LIKE ?1)
                 ORDER BY q.source_title LIMIT 60",
            )
            .map_err(|error| error.to_string())?;
        let rows = statement
            .query_map(params![pattern], style_quote_from_row)
            .map_err(|error| error.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| error.to_string())?;
        rows
    };
    Ok(StyleCorpusSearchResult { categories, works, quotes })
}

#[tauri::command]
fn recommend_style_corpus(app: tauri::AppHandle, keywords: Vec<String>) -> Result<StyleCorpusSearchResult, String> {
    let query = keywords.join(" ");
    search_style_corpus(app, query)
}

#[tauri::command]
fn get_editor_state(app: tauri::AppHandle, project_id: String) -> Result<EditorState, String> {
    get_editor_state_for_project(&open_database(&app)?, &project_id)
}

#[tauri::command]
fn get_outline_state(app: tauri::AppHandle, project_id: String) -> Result<OutlineState, String> {
    let connection = open_database(&app)?;
    ensure_outline_defaults(&connection, &project_id)?;
    Ok(OutlineState {
        text_sections: list_outline_text_sections(&connection, &project_id)?,
        mind_nodes: list_outline_mind_nodes(&connection, &project_id)?,
        mind_edges: list_outline_mind_edges(&connection, &project_id)?,
    })
}

#[tauri::command]
fn save_outline_text_section(
    app: tauri::AppHandle,
    project_id: String,
    section_type: String,
    content: String,
) -> Result<OutlineTextSection, String> {
    let connection = open_database(&app)?;
    let existing_id: Option<String> = connection
        .query_row(
            "SELECT id FROM outline_text_sections WHERE project_id = ?1 AND section_type = ?2",
            params![project_id, section_type],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| error.to_string())?;

    let id = existing_id.unwrap_or_else(|| new_id("outline-text"));
    connection
        .execute(
            "INSERT INTO outline_text_sections (id, project_id, section_type, content)
             VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(project_id, section_type)
             DO UPDATE SET content = excluded.content, updated_at = CURRENT_TIMESTAMP",
            params![id, project_id, section_type, content],
        )
        .map_err(|error| error.to_string())?;
    touch_project(&connection, &project_id)?;
    get_outline_text_section(&connection, &project_id, &section_type)
}

#[tauri::command]
fn create_outline_mind_node(
    app: tauri::AppHandle,
    project_id: String,
    node_type: String,
    title: String,
    description: String,
    x: f64,
    y: f64,
) -> Result<OutlineMindNode, String> {
    let connection = open_database(&app)?;
    let id = new_id("outline-node");
    connection
        .execute(
            "INSERT INTO outline_mind_nodes (id, project_id, node_type, title, description, x, y)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                id,
                project_id,
                clean_title(&node_type, "branch_plot"),
                clean_title(&title, "\u{65b0}\u{8282}\u{70b9}"),
                description,
                x,
                y
            ],
        )
        .map_err(|error| error.to_string())?;
    touch_project(&connection, &project_id)?;
    get_outline_mind_node(&connection, &id)
}

#[tauri::command]
fn update_outline_mind_node(
    app: tauri::AppHandle,
    node_id: String,
    node_type: String,
    title: String,
    description: String,
    x: f64,
    y: f64,
) -> Result<OutlineMindNode, String> {
    let connection = open_database(&app)?;
    let project_id: String = connection
        .query_row(
            "SELECT project_id FROM outline_mind_nodes WHERE id = ?1",
            params![node_id],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())?;
    connection
        .execute(
            "UPDATE outline_mind_nodes
             SET node_type = ?1, title = ?2, description = ?3, x = ?4, y = ?5, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?6",
            params![
                clean_title(&node_type, "branch_plot"),
                clean_title(&title, "\u{65b0}\u{8282}\u{70b9}"),
                description,
                x,
                y,
                node_id
            ],
        )
        .map_err(|error| error.to_string())?;
    touch_project(&connection, &project_id)?;
    get_outline_mind_node(&connection, &node_id)
}

#[tauri::command]
fn create_outline_mind_edge(
    app: tauri::AppHandle,
    project_id: String,
    source_node_id: String,
    target_node_id: String,
) -> Result<OutlineMindEdge, String> {
    if source_node_id == target_node_id {
        return Err("cannot connect a node to itself".to_string());
    }

    let connection = open_database(&app)?;
    let existing: Option<String> = connection
        .query_row(
            "SELECT id FROM outline_mind_edges
             WHERE project_id = ?1 AND source_node_id = ?2 AND target_node_id = ?3",
            params![project_id, source_node_id, target_node_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| error.to_string())?;

    if existing.is_some() {
        return Err("edge already exists".to_string());
    }

    let id = new_id("outline-edge");
    connection
        .execute(
            "INSERT INTO outline_mind_edges (id, project_id, source_node_id, target_node_id, edge_type, label)
             VALUES (?1, ?2, ?3, ?4, 'related', NULL)",
            params![id, project_id, source_node_id, target_node_id],
        )
        .map_err(|error| error.to_string())?;
    touch_project(&connection, &project_id)?;
    get_outline_mind_edge(&connection, &id)
}

#[tauri::command]
fn update_outline_mind_edge(
    app: tauri::AppHandle,
    edge_id: String,
    edge_type: String,
    label: Option<String>,
) -> Result<OutlineMindEdge, String> {
    let connection = open_database(&app)?;
    let project_id: String = connection
        .query_row(
            "SELECT project_id FROM outline_mind_edges WHERE id = ?1",
            params![edge_id],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())?;
    let next_label = label.and_then(|value| {
        let trimmed = value.trim().to_string();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed)
        }
    });
    connection
        .execute(
            "UPDATE outline_mind_edges
             SET edge_type = ?1, label = ?2, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?3",
            params![clean_title(&edge_type, "related"), next_label, edge_id],
        )
        .map_err(|error| error.to_string())?;
    touch_project(&connection, &project_id)?;
    get_outline_mind_edge(&connection, &edge_id)
}

#[tauri::command]
fn delete_outline_mind_edge(app: tauri::AppHandle, edge_id: String) -> Result<(), String> {
    let connection = open_database(&app)?;
    let project_id: String = connection
        .query_row(
            "SELECT project_id FROM outline_mind_edges WHERE id = ?1",
            params![edge_id],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())?;
    connection
        .execute("DELETE FROM outline_mind_edges WHERE id = ?1", params![edge_id])
        .map_err(|error| error.to_string())?;
    touch_project(&connection, &project_id)
}

#[tauri::command]
fn delete_outline_mind_node(app: tauri::AppHandle, node_id: String) -> Result<(), String> {
    let connection = open_database(&app)?;
    let project_id: String = connection
        .query_row(
            "SELECT project_id FROM outline_mind_nodes WHERE id = ?1",
            params![node_id],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())?;
    connection
        .execute(
            "DELETE FROM outline_mind_edges WHERE source_node_id = ?1 OR target_node_id = ?1",
            params![node_id],
        )
        .map_err(|error| error.to_string())?;
    connection
        .execute("DELETE FROM outline_mind_nodes WHERE id = ?1", params![node_id])
        .map_err(|error| error.to_string())?;
    touch_project(&connection, &project_id)
}

#[tauri::command]
fn clear_outline_mind_map(app: tauri::AppHandle, project_id: String) -> Result<(), String> {
    let connection = open_database(&app)?;
    connection
        .execute("DELETE FROM outline_mind_edges WHERE project_id = ?1", params![project_id])
        .map_err(|error| error.to_string())?;
    connection
        .execute("DELETE FROM outline_mind_nodes WHERE project_id = ?1", params![project_id])
        .map_err(|error| error.to_string())?;
    touch_project(&connection, &project_id)
}

#[tauri::command]
fn get_memory_library_stats(app: tauri::AppHandle, project_id: String) -> Result<MemoryLibraryStats, String> {
    let connection = open_database(&app)?;
    seed_builtin_ai_patterns(&connection, &project_id)?;
    Ok(MemoryLibraryStats {
        outline_text_sections: count_project_rows(&connection, "outline_text_sections", &project_id)?,
        outline_mind_nodes: count_project_rows(&connection, "outline_mind_nodes", &project_id)?,
        outline_mind_edges: count_project_rows(&connection, "outline_mind_edges", &project_id)?,
        chapter_summaries: connection
            .query_row(
                "SELECT COUNT(*) FROM chapter_summaries s JOIN chapters c ON s.chapter_id = c.id WHERE c.project_id = ?1",
                params![project_id],
                |row| row.get(0),
            )
            .map_err(|error| error.to_string())?,
        global_outlines: count_project_rows(&connection, "global_outlines", &project_id)?,
        characters: count_project_rows(&connection, "characters", &project_id)?,
        plot_threads: count_project_rows(&connection, "plot_threads", &project_id)?,
        foreshadowing: count_project_rows(&connection, "foreshadowing", &project_id)?,
        consistency_issues: count_project_rows(&connection, "consistency_issues", &project_id)?,
        writing_style_profiles: count_project_rows(&connection, "writing_style_profiles", &project_id)?,
        ai_pattern_memory: count_project_rows(&connection, "ai_pattern_memory", &project_id)?,
        style_corpus_categories: count_all_rows(&connection, "style_corpus_categories")?,
        style_corpus_works: count_all_rows(&connection, "style_corpus_works")?,
        style_corpus_quotes: count_all_rows(&connection, "style_corpus_quotes")?,
    })
}

#[tauri::command]
fn clear_outline_memory(app: tauri::AppHandle, project_id: String) -> Result<(), String> {
    let connection = open_database(&app)?;
    connection
        .execute("DELETE FROM outline_mind_edges WHERE project_id = ?1", params![project_id])
        .map_err(|error| error.to_string())?;
    connection
        .execute("DELETE FROM outline_mind_nodes WHERE project_id = ?1", params![project_id])
        .map_err(|error| error.to_string())?;
    connection
        .execute("DELETE FROM outline_text_sections WHERE project_id = ?1", params![project_id])
        .map_err(|error| error.to_string())?;
    connection
        .execute(
            "DELETE FROM chapter_summaries WHERE chapter_id IN (SELECT id FROM chapters WHERE project_id = ?1)",
            params![project_id],
        )
        .map_err(|error| error.to_string())?;
    for table in ["global_outlines", "characters", "plot_threads", "foreshadowing", "consistency_issues"] {
        connection
            .execute(&format!("DELETE FROM {table} WHERE project_id = ?1"), params![project_id])
            .map_err(|error| error.to_string())?;
    }
    ensure_outline_defaults(&connection, &project_id)?;
    touch_project(&connection, &project_id)
}

#[tauri::command]
fn clear_writing_style_memory(app: tauri::AppHandle, project_id: String) -> Result<(), String> {
    let connection = open_database(&app)?;
    connection
        .execute("DELETE FROM writing_style_profiles WHERE project_id = ?1", params![project_id])
        .map_err(|error| error.to_string())?;
    touch_project(&connection, &project_id)
}

#[tauri::command]
fn list_ai_pattern_memory(app: tauri::AppHandle, project_id: String) -> Result<Vec<AIPatternMemory>, String> {
    let connection = open_database(&app)?;
    seed_builtin_ai_patterns(&connection, &project_id)?;
    list_ai_patterns(&connection, &project_id)
}

#[tauri::command]
fn save_ai_pattern_memory(app: tauri::AppHandle, input: SaveAIPatternMemoryInput) -> Result<AIPatternMemory, String> {
    let connection = open_database(&app)?;
    let id = input.id.unwrap_or_else(|| new_id("ai-pattern"));
    let source = input.source.unwrap_or_else(|| "user".to_string());
    let source_model = input.source_model.unwrap_or_default();
    let pattern_keywords = serde_json::to_string(&input.pattern_keywords).unwrap_or_else(|_| "[]".to_string());
    let bad_examples = serde_json::to_string(&trim_examples(input.bad_examples)).unwrap_or_else(|_| "[]".to_string());
    connection
        .execute(
            "INSERT INTO ai_pattern_memory (
                id, project_id, pattern_type, pattern_name, pattern_keywords, pattern_description,
                bad_examples, rewrite_advice, severity, source, source_model, is_active
             )
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
             ON CONFLICT(id) DO UPDATE SET
                pattern_type = excluded.pattern_type,
                pattern_name = excluded.pattern_name,
                pattern_keywords = excluded.pattern_keywords,
                pattern_description = excluded.pattern_description,
                bad_examples = excluded.bad_examples,
                rewrite_advice = excluded.rewrite_advice,
                severity = excluded.severity,
                source_model = excluded.source_model,
                is_active = excluded.is_active,
                updated_at = CURRENT_TIMESTAMP",
            params![
                id,
                input.project_id,
                input.pattern_type,
                clean_title(&input.pattern_name, "自定义 AI 模式"),
                pattern_keywords,
                input.pattern_description,
                bad_examples,
                input.rewrite_advice,
                normalize_severity(&input.severity),
                source,
                source_model,
                bool_to_int(input.is_active)
            ],
        )
        .map_err(|error| error.to_string())?;
    get_ai_pattern(&connection, &id)
}

#[tauri::command]
fn set_ai_pattern_active(app: tauri::AppHandle, pattern_id: String, is_active: bool) -> Result<AIPatternMemory, String> {
    let connection = open_database(&app)?;
    connection
        .execute(
            "UPDATE ai_pattern_memory SET is_active = ?2, updated_at = CURRENT_TIMESTAMP WHERE id = ?1",
            params![pattern_id, bool_to_int(is_active)],
        )
        .map_err(|error| error.to_string())?;
    get_ai_pattern(&connection, &pattern_id)
}

#[tauri::command]
fn delete_ai_pattern_memory(app: tauri::AppHandle, pattern_id: String) -> Result<(), String> {
    let connection = open_database(&app)?;
    let source: String = connection
        .query_row("SELECT source FROM ai_pattern_memory WHERE id = ?1", params![pattern_id], |row| row.get(0))
        .map_err(|error| error.to_string())?;
    if source == "builtin" {
        return Err("内置规则不能删除，只能禁用或重置。".to_string());
    }
    connection
        .execute("DELETE FROM ai_pattern_memory WHERE id = ?1", params![pattern_id])
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
fn clear_ai_pattern_memory(app: tauri::AppHandle, project_id: String, include_builtin: bool) -> Result<(), String> {
    let connection = open_database(&app)?;
    let sql = if include_builtin {
        "DELETE FROM ai_pattern_memory WHERE project_id = ?1"
    } else {
        "DELETE FROM ai_pattern_memory WHERE project_id = ?1 AND source <> 'builtin'"
    };
    connection.execute(sql, params![project_id]).map_err(|error| error.to_string())?;
    seed_builtin_ai_patterns(&connection, &project_id)?;
    Ok(())
}

#[tauri::command]
fn reset_builtin_ai_patterns(app: tauri::AppHandle, project_id: String) -> Result<Vec<AIPatternMemory>, String> {
    let connection = open_database(&app)?;
    connection
        .execute(
            "DELETE FROM ai_pattern_memory WHERE project_id = ?1 AND source = 'builtin'",
            params![project_id],
        )
        .map_err(|error| error.to_string())?;
    seed_builtin_ai_patterns(&connection, &project_id)?;
    list_ai_patterns(&connection, &project_id)
}

#[tauri::command]
fn upsert_ai_patterns_from_review(
    app: tauri::AppHandle,
    project_id: String,
    patterns: Vec<ReviewPatternInput>,
) -> Result<Vec<AIPatternMemory>, String> {
    let connection = open_database(&app)?;
    let mut saved = Vec::new();
    for pattern in patterns {
        let name = clean_title(&pattern.pattern_name, "AI 互检模式");
        let existing_id: Option<String> = connection
            .query_row(
                "SELECT id FROM ai_pattern_memory WHERE project_id = ?1 AND pattern_name = ?2 LIMIT 1",
                params![project_id, name],
                |row| row.get(0),
            )
            .optional()
            .map_err(|error| error.to_string())?;
        let id = existing_id.unwrap_or_else(|| new_id("ai-pattern"));
        let keywords = serde_json::to_string(&pattern.pattern_keywords).unwrap_or_else(|_| "[]".to_string());
        let bad_examples = serde_json::to_string(&trim_examples(pattern.bad_example.into_iter().collect())).unwrap_or_else(|_| "[]".to_string());
        connection
            .execute(
                "INSERT INTO ai_pattern_memory (
                    id, project_id, pattern_type, pattern_name, pattern_keywords, pattern_description,
                    bad_examples, rewrite_advice, severity, source, source_model, hit_count, is_active
                 )
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'ai_review', ?10, 1, 1)
                 ON CONFLICT(id) DO UPDATE SET
                    pattern_description = CASE WHEN excluded.pattern_description <> '' THEN excluded.pattern_description ELSE ai_pattern_memory.pattern_description END,
                    bad_examples = CASE WHEN excluded.bad_examples <> '[]' THEN excluded.bad_examples ELSE ai_pattern_memory.bad_examples END,
                    rewrite_advice = CASE WHEN excluded.rewrite_advice <> '' THEN excluded.rewrite_advice ELSE ai_pattern_memory.rewrite_advice END,
                    severity = excluded.severity,
                    source_model = excluded.source_model,
                    hit_count = ai_pattern_memory.hit_count + 1,
                    is_active = 1,
                    updated_at = CURRENT_TIMESTAMP",
                params![
                    id,
                    project_id,
                    normalize_pattern_type(&pattern.pattern_type),
                    name,
                    keywords,
                    truncate_text(&pattern.pattern_description, 240),
                    bad_examples,
                    pattern.rewrite_advice,
                    normalize_severity(&pattern.severity),
                    pattern.source_model
                ],
            )
            .map_err(|error| error.to_string())?;
        saved.push(get_ai_pattern(&connection, &id)?);
    }
    Ok(saved)
}

#[tauri::command]
fn create_volume(app: tauri::AppHandle, project_id: String) -> Result<Volume, String> {
    create_volume_with_title_inner(&open_database(&app)?, &project_id, "\u{65b0}\u{5efa}\u{5377}")
}

#[tauri::command]
fn create_import_volume(app: tauri::AppHandle, project_id: String) -> Result<Volume, String> {
    create_volume_with_title_inner(&open_database(&app)?, &project_id, "\u{5bfc}\u{5165}\u{5377}")
}

#[tauri::command]
fn create_volume_with_title(
    app: tauri::AppHandle,
    project_id: String,
    title: String,
) -> Result<Volume, String> {
    create_volume_with_title_inner(&open_database(&app)?, &project_id, &title)
}

#[tauri::command]
fn create_chapter(
    app: tauri::AppHandle,
    project_id: String,
    volume_id: String,
) -> Result<Chapter, String> {
    let connection = open_database(&app)?;
    let id = new_id("chapter");
    let sort_order = next_sort_order(&connection, "chapters", "volume_id", &volume_id)?;
    let chapter_index = next_chapter_index(&connection, &project_id)?;
    connection
        .execute(
            "INSERT INTO chapters (id, project_id, volume_id, title, chapter_index, sort_order)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![id, project_id, volume_id, "\u{65b0}\u{5efa}\u{7ae0}\u{8282}", chapter_index, sort_order],
        )
        .map_err(|error| error.to_string())?;
    touch_project(&connection, &project_id)?;
    get_chapter(&connection, &id)
}

#[tauri::command]
fn rename_volume(app: tauri::AppHandle, volume_id: String, title: String) -> Result<Volume, String> {
    let connection = open_database(&app)?;
    let project_id = get_volume_project_id(&connection, &volume_id)?;
    connection
        .execute(
            "UPDATE volumes SET title = ?1, updated_at = CURRENT_TIMESTAMP WHERE id = ?2",
            params![clean_title(&title, "\u{65b0}\u{5efa}\u{5377}"), volume_id],
        )
        .map_err(|error| error.to_string())?;
    touch_project(&connection, &project_id)?;
    get_volume(&connection, &volume_id)
}

#[tauri::command]
fn rename_chapter(app: tauri::AppHandle, chapter_id: String, title: String) -> Result<Chapter, String> {
    let connection = open_database(&app)?;
    let project_id = get_chapter_project_id(&connection, &chapter_id)?;
    connection
        .execute(
            "UPDATE chapters SET title = ?1, updated_at = CURRENT_TIMESTAMP WHERE id = ?2",
            params![clean_title(&title, "\u{65b0}\u{5efa}\u{7ae0}\u{8282}"), chapter_id],
        )
        .map_err(|error| error.to_string())?;
    touch_project(&connection, &project_id)?;
    get_chapter(&connection, &chapter_id)
}

#[tauri::command]
fn save_chapter_content(
    app: tauri::AppHandle,
    chapter_id: String,
    content: String,
    word_count: i64,
) -> Result<SavedChapter, String> {
    let connection = open_database(&app)?;
    let project_id = get_chapter_project_id(&connection, &chapter_id)?;
    connection
        .execute(
            "UPDATE chapters
             SET content = ?1, word_count = ?2, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?3",
            params![content, word_count, chapter_id],
        )
        .map_err(|error| error.to_string())?;
    touch_project(&connection, &project_id)?;
    connection
        .query_row(
            "SELECT id, word_count, updated_at FROM chapters WHERE id = ?1",
            params![chapter_id],
            |row| {
                Ok(SavedChapter {
                    id: row.get(0)?,
                    word_count: row.get(1)?,
                    updated_at: row.get(2)?,
                })
            },
        )
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn import_chapters(
    app: tauri::AppHandle,
    project_id: String,
    volume_id: String,
    chapters: Vec<ImportChapterDraft>,
) -> Result<EditorState, String> {
    if chapters.is_empty() {
        return Err("no chapters to import".to_string());
    }

    let mut connection = open_database(&app)?;
    let transaction = connection.transaction().map_err(|error| error.to_string())?;
    let mut sort_order = next_sort_order_tx(&transaction, "chapters", "volume_id", &volume_id)?;
    let mut chapter_index = next_chapter_index_tx(&transaction, &project_id)?;

    for chapter in chapters {
        transaction
            .execute(
                "INSERT INTO chapters
                 (id, project_id, volume_id, title, chapter_index, sort_order, content, word_count)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![
                    new_id("chapter"),
                    project_id,
                    volume_id,
                    clean_title(&chapter.title, "\u{65b0}\u{5efa}\u{7ae0}\u{8282}"),
                    chapter_index,
                    sort_order,
                    chapter.content,
                    chapter.word_count
                ],
            )
            .map_err(|error| error.to_string())?;
        sort_order += 1;
        chapter_index += 1;
    }

    touch_project_tx(&transaction, &project_id)?;
    transaction.commit().map_err(|error| error.to_string())?;
    get_editor_state_for_project(&connection, &project_id)
}

#[tauri::command]
fn delete_selected_items(
    app: tauri::AppHandle,
    project_id: String,
    volume_ids: Vec<String>,
    chapter_ids: Vec<String>,
) -> Result<EditorState, String> {
    let mut connection = open_database(&app)?;
    let transaction = connection.transaction().map_err(|error| error.to_string())?;
    let mut affected_chapter_ids = chapter_ids;

    for volume_id in &volume_ids {
        let mut statement = transaction
            .prepare("SELECT id FROM chapters WHERE volume_id = ?1 AND project_id = ?2")
            .map_err(|error| error.to_string())?;
        let ids = statement
            .query_map(params![volume_id, project_id], |row| row.get::<_, String>(0))
            .map_err(|error| error.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| error.to_string())?;
        affected_chapter_ids.extend(ids);
    }

    affected_chapter_ids.sort();
    affected_chapter_ids.dedup();
    if !affected_chapter_ids.is_empty() {
        execute_with_ids(&transaction, "DELETE FROM chapter_summaries WHERE chapter_id IN", &affected_chapter_ids)?;
        execute_with_ids(&transaction, "DELETE FROM foreshadowing WHERE chapter_id IN", &affected_chapter_ids)?;
        execute_with_ids(&transaction, "DELETE FROM consistency_issues WHERE chapter_id IN", &affected_chapter_ids)?;
        execute_with_ids(&transaction, "UPDATE characters SET first_seen_chapter_id = NULL WHERE first_seen_chapter_id IN", &affected_chapter_ids)?;
        execute_with_ids(&transaction, "UPDATE characters SET last_seen_chapter_id = NULL WHERE last_seen_chapter_id IN", &affected_chapter_ids)?;
        execute_with_ids(&transaction, "UPDATE plot_threads SET start_chapter_id = NULL WHERE start_chapter_id IN", &affected_chapter_ids)?;
        execute_with_ids(&transaction, "UPDATE plot_threads SET end_chapter_id = NULL WHERE end_chapter_id IN", &affected_chapter_ids)?;
        execute_with_ids(&transaction, "DELETE FROM chapters WHERE id IN", &affected_chapter_ids)?;
    }
    if !volume_ids.is_empty() {
        execute_with_ids(&transaction, "DELETE FROM volumes WHERE id IN", &volume_ids)?;
    }

    touch_project_tx(&transaction, &project_id)?;
    transaction.commit().map_err(|error| error.to_string())?;
    get_editor_state_for_project(&connection, &project_id)
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(path).map_err(|error| format!("read file failed: {error}"))
}

#[tauri::command]
fn write_text_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(path, content).map_err(|error| format!("write file failed: {error}"))
}

#[tauri::command]
fn write_binary_file(path: String, bytes: Vec<u8>) -> Result<(), String> {
    std::fs::write(path, bytes).map_err(|error| format!("write file failed: {error}"))
}

#[tauri::command]
fn read_docx_file(path: String) -> Result<Vec<String>, String> {
    let file = std::fs::File::open(path).map_err(|error| format!("open docx failed: {error}"))?;
    let mut archive = ZipArchive::new(file).map_err(|error| format!("read docx archive failed: {error}"))?;
    let mut document_xml = String::new();
    archive
        .by_name("word/document.xml")
        .map_err(|error| format!("read word/document.xml failed: {error}"))?
        .read_to_string(&mut document_xml)
        .map_err(|error| format!("read docx xml failed: {error}"))?;
    parse_docx_paragraphs(&document_xml)
}

#[tauri::command]
fn write_docx_file(path: String, volumes: Vec<ExportVolumeDraft>) -> Result<(), String> {
    let bytes = build_docx(&volumes)?;
    std::fs::write(path, bytes).map_err(|error| format!("write docx failed: {error}"))
}

fn initialize_database(app: &tauri::App) -> Result<(), String> {
    let connection = open_database(app.handle())?;
    connection.execute_batch(SCHEMA).map_err(|error| error.to_string())?;
    migrate_database(&connection).map_err(|error| error.to_string())?;
    Ok(())
}

fn open_database(app: &tauri::AppHandle) -> Result<Connection, String> {
    let connection = Connection::open(database_path(app)?).map_err(|error| error.to_string())?;
    connection
        .execute("PRAGMA foreign_keys = ON", [])
        .map_err(|error| error.to_string())?;
    Ok(connection)
}

fn database_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let app_dir = app.path().app_data_dir().map_err(|error| error.to_string())?;
    std::fs::create_dir_all(&app_dir).map_err(|error| error.to_string())?;
    Ok(app_dir.join("novel_memory_engine.sqlite3"))
}

fn persist_cover_image(app: &tauri::AppHandle, source_path: Option<&str>) -> Result<Option<String>, String> {
    let Some(source_path) = source_path else {
        return Ok(None);
    };
    let source_path = source_path.trim();
    if source_path.is_empty() {
        return Ok(None);
    }

    let source = PathBuf::from(source_path);
    let extension = source
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("png")
        .to_ascii_lowercase();
    if !["png", "jpg", "jpeg", "webp"].contains(&extension.as_str()) {
        return Err("cover only supports png/jpg/jpeg/webp".to_string());
    }

    let cover_dir = app.path().app_data_dir().map_err(|error| error.to_string())?.join("covers");
    std::fs::create_dir_all(&cover_dir).map_err(|error| error.to_string())?;
    let target = cover_dir.join(format!("cover-{}.{}", new_id("image"), extension));
    std::fs::copy(&source, &target).map_err(|error| format!("copy cover failed: {error}"))?;
    Ok(Some(target.to_string_lossy().to_string()))
}

fn migrate_database(connection: &Connection) -> rusqlite::Result<()> {
    ensure_column(connection, "projects", "category", "ALTER TABLE projects ADD COLUMN category TEXT NOT NULL DEFAULT 'Fantasy'")?;
    ensure_column(connection, "projects", "description", "ALTER TABLE projects ADD COLUMN description TEXT")?;
    ensure_column(connection, "projects", "cover_path", "ALTER TABLE projects ADD COLUMN cover_path TEXT")?;
    ensure_column(connection, "projects", "last_edited_at", "ALTER TABLE projects ADD COLUMN last_edited_at TEXT")?;
    connection.execute(
        "UPDATE projects SET last_edited_at = COALESCE(last_edited_at, updated_at, created_at, CURRENT_TIMESTAMP)",
        [],
    )?;
    connection.execute(
        "UPDATE projects SET updated_at = COALESCE(updated_at, created_at, CURRENT_TIMESTAMP),
                             created_at = COALESCE(created_at, CURRENT_TIMESTAMP)
         WHERE updated_at IS NULL OR created_at IS NULL",
        [],
    )?;
    ensure_column(connection, "chapters", "volume_id", "ALTER TABLE chapters ADD COLUMN volume_id TEXT")?;
    ensure_column(connection, "chapters", "sort_order", "ALTER TABLE chapters ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0")?;
    ensure_column(connection, "chapters", "word_count", "ALTER TABLE chapters ADD COLUMN word_count INTEGER NOT NULL DEFAULT 0")?;
    ensure_column(connection, "chapter_summaries", "summary_text", "ALTER TABLE chapter_summaries ADD COLUMN summary_text TEXT NOT NULL DEFAULT ''")?;
    ensure_column(connection, "ai_settings", "default_analysis_mode", "ALTER TABLE ai_settings ADD COLUMN default_analysis_mode TEXT NOT NULL DEFAULT 'simple'")?;
    ensure_column(connection, "ai_settings", "simple_chunk_size", "ALTER TABLE ai_settings ADD COLUMN simple_chunk_size INTEGER NOT NULL DEFAULT 5")?;
    ensure_column(connection, "ai_settings", "detailed_chunk_size", "ALTER TABLE ai_settings ADD COLUMN detailed_chunk_size INTEGER NOT NULL DEFAULT 3")?;
    ensure_column(connection, "ai_settings", "analysis_concurrency", "ALTER TABLE ai_settings ADD COLUMN analysis_concurrency INTEGER NOT NULL DEFAULT 2")?;
    ensure_column(connection, "ai_settings", "enable_chapter_cache", "ALTER TABLE ai_settings ADD COLUMN enable_chapter_cache INTEGER NOT NULL DEFAULT 1")?;
    ensure_column(connection, "ai_settings", "thinking_enabled", "ALTER TABLE ai_settings ADD COLUMN thinking_enabled INTEGER NOT NULL DEFAULT 0")?;
    ensure_column(connection, "ai_settings", "reasoning_effort", "ALTER TABLE ai_settings ADD COLUMN reasoning_effort TEXT NOT NULL DEFAULT 'high'")?;
    ensure_column(connection, "ai_settings", "show_reasoning_content", "ALTER TABLE ai_settings ADD COLUMN show_reasoning_content INTEGER NOT NULL DEFAULT 0")?;
    ensure_column(connection, "ai_settings", "openai_api_key", "ALTER TABLE ai_settings ADD COLUMN openai_api_key TEXT NOT NULL DEFAULT ''")?;
    ensure_column(connection, "ai_settings", "openai_base_url", "ALTER TABLE ai_settings ADD COLUMN openai_base_url TEXT NOT NULL DEFAULT 'https://api.openai.com/v1'")?;
    ensure_column(connection, "ai_settings", "openai_model", "ALTER TABLE ai_settings ADD COLUMN openai_model TEXT NOT NULL DEFAULT 'gpt-5.5'")?;
    ensure_column(connection, "ai_settings", "enable_hybrid_ai", "ALTER TABLE ai_settings ADD COLUMN enable_hybrid_ai INTEGER NOT NULL DEFAULT 0")?;
    ensure_column(connection, "ai_settings", "primary_provider", "ALTER TABLE ai_settings ADD COLUMN primary_provider TEXT NOT NULL DEFAULT 'deepseek'")?;
    ensure_column(connection, "ai_settings", "review_provider", "ALTER TABLE ai_settings ADD COLUMN review_provider TEXT NOT NULL DEFAULT 'openai'")?;
    ensure_column(connection, "ai_settings", "primary_model", "ALTER TABLE ai_settings ADD COLUMN primary_model TEXT NOT NULL DEFAULT 'deepseek-v4-flash'")?;
    ensure_column(connection, "ai_settings", "review_model", "ALTER TABLE ai_settings ADD COLUMN review_model TEXT NOT NULL DEFAULT 'gpt-5.5'")?;
    ensure_column(connection, "ai_settings", "enable_cross_review", "ALTER TABLE ai_settings ADD COLUMN enable_cross_review INTEGER NOT NULL DEFAULT 1")?;
    ensure_column(connection, "ai_settings", "max_revision_rounds", "ALTER TABLE ai_settings ADD COLUMN max_revision_rounds INTEGER NOT NULL DEFAULT 1")?;
    ensure_column(connection, "ai_settings", "feature_chapter_summary", "ALTER TABLE ai_settings ADD COLUMN feature_chapter_summary TEXT NOT NULL DEFAULT 'deepseek'")?;
    ensure_column(connection, "ai_settings", "feature_outline_chunk_analysis", "ALTER TABLE ai_settings ADD COLUMN feature_outline_chunk_analysis TEXT NOT NULL DEFAULT 'deepseek'")?;
    ensure_column(connection, "ai_settings", "feature_outline_reduce_merge", "ALTER TABLE ai_settings ADD COLUMN feature_outline_reduce_merge TEXT NOT NULL DEFAULT 'deepseek'")?;
    ensure_column(connection, "ai_settings", "feature_outline_final_merge", "ALTER TABLE ai_settings ADD COLUMN feature_outline_final_merge TEXT NOT NULL DEFAULT 'openai'")?;
    ensure_column(connection, "ai_settings", "feature_mindmap_generation", "ALTER TABLE ai_settings ADD COLUMN feature_mindmap_generation TEXT NOT NULL DEFAULT 'deepseek'")?;
    ensure_column(connection, "ai_settings", "feature_writing_style_analysis", "ALTER TABLE ai_settings ADD COLUMN feature_writing_style_analysis TEXT NOT NULL DEFAULT 'openai'")?;
    ensure_column(connection, "ai_settings", "feature_chapter_polish", "ALTER TABLE ai_settings ADD COLUMN feature_chapter_polish TEXT NOT NULL DEFAULT 'hybrid'")?;
    ensure_column(connection, "ai_settings", "feature_outline_chunk_model", "ALTER TABLE ai_settings ADD COLUMN feature_outline_chunk_model TEXT NOT NULL DEFAULT 'deepseek-v4-flash'")?;
    ensure_column(connection, "ai_settings", "feature_outline_final_model", "ALTER TABLE ai_settings ADD COLUMN feature_outline_final_model TEXT NOT NULL DEFAULT 'deepseek-v4-pro'")?;
    ensure_column(connection, "ai_settings", "feature_review_model", "ALTER TABLE ai_settings ADD COLUMN feature_review_model TEXT NOT NULL DEFAULT 'deepseek-v4-pro'")?;
    ensure_column(connection, "ai_settings", "feature_pattern_memory_model", "ALTER TABLE ai_settings ADD COLUMN feature_pattern_memory_model TEXT NOT NULL DEFAULT 'deepseek-v4-pro'")?;
    ensure_column(connection, "ai_settings", "feature_polish_model", "ALTER TABLE ai_settings ADD COLUMN feature_polish_model TEXT NOT NULL DEFAULT 'deepseek-v4-flash'")?;
    connection.execute(
        "CREATE TABLE IF NOT EXISTS corpus_style_profiles (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          profile_name TEXT NOT NULL,
          source_type TEXT NOT NULL,
          source_chapter_ids TEXT NOT NULL DEFAULT '[]',
          analysis_mode TEXT NOT NULL DEFAULT 'simple',
          summary TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        )",
        [],
    )?;
    connection.execute(
        "CREATE TABLE IF NOT EXISTS corpus_style_dimensions (
          id TEXT PRIMARY KEY,
          profile_id TEXT NOT NULL,
          dimension_type TEXT NOT NULL,
          summary TEXT NOT NULL DEFAULT '',
          rules_json TEXT NOT NULL DEFAULT '[]',
          metrics_json TEXT NOT NULL DEFAULT '{}',
          examples_json TEXT NOT NULL DEFAULT '[]',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (profile_id) REFERENCES corpus_style_profiles(id) ON DELETE CASCADE,
          UNIQUE (profile_id, dimension_type)
        )",
        [],
    )?;
    connection.execute(
        "CREATE TABLE IF NOT EXISTS corpus_style_examples (
          id TEXT PRIMARY KEY,
          profile_id TEXT NOT NULL,
          dimension_type TEXT NOT NULL,
          original_excerpt TEXT NOT NULL DEFAULT '',
          analysis_note TEXT NOT NULL DEFAULT '',
          usage_rule TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (profile_id) REFERENCES corpus_style_profiles(id) ON DELETE CASCADE
        )",
        [],
    )?;
    connection.execute("CREATE INDEX IF NOT EXISTS idx_corpus_style_profiles_project_id ON corpus_style_profiles(project_id)", [])?;
    connection.execute("CREATE INDEX IF NOT EXISTS idx_corpus_style_dimensions_profile_id ON corpus_style_dimensions(profile_id)", [])?;
    connection.execute("CREATE INDEX IF NOT EXISTS idx_corpus_style_examples_profile_id ON corpus_style_examples(profile_id)", [])?;
    connection.execute(
        "CREATE TABLE IF NOT EXISTS style_retrieval_snippets (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          source_type TEXT NOT NULL,
          source_id TEXT NOT NULL,
          chapter_id TEXT,
          chapter_title TEXT,
          volume_id TEXT,
          dimension_type TEXT NOT NULL,
          snippet_text TEXT NOT NULL DEFAULT '',
          summary TEXT NOT NULL DEFAULT '',
          tags_json TEXT NOT NULL DEFAULT '[]',
          metrics_json TEXT NOT NULL DEFAULT '{}',
          content_hash TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
          UNIQUE (project_id, source_type, source_id, content_hash)
        )",
        [],
    )?;
    connection.execute("CREATE INDEX IF NOT EXISTS idx_style_retrieval_snippets_project_id ON style_retrieval_snippets(project_id)", [])?;
    connection.execute("CREATE INDEX IF NOT EXISTS idx_style_retrieval_snippets_dimension ON style_retrieval_snippets(project_id, dimension_type)", [])?;
    connection.execute(
        "CREATE TABLE IF NOT EXISTS chapter_ai_cache (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          chapter_id TEXT NOT NULL,
          content_hash TEXT NOT NULL,
          model TEXT NOT NULL,
          prompt_version TEXT NOT NULL,
          analysis_mode TEXT NOT NULL,
          summary_json TEXT NOT NULL DEFAULT '{}',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
          FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE,
          UNIQUE (project_id, chapter_id, content_hash, model, prompt_version, analysis_mode)
        )",
        [],
    )?;
    connection.execute(
        "CREATE INDEX IF NOT EXISTS idx_chapter_ai_cache_lookup ON chapter_ai_cache(project_id, chapter_id, content_hash, model, prompt_version, analysis_mode)",
        [],
    )?;
    connection.execute(
        "CREATE TABLE IF NOT EXISTS writing_style_profiles (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          profile_name TEXT NOT NULL,
          source_chapter_ids TEXT NOT NULL DEFAULT '[]',
          dialogue_style TEXT NOT NULL DEFAULT '',
          scene_description_style TEXT NOT NULL DEFAULT '',
          sentence_structure_style TEXT NOT NULL DEFAULT '',
          emotion_style TEXT NOT NULL DEFAULT '',
          humor_style TEXT NOT NULL DEFAULT '',
          taboo_style TEXT NOT NULL DEFAULT '',
          style_summary TEXT NOT NULL DEFAULT '',
          example_features_json TEXT NOT NULL DEFAULT '[]',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
          UNIQUE (project_id, profile_name)
        )",
        [],
    )?;
    connection.execute(
        "CREATE TABLE IF NOT EXISTS chapter_versions (
          id TEXT PRIMARY KEY,
          chapter_id TEXT NOT NULL,
          version_type TEXT NOT NULL,
          content TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          note TEXT,
          FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE
        )",
        [],
    )?;
    connection.execute(
        "CREATE TABLE IF NOT EXISTS ai_pattern_memory (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          pattern_type TEXT NOT NULL,
          pattern_name TEXT NOT NULL,
          pattern_keywords TEXT NOT NULL DEFAULT '[]',
          pattern_description TEXT NOT NULL DEFAULT '',
          bad_examples TEXT NOT NULL DEFAULT '[]',
          rewrite_advice TEXT NOT NULL DEFAULT '',
          severity TEXT NOT NULL DEFAULT 'medium',
          source TEXT NOT NULL DEFAULT 'user',
          source_model TEXT NOT NULL DEFAULT '',
          hit_count INTEGER NOT NULL DEFAULT 0,
          is_active INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
          UNIQUE (project_id, pattern_name, source)
        )",
        [],
    )?;
    connection.execute("CREATE INDEX IF NOT EXISTS idx_writing_style_profiles_project_id ON writing_style_profiles(project_id)", [])?;
    connection.execute("CREATE INDEX IF NOT EXISTS idx_chapter_versions_chapter_id ON chapter_versions(chapter_id)", [])?;
    connection.execute("CREATE INDEX IF NOT EXISTS idx_ai_pattern_memory_project_id ON ai_pattern_memory(project_id)", [])?;
    connection.execute(
        "CREATE TABLE IF NOT EXISTS style_corpus_categories (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )?;
    connection.execute(
        "CREATE TABLE IF NOT EXISTS style_corpus_works (
          id TEXT PRIMARY KEY,
          category_id TEXT NOT NULL,
          title TEXT NOT NULL,
          author TEXT NOT NULL DEFAULT '',
          era TEXT NOT NULL DEFAULT '',
          region TEXT NOT NULL DEFAULT '',
          copyright_status TEXT NOT NULL DEFAULT 'unknown',
          allow_direct_quote INTEGER NOT NULL DEFAULT 0,
          style_tags TEXT NOT NULL DEFAULT '[]',
          theme_tags TEXT NOT NULL DEFAULT '[]',
          image_tags TEXT NOT NULL DEFAULT '[]',
          usage_note TEXT NOT NULL DEFAULT '',
          is_builtin INTEGER NOT NULL DEFAULT 0,
          is_hidden INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (category_id) REFERENCES style_corpus_categories(id) ON DELETE CASCADE
        )",
        [],
    )?;
    connection.execute(
        "CREATE TABLE IF NOT EXISTS style_corpus_quotes (
          id TEXT PRIMARY KEY,
          work_id TEXT NOT NULL,
          original_text TEXT NOT NULL,
          source_title TEXT NOT NULL DEFAULT '',
          author TEXT NOT NULL DEFAULT '',
          modern_explanation TEXT NOT NULL DEFAULT '',
          scene_tags TEXT NOT NULL DEFAULT '[]',
          emotion_tags TEXT NOT NULL DEFAULT '[]',
          image_tags TEXT NOT NULL DEFAULT '[]',
          usage_suggestion TEXT NOT NULL DEFAULT '',
          ai_rewrite_example TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (work_id) REFERENCES style_corpus_works(id) ON DELETE CASCADE
        )",
        [],
    )?;
    connection.execute("CREATE INDEX IF NOT EXISTS idx_style_corpus_works_category_id ON style_corpus_works(category_id)", [])?;
    connection.execute("CREATE INDEX IF NOT EXISTS idx_style_corpus_quotes_work_id ON style_corpus_quotes(work_id)", [])?;
    seed_style_corpus(connection)?;
    connection.execute("CREATE INDEX IF NOT EXISTS idx_chapters_volume_id ON chapters(volume_id)", [])?;
    Ok(())
}

fn ensure_column(connection: &Connection, table_name: &str, column_name: &str, alter_sql: &str) -> rusqlite::Result<()> {
    let mut statement = connection.prepare(&format!("PRAGMA table_info({table_name})"))?;
    let columns = statement
        .query_map([], |row| row.get::<_, String>(1))?
        .collect::<Result<Vec<_>, _>>()?;
    if !columns.iter().any(|column| column == column_name) {
        connection.execute(alter_sql, [])?;
    }
    Ok(())
}

fn get_editor_state_for_project(connection: &Connection, project_id: &str) -> Result<EditorState, String> {
    Ok(EditorState {
        project: get_project(connection, project_id)?,
        volumes: list_volumes(connection, project_id)?,
        chapters: list_chapters(connection, project_id)?,
    })
}

fn chapter_ai_cache_from_row(row: &Row<'_>) -> rusqlite::Result<ChapterAICacheEntry> {
    Ok(ChapterAICacheEntry {
        id: row.get(0)?,
        project_id: row.get(1)?,
        chapter_id: row.get(2)?,
        content_hash: row.get(3)?,
        model: row.get(4)?,
        prompt_version: row.get(5)?,
        analysis_mode: row.get(6)?,
        summary_json: row.get(7)?,
        created_at: row.get(8)?,
        updated_at: row.get(9)?,
    })
}

fn list_volumes(connection: &Connection, project_id: &str) -> Result<Vec<Volume>, String> {
    let mut statement = connection
        .prepare(
            "SELECT id, project_id, title, sort_order, created_at, updated_at
             FROM volumes
             WHERE project_id = ?1
             ORDER BY sort_order ASC, created_at ASC",
        )
        .map_err(|error| error.to_string())?;
    let volumes = statement
        .query_map(params![project_id], volume_from_row)
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    Ok(volumes)
}

fn list_chapters(connection: &Connection, project_id: &str) -> Result<Vec<Chapter>, String> {
    let mut statement = connection
        .prepare(
            "SELECT id, project_id, COALESCE(volume_id, ''), title, content, sort_order, word_count, created_at, updated_at
             FROM chapters
             WHERE project_id = ?1
             ORDER BY sort_order ASC, chapter_index ASC, created_at ASC",
        )
        .map_err(|error| error.to_string())?;
    let chapters = statement
        .query_map(params![project_id], chapter_from_row)
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    Ok(chapters)
}

fn create_volume_with_title_inner(connection: &Connection, project_id: &str, title: &str) -> Result<Volume, String> {
    let id = new_id("volume");
    let sort_order = next_sort_order(connection, "volumes", "project_id", project_id)?;
    connection
        .execute(
            "INSERT INTO volumes (id, project_id, title, sort_order) VALUES (?1, ?2, ?3, ?4)",
            params![id, project_id, clean_title(title, "\u{65b0}\u{5efa}\u{5377}"), sort_order],
        )
        .map_err(|error| error.to_string())?;
    touch_project(connection, project_id)?;
    get_volume(connection, &id)
}

fn ensure_outline_defaults(connection: &Connection, project_id: &str) -> Result<(), String> {
    for section_type in ["world", "main_characters", "roles", "main_plot", "branch_plot", "conflicts"] {
        connection
            .execute(
                "INSERT OR IGNORE INTO outline_text_sections (id, project_id, section_type, content)
                 VALUES (?1, ?2, ?3, '')",
                params![new_id("outline-text"), project_id, section_type],
            )
            .map_err(|error| error.to_string())?;
    }

    let node_count: i64 = connection
        .query_row(
            "SELECT COUNT(*) FROM outline_mind_nodes WHERE project_id = ?1",
            params![project_id],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())?;
    if node_count == 0 {
        for (node_type, title, description, x, y) in [
            ("world", "World", "World rules and background.", 90.0, 80.0),
            ("main_character", "Main Characters", "Core characters and motivations.", 330.0, 80.0),
            ("main_plot", "Main Plot", "Central conflict and phases.", 560.0, 180.0),
            ("branch_plot", "Branch Plot", "Side plots and relationships.", 260.0, 300.0),
        ] {
            connection
                .execute(
                    "INSERT INTO outline_mind_nodes (id, project_id, node_type, title, description, x, y)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                    params![new_id("outline-node"), project_id, node_type, title, description, x, y],
                )
                .map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

fn list_outline_text_sections(connection: &Connection, project_id: &str) -> Result<Vec<OutlineTextSection>, String> {
    let mut statement = connection
        .prepare(
            "SELECT id, project_id, section_type, content, created_at, updated_at
             FROM outline_text_sections
             WHERE project_id = ?1
             ORDER BY CASE section_type
               WHEN 'world' THEN 1
               WHEN 'main_characters' THEN 2
               WHEN 'roles' THEN 3
               WHEN 'main_plot' THEN 4
               WHEN 'branch_plot' THEN 5
               WHEN 'conflicts' THEN 6
               ELSE 99
             END",
        )
        .map_err(|error| error.to_string())?;
    let sections = statement
        .query_map(params![project_id], outline_text_section_from_row)
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    Ok(sections)
}

fn list_outline_mind_nodes(connection: &Connection, project_id: &str) -> Result<Vec<OutlineMindNode>, String> {
    let mut statement = connection
        .prepare(
            "SELECT id, project_id, node_type, title, description, x, y, created_at, updated_at
             FROM outline_mind_nodes
             WHERE project_id = ?1
             ORDER BY datetime(created_at) ASC",
        )
        .map_err(|error| error.to_string())?;
    let nodes = statement
        .query_map(params![project_id], outline_mind_node_from_row)
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    Ok(nodes)
}

fn list_outline_mind_edges(connection: &Connection, project_id: &str) -> Result<Vec<OutlineMindEdge>, String> {
    let mut statement = connection
        .prepare(
            "SELECT id, project_id, source_node_id, target_node_id, edge_type, label, created_at, updated_at
             FROM outline_mind_edges
             WHERE project_id = ?1
             ORDER BY datetime(created_at) ASC",
        )
        .map_err(|error| error.to_string())?;
    let edges = statement
        .query_map(params![project_id], |row| {
            Ok(OutlineMindEdge {
                id: row.get(0)?,
                project_id: row.get(1)?,
                source_node_id: row.get(2)?,
                target_node_id: row.get(3)?,
                edge_type: row.get(4)?,
                label: row.get(5)?,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
            })
        })
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    Ok(edges)
}

fn get_outline_text_section(
    connection: &Connection,
    project_id: &str,
    section_type: &str,
) -> Result<OutlineTextSection, String> {
    connection
        .query_row(
            "SELECT id, project_id, section_type, content, created_at, updated_at
             FROM outline_text_sections
             WHERE project_id = ?1 AND section_type = ?2",
            params![project_id, section_type],
            outline_text_section_from_row,
        )
        .map_err(|error| error.to_string())
}

fn get_outline_mind_node(connection: &Connection, node_id: &str) -> Result<OutlineMindNode, String> {
    connection
        .query_row(
            "SELECT id, project_id, node_type, title, description, x, y, created_at, updated_at
             FROM outline_mind_nodes
             WHERE id = ?1",
            params![node_id],
            outline_mind_node_from_row,
        )
        .map_err(|error| error.to_string())
}

fn get_outline_mind_edge(connection: &Connection, edge_id: &str) -> Result<OutlineMindEdge, String> {
    connection
        .query_row(
            "SELECT id, project_id, source_node_id, target_node_id, edge_type, label, created_at, updated_at
             FROM outline_mind_edges
             WHERE id = ?1",
            params![edge_id],
            |row| {
                Ok(OutlineMindEdge {
                    id: row.get(0)?,
                    project_id: row.get(1)?,
                    source_node_id: row.get(2)?,
                    target_node_id: row.get(3)?,
                    edge_type: row.get(4)?,
                    label: row.get(5)?,
                    created_at: row.get(6)?,
                    updated_at: row.get(7)?,
                })
            },
        )
        .map_err(|error| error.to_string())
}

fn get_project(connection: &Connection, project_id: &str) -> Result<Project, String> {
    connection
        .query_row(
            "SELECT id, title, category, description, cover_path, created_at, updated_at,
                    COALESCE(last_edited_at, updated_at, created_at, CURRENT_TIMESTAMP) AS last_edited_at
             FROM projects WHERE id = ?1",
            params![project_id],
            project_from_row,
        )
        .map_err(|error| error.to_string())
}

fn get_ai_task(connection: &Connection, task_id: &str) -> Result<AITask, String> {
    connection
        .query_row(
            "SELECT id, project_id, task_type, status, input_text, output_text, created_at, finished_at
             FROM ai_tasks WHERE id = ?1",
            params![task_id],
            |row| {
                Ok(AITask {
                    id: row.get(0)?,
                    project_id: row.get(1)?,
                    task_type: row.get(2)?,
                    status: row.get(3)?,
                    input_text: row.get(4)?,
                    output_text: row.get(5)?,
                    created_at: row.get(6)?,
                    finished_at: row.get(7)?,
                })
            },
        )
        .map_err(|error| error.to_string())
}

fn get_volume(connection: &Connection, volume_id: &str) -> Result<Volume, String> {
    connection
        .query_row(
            "SELECT id, project_id, title, sort_order, created_at, updated_at FROM volumes WHERE id = ?1",
            params![volume_id],
            volume_from_row,
        )
        .map_err(|error| error.to_string())
}

fn get_chapter(connection: &Connection, chapter_id: &str) -> Result<Chapter, String> {
    connection
        .query_row(
            "SELECT id, project_id, COALESCE(volume_id, ''), title, content, sort_order, word_count, created_at, updated_at
             FROM chapters WHERE id = ?1",
            params![chapter_id],
            chapter_from_row,
        )
        .map_err(|error| error.to_string())
}

fn get_volume_project_id(connection: &Connection, volume_id: &str) -> Result<String, String> {
    connection
        .query_row("SELECT project_id FROM volumes WHERE id = ?1", params![volume_id], |row| row.get(0))
        .map_err(|error| error.to_string())
}

fn get_chapter_project_id(connection: &Connection, chapter_id: &str) -> Result<String, String> {
    connection
        .query_row("SELECT project_id FROM chapters WHERE id = ?1", params![chapter_id], |row| row.get(0))
        .map_err(|error| error.to_string())
}

fn next_sort_order(connection: &Connection, table: &str, column: &str, value: &str) -> Result<i64, String> {
    connection
        .query_row(
            &format!("SELECT COALESCE(MAX(sort_order), -1) + 1 FROM {table} WHERE {column} = ?1"),
            params![value],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())
}

fn next_sort_order_tx(transaction: &Transaction<'_>, table: &str, column: &str, value: &str) -> Result<i64, String> {
    transaction
        .query_row(
            &format!("SELECT COALESCE(MAX(sort_order), -1) + 1 FROM {table} WHERE {column} = ?1"),
            params![value],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())
}

fn next_chapter_index(connection: &Connection, project_id: &str) -> Result<i64, String> {
    connection
        .query_row(
            "SELECT COALESCE(MAX(chapter_index), -1) + 1 FROM chapters WHERE project_id = ?1",
            params![project_id],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())
}

fn next_chapter_index_tx(transaction: &Transaction<'_>, project_id: &str) -> Result<i64, String> {
    transaction
        .query_row(
            "SELECT COALESCE(MAX(chapter_index), -1) + 1 FROM chapters WHERE project_id = ?1",
            params![project_id],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())
}

fn execute_with_ids(transaction: &Transaction<'_>, sql_prefix: &str, ids: &[String]) -> Result<(), String> {
    if ids.is_empty() {
        return Ok(());
    }
    let placeholders = std::iter::repeat("?").take(ids.len()).collect::<Vec<_>>().join(", ");
    let sql = format!("{sql_prefix} ({placeholders})");
    transaction
        .execute(&sql, params_from_iter(ids.iter()))
        .map(|_| ())
        .map_err(|error| error.to_string())
}

fn touch_project(connection: &Connection, project_id: &str) -> Result<(), String> {
    connection
        .execute(
            "UPDATE projects SET updated_at = CURRENT_TIMESTAMP, last_edited_at = CURRENT_TIMESTAMP WHERE id = ?1",
            params![project_id],
        )
        .map(|_| ())
        .map_err(|error| error.to_string())
}

fn touch_project_tx(transaction: &Transaction<'_>, project_id: &str) -> Result<(), String> {
    transaction
        .execute(
            "UPDATE projects SET updated_at = CURRENT_TIMESTAMP, last_edited_at = CURRENT_TIMESTAMP WHERE id = ?1",
            params![project_id],
        )
        .map(|_| ())
        .map_err(|error| error.to_string())
}

fn project_from_row(row: &Row<'_>) -> rusqlite::Result<Project> {
    let created_at: String = row.get(5)?;
    let updated_at: String = row.get(6)?;
    let last_edited_at: Option<String> = row.get(7)?;
    Ok(Project {
        id: row.get(0)?,
        title: row.get(1)?,
        category: row.get(2)?,
        description: row.get(3)?,
        cover_path: row.get(4)?,
        created_at: created_at.clone(),
        updated_at: updated_at.clone(),
        last_edited_at: last_edited_at.unwrap_or_else(|| {
            if !updated_at.is_empty() {
                updated_at
            } else {
                created_at
            }
        }),
    })
}

fn volume_from_row(row: &Row<'_>) -> rusqlite::Result<Volume> {
    Ok(Volume {
        id: row.get(0)?,
        project_id: row.get(1)?,
        title: row.get(2)?,
        sort_order: row.get(3)?,
        created_at: row.get(4)?,
        updated_at: row.get(5)?,
    })
}

fn chapter_from_row(row: &Row<'_>) -> rusqlite::Result<Chapter> {
    Ok(Chapter {
        id: row.get(0)?,
        project_id: row.get(1)?,
        volume_id: row.get(2)?,
        title: row.get(3)?,
        content: row.get(4)?,
        sort_order: row.get(5)?,
        word_count: row.get(6)?,
        created_at: row.get(7)?,
        updated_at: row.get(8)?,
    })
}

fn outline_text_section_from_row(row: &Row<'_>) -> rusqlite::Result<OutlineTextSection> {
    Ok(OutlineTextSection {
        id: row.get(0)?,
        project_id: row.get(1)?,
        section_type: row.get(2)?,
        content: row.get(3)?,
        created_at: row.get(4)?,
        updated_at: row.get(5)?,
    })
}

fn outline_mind_node_from_row(row: &Row<'_>) -> rusqlite::Result<OutlineMindNode> {
    Ok(OutlineMindNode {
        id: row.get(0)?,
        project_id: row.get(1)?,
        node_type: row.get(2)?,
        title: row.get(3)?,
        description: row.get(4)?,
        x: row.get(5)?,
        y: row.get(6)?,
        created_at: row.get(7)?,
        updated_at: row.get(8)?,
    })
}

fn writing_style_profile_from_row(row: &Row<'_>) -> rusqlite::Result<WritingStyleProfile> {
    Ok(WritingStyleProfile {
        id: row.get(0)?,
        project_id: row.get(1)?,
        profile_name: row.get(2)?,
        source_chapter_ids: row.get(3)?,
        dialogue_style: row.get(4)?,
        scene_description_style: row.get(5)?,
        sentence_structure_style: row.get(6)?,
        emotion_style: row.get(7)?,
        humor_style: row.get(8)?,
        taboo_style: row.get(9)?,
        style_summary: row.get(10)?,
        example_features_json: row.get(11)?,
        created_at: row.get(12)?,
        updated_at: row.get(13)?,
    })
}

fn corpus_style_profile_from_row(row: &Row<'_>) -> rusqlite::Result<CorpusStyleProfile> {
    Ok(CorpusStyleProfile {
        id: row.get(0)?,
        project_id: row.get(1)?,
        profile_name: row.get(2)?,
        source_type: row.get(3)?,
        source_chapter_ids: row.get(4)?,
        analysis_mode: row.get(5)?,
        summary: row.get(6)?,
        created_at: row.get(7)?,
        updated_at: row.get(8)?,
    })
}

fn corpus_style_dimension_from_row(row: &Row<'_>) -> rusqlite::Result<CorpusStyleDimension> {
    Ok(CorpusStyleDimension {
        id: row.get(0)?,
        profile_id: row.get(1)?,
        dimension_type: row.get(2)?,
        summary: row.get(3)?,
        rules_json: row.get(4)?,
        metrics_json: row.get(5)?,
        examples_json: row.get(6)?,
        created_at: row.get(7)?,
        updated_at: row.get(8)?,
    })
}

fn corpus_style_example_from_row(row: &Row<'_>) -> rusqlite::Result<CorpusStyleExample> {
    Ok(CorpusStyleExample {
        id: row.get(0)?,
        profile_id: row.get(1)?,
        dimension_type: row.get(2)?,
        original_excerpt: row.get(3)?,
        analysis_note: row.get(4)?,
        usage_rule: row.get(5)?,
        created_at: row.get(6)?,
        updated_at: row.get(7)?,
    })
}

fn style_retrieval_snippet_from_row(row: &Row<'_>) -> rusqlite::Result<StyleRetrievalSnippet> {
    Ok(StyleRetrievalSnippet {
        id: row.get("id")?,
        project_id: row.get("project_id")?,
        source_type: row.get("source_type")?,
        source_id: row.get("source_id")?,
        chapter_id: row.get("chapter_id")?,
        chapter_title: row.get("chapter_title")?,
        volume_id: row.get("volume_id")?,
        dimension_type: row.get("dimension_type")?,
        snippet_text: row.get("snippet_text")?,
        summary: row.get("summary")?,
        tags_json: row.get("tags_json")?,
        metrics_json: row.get("metrics_json")?,
        content_hash: row.get("content_hash")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

fn list_style_retrieval_snippets_with_connection(
    connection: &Connection,
    project_id: &str,
) -> Result<Vec<StyleRetrievalSnippet>, String> {
    let mut statement = connection
        .prepare(
            "SELECT id, project_id, source_type, source_id, chapter_id, chapter_title, volume_id,
                    dimension_type, snippet_text, summary, tags_json, metrics_json, content_hash, created_at, updated_at
             FROM style_retrieval_snippets
             WHERE project_id = ?1
             ORDER BY datetime(updated_at) DESC",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map(params![project_id], style_retrieval_snippet_from_row)
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    Ok(rows)
}

fn get_corpus_style_profile_state_with_connection(connection: &Connection, profile_id: &str) -> Result<CorpusStyleProfileState, String> {
    let profile = connection
        .query_row(
            "SELECT id, project_id, profile_name, source_type, source_chapter_ids, analysis_mode, summary, created_at, updated_at
             FROM corpus_style_profiles WHERE id = ?1",
            params![profile_id],
            corpus_style_profile_from_row,
        )
        .map_err(|error| error.to_string())?;

    let mut dimension_statement = connection
        .prepare(
            "SELECT id, profile_id, dimension_type, summary, rules_json, metrics_json, examples_json, created_at, updated_at
             FROM corpus_style_dimensions WHERE profile_id = ?1 ORDER BY dimension_type",
        )
        .map_err(|error| error.to_string())?;
    let dimensions = dimension_statement
        .query_map(params![profile_id], corpus_style_dimension_from_row)
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;

    let mut example_statement = connection
        .prepare(
            "SELECT id, profile_id, dimension_type, original_excerpt, analysis_note, usage_rule, created_at, updated_at
             FROM corpus_style_examples WHERE profile_id = ?1 ORDER BY dimension_type, created_at",
        )
        .map_err(|error| error.to_string())?;
    let examples = example_statement
        .query_map(params![profile_id], corpus_style_example_from_row)
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;

    Ok(CorpusStyleProfileState { profile, dimensions, examples })
}

fn ai_pattern_from_row(row: &Row<'_>) -> rusqlite::Result<AIPatternMemory> {
    Ok(AIPatternMemory {
        id: row.get(0)?,
        project_id: row.get(1)?,
        pattern_type: row.get(2)?,
        pattern_name: row.get(3)?,
        pattern_keywords: row.get(4)?,
        pattern_description: row.get(5)?,
        bad_examples: row.get(6)?,
        rewrite_advice: row.get(7)?,
        severity: row.get(8)?,
        source: row.get(9)?,
        source_model: row.get(10)?,
        hit_count: row.get(11)?,
        is_active: row.get::<_, i64>(12)? != 0,
        created_at: row.get(13)?,
        updated_at: row.get(14)?,
    })
}

fn get_ai_pattern(connection: &Connection, pattern_id: &str) -> Result<AIPatternMemory, String> {
    connection
        .query_row(
            "SELECT id, project_id, pattern_type, pattern_name, pattern_keywords, pattern_description,
                    bad_examples, rewrite_advice, severity, source, source_model, hit_count,
                    is_active, created_at, updated_at
             FROM ai_pattern_memory WHERE id = ?1",
            params![pattern_id],
            ai_pattern_from_row,
        )
        .map_err(|error| error.to_string())
}

fn list_ai_patterns(connection: &Connection, project_id: &str) -> Result<Vec<AIPatternMemory>, String> {
    let mut statement = connection
        .prepare(
            "SELECT id, project_id, pattern_type, pattern_name, pattern_keywords, pattern_description,
                    bad_examples, rewrite_advice, severity, source, source_model, hit_count,
                    is_active, created_at, updated_at
             FROM ai_pattern_memory
             WHERE project_id = ?1
             ORDER BY is_active DESC,
                      CASE severity WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
                      hit_count DESC,
                      updated_at DESC",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map(params![project_id], ai_pattern_from_row)
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    Ok(rows)
}

fn seed_builtin_ai_patterns(connection: &Connection, project_id: &str) -> Result<(), String> {
    let builtins = builtin_ai_patterns();
    for (pattern_type, name, keywords, examples, advice) in builtins {
        let id = format!("builtin-{project_id}-{pattern_type}-{name}");
        let keyword_json = serde_json::to_string(&keywords).unwrap_or_else(|_| "[]".to_string());
        let example_json = serde_json::to_string(&examples).unwrap_or_else(|_| "[]".to_string());
        connection
            .execute(
                "INSERT INTO ai_pattern_memory (
                    id, project_id, pattern_type, pattern_name, pattern_keywords, pattern_description,
                    bad_examples, rewrite_advice, severity, source, source_model, hit_count, is_active
                 )
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'medium', 'builtin', '', 0, 1)
                 ON CONFLICT(id) DO UPDATE SET
                    pattern_type = excluded.pattern_type,
                    pattern_name = excluded.pattern_name,
                    pattern_keywords = excluded.pattern_keywords,
                    pattern_description = excluded.pattern_description,
                    bad_examples = excluded.bad_examples,
                    rewrite_advice = excluded.rewrite_advice,
                    severity = excluded.severity,
                    source = 'builtin',
                    source_model = '',
                    updated_at = CURRENT_TIMESTAMP",
                params![id, project_id, pattern_type, name, keyword_json, name, example_json, advice],
            )
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn builtin_ai_patterns() -> Vec<(&'static str, &'static str, Vec<&'static str>, Vec<&'static str>, &'static str)> {
    vec![
        (
            "negation_pattern",
            "Negation then affirmation",
            vec!["\u{4e0d}\u{662f}", "\u{5e76}\u{975e}", "\u{800c}\u{662f}", "\u{4e0d}\u{662f}\u{7761}\u{4e24}\u{5c0f}\u{65f6}\u{ff0c}\u{800c}\u{662f}\u{76f4}\u{63a5}\u{5f00}\u{4e09}\u{4e2a}\u{53f7}"],
            vec!["\u{4e0d}\u{662f}\u{7761}\u{4e24}\u{5c0f}\u{65f6}\u{ff0c}\u{800c}\u{662f}\u{76f4}\u{63a5}\u{5f00}\u{4e09}\u{4e2a}\u{53f7}\u{3002}", "\u{4e0d}\u{662f}\u{6050}\u{60e7}\u{ff0c}\u{4e5f}\u{4e0d}\u{662f}\u{6124}\u{6012}\u{ff0c}\u{800c}\u{662f}\u{67d0}\u{79cd}\u{66f4}\u{6df1}\u{7684}\u{4e1c}\u{897f}\u{3002}"],
            "\u{53ea}\u{4fdd}\u{7559}\u{771f}\u{6b63}\u{6709}\u{6897}\u{7684}\u{5c11}\u{6570}\u{201c}\u{4e0d}\u{662f}\u{2026}\u{2026}\u{800c}\u{662f}\u{2026}\u{2026}\u{201d}\u{53e5}\u{5f0f}\u{ff0c}\u{5176}\u{4f59}\u{6539}\u{6210}\u{5177}\u{4f53}\u{52a8}\u{4f5c}\u{3001}\u{573a}\u{666f}\u{6216}\u{4eba}\u{7269}\u{53cd}\u{5e94}\u{3002}",
        ),
        (
            "repeated_emphasis",
            "Repeated short emphasis",
            vec!["\u{53c8}\u{662f}", "\u{592a}", "\u{975e}\u{5e38}", "\u{91cd}\u{70b9}\u{73ed}\u{3002}\u{53c8}\u{662f}\u{91cd}\u{70b9}\u{73ed}", "\u{53ea}\u{6709}\u{4e00}\u{4e2a}\u{3002}\u{8fd9}\u{6bd4}"],
            vec!["\u{91cd}\u{70b9}\u{73ed}\u{3002}\u{53c8}\u{662f}\u{91cd}\u{70b9}\u{73ed}\u{3002}", "\u{8001}\u{5978}\u{5de8}\u{733e}\u{3002}\u{975e}\u{5e38}\u{8001}\u{5978}\u{5de8}\u{733e}\u{3002}", "\u{53ea}\u{6709}\u{4e00}\u{4e2a}\u{3002}\u{8fd9}\u{6bd4}\u{5979}\u{60f3}\u{8c61}\u{4e2d}\u{8fd8}\u{72e0}\u{3002}"],
            "\u{907f}\u{514d}\u{91cd}\u{590d}\u{77ed}\u{53e5}\u{5f3a}\u{8c03}\u{548c}\u{673a}\u{68b0}\u{77ed}\u{53e5}\u{65ad}\u{8a00}\u{ff0c}\u{6539}\u{7528}\u{4eba}\u{7269}\u{52a8}\u{4f5c}\u{3001}\u{53cd}\u{5e94}\u{3001}\u{505c}\u{987f}\u{3001}\u{89c6}\u{7ebf}\u{3001}\u{73b0}\u{573a}\u{7ec6}\u{8282}\u{6216}\u{5410}\u{69fd}\u{8282}\u{594f}\u{8868}\u{8fbe}\u{3002}",
        ),
        (
            "blunt_explanation_template",
            "Blunt split explanation",
            vec!["\u{4e0d}\u{662f}\u{5f62}\u{5bb9}", "\u{4e0d}\u{662f}\u{6bd4}\u{55bb}", "\u{4e0d}\u{662f}\u{9519}\u{89c9}", "\u{662f}\u{771f}\u{7684}"],
            vec!["\u{4e0d}\u{662f}\u{5f62}\u{5bb9}\u{3002}\u{662f}\u{771f}\u{7684}\u{4e09}\u{4e2a}\u{3002}", "\u{4e0d}\u{662f}\u{6bd4}\u{55bb}\u{3002}\u{662f}\u{771f}\u{7684}\u{3002}"],
            "\u{907f}\u{514d}\u{201c}\u{4e0d}\u{662f}\u{5f62}\u{5bb9}\u{3002}\u{662f}\u{771f}\u{7684}\u{2026}\u{2026}\u{201d}\u{8fd9}\u{7c7b}\u{65ad}\u{53e5}\u{5f0f}\u{89e3}\u{91ca}\u{ff0c}\u{6539}\u{7528}\u{4eba}\u{7269}\u{53cd}\u{5e94}\u{3001}\u{52a8}\u{4f5c}\u{505c}\u{987f}\u{3001}\u{89c6}\u{89c9}\u{53d8}\u{5316}\u{6216}\u{5bf9}\u{8bdd}\u{8282}\u{594f}\u{4f53}\u{73b0}\u{3002}",
        ),
        (
            "body_language",
            "Generic body language",
            vec!["\u{770b}\u{4e86}\u{4e00}\u{773c}", "\u{770b}\u{4e86}\u{51e0}\u{79d2}", "\u{4f4e}\u{5934}\u{770b}\u{4e86}\u{770b}\u{81ea}\u{5df1}\u{7684}\u{624b}", "\u{5fae}\u{5fae}\u{4e00}\u{6014}", "\u{76b1}\u{7709}", "\u{6c89}\u{9ed8}"],
            vec!["\u{8ba4}\u{771f}\u{770b}\u{4e86}\u{5979}\u{51e0}\u{79d2}\u{3002}", "\u{770b}\u{4e86}\u{5979}\u{4e00}\u{773c}\u{3002}", "\u{4f4e}\u{5934}\u{770b}\u{4e86}\u{770b}\u{81ea}\u{5df1}\u{7684}\u{624b}\u{3002}"],
            "\u{4eba}\u{7269}\u{52a8}\u{4f5c}\u{8981}\u{7b26}\u{5408}\u{6027}\u{683c}\u{3001}\u{8eab}\u{4efd}\u{3001}\u{5173}\u{7cfb}\u{548c}\u{5f53}\u{524d}\u{60c5}\u{7eea}\u{ff0c}\u{4e0d}\u{8981}\u{5168}\u{5458}\u{5171}\u{7528}\u{901a}\u{7528}\u{52a8}\u{4f5c}\u{6a21}\u{677f}\u{3002}",
        ),
        (
            "dialogue_template",
            "Manual-like dialogue",
            vec!["\u{4f60}\u{77e5}\u{9053}\u{5417}", "\u{4e5f}\u{5c31}\u{662f}\u{8bf4}", "\u{6362}\u{53e5}\u{8bdd}\u{8bf4}", "\u{8fd9}\u{4e2a}\u{4e16}\u{754c}", "\u{7b49}\u{7ea7}\u{5206}\u{4e3a}", "\u{539f}\u{6765}\u{5982}\u{6b64}"],
            vec!["\u{8fd9}\u{4e2a}\u{4e16}\u{754c}\u{7684}\u{9b54}\u{5973}\u{7b49}\u{7ea7}\u{5206}\u{4e3a} E \u{5230} S \u{7ea7}\u{3002}", "\u{4e5f}\u{5c31}\u{662f}\u{8bf4}\u{ff0c}\u{4f60}\u{73b0}\u{5728}\u{662f} D \u{7ea7}\u{9b54}\u{5973}\u{3002}"],
            "\u{4e0d}\u{8981}\u{8ba9}\u{5bf9}\u{8bdd}\u{53d8}\u{6210}\u{8bf4}\u{660e}\u{4e66}\u{5f0f}\u{95ee}\u{7b54}\u{ff0c}\u{7528}\u{6253}\u{65ad}\u{3001}\u{8bef}\u{89e3}\u{3001}\u{505c}\u{987f}\u{3001}\u{53cd}\u{5e94}\u{3001}\u{73a9}\u{7b11}\u{6216}\u{8bd5}\u{63a2}\u{5e26}\u{51fa}\u{8bbe}\u{5b9a}\u{3002}",
        ),
        (
            "light_action_template",
            "Light action template",
            vec!["\u{628a}\u{58f0}\u{97f3}\u{538b}\u{5f97}\u{5f88}\u{8f7b}", "\u{628a}\u{8bed}\u{6c14}\u{653e}\u{5f97}\u{5f88}\u{8f7b}", "\u{628a}\u{52a8}\u{4f5c}\u{505a}\u{5f97}\u{5f88}\u{8f7b}"],
            vec!["\u{5979}\u{628a}\u{58f0}\u{97f3}\u{538b}\u{5f97}\u{5f88}\u{8f7b}\u{3002}"],
            "\u{907f}\u{514d}\u{201c}\u{628a}\u{58f0}\u{97f3}\u{538b}\u{5f97}\u{5f88}\u{8f7b}\u{201d}\u{8fd9}\u{7c7b}\u{6a21}\u{677f}\u{8868}\u{8fbe}\u{ff0c}\u{6539}\u{7528}\u{5177}\u{4f53}\u{52a8}\u{4f5c}\u{3001}\u{5c3e}\u{97f3}\u{3001}\u{8ddd}\u{79bb}\u{6216}\u{4eba}\u{7269}\u{53cd}\u{5e94}\u{4f53}\u{73b0}\u{8f7b}\u{5fae}\u{7a0b}\u{5ea6}\u{3002}",
        ),
        (
            "object_description_template",
            "Object description template",
            vec!["\u{5916}\u{58f3}", "\u{6cd5}\u{9635}", "\u{5bfc}\u{7ba1}", "\u{6db2}\u{4f53}", "\u{673a}\u{68b0}\u{81c2}", "\u{8f7b}\u{8f7b}\u{6643}\u{52a8}", "\u{9759}\u{9759}\u{8eba}\u{7740}"],
            vec!["\u{94f6}\u{767d}\u{8272}\u{957f}\u{7bb1}\u{7684}\u{5916}\u{58f3}\u{3001}\u{6cd5}\u{9635}\u{3001}\u{5bfc}\u{7ba1}\u{3001}\u{6db2}\u{4f53}\u{548c}\u{673a}\u{68b0}\u{81c2}\u{4f9d}\u{6b21}\u{5c55}\u{5f00}\u{3002}", "\u{90a3}\u{662f}\u{4e00}\u{679a}\u{94f6}\u{8272}\u{5fbd}\u{7ae0}\u{ff0c}\u{8fb9}\u{7f18}\u{523b}\u{7740}\u{82b1}\u{7eb9}\u{ff0c}\u{5728}\u{706f}\u{5149}\u{4e0b}\u{8f7b}\u{8f7b}\u{6643}\u{52a8}\u{3002}"],
            "\u{907f}\u{514d}\u{91cd}\u{590d}\u{7f57}\u{5217}\u{7269}\u{54c1}\u{5916}\u{89c2}\u{ff0c}\u{8ba9}\u{7269}\u{54c1}\u{901a}\u{8fc7}\u{4eba}\u{7269}\u{53cd}\u{5e94}\u{3001}\u{4f7f}\u{7528}\u{65b9}\u{5f0f}\u{3001}\u{89e6}\u{611f}\u{3001}\u{91cd}\u{91cf}\u{3001}\u{529f}\u{80fd}\u{6216}\u{5267}\u{60c5}\u{4f5c}\u{7528}\u{8fdb}\u{5165}\u{6587}\u{672c}\u{3002}",
        ),
        (
            "metaphor_overuse",
            "Metaphor overuse",
            vec!["\u{50cf}", "\u{4eff}\u{4f5b}", "\u{597d}\u{4f3c}", "\u{5b9b}\u{5982}"],
            vec!["\u{8fde}\u{7eed}\u{4e24}\u{4e2a}\u{4ee5}\u{4e0a}\u{6bd4}\u{55bb}\u{53e5}\u{5806}\u{53e0}\u{3002}"],
            "\u{5c3d}\u{91cf}\u{5c11}\u{7528}\u{6bd4}\u{55bb}\u{ff0c}\u{591a}\u{7528}\u{767d}\u{63cf}\u{3001}\u{52a8}\u{4f5c}\u{3001}\u{73af}\u{5883}\u{7ec6}\u{8282}\u{548c}\u{4eba}\u{7269}\u{53cd}\u{5e94}\u{3002}",
        ),
        (
            "ending_overextension",
            "Ending overextension",
            vec!["\u{547d}\u{8fd0}", "\u{8fd9}\u{53ea}\u{662f}\u{5f00}\u{59cb}", "\u{4e00}\u{5207}\u{90fd}\u{5c06}\u{4e0d}\u{540c}", "\u{8fd9}\u{610f}\u{5473}\u{7740}"],
            vec!["\u{5979}\u{8fd8}\u{4e0d}\u{77e5}\u{9053}\u{ff0c}\u{8fd9}\u{53ea}\u{662f}\u{5f00}\u{59cb}\u{3002}", "\u{4ece}\u{8fd9}\u{4e00}\u{523b}\u{8d77}\u{ff0c}\u{4e00}\u{5207}\u{90fd}\u{5c06}\u{4e0d}\u{540c}\u{3002}"],
            "\u{4e0d}\u{8981}\u{64c5}\u{81ea}\u{6269}\u{5199}\u{3001}\u{603b}\u{7ed3}\u{3001}\u{5347}\u{534e}\u{6216}\u{9884}\u{544a}\u{6545}\u{4e8b}\u{672b}\u{5c3e}\u{53d1}\u{5c55}\u{ff0c}\u{53ea}\u{6da6}\u{8272}\u{7528}\u{6237}\u{63d0}\u{4f9b}\u{7684}\u{6587}\u{672c}\u{3002}",
        ),
        (
            "wording_template",
            "Abstract wording",
            vec!["\u{5f88}\u{6f02}\u{4eae}", "\u{5f88}\u{538b}\u{6291}", "\u{5f88}\u{6124}\u{6012}", "\u{5f88}\u{7d27}\u{5f20}", "\u{67d0}\u{79cd}", "\u{5206}\u{660e}"],
            vec!["\u{5979}\u{5f88}\u{6f02}\u{4eae}\u{3002}", "\u{6c14}\u{6c1b}\u{5f88}\u{538b}\u{6291}\u{3002}"],
            "\u{5c11}\u{7528}\u{786e}\u{5b9a}\u{6027}\u{5f62}\u{5bb9}\u{8bcd}\u{548c}\u{62bd}\u{8c61}\u{8bcd}\u{ff0c}\u{591a}\u{7528}\u{5177}\u{4f53}\u{52a8}\u{4f5c}\u{3001}\u{4e94}\u{5b98}\u{3001}\u{4ed6}\u{4eba}\u{53cd}\u{5e94}\u{3001}\u{7269}\u{54c1}\u{7ec6}\u{8282}\u{548c}\u{573a}\u{666f}\u{53d8}\u{5316}\u{8868}\u{73b0}\u{3002}",
        ),
    ]
}

fn count_project_rows(connection: &Connection, table: &str, project_id: &str) -> Result<i64, String> {
    connection
        .query_row(&format!("SELECT COUNT(*) FROM {table} WHERE project_id = ?1"), params![project_id], |row| row.get(0))
        .map_err(|error| error.to_string())
}

fn count_all_rows(connection: &Connection, table: &str) -> Result<i64, String> {
    connection
        .query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |row| row.get(0))
        .map_err(|error| error.to_string())
}

fn bool_to_int(value: bool) -> i64 {
    if value { 1 } else { 0 }
}

fn normalize_severity(value: &str) -> String {
    match value {
        "high" | "medium" | "low" => value.to_string(),
        _ => "medium".to_string(),
    }
}

fn normalize_pattern_type(value: &str) -> String {
    match value {
        "ai_taste" | "structure_template" | "wording_template" | "dialogue_template"
        | "object_description_template" | "metaphor_overuse" | "repeated_emphasis"
        | "blunt_explanation_template" | "body_language"
        | "dialogue_interaction" | "ai_wording_template" | "light_action_template"
        | "ending_overextension" | "negation_pattern" | "custom" => value.to_string(),
        "ai_negation_pattern" => "negation_pattern".to_string(),
        "repeated_emphasis_template" => "repeated_emphasis".to_string(),
        _ => "custom".to_string(),
    }
}

fn trim_examples(values: Vec<String>) -> Vec<String> {
    values
        .into_iter()
        .map(|value| truncate_text(&value, 120))
        .filter(|value| !value.trim().is_empty())
        .take(8)
        .collect()
}

fn truncate_text(value: &str, limit: usize) -> String {
    value.chars().take(limit).collect()
}

fn style_category_from_row(row: &Row<'_>) -> rusqlite::Result<StyleCorpusCategory> {
    Ok(StyleCorpusCategory {
        id: row.get(0)?,
        name: row.get(1)?,
        description: row.get(2)?,
        created_at: row.get(3)?,
        updated_at: row.get(4)?,
    })
}

fn style_work_from_row(row: &Row<'_>) -> rusqlite::Result<StyleCorpusWork> {
    Ok(StyleCorpusWork {
        id: row.get(0)?,
        category_id: row.get(1)?,
        title: row.get(2)?,
        author: row.get(3)?,
        era: row.get(4)?,
        region: row.get(5)?,
        copyright_status: row.get(6)?,
        allow_direct_quote: row.get::<_, i64>(7)? != 0,
        style_tags: row.get(8)?,
        theme_tags: row.get(9)?,
        image_tags: row.get(10)?,
        usage_note: row.get(11)?,
        is_builtin: row.get::<_, i64>(12)? != 0,
        is_hidden: row.get::<_, i64>(13)? != 0,
        created_at: row.get(14)?,
        updated_at: row.get(15)?,
    })
}

fn style_quote_from_row(row: &Row<'_>) -> rusqlite::Result<StyleCorpusQuote> {
    Ok(StyleCorpusQuote {
        id: row.get(0)?,
        work_id: row.get(1)?,
        original_text: row.get(2)?,
        source_title: row.get(3)?,
        author: row.get(4)?,
        modern_explanation: row.get(5)?,
        scene_tags: row.get(6)?,
        emotion_tags: row.get(7)?,
        image_tags: row.get(8)?,
        usage_suggestion: row.get(9)?,
        ai_rewrite_example: row.get(10)?,
        created_at: row.get(11)?,
        updated_at: row.get(12)?,
    })
}

fn list_style_categories(connection: &Connection) -> Result<Vec<StyleCorpusCategory>, String> {
    let mut statement = connection
        .prepare("SELECT id, name, description, created_at, updated_at FROM style_corpus_categories ORDER BY name")
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([], style_category_from_row)
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    Ok(rows)
}

fn list_style_works<P: Params>(connection: &Connection, sql: &str, params: P) -> Result<Vec<StyleCorpusWork>, String> {
    let mut statement = connection.prepare(sql).map_err(|error| error.to_string())?;
    let rows = statement
        .query_map(params, style_work_from_row)
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    Ok(rows)
}

fn list_style_quotes<P: Params>(connection: &Connection, sql: &str, params: P) -> Result<Vec<StyleCorpusQuote>, String> {
    let mut statement = connection.prepare(sql).map_err(|error| error.to_string())?;
    let rows = statement
        .query_map(params, style_quote_from_row)
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    Ok(rows)
}

fn seed_style_corpus(connection: &Connection) -> rusqlite::Result<()> {
    let count: i64 = connection.query_row("SELECT COUNT(*) FROM style_corpus_categories", [], |row| row.get(0))?;
    if count > 0 {
        return Ok(());
    }

    let categories = [
        ("cat-cn-poetry", "中国传统诗词", "唐诗、宋词、诗经等公共领域传统语料。"),
        ("cat-gothic", "哥特文学", "阴影、古堡、宗教感、压抑气氛等风格索引。"),
        ("cat-magic-realism", "魔幻现实主义", "仅提供现代作品的风格和主题标签，不提供原句。"),
        ("cat-modernism", "现代主义 / 意识流", "仅提供风格索引，不提供版权文本原句。"),
    ];
    for (id, name, description) in categories {
        connection.execute(
            "INSERT OR IGNORE INTO style_corpus_categories (id, name, description) VALUES (?1, ?2, ?3)",
            params![id, name, description],
        )?;
    }

    connection.execute(
        "INSERT OR IGNORE INTO style_corpus_works
         (id, category_id, title, author, era, region, copyright_status, allow_direct_quote, style_tags, theme_tags, image_tags, usage_note, is_builtin)
         VALUES
         ('work-maple-bridge', 'cat-cn-poetry', '枫桥夜泊', '张继', '唐', '中国', 'public_domain', 1, '[\"清冷\",\"夜色\",\"羁旅\"]', '[\"孤独\",\"旅途\",\"寒意\"]', '[\"月\",\"霜\",\"钟声\",\"江\"]', '适合夜晚、离别、梦醒、异乡感场景。', 1),
         ('work-one-hundred-years', 'cat-magic-realism', '百年孤独', '加西亚·马尔克斯', '现代', '拉丁美洲', 'copyrighted', 0, '[\"魔幻现实主义\",\"家族史诗\",\"荒诞\",\"循环叙事\"]', '[\"家族\",\"命运\",\"孤独\",\"记忆\"]', '[\"雨\",\"金色\",\"小镇\",\"预言\"]', '仅作魔幻现实主义、家族史诗和荒诞现实交织的风格参考，不提供原句。', 1),
         ('work-proust', 'cat-modernism', '追忆似水年华', '马塞尔·普鲁斯特', '现代', '法国', 'unknown', 0, '[\"意识流\",\"记忆书写\",\"细腻感知\",\"长句\"]', '[\"时间\",\"记忆\",\"失落\",\"感官经验\"]', '[\"气味\",\"光影\",\"下午\",\"房间\"]', '仅作记忆、感官经验和时间流动的风格参考，不提供原句。', 1),
         ('work-dracula', 'cat-gothic', '德古拉', '布拉姆·斯托克', '近代', '英国', 'public_domain', 0, '[\"哥特\",\"书信体\",\"阴影\",\"古堡\"]', '[\"恐惧\",\"欲望\",\"异域\"]', '[\"城堡\",\"雾\",\"血\",\"夜晚\"]', '可作为哥特氛围、吸血鬼意象和压抑节奏参考。', 1)",
        [],
    )?;
    connection.execute(
        "INSERT OR IGNORE INTO style_corpus_quotes
         (id, work_id, original_text, source_title, author, modern_explanation, scene_tags, emotion_tags, image_tags, usage_suggestion, ai_rewrite_example)
         VALUES
         ('quote-maple-bridge-1', 'work-maple-bridge', '月落乌啼霜满天', '枫桥夜泊', '张继', '营造夜色、寒意、孤独和旅途漂泊感。', '[\"夜晚\",\"旅途\",\"江边\"]', '[\"孤寂\",\"惆怅\"]', '[\"月\",\"霜\",\"乌啼\"]', '适合夜晚赶路、梦醒、离别和异乡感场景。', '月光沉到屋檐下，冷意顺着窗缝爬进来，远处的钟声一下一下敲得人睡不安稳。'),
         ('quote-maple-bridge-2', 'work-maple-bridge', '江枫渔火对愁眠', '枫桥夜泊', '张继', '用江边灯火与难眠状态表现漂泊和心事。', '[\"江边\",\"夜泊\",\"灯火\"]', '[\"愁绪\",\"失眠\"]', '[\"江枫\",\"渔火\"]', '适合主人公夜里停留、等待消息或心绪不宁。', '河岸边的灯火稀稀落落，她盯着那点红光，越看越清醒。')",
        [],
    )?;
    Ok(())
}

fn clean_title(value: &str, fallback: &str) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        fallback.to_string()
    } else {
        trimmed.to_string()
    }
}

fn clean_provider_strategy(value: &str, fallback: &str) -> String {
    match value.trim().to_lowercase().as_str() {
        "deepseek" => "deepseek".to_string(),
        "openai" => "openai".to_string(),
        _ => fallback.to_string(),
    }
}

fn clean_reasoning_effort(value: &str) -> String {
    match value {
        "max" => "max".to_string(),
        _ => "high".to_string(),
    }
}

fn clean_feature_strategy(value: &str, fallback: &str) -> String {
    match value.trim().to_lowercase().as_str() {
        "deepseek" => "deepseek".to_string(),
        "openai" => "openai".to_string(),
        "hybrid" => "hybrid".to_string(),
        _ => fallback.to_string(),
    }
}

fn default_ai_settings() -> AISettings {
    AISettings {
        provider: "DeepSeek".to_string(),
        api_key: String::new(),
        base_url: "https://api.deepseek.com".to_string(),
        model: "deepseek-v4-flash".to_string(),
        thinking_enabled: false,
        reasoning_effort: "high".to_string(),
        show_reasoning_content: false,
        openai_api_key: String::new(),
        openai_base_url: "https://api.openai.com/v1".to_string(),
        openai_model: "gpt-5.5".to_string(),
        enable_hybrid_ai: false,
        primary_provider: "deepseek".to_string(),
        review_provider: "openai".to_string(),
        primary_model: "deepseek-v4-flash".to_string(),
        review_model: "gpt-5.5".to_string(),
        enable_cross_review: true,
        max_revision_rounds: 1,
        feature_chapter_summary: "deepseek".to_string(),
        feature_outline_chunk_analysis: "deepseek".to_string(),
        feature_outline_reduce_merge: "deepseek".to_string(),
        feature_outline_final_merge: "openai".to_string(),
        feature_mindmap_generation: "deepseek".to_string(),
        feature_writing_style_analysis: "openai".to_string(),
        feature_chapter_polish: "hybrid".to_string(),
        default_analysis_mode: "simple".to_string(),
        simple_chunk_size: 5,
        detailed_chunk_size: 3,
        analysis_concurrency: 2,
        enable_chapter_cache: true,
        feature_outline_chunk_model: "deepseek-v4-flash".to_string(),
        feature_outline_final_model: "deepseek-v4-pro".to_string(),
        feature_review_model: "deepseek-v4-pro".to_string(),
        feature_pattern_memory_model: "deepseek-v4-pro".to_string(),
        feature_polish_model: "deepseek-v4-flash".to_string(),
    }
}

fn new_id(prefix: &str) -> String {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default();
    format!("{prefix}-{now}")
}

fn parse_docx_paragraphs(document_xml: &str) -> Result<Vec<String>, String> {
    let mut reader = Reader::from_str(document_xml);
    reader.trim_text(false);
    let mut buffer = Vec::new();
    let mut paragraphs = Vec::new();
    let mut current = String::new();
    let mut in_paragraph = false;

    loop {
        match reader.read_event_into(&mut buffer) {
            Ok(Event::Start(event)) => match event.name().as_ref() {
                b"w:p" => {
                    in_paragraph = true;
                    current.clear();
                }
                b"w:tab" if in_paragraph => current.push('\t'),
                b"w:br" if in_paragraph => current.push('\n'),
                _ => {}
            },
            Ok(Event::Empty(event)) => match event.name().as_ref() {
                b"w:tab" if in_paragraph => current.push('\t'),
                b"w:br" if in_paragraph => current.push('\n'),
                _ => {}
            },
            Ok(Event::Text(text)) if in_paragraph => {
                current.push_str(&text.unescape().map_err(|error| format!("parse docx text failed: {error}"))?);
            }
            Ok(Event::End(event)) if event.name().as_ref() == b"w:p" => {
                paragraphs.push(current.trim().to_string());
                current.clear();
                in_paragraph = false;
            }
            Ok(Event::Eof) => break,
            Err(error) => return Err(format!("parse docx xml failed: {error}")),
            _ => {}
        }
        buffer.clear();
    }
    Ok(paragraphs)
}

fn build_docx(volumes: &[ExportVolumeDraft]) -> Result<Vec<u8>, String> {
    let cursor = Cursor::new(Vec::new());
    let mut zip = ZipWriter::new(cursor);
    let options = FileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    zip.start_file("[Content_Types].xml", options).map_err(|error| error.to_string())?;
    zip.write_all(CONTENT_TYPES_XML.as_bytes()).map_err(|error| error.to_string())?;
    zip.add_directory("_rels/", options).map_err(|error| error.to_string())?;
    zip.start_file("_rels/.rels", options).map_err(|error| error.to_string())?;
    zip.write_all(RELS_XML.as_bytes()).map_err(|error| error.to_string())?;
    zip.add_directory("word/", options).map_err(|error| error.to_string())?;
    zip.start_file("word/document.xml", options).map_err(|error| error.to_string())?;
    zip.write_all(build_document_xml(volumes).as_bytes()).map_err(|error| error.to_string())?;
    zip.add_directory("word/_rels/", options).map_err(|error| error.to_string())?;
    zip.start_file("word/_rels/document.xml.rels", options).map_err(|error| error.to_string())?;
    zip.write_all(DOCUMENT_RELS_XML.as_bytes()).map_err(|error| error.to_string())?;
    zip.start_file("word/styles.xml", options).map_err(|error| error.to_string())?;
    zip.write_all(STYLES_XML.as_bytes()).map_err(|error| error.to_string())?;
    zip.finish().map(|cursor| cursor.into_inner()).map_err(|error| error.to_string())
}

fn build_document_xml(volumes: &[ExportVolumeDraft]) -> String {
    let mut body = String::new();
    for volume in volumes {
        body.push_str(&heading_paragraph(&volume.title, "Heading1"));
        for chapter in &volume.chapters {
            body.push_str(&heading_paragraph(&chapter.title, "Heading2"));
            for paragraph in chapter.content.replace("\r\n", "\n").replace('\r', "\n").split('\n') {
                body.push_str(&text_paragraph(paragraph));
            }
        }
    }
    format!(
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>{body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body>
</w:document>"#
    )
}

fn heading_paragraph(text: &str, style: &str) -> String {
    format!(
        r#"<w:p><w:pPr><w:pStyle w:val="{style}"/></w:pPr><w:r><w:t>{}</w:t></w:r></w:p>"#,
        escape_xml(text)
    )
}

fn text_paragraph(text: &str) -> String {
    format!(r#"<w:p><w:r><w:t>{}</w:t></w:r></w:p>"#, escape_xml(text))
}

fn escape_xml(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

const CONTENT_TYPES_XML: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>"#;

const RELS_XML: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>"#;

const DOCUMENT_RELS_XML: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>"#;

const STYLES_XML: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:uiPriority w:val="9"/><w:qFormat/></w:style>
  <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:uiPriority w:val="9"/><w:qFormat/></w:style>
</w:styles>"#;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            initialize_database(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app_status,
            list_projects,
            create_project,
            update_project,
            delete_project,
            read_image_data_url,
            get_ai_settings,
            save_ai_settings,
            read_prompt_file,
            save_ai_debug_log,
            create_ai_task,
            finish_ai_task,
            log_ai_usage,
            get_chapter_ai_cache,
            save_chapter_ai_cache,
            save_chapter_summary,
            list_writing_style_profiles,
            save_writing_style_profile,
            list_corpus_style_profiles,
            get_corpus_style_profile_state,
            delete_corpus_style_profile,
            save_corpus_style_profile,
            replace_style_retrieval_snippets,
            list_style_retrieval_snippets,
            save_chapter_version,
            search_style_corpus,
            recommend_style_corpus,
            get_editor_state,
            get_outline_state,
            save_outline_text_section,
            create_outline_mind_node,
            update_outline_mind_node,
            create_outline_mind_edge,
            update_outline_mind_edge,
            delete_outline_mind_edge,
            delete_outline_mind_node,
            clear_outline_mind_map,
            get_memory_library_stats,
            clear_outline_memory,
            clear_writing_style_memory,
            list_ai_pattern_memory,
            save_ai_pattern_memory,
            set_ai_pattern_active,
            delete_ai_pattern_memory,
            clear_ai_pattern_memory,
            reset_builtin_ai_patterns,
            upsert_ai_patterns_from_review,
            create_volume,
            create_chapter,
            create_import_volume,
            create_volume_with_title,
            rename_volume,
            rename_chapter,
            save_chapter_content,
            delete_selected_items,
            read_text_file,
            write_text_file,
            write_binary_file,
            read_docx_file,
            write_docx_file,
            import_chapters
        ])
        .run(tauri::generate_context!())
        .expect("error while running Novel Memory Engine");
}
