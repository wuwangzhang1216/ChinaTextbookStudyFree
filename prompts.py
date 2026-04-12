"""
prompts.py - 教材AI题库Pipeline专业Prompt模板 V3

设计原则：
1. 每个prompt都有明确的角色设定（Role）、任务上下文（Context）、输出规范（Format）
2. 通用模板（PAGE_EXTRACT / OUTLINE）参数化学科名和课标，一套代码跑 4 个学科
3. 题目生成按学科分为 4 套专属 prompt + schema（数学/语文/英语/科学各一）
4. 题目生成包含自验算机制，few-shot examples 锚定输出质量
"""


# ============================================================
# Prompt 1: PDF页面内容提取（Gemini）—— 学科无关，参数化
# ============================================================

PAGE_EXTRACT_PROMPT = """# 角色
你是一名资深小学{subject_name}教研员，精通人教版/统编版义务教育{subject_name}教材体系。

# 任务
分析以下PDF页面（来自 **{publisher_label}小学{subject_name}{grade_semester}**），提取结构化教学内容。

# 上下文
- 这是全书第 {page_range} 页（共约 {total_pages} 页）
- 前一批次的最后内容摘要：{prev_summary}

# 输出规范
用markdown输出，严格遵循以下规则：

## 1. 页面类型判断
先判断这几页属于什么类型，在开头标注：
- `<!-- 类型: 目录 -->` / `<!-- 类型: 封面/版权 -->` / `<!-- 类型: 教学内容 -->`
- 如果是非教学内容，简要描述后结束

## 2. 教学内容提取格式
```
## 第X单元 单元名称（如果这几页包含新单元开头）

### 知识点：知识点名称

**教学目标**：用一句话概括本知识点学生需要掌握什么

**核心概念**：
- 概念1的要点描述（用你自己的语言概括）
- 概念2的要点描述

**例题题型**：
- 例1：[题型分类] 简要描述题目考察方向（不要照抄原题）
  - 涉及知识点：xxx
  - 难度：基础/中等/提高

**练习题分类**：
- 基础练习 N 题：主要考察 xxx
- 提高练习 N 题：主要考察 xxx

**数学公式/规则**：（如有）
- 用LaTeX格式书写，如 $a + b = b + a$
```

## 3. 特殊内容处理
- **数学公式**（仅数学科适用）：统一用LaTeX表示。如加法交换律写作 `$a + b = b + a$`
- **图形 / 示意图**：用文字描述图形特征，标注关键元素（尺寸、标签、对比关系）
- **表格**：用markdown表格还原，数据完整
- **跨页内容**：如果知识点跨页未完，在末尾标注 `<!-- 续下一批次 -->`
- **语文课文原文**：保留关键段落，节选而非全抄
- **英语词汇/句型**：完整列出本单元新单词、重点句型
- **科学实验**：描述实验目标、步骤、现象、结论

## 4. 不要做的事
- 不要照抄教材原文大段文字
- 不要编造教材中没有的内容
- 不要遗漏任何单元标题或知识点标题
- 不要忽略"做一做"、"你知道吗"等栏目
"""


# ============================================================
# Prompt 1b: 课文原文逐字抽取（Gemini）—— 仅语文/英语用
# 与 PAGE_EXTRACT_PROMPT 互补：那个只要概要跳过原文；这个只要原文不要概要
# ============================================================

PASSAGE_EXTRACT_PROMPT = """# 角色
你是人教版/统编版小学{subject_name}教材数字化的文字录入员。

# 任务
从下面这几页 PDF（来自 **{publisher_label}小学{subject_name}{grade_semester}**，
第 {page_range} 页 / 全书约 {total_pages} 页）里**逐字抄录"课文正文"**。
不要概括、不要改写、不要补全、不要翻译。

# 只抽取
- 课文标题（含古诗标题、儿歌标题、英语 Story / Let's read / Let's talk 标题）
- 课文正文全文（古诗、儿歌、散文、记叙文、英语短文、英语对话）
- 作者（如页面显式印有）

# 一定要跳过（不要放进 passages）
- 目录、封面、版权页、编委会、前言
- 单元导语、单元小结、单元测试
- 拼音注音（只抄汉字，不要 pinyin）、脚注、插图说明文字
- 练习题、思考题、"读一读写一写"、"我会认/我会写"字表
- 课后"词语表""字词表""四会词"
- 语文园地、口语交际、习作、快乐读书吧
- 英语的 Let's learn 单词表、Let's do、Let's check、Story time 之外的练习

# 输出要求（严格 JSON，不要 markdown 代码块包裹，不要任何额外说明文字）
{{
  "passages": [
    {{
      "title": "小小的船",
      "kind": "poem",
      "author": "叶圣陶",
      "page_in_batch": 3,
      "sentences": [
        "弯弯的月儿小小的船。",
        "小小的船儿两头尖。",
        "我在小小的船里坐，",
        "只看见闪闪的星星蓝蓝的天。"
      ]
    }}
  ]
}}

字段说明：
- kind: 取值 poem / ancient_poem / prose / story / song / dialogue 之一
- author: 没有标注就写 null
- page_in_batch: 本篇课文在**这个 PDF 批次**里的第几页（从 1 开始数）。
  **不要**读页眉/页脚的印刷页码，那个和 PDF 物理页不一样。直接从头数：这个 PDF 的第 1 页、第 2 页……第 10 页
- sentences: 已拆好的句子数组

# 分句规则
- 中文散文/故事：按 。 ？ ！ ； 切分，保留标点
- 中文古诗/儿歌：按原文换行切分，每行作为一个 sentence
- 英文散文/故事：按 . ? ! 切分，保留标点
- 英文对话：每个 speaker 的一次发言作为一个 sentence（含前面的 "Sarah: "）
- **歌谣 / 诗 / 韵文 / 字母歌 / chant：严格按原文换行或标点分行，每一行/每一句作为独立 sentence。
  绝对不要把多行合并到同一个字符串里。**例如 ABC song 的
  `Aa Bb Cc Dd Ee Ff Gg,` `Hh Ii Jj Kk Ll Mm Nn,` 必须是两个独立的 sentence 元素

# speaker 标签规则（英文对话 / 中文剧本）
- **只有**原文 PDF 里**印出了角色名**（如 `Sarah: ...`、`张三：...`）才在 sentence 前保留那个角色名
- 原文没印的角色名**不要编造**。宁可让 sentence 里只有对话内容，也不要加上下文推断的 `Students: `、`Class: `、`Boy: ` 这种标签
- 如果连续几句话全是同一个人说的，每一句都带上同一个 speaker 标签没问题

# 质量要求（极其重要）
- **逐字抄录**：一个字都不许改、漏、补，连"的地得"都不许换
- 繁简、标点、数字格式都按原文
- 某字被插图遮挡看不清，用 `[?]` 代替，**不要猜**
- 如本批次页面**完全没有**课文正文，返回 {{"passages": []}}
"""


