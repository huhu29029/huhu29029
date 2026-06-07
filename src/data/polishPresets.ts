export type PolishPreset = {
  label: string;
  value: string;
  description: string;
  promptInstruction: string;
  focus: string[];
  avoid: string[];
};

export const polishPresets = [
  {
    label: "基础叙事优化",
    value: "basic_narrative",
    description: "减少空泛形容词，增加具体动作、人物互动、环境细节和肢体语言连贯性。",
    promptInstruction:
      "请重点优化基础叙事质量。少用“漂亮、压抑、紧张、愤怒”等确定性形容词，多用具体动作、人物反应、五官细节、物品变化和环境互动来表现。对话中加入符合人物性格的小动作、停顿、插话和互动，不要让角色干念设定。景物描写要动静结合，有镜头感，不要罗列。人物动作要连贯，避免重复使用皱眉、沉默、抬眼、攥拳、微微一怔等模板动作。",
    focus: ["具体描写", "动作连贯", "对话互动", "景物镜头感"],
    avoid: ["空泛形容词", "说明文式设定解释", "动作模板", "景物罗列"]
  },
  {
    label: "保持原风格",
    value: "keep_style",
    description: "尽量保留原文语气、节奏、吐槽方式和人物口吻，只做轻度语言清理。",
    promptInstruction:
      "请尽量保持原文风格，不要大幅重写。只修正拗口、重复、节奏不顺、表达不清的地方。保留原文喜剧梗、吐槽、人物互动、句式节奏和对白内容。不要把文本改成更“文学化”或更“AI化”的表达。",
    focus: ["保留原风格", "轻度润色", "修正不顺", "保留梗点"],
    avoid: ["大幅重写", "改变语气", "文艺化", "过度扩写"]
  },
  {
    label: "更流畅",
    value: "smoother",
    description: "改善句子衔接和段落节奏，让阅读更顺，但不明显改变风格。",
    promptInstruction:
      "请优化句子衔接、段落节奏和语序，让文本读起来更顺。重点处理重复、断裂、拗口、逻辑跳跃的句子。不要大幅改写剧情，不要添加新设定，不要改变人物关系。保留原文口吻和主要表达。",
    focus: ["句子衔接", "段落节奏", "语序自然", "减少卡顿"],
    avoid: ["重写全文", "过度文艺", "改变人设", "无意义扩写"]
  },
  {
    label: "更有画面感",
    value: "visual",
    description: "增强场景、动作和感官细节，让画面更清楚。",
    promptInstruction:
      "请增强画面感。优先通过角色动作、视线移动、空间关系、声音、物品变化和环境细节来呈现场景。不要简单堆砌形容词或罗列景物。不要连续使用比喻。景物必须服务人物情绪或剧情推进。",
    focus: ["场景画面", "角色动作", "空间关系", "感官细节"],
    avoid: ["景物清单", "连续比喻", "抽象情绪词", "机械镜头语言"]
  },
  {
    label: "更符合网文节奏",
    value: "webnovel_pacing",
    description: "增强节奏、爽点、吐槽和段落推进，让文本更适合网文阅读。",
    promptInstruction:
      "请让文本更符合网文阅读节奏。保留并强化原文的吐槽、反差、爽点、段落推进和读者期待。句子不要过度书面化。冲突、转折和笑点要更清晰，但不要直接解释笑点。不要把文本改成散文腔。",
    focus: ["节奏推进", "吐槽感", "爽点", "反差"],
    avoid: ["散文化", "说明文", "笑点解释", "节奏拖慢"]
  },
  {
    label: "增强人物对白",
    value: "dialogue",
    description: "重点优化人物对话，让台词更自然、更符合性格，减少说明书式对白。",
    promptInstruction:
      "请重点优化人物对白。对话要有互动、停顿、插话、误解、反问和情绪起伏。不要让角色像在朗读设定。每个人的小动作和说话方式要符合其性格、身份和关系。保留原有对话含义，不要改掉关键信息。",
    focus: ["对话自然", "人物口吻", "互动关系", "情绪变化"],
    avoid: ["干念设定", "一问一答", "机械补神态", "全员同一语气"]
  },
  {
    label: "减少 AI 味",
    value: "reduce_ai_taste",
    description: "重点消除 AI 模板句、套路动作、过度比喻、结尾升华和机械化表达。",
    promptInstruction:
      "请重点减少 AI 味。避免“不是……而是……”“X。太X了。”“把声音压得很轻”“命运的齿轮开始转动”“这只是开始”等模板句。减少悄然、分明、仿佛、似乎、某种、静静地、轻轻地等高频 AI 词。少用比喻，多用白描、动作、环境和人物反应。不要擅自扩写结尾或升华主题。",
    focus: ["反模板", "白描", "具体动作", "去 AI 味"],
    avoid: ["模板句", "过度比喻", "结尾升华", "高频 AI 虚词"]
  },
  {
    label: "自定义",
    value: "custom",
    description: "使用用户输入的自定义要求。",
    promptInstruction:
      "使用用户自定义要求进行润色。仍然必须遵守不改变剧情、不改变人物关系、不新增重大设定、不自动续写的基本规则。",
    focus: ["用户自定义"],
    avoid: ["违背基础安全规则"]
  }
] as const satisfies readonly PolishPreset[];

export type PolishPresetValue = (typeof polishPresets)[number]["value"];

export function getPolishPreset(value: string) {
  return polishPresets.find((preset) => preset.value === value) ?? polishPresets[0];
}
