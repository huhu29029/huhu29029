export const aiPatternTypeLabels: Record<string, string> = {
  all: "全部",
  ai_taste: "AI 味",
  structure_template: "结构模板",
  wording_template: "措辞模板",
  dialogue_template: "对话模板",
  object_description_template: "物品描写模板",
  metaphor_overuse: "过度比喻",
  repeated_emphasis: "重复强调",
  repeated_emphasis_template: "重复强调模板",
  light_action_template: "轻动作模板",
  ending_overextension: "结尾升华/预告",
  negation_pattern: "先否定再肯定",
  ai_negation_pattern: "AI 否定句式",
  blunt_explanation_template: "断句式解释",
  body_language: "肢体语言",
  description_specificity: "具体描写不足",
  dialogue_interaction: "对话互动不足",
  scene_camera: "景物镜头感",
  ai_wording_template: "AI 高频词",
  custom: "自定义"
};

export function aiPatternTypeLabel(type: string) {
  return aiPatternTypeLabels[type] ?? type;
}