# ============================================================
# Prompt 2: 结构化大纲生成（Gemini）—— 学科无关，参数化
# ============================================================

OUTLINE_PROMPT = """# 角色
你是一名教育技术专家，负责将教材内容结构化为知识图谱。你熟悉{curriculum}的内容要求和学业质量标准。

# 任务
基于以下{publisher_label}小学{subject_name}教材的完整内容markdown，生成结构化教学大纲。

# 输入
{content}

# 输出要求
输出严格符合JSON Schema的JSON对象。字段说明：

## textbook
格式："{{N}}年级{{上/下}}册"，如"三年级上册"

## units 单元粒度（**最高优先级，必须满足**）

- **units 数组必须覆盖教材中出现的所有正式单元**（包括"准备课"、"总复习"等编号单元；不含"数学乐园"这类综合实践活动）
- **每个单元必须拆出至少 3 个 knowledge_points**（上限 8 个）。如果该单元本来就只有一个核心主题，也要拆成"概念认识 / 运算方法 / 应用问题"等子点，不要只用一个笼统的知识点概括整单元
- knowledge_points 的 name 字段要**具体到可出题**的颗粒度，例如：
  - ✅ 好："上、下、前、后的位置关系"、"6~10各数的认识"、"6~10的加法"、"6~10的减法"、"连加连减"、"加减混合"
  - ❌ 不好："位置"、"6~10的认识和加减法"（太笼统，无法据此出有针对性的题）
- 每个单元的 knowledge_points 顺序应与教材呈现顺序一致

## units[].knowledge_points[].difficulty
难度评级标准（锚定课标学业质量描述）：
- 1 = 识记：能说出、辨认概念（如：认识图形的名称）
- 2 = 理解：能解释、举例说明（如：理解乘法的含义）
- 3 = 应用：能在简单情境中运用（如：用竖式完成计算）
- 4 = 分析：能在复合情境中综合运用（如：两步应用题）
- 5 = 创造：能在开放情境中建模解决（如：设计购物方案）

## units[].knowledge_points[].question_types
从以下标准题型中选择适用项：
- "口算"：20以内/100以内的直接计算
- "竖式计算"：需要列竖式的加减乘除
- "填空"：填写数字、单位、符号
- "选择"：三选一或四选一
- "判断"：判断对错
- "画图"：画线段图、几何图形、数轴标注
- "连线/匹配"：连线配对
- "排序/比较"：大小比较、排列
- "应用题"：一步或多步文字题
- "操作题"：测量、拼摆、折叠等动手操作
- "规律探索"：找规律、填数

## 输出示例（注意单元拆分粒度）
{{
  "textbook": "三年级上册",
  "units": [
    {{
      "unit_number": 1,
      "title": "时、分、秒",
      "knowledge_points": [
        {{
          "name": "秒的认识",
          "description": "认识时间单位'秒'，知道1分=60秒，体验1秒和1分的长短",
          "difficulty": 2,
          "question_types": ["填空", "判断", "选择"]
        }},
        {{
          "name": "时间单位的换算",
          "description": "掌握时、分、秒之间的换算关系，能正确进行单位转换",
          "difficulty": 2,
          "question_types": ["填空", "选择"]
        }},
        {{
          "name": "经过时间的计算",
          "description": "能根据起止时刻计算经过的时间，能根据起始时刻和经过时间求结束时刻",
          "difficulty": 3,
          "question_types": ["填空", "应用题"]
        }}
      ]
    }}
  ]
}}
"""


# ============================================================
# Prompt 3a: 数学题目 + 知识点全解生成（Gemini）
# ============================================================

