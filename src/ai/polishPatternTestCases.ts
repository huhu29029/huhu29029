export const polishPatternTestCases = [
  {
    expectedType: "repeated_emphasis_template",
    text: "重点班。又是重点班。"
  },
  {
    expectedType: "repeated_emphasis_template",
    text: "老奸巨猾。非常老奸巨猾。"
  },
  {
    expectedType: "blunt_explanation_template",
    text: "不是形容。是真的三个。"
  },
  {
    expectedType: "negation_pattern",
    text: "不是睡两小时，而是直接开三个号。"
  }
] as const;
