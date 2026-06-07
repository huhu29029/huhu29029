PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Fantasy',
  description TEXT,
  cover_path TEXT,
  source_path TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_edited_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS volumes (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS chapters (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  volume_id TEXT,
  title TEXT NOT NULL,
  chapter_index INTEGER NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  content TEXT NOT NULL DEFAULT '',
  word_count INTEGER NOT NULL DEFAULT 0,
  imported_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (volume_id) REFERENCES volumes(id) ON DELETE CASCADE,
  UNIQUE (project_id, chapter_index)
);

CREATE TABLE IF NOT EXISTS chapter_summaries (
  id TEXT PRIMARY KEY,
  chapter_id TEXT NOT NULL,
  summary_text TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  key_events TEXT NOT NULL DEFAULT '[]',
  generated_by TEXT NOT NULL DEFAULT 'manual',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ai_settings (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  api_key TEXT NOT NULL DEFAULT '',
  base_url TEXT NOT NULL DEFAULT 'https://api.deepseek.com',
  model TEXT NOT NULL DEFAULT 'deepseek-v4-flash',
  thinking_enabled INTEGER NOT NULL DEFAULT 0,
  reasoning_effort TEXT NOT NULL DEFAULT 'high',
  show_reasoning_content INTEGER NOT NULL DEFAULT 0,
  openai_api_key TEXT NOT NULL DEFAULT '',
  openai_base_url TEXT NOT NULL DEFAULT 'https://api.openai.com/v1',
  openai_model TEXT NOT NULL DEFAULT 'gpt-5.5',
  enable_hybrid_ai INTEGER NOT NULL DEFAULT 0,
  primary_provider TEXT NOT NULL DEFAULT 'deepseek',
  review_provider TEXT NOT NULL DEFAULT 'openai',
  primary_model TEXT NOT NULL DEFAULT 'deepseek-v4-flash',
  review_model TEXT NOT NULL DEFAULT 'gpt-5.5',
  enable_cross_review INTEGER NOT NULL DEFAULT 1,
  max_revision_rounds INTEGER NOT NULL DEFAULT 1,
  feature_chapter_summary TEXT NOT NULL DEFAULT 'deepseek',
  feature_outline_chunk_analysis TEXT NOT NULL DEFAULT 'deepseek',
  feature_outline_reduce_merge TEXT NOT NULL DEFAULT 'deepseek',
  feature_outline_final_merge TEXT NOT NULL DEFAULT 'openai',
  feature_mindmap_generation TEXT NOT NULL DEFAULT 'deepseek',
  feature_writing_style_analysis TEXT NOT NULL DEFAULT 'openai',
  feature_chapter_polish TEXT NOT NULL DEFAULT 'hybrid',
  default_analysis_mode TEXT NOT NULL DEFAULT 'simple',
  simple_chunk_size INTEGER NOT NULL DEFAULT 5,
  detailed_chunk_size INTEGER NOT NULL DEFAULT 3,
  analysis_concurrency INTEGER NOT NULL DEFAULT 2,
  enable_chapter_cache INTEGER NOT NULL DEFAULT 1,
  feature_outline_chunk_model TEXT NOT NULL DEFAULT 'deepseek-v4-flash',
  feature_outline_final_model TEXT NOT NULL DEFAULT 'deepseek-v4-pro',
  feature_review_model TEXT NOT NULL DEFAULT 'deepseek-v4-pro',
  feature_pattern_memory_model TEXT NOT NULL DEFAULT 'deepseek-v4-pro',
  feature_polish_model TEXT NOT NULL DEFAULT 'deepseek-v4-flash',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS chapter_ai_cache (
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
);

CREATE TABLE IF NOT EXISTS writing_style_profiles (
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
);

CREATE TABLE IF NOT EXISTS corpus_style_profiles (
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
);

CREATE TABLE IF NOT EXISTS corpus_style_dimensions (
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
);

CREATE TABLE IF NOT EXISTS corpus_style_examples (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  dimension_type TEXT NOT NULL,
  original_excerpt TEXT NOT NULL DEFAULT '',
  analysis_note TEXT NOT NULL DEFAULT '',
  usage_rule TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (profile_id) REFERENCES corpus_style_profiles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS style_retrieval_snippets (
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
);

CREATE TABLE IF NOT EXISTS chapter_versions (
  id TEXT PRIMARY KEY,
  chapter_id TEXT NOT NULL,
  version_type TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  note TEXT,
  FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS style_corpus_categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS style_corpus_works (
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
);

CREATE TABLE IF NOT EXISTS style_corpus_quotes (
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
);

CREATE TABLE IF NOT EXISTS ai_usage_logs (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  feature_name TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  estimated_cost REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS ai_tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  task_type TEXT NOT NULL,
  status TEXT NOT NULL,
  input_text TEXT NOT NULL DEFAULT '',
  output_text TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at TEXT,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS ai_pattern_memory (
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
);

CREATE TABLE IF NOT EXISTS global_outlines (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT 'Global Outline',
  content TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS characters (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  aliases TEXT NOT NULL DEFAULT '[]',
  role TEXT,
  current_state TEXT NOT NULL DEFAULT 'unknown',
  first_seen_chapter_id TEXT,
  last_seen_chapter_id TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (first_seen_chapter_id) REFERENCES chapters(id) ON DELETE SET NULL,
  FOREIGN KEY (last_seen_chapter_id) REFERENCES chapters(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS plot_threads (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  start_chapter_id TEXT,
  end_chapter_id TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (start_chapter_id) REFERENCES chapters(id) ON DELETE SET NULL,
  FOREIGN KEY (end_chapter_id) REFERENCES chapters(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS foreshadowing (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  chapter_id TEXT,
  plot_thread_id TEXT,
  title TEXT NOT NULL,
  setup_note TEXT NOT NULL DEFAULT '',
  payoff_note TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE SET NULL,
  FOREIGN KEY (plot_thread_id) REFERENCES plot_threads(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS consistency_issues (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  chapter_id TEXT,
  character_id TEXT,
  plot_thread_id TEXT,
  issue_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium',
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TEXT,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE SET NULL,
  FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE SET NULL,
  FOREIGN KEY (plot_thread_id) REFERENCES plot_threads(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS outline_text_sections (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  section_type TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  UNIQUE (project_id, section_type)
);

CREATE TABLE IF NOT EXISTS outline_mind_nodes (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  node_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  x REAL NOT NULL DEFAULT 120,
  y REAL NOT NULL DEFAULT 120,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS outline_mind_edges (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  source_node_id TEXT NOT NULL,
  target_node_id TEXT NOT NULL,
  edge_type TEXT NOT NULL DEFAULT 'related',
  label TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (source_node_id) REFERENCES outline_mind_nodes(id) ON DELETE CASCADE,
  FOREIGN KEY (target_node_id) REFERENCES outline_mind_nodes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_chapters_project_id ON chapters(project_id);
CREATE INDEX IF NOT EXISTS idx_volumes_project_id ON volumes(project_id);
CREATE INDEX IF NOT EXISTS idx_chapter_summaries_chapter_id ON chapter_summaries(chapter_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_project_id ON ai_usage_logs(project_id);
CREATE INDEX IF NOT EXISTS idx_ai_tasks_project_id ON ai_tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_ai_pattern_memory_project_id ON ai_pattern_memory(project_id);
CREATE INDEX IF NOT EXISTS idx_chapter_ai_cache_lookup ON chapter_ai_cache(project_id, chapter_id, content_hash, model, prompt_version, analysis_mode);
CREATE INDEX IF NOT EXISTS idx_writing_style_profiles_project_id ON writing_style_profiles(project_id);
CREATE INDEX IF NOT EXISTS idx_corpus_style_profiles_project_id ON corpus_style_profiles(project_id);
CREATE INDEX IF NOT EXISTS idx_corpus_style_dimensions_profile_id ON corpus_style_dimensions(profile_id);
CREATE INDEX IF NOT EXISTS idx_corpus_style_examples_profile_id ON corpus_style_examples(profile_id);
CREATE INDEX IF NOT EXISTS idx_style_retrieval_snippets_project_id ON style_retrieval_snippets(project_id);
CREATE INDEX IF NOT EXISTS idx_style_retrieval_snippets_dimension ON style_retrieval_snippets(project_id, dimension_type);
CREATE INDEX IF NOT EXISTS idx_chapter_versions_chapter_id ON chapter_versions(chapter_id);
CREATE INDEX IF NOT EXISTS idx_style_corpus_works_category_id ON style_corpus_works(category_id);
CREATE INDEX IF NOT EXISTS idx_style_corpus_quotes_work_id ON style_corpus_quotes(work_id);
CREATE INDEX IF NOT EXISTS idx_characters_project_id ON characters(project_id);
CREATE INDEX IF NOT EXISTS idx_plot_threads_project_id ON plot_threads(project_id);
CREATE INDEX IF NOT EXISTS idx_foreshadowing_project_id ON foreshadowing(project_id);
CREATE INDEX IF NOT EXISTS idx_consistency_issues_project_id ON consistency_issues(project_id);
CREATE INDEX IF NOT EXISTS idx_outline_text_sections_project_id ON outline_text_sections(project_id);
CREATE INDEX IF NOT EXISTS idx_outline_mind_nodes_project_id ON outline_mind_nodes(project_id);
CREATE INDEX IF NOT EXISTS idx_outline_mind_edges_project_id ON outline_mind_edges(project_id);