QUIZ_PROMPT_MATH = """# 角色
你是一名有15年教学经验的小学数学特级教师，同时是区级命题组成员。你出的每道题都经过反复验算，答案准确无误。

# 任务
为 **人教版小学数学{textbook}** 第{unit_number}单元「{unit_title}」编写完整的学习评测资料。

# 本单元知识点
{knowledge_points_detail}

# 命题规范

## 题量与分数（**最高优先级，必须严格满足，否则视为生成失败**）

每场测验（unit_test 和 exam 都一样）必须满足以下硬性指标：

- **questions 数组长度必须在 18 到 25 之间**（少于 18 道题视为失败）
- **所有题目 score 之和必须正好等于 total_score（即 100）**，多一分少一分都不行
- total_score 必须填 100
- unit_test 的 time_minutes 填 40，exam 的 time_minutes 填 60

## 题型配比（必须严格遵守，每场测验都要满足）

**核心原则**：本产品在手机/平板上答题，只提供三种输入方式——点选、点对/错、点数字键盘。**任何需要输入汉字、字母、标点的题目都被严格禁止**。所以题型配比极度偏向点选题。

每场测验必须严格按下表出题：

| 题型 type 字段 | 数量 | 每题分值 | 该题型小计 | 学生交互 |
|----------------|------|----------|------------|----------|
| true_false（判断题） | 5 题 | 2 分 | 10 分 | 点"对"或"错" |
| choice（选择题） | 13 题 | 5 分 | 65 分 | 点 A/B/C/D |
| fill_blank（填空题） | 3 题 | 5 分 | 15 分 | 数字键盘输入整数 |
| calculation（计算题） | 2 题 | 5 分 | 10 分 | 数字键盘输入整数 |

合计：**23 题，100 分**。**不得出 `word_problem` 类题目**（应用题一律改写成 `choice` 或 `fill_blank`）。

## 题型选型铁律（**违反即视为生成失败**）

1. **以下情况必须用 `choice`**（绝不能用 fill_blank / calculation）：
   - 答案是**中文词语/短语/句子**（如"剩下的鱼多"、"相等"、"三角形"、"上午"、"一样重"）
   - 答案是**比较符号** `>` `<` `=`（做成 4 选 1：`>` / `<` / `=` / `≈`）
   - 答案是**单位名称**（如"米"、"厘米"、"千克"）
   - 问题含"哪个/哪种/下面/下列 + 多/少/大/小/长/短/对/错/属于/是……"
   - 应用题的答案不是一个单纯的整数（比如需要答"甲快"、"还剩多少页"）
   - **判断是非类问题如果可以改成 true_false，优先用 true_false**

2. **`fill_blank` 与 `calculation` 的答案必须满足以下全部条件**（否则改成 choice）：
   - ✅ answer 字段是**纯阿拉伯数字的整数字符串**，如 `"7"`、`"100"`、`"1024"`
   - ❌ 不得含任何中文字符、字母、单位、符号、小数点、分号、空格、分数线
   - ❌ 不得是小数（如 `"3.5"`）、分数（如 `"1/2"`）、负数（如 `"-3"`）
   - ❌ 不得是多个数字（如 `"3, 5"`）
   - 题干中如果需要用到单位，把单位写在题目文字里，空格只填数字本身：
     - ✅ 好："1 米 = ___ 厘米"，answer: `"100"`
     - ✅ 好："小明有 5 个苹果，吃了 2 个，还剩 ___ 个。"，answer: `"3"`
     - ❌ 坏：answer: `"100 厘米"`（含单位）
     - ❌ 坏：answer: `"3 个"`（含量词）

3. **`calculation` 与 `fill_blank` 的区别**：
   - `calculation`：题干是**纯算式**（如 `"246 - 158 = ?"`、`"25 × 4 = ?"`），不含文字情境
   - `fill_blank`：题干包含**文字描述或单位换算**（如 `"1 米 = ___ 厘米"`、`"小明有 5 个苹果，吃了 2 个，还剩 ___ 个。"`）
   - 两者 answer 字段格式要求完全相同（纯整数字符串）

4. **`choice` 的质量要求**：
   - 必须有正好 4 个选项
   - 正确答案 + 3 个**合理的**错项（常见错算结果、概念混淆、相近数值），不要"以上都不对"
   - options 里不要带 "A. " / "B. " 前缀，只写选项内容
   - answer 字段填**正确选项的完整内容字符串**（与 options 中某一项完全一致），不要填 "A"/"B"

5. **`true_false` 的答案字段**只能填 `"对"` 或 `"错"`，不要填 `"正确"`/`"错误"`/`"true"`。

6. **严禁依赖图片/图形的题目**。本产品**没有任何配图**，题干只有一段文字会被渲染。以下题目一律禁止：
   - ❌ "观察下图，下面说法正确的是……"
   - ❌ "如图所示，三角形 ABC 的面积是……"
   - ❌ "看图列式"、"数一数图中有几个○"
   - ❌ "下面哪个图形是轴对称图形？"（因为选项无法用图）
   - ❌ 任何出现"图"、"如图"、"观察下面"、"看图"、"图中"、"箭头所指"等字样的题
   - ❌ 任何需要学生**在脑中想象一张特定图**才能作答的题
   - 几何题只能用**纯文字描述**：如"一个长方形长 6 厘米，宽 4 厘米，周长是多少厘米？"、"等边三角形有几条边？"
   - 图形识别类知识点可以通过文字问答出题：如"三角形有几条边？"（答 3）、"正方形有几个直角？"（答 4）

**再次强调**：如果你想出的题答案不是纯整数、也不是选择题/判断题，你必须把它改写成 choice 题。如果你想出的题需要图片才能作答，你必须把它改写成纯文字题或换一道题。宁可多出 choice 和纯文字几何题，也绝不允许出现让学生打字或看图的题目。

## 难度分布（必须严格遵守）
- 单元小测（unit_test）：基础题（difficulty=1）约 70%，中等题（difficulty=2）约 20%，提高题（difficulty=3）约 10%
- 综合测验（exam）：基础题约 50%，中等题约 30%，提高题约 20%

## 难度定义
- 基础（difficulty=1）：直接应用单一知识点，如口算、单步填空。预期正确率 ≥ 85%
- 中等（difficulty=2）：需要两个知识点配合或两步操作。预期正确率 60-85%
- 提高（difficulty=3）：综合运用或变式，需要分析推理。预期正确率 40-60%

## 答案验算要求（关键！）
每道 fill_blank 和 calculation 题目，你必须在 explanation 中展示完整的解题过程：
1. 列出算式
2. 分步计算
3. 用逆运算或代入法验算
4. 确认 answer 字段与计算结果一致（且为纯整数字符串）

示例 1（fill_blank，带情境）：
- question: "一本书有 246 页，小明已经看了 158 页，还剩 ___ 页没看。"
- answer: "88"
- explanation: "已知总页数 246 页，已看 158 页。列式：$246 - 158 = 88$（页）。验算：$88 + 158 = 246$ ✓。"

示例 2（calculation，纯算式）：
- question: "计算：$25 \\times 4 = ?$"
- answer: "100"
- explanation: "$25 \\times 4 = 100$。验算：$100 \\div 4 = 25$ ✓。"

示例 3（choice，比较类题型必须用 choice）：
- question: "小花猫钓了 5 条鱼，吃掉了 2 条。剩下的鱼和吃掉的鱼相比，哪种多？"
- options: ["剩下的鱼多", "吃掉的鱼多", "一样多", "无法比较"]
- answer: "剩下的鱼多"
- explanation: "剩下 $5 - 2 = 3$ 条，吃掉 2 条，$3 > 2$，所以剩下的鱼多。"

## 数值范围约束（按年级）
- 一年级：数字范围 0-100，加减法为主
- 二年级：数字范围 0-10000，含乘法口诀内的乘除法
- 三年级：万以内加减法、一位数乘多位数、简单分数
- 四年级：多位数乘除法、小数初步、简单几何
- 五年级：小数四则运算、分数加减法、图形面积
- 六年级：分数乘除法、比和比例、圆和扇形

## 语言规范
- 题目语言适合小学生阅读，用词简洁准确
- 应用题情境贴近小学生生活（校园、购物、游玩、运动等）
- 避免生僻词汇和复杂长句
- 单位要规范：米(m)、厘米(cm)、千克(kg)、元、角、分等
- 数学公式用LaTeX格式：$246 - 158 = 88$

## 知识点全解规范（**强制覆盖率**）

`knowledge_summary` 数组**必须为本单元每一个知识点各写一条**，一个都不能省略。
- 数组长度 = 本单元知识点数量（见上方"本单元知识点"列表，几个就写几条）
- 每条的 `point` 字段必须完全等于知识点列表中对应的 name

每条全解应包含：
- core_concept：核心概念讲解（80-150字），用学生能理解的语言
- key_formula：关键公式或规则，用LaTeX格式（如该知识点没有公式，写一句话规则即可，不要留空）
- common_mistakes：至少列出 2 个该年龄段学生的真实高频错误（不要编造不切实际的错误）
- tips：具体的学习方法或记忆技巧（不要空泛的"多练习"）

# 输出
严格按照 JSON Schema 输出。最终 checklist：
1. 每份测验正好 23 题，题型配比 `true_false:5 / choice:13 / fill_blank:3 / calculation:2`，**不允许出现 word_problem**
2. 所有题目 score 之和 = 100
3. 选择题的 options 数组有 4 个选项，其他题型 options 为空数组 `[]`
4. 每道题的 difficulty 在 1-3 范围内
5. knowledge_point 字段必须是本单元知识点列表中的某一个
6. true_false 的 answer 字段只填 `"对"` 或 `"错"`
7. choice 的 answer 字段填**正确选项的内容字符串**（与 options 中某一项完全一致），不要填 `"A"`/`"B"`/`"C"`/`"D"`
8. fill_blank 和 calculation 的 answer 字段只能是**纯阿拉伯数字的整数字符串**，不得含单位、汉字、字母、小数点、分数线、负号、空格
"""


# ============================================================
# JSON Schemas（OpenRouter structured output）
# ============================================================

OUTLINE_SCHEMA = {
    "name": "textbook_outline",
    "strict": True,
    "schema": {
        "type": "object",
        "properties": {
            "textbook": {"type": "string", "description": "年级+学期，如'三年级上册'"},
            "units": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "unit_number": {"type": "integer"},
                        "title": {"type": "string"},
                        "knowledge_points": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "name": {"type": "string"},
                                    "description": {"type": "string"},
                                    "difficulty": {"type": "integer", "description": "1-5"},
                                    "question_types": {
                                        "type": "array",
                                        "items": {"type": "string"}
                                    },
                                },
                                "required": ["name", "description", "difficulty", "question_types"],
                                "additionalProperties": False,
                            },
                        },
                    },
                    "required": ["unit_number", "title", "knowledge_points"],
                    "additionalProperties": False,
                },
            },
        },
        "required": ["textbook", "units"],
        "additionalProperties": False,
    },
}

QUIZ_SCHEMA_MATH = {
    "name": "quiz_output",
    "strict": True,
    "schema": {
        "type": "object",
        "properties": {
            "textbook": {"type": "string"},
            "unit": {"type": "string"},
            "unit_number": {"type": "integer"},
            "unit_test": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "total_score": {"type": "integer"},
                    "time_minutes": {"type": "integer"},
                    "questions": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "id": {"type": "integer"},
                                "type": {
                                    "type": "string",
                                    "description": "choice|fill_blank|calculation|word_problem|true_false",
                                },
                                "score": {"type": "integer"},
                                "difficulty": {
                                    "type": "integer",
                                    "description": "1=基础, 2=中等, 3=提高",
                                },
                                "knowledge_point": {"type": "string"},
                                "question": {"type": "string"},
                                "options": {
                                    "type": "array",
                                    "items": {"type": "string"},
                                    "description": "选择题4个选项，其他题型为空数组",
                                },
                                "answer": {"type": "string"},
                                "explanation": {
                                    "type": "string",
                                    "description": "详细解题步骤，含验算",
                                },
                            },
                            "required": [
                                "id", "type", "score", "difficulty",
                                "knowledge_point", "question", "options",
                                "answer", "explanation",
                            ],
                            "additionalProperties": False,
                        },
                    },
                },
                "required": ["title", "total_score", "time_minutes", "questions"],
                "additionalProperties": False,
            },
            "exam": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "total_score": {"type": "integer"},
                    "time_minutes": {"type": "integer"},
                    "questions": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "id": {"type": "integer"},
                                "type": {"type": "string"},
                                "score": {"type": "integer"},
                                "difficulty": {"type": "integer"},
                                "knowledge_point": {"type": "string"},
                                "question": {"type": "string"},
                                "options": {
                                    "type": "array",
                                    "items": {"type": "string"},
                                },
                                "answer": {"type": "string"},
                                "explanation": {"type": "string"},
                            },
                            "required": [
                                "id", "type", "score", "difficulty",
                                "knowledge_point", "question", "options",
                                "answer", "explanation",
                            ],
                            "additionalProperties": False,
                        },
                    },
                },
                "required": ["title", "total_score", "time_minutes", "questions"],
                "additionalProperties": False,
            },
            "knowledge_summary": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "point": {"type": "string"},
                        "core_concept": {"type": "string"},
                        "key_formula": {"type": "string"},
                        "common_mistakes": {
                            "type": "array",
                            "items": {"type": "string"},
                        },
                        "tips": {"type": "string"},
                    },
                    "required": [
                        "point", "core_concept", "key_formula",
                        "common_mistakes", "tips",
                    ],
                    "additionalProperties": False,
                },
            },
        },
        "required": [
            "textbook", "unit", "unit_number",
            "unit_test", "exam", "knowledge_summary",
        ],
        "additionalProperties": False,
    },
}


# ============================================================
# Prompt 3b: 语文题目 + 知识点全解生成
# ============================================================

QUIZ_PROMPT_CHINESE = """# 角色
你是一名有15年教学经验的小学语文特级教师，同时是区级命题组成员。你熟悉《义务教育语文课程标准（2022年版）》的学业质量描述，出的题严谨、贴近学生生活。

# 任务
为 **统编版小学语文{textbook}** 第{unit_number}单元「{unit_title}」编写完整的学习评测资料。

# 本单元知识点
{knowledge_points_detail}

# 命题规范

## 题量与分数（**最高优先级，必须严格满足**）

每场测验（unit_test 和 exam 都一样）必须严格满足：

- **questions 数组长度必须正好 23 题**
- **所有题目 score 之和必须正好等于 100**
- total_score 填 100
- unit_test 的 time_minutes 填 40，exam 填 60

## 题型配比（每场测验都必须完全符合）

**核心原则**：本产品在手机/平板上答题，学生通过点选和简单键盘输入作答。不允许自由书写、不允许听力、不允许画图。

| 题型 type 字段 | 数量 | 每题分值 | 小计 | 学生交互 |
|----------------|------|----------|------|----------|
| true_false（判断题） | 5 题 | 2 分 | 10 分 | 点"对"或"错" |
| choice（选择题） | 10 题 | 5 分 | 50 分 | 点 A/B/C/D |
| fill_blank_text（文字填空） | 3 题 | 5 分 | 15 分 | 文字输入字/词 |
| matching（连线题） | 3 题 | 5 分 | 15 分 | 连接左右两列 |
| word_order（排序题） | 2 题 | 5 分 | 10 分 | 点击词语拼成句 |

合计：**23 题，100 分**。

## 题型选型铁律（违反视为失败）

### 1. choice（优先用）
- 理解阅读（在题干中给一段 50-120 字的短文或古诗原文，然后问 1 个问题）
- 字词义辨析、近义词反义词选择、多音字读音选择
- 修辞方法识别（比喻 / 拟人 / 排比 / 反问）
- 标点符号选择
- 句式转换正误判断
- 选项 4 个，不带 A./B. 前缀，answer 填正确选项的**完整内容字符串**

### 2. true_false（比 choice 更简单的真假判断）
- "xxx 是一个形容词" / "xxx 这个字读作 xxx" 这类只需要判断对错的小题
- answer 字段只能填 `"对"` 或 `"错"`

### 3. fill_blank_text（文字填空）
- 答案必须是**单个汉字、词语或短语**（1~6 字），如"春"、"桃花"、"万里长城"
- **严禁**整句默写（如"请默写《静夜思》"）—— 这会让学生打出长句
- **严禁**答案超过 6 个汉字
- 举例：
  - ✅ "火"字的偏旁是（___）。answer: "火"
  - ✅ "白日依山尽，（___）入海流。" answer: "黄河"
  - ✅ "桃花和什么花颜色相近？" 应改为 choice
- 所有 fill_blank_text 的答案**不得含英文字母、数字、标点**

### 4. matching（连线题）
- 用于"字→拼音"、"词→释义"、"作者→作品"、"成语→含义"等二元配对
- `options` 字段必须是**恰好 8 项**的数组：前 4 项是左列（对应 A/B/C/D），后 4 项是右列（对应 1/2/3/4）
- `answer` 字段是正确配对的字符串，格式严格为 `"A-n1,B-n2,C-n3,D-n4"`

⚠️ **铁律 1（一一对应）**：n1, n2, n3, n4 **必须是 1/2/3/4 的一个排列**——每个数字恰好出现一次。绝对禁止：
  - ❌ `"A-1,B-2,C-1,D-3"` （1 出现两次）
  - ❌ `"A-4,B-4,C-4,D-4"` （全部映到 4）
  - ❌ `"A-1,B-2,C-3"` （只有 3 对）

⚠️ **铁律 2（右列必须是 4 个有意义的不同项）**：右列 4 项必须是 4 个**不同的、有实际语义的**词语/短语，**严禁**填占位符（如 "1" "2" "3"）或重复项。如果你想出的题没有 4 个有区分度的右列项，**改换知识点**或**改用 choice 题**。
  - ❌ options=`["狮","狸","猬","狼","1","2","3","犭"]` — 右列出现"1/2/3"占位符且全部都是 犭 偏旁
  - ✅ options=`["春","夏","秋","冬","桃花","荷花","菊花","梅花"]`

✅ 正面示例：
  - options: `["春", "夏", "秋", "冬", "梅花", "荷花", "菊花", "桃花"]`
  - answer: `"A-4,B-2,C-3,D-1"` （春—桃花，夏—荷花，秋—菊花，冬—梅花）

**出题前自检**：把答案的 4 个数字按升序排列必须等于 `[1,2,3,4]`。

### 5. word_order（词语排序）
- 用于把现代文的词语 / 短语 排成一个完整的句子
- `options` 字段是**打乱顺序**的词语/短语数组，3-6 项
- `answer` 字段是**正确顺序**的词语用**英文半角逗号**连接，如 `"小明,在,公园里,跑步"`

⚠️ **铁律 1**：`options` 数组的所有元素，必须与 `answer` 用逗号分割后的所有元素**完全一致**（顺序不同）。不能多一项、不能少一项、不能有任何文字差异（包括汉字拆分/合并）。出题前必须自检：
  - `set(options)` 必须等于 `set(answer.split(","))`
  - `len(options)` 必须等于 `len(answer.split(","))`
  - 特别注意：**不要在 options 和 answer 之间拆分或合并词语**。如果 options 里写的是"的一幅"，answer 里也必须写"的一幅"，不能拆成"的"和"一幅"

⚠️ **铁律 2**：**严禁**让学生排古诗的字词顺序（如"碧水东流至此回"逐字排列）—— 这是死记硬背，不是排序。古诗只允许整句之间排序，且必须给完整的词组单位（不要拆字）。

✅ 正面示例：
  - 现代文排成句子：
    - options: `["小红", "认真地", "在课堂上", "听老师", "讲课"]`
    - answer: `"小红,在课堂上,认真地,听老师,讲课"`
  - 比喻句结构：
    - options: `["像", "弯弯的", "月亮", "小船"]`
    - answer: `"弯弯的,月亮,像,小船"`

❌ 反面示例（不要出）：
  - ❌ "请将《望天门山》'碧水东流至此回'按字排序" — 字逐个排序属于死记硬背
  - ❌ options=`["亮晶晶的","铺满","落叶","那条"]` answer=`"那条,水泥道,铺满,亮晶晶的,落叶"` — answer 多了"水泥道"
  - ❌ options=`["在","小星星","蓝蓝的","闪闪的","多像","宝石"]` answer=`"闪闪的,小星星,多像,蓝蓝的,宝石"` — answer 漏了"在"
  - ❌ options=`["春天","像","美丽","的一幅","画"]` answer=`"春天,像,一幅,美丽,的,画"` — options 写"的一幅"但 answer 拆成"的"和"一幅"

### 6. 全局禁令
- ❌ 禁止任何要求学生"写作文"、"写一段话"、"仿写"的题
- ❌ 禁止"听一听"、"读一读"、"观察下图"类依赖多媒体的题
- ❌ 禁止古诗全文默写
- ❌ 禁止需要手写汉字笔画、笔顺的题
- ❌ 答案必须是**唯一确定**的，不接受"答案不唯一"

## 难度分布

- unit_test：基础（1）≈ 70%，中等（2）≈ 20%，提高（3）≈ 10%
- exam：基础 ≈ 50%，中等 ≈ 30%，提高 ≈ 20%

## 语言规范

- 用词贴近小学生水平，情境贴近学生生活
- 短文阅读不超过 150 字
- 古诗文只选课本出现过的篇目

## 知识点全解规范

`knowledge_summary` 数组必须为本单元每一个知识点各写一条。每条字段：
- `point`：知识点名称（必须等于上面知识点列表中的 name）
- `core_concept`：80-150 字的概念讲解
- `key_formula`：关键规则 / 语法点（即使语文没有"公式"，也要写一句话规则，不要留空）
- `common_mistakes`：至少 2 个本年龄段学生的真实高频错误
- `tips`：具体的学习方法或记忆技巧

# 输出
严格按 JSON Schema 输出。最终检查清单：
1. 每份测验正好 23 题，题型严格 5/10/3/3/2
2. 分数和为 100
3. matching 的 options 恰好 8 项，answer 符合 `"A-n,B-n,C-n,D-n"` 格式
4. word_order 的 options 与 answer 词语一致（数量、文字），只是顺序不同
5. fill_blank_text 答案不超过 6 个汉字，不含英文/数字
6. true_false 答案只填"对"或"错"
7. choice 答案填正确选项的完整内容字符串
"""


# ============================================================
# Prompt 3c: 英语题目 + 知识点全解生成
# ============================================================

QUIZ_PROMPT_ENGLISH = """# 角色
你是一名有15年教学经验的小学英语（PEP）特级教师，熟悉 PEP 教材体系和《义务教育英语课程标准（2022年版）》学业质量标准。

# 任务
为 **人教版 PEP 英语{textbook}** 第{unit_number}单元「{unit_title}」编写完整的学习评测资料。

# 本单元知识点
{knowledge_points_detail}

# 命题规范

## 题量与分数

- 每份测验正好 23 题，分数合计 100
- unit_test time_minutes=40，exam time_minutes=60

## 题型配比（严格遵守）

| 题型 | 数量 | 每题分值 | 小计 |
|------|------|----------|------|
| true_false | 5 | 2 | 10 |
| choice | 10 | 5 | 50 |
| fill_blank_text | 4 | 5 | 20 |
| matching | 2 | 5 | 10 |
| word_order | 2 | 5 | 10 |

合计 **23 题，100 分**。

## 题型铁律

### 1. true_false
- answer 只填 `"对"` 或 `"错"`
- 题干可以中英混合，例如：`"'apple' 的意思是香蕉。"` answer: `"错"`

### 2. choice
- 必须有正好 4 个选项
- answer 填正确选项的完整内容字符串
- 选项可以是英文单词、英文句子、中文翻译
- 用于：词义辨析、语法选择（单复数/时态）、句子补全、短对话理解

### 3. fill_blank_text
- 答案必须是**单个英文单词或不超过 3 个单词的短语**，**全部小写**
- **严禁**答案含中文、标点、大写字母
- 答案必须是本单元/本册范围内的高频词
- 举例：
  - ✅ "I ___ a student." answer: `"am"`
  - ✅ "How ___ apples do you have?" answer: `"many"`
  - ❌ 答案是"Apple"（有大写）
  - ❌ 答案是"I am a student."（整句）

### 4. matching（英汉配对）
- options 恰好 8 项：前 4 项英文单词/短语，后 4 项对应的中文意思
- answer 格式严格为 `"A-n1,B-n2,C-n3,D-n4"`（n 是 1-4 的排列）
- 举例：
  - options: `["apple", "book", "cat", "dog", "猫", "狗", "书", "苹果"]`
  - answer: `"A-4,B-3,C-1,D-2"`

### 5. word_order（单词排成句子）
- options 是**打乱顺序**的单词数组，3-6 个单词
- answer 是正确顺序的单词用**英文半角逗号**连接，如 `"I,am,happy"`

⚠️ **铁律**：`options` 数组的所有单词必须与 `answer` 用逗号分割后的所有单词**完全一致**（包括大小写、标点），只是顺序不同。不能多一个、不能少一个、不能有任何拼写差异。出题前必须自检：
  - `set(options)` 必须等于 `set(answer.split(","))`
  - `len(options)` 必须等于 `len(answer.split(","))`

- 句首单词首字母大写（"I"、"He"、"Tom"），其他单词通常小写
- 举例：
  - options: `["am", "I", "Tom"]`, answer: `"I,am,Tom"` ✅
  - options: `["like", "apples", "I"]`, answer: `"I,like,apples"` ✅
  - ❌ 反面：options=`["am","I"]` answer=`"I,am,Tom"` — answer 多了 Tom

### 6. 全局禁令
- ❌ 禁止听力题（没有音频）
- ❌ 禁止自由作文
- ❌ 禁止发音题（需要音标显示）
- ❌ 禁止答案是整段文字的题

## 难度分布与其他规范
- unit_test：基础 70% / 中等 20% / 提高 10%
- exam：基础 50% / 中等 30% / 提高 20%

## 知识点全解
同语文规范：`point / core_concept / key_formula(写成语法规则或词汇记忆点) / common_mistakes / tips`，每个知识点一条。

# 输出
严格按 JSON Schema 输出。检查清单：
1. 题型配比 5/10/4/2/2，分数和 100
2. fill_blank_text 答案全小写，不含标点
3. word_order 答案能由 options 重排得到
4. matching options 8 项，answer 格式符合
5. true_false 只填"对"/"错"
"""


# ============================================================
# Prompt 3d: 科学题目 + 知识点全解生成
# ============================================================

QUIZ_PROMPT_SCIENCE = """# 角色
你是一名有15年教学经验的小学科学特级教师，熟悉《义务教育科学课程标准（2022年版）》和教科版教材体系。

# 任务
为 **教科版小学科学{textbook}** 第{unit_number}单元「{unit_title}」编写完整的学习评测资料。

# 本单元知识点
{knowledge_points_detail}

# 命题规范

## 题量与分数

- 每份测验正好 23 题
- 分数合计 100（允许 fill_blank 的每题分值微调以凑整）

## 题型配比（**严格遵守**）

| 题型 | 数量 | 每题分值 | 小计 |
|------|------|----------|------|
| true_false | 5 | 2 | 10 |
| choice | 13 | 5 | 65 |
| fill_blank（数字） | 2 | 5 | 10 |
| fill_blank_text | 3 | 5 | 15 |

合计 **23 题，100 分**。所有 fill_blank 和 fill_blank_text 都是 5 分，方便对齐。

## 题型铁律

### 1. true_false
- 用于判断科学事实真伪（"植物通过根吸收水分"、"声音在真空中可以传播"）
- answer 只填 `"对"` 或 `"错"`

### 2. choice
- 主力题型，覆盖概念识记、现象解释、实验结论、因果分析
- 4 个选项，answer 填正确选项的完整内容字符串
- 严禁"以上都对"/"以上都不对"这种偷懒选项

### 3. fill_blank（数字答案，**仅当答案确实是数字时使用**）
- answer 必须是**纯阿拉伯数字整数**，如 `"100"`、`"37"`
- 不得含单位、小数点、汉字、字母
- 单位放在题干中：
  - ✅ "水在（___）℃时结冰。" answer: `"0"`
  - ✅ "一只成年人的体温大约是（___）℃。" answer: `"37"`
  - ❌ answer: `"0℃"` / `"摄氏"` — 不是纯整数

### 4. fill_blank_text（科学术语答案，**只要答案是中文词，就必须用这个 type**）
- answer 必须是**单一的科学术语**，1-6 个汉字
- 举例：
  - ✅ "（___）是植物进行光合作用的主要器官。" answer: `"叶"`
  - ✅ "水从液态变成气态的过程叫（___）。" answer: `"蒸发"`
  - ✅ "气温计上 C 或 ℃ 代表的是（___）刻度。" answer: `"摄氏"` ← 答案是中文词，必须用 fill_blank_text 而不是 fill_blank
  - ❌ "下列哪种..." 这种描述性问题应改用 choice
- 严禁答案是英文、数字、标点

> ⚠️ **type 字段选错的后果**：如果一道题答案是中文词，但你写成 `"type": "fill_blank"`（应该是 `fill_blank_text`），整道题会被验证器拒绝。判断方法极其简单：**答案是否仅由阿拉伯数字 0-9 组成？** 是 → `fill_blank`；否 → `fill_blank_text`。

### 5. 全局禁令
- ❌ 禁止需要手绘实验装置的题
- ❌ 禁止"观察下图"/"看图回答"
- ❌ 禁止需要学生设计实验的开放题
- ❌ 禁止长答案

## 难度分布
- unit_test：基础 70% / 中等 20% / 提高 10%
- exam：基础 50% / 中等 30% / 提高 20%

## 知识点全解
同上，每个知识点一条 `point / core_concept / key_formula(科学规律或关键结论) / common_mistakes / tips`

# 输出
严格按 JSON Schema 输出。检查清单：
1. 题型配比 5/13/2/3，总 23 题，分数和正好 100
2. fill_blank 答案是纯整数字符串
3. fill_blank_text 答案不超过 6 个汉字、不含英文或数字
4. choice 答案是完整选项文本
5. true_false 只填"对"/"错"
"""


# ============================================================
# 学科专属 JSON Schemas（支持新题型 fill_blank_text / word_order / matching）
# ============================================================

# 共享的单道题属性模板
_QUESTION_PROPS_COMMON = {
    "id": {"type": "integer"},
    "type": {"type": "string"},
    "score": {"type": "integer"},
    "difficulty": {"type": "integer", "description": "1=基础, 2=中等, 3=提高"},
    "knowledge_point": {"type": "string"},
    "question": {"type": "string"},
    "options": {
        "type": "array",
        "items": {"type": "string"},
        "description": "choice=4项；matching=8项(前4左后4右)；word_order=2-6项打乱顺序；其他为空数组",
    },
    "answer": {"type": "string"},
    "explanation": {"type": "string", "description": "详细解题步骤"},
}

_QUESTION_REQUIRED = [
    "id", "type", "score", "difficulty",
    "knowledge_point", "question", "options",
    "answer", "explanation",
]


def _build_quiz_schema(name: str) -> dict:
    """构造一份标准 quiz schema，题目 properties 通用，只是 schema name 不同。"""
    return {
        "name": name,
        "strict": True,
        "schema": {
            "type": "object",
            "properties": {
                "textbook": {"type": "string"},
                "unit": {"type": "string"},
                "unit_number": {"type": "integer"},
                "unit_test": {
                    "type": "object",
                    "properties": {
                        "title": {"type": "string"},
                        "total_score": {"type": "integer"},
                        "time_minutes": {"type": "integer"},
                        "questions": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": _QUESTION_PROPS_COMMON,
                                "required": _QUESTION_REQUIRED,
                                "additionalProperties": False,
                            },
                        },
                    },
                    "required": ["title", "total_score", "time_minutes", "questions"],
                    "additionalProperties": False,
                },
                "exam": {
                    "type": "object",
                    "properties": {
                        "title": {"type": "string"},
                        "total_score": {"type": "integer"},
                        "time_minutes": {"type": "integer"},
                        "questions": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": _QUESTION_PROPS_COMMON,
                                "required": _QUESTION_REQUIRED,
                                "additionalProperties": False,
                            },
                        },
                    },
                    "required": ["title", "total_score", "time_minutes", "questions"],
                    "additionalProperties": False,
                },
                "knowledge_summary": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "point": {"type": "string"},
                            "core_concept": {"type": "string"},
                            "key_formula": {"type": "string"},
                            "common_mistakes": {"type": "array", "items": {"type": "string"}},
                            "tips": {"type": "string"},
                        },
                        "required": [
                            "point", "core_concept", "key_formula",
                            "common_mistakes", "tips",
                        ],
                        "additionalProperties": False,
                    },
                },
            },
            "required": [
                "textbook", "unit", "unit_number",
                "unit_test", "exam", "knowledge_summary",
            ],
            "additionalProperties": False,
        },
    }


QUIZ_SCHEMA_CHINESE = _build_quiz_schema("quiz_output_chinese")
QUIZ_SCHEMA_ENGLISH = _build_quiz_schema("quiz_output_english")
QUIZ_SCHEMA_SCIENCE = _build_quiz_schema("quiz_output_science")


# ============================================================
# 辅助函数
# ============================================================

# 年级 / 学科解析函数已迁移至 subjects.py：
#   from subjects import get_grade_semester, detect_subject_from_stem


def build_knowledge_points_detail(unit: dict) -> str:
    """把知识点列表格式化为prompt可用的详细描述"""
    lines = []
    for i, kp in enumerate(unit.get("knowledge_points", []), 1):
        lines.append(f"{i}. **{kp['name']}**")
        lines.append(f"   - 描述：{kp.get('description', '无')}")
        lines.append(f"   - 难度级别：{kp.get('difficulty', '未知')}")
        lines.append(f"   - 适用题型：{', '.join(kp.get('question_types', []))}")
        lines.append("")
    return "\n".join(lines)
