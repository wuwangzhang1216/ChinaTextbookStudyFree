"""
story_prompts.py — LLM 生成分级故事 + 阅读理解题的 Prompt 模板与 Schema

为语文和英语两个学科分别提供：
- 故事生成 prompt（按年级分级约束）
- JSON Schema（结构化输出）
"""


# ============================================================
# 年级分级约束
# ============================================================

GRADE_CONSTRAINTS_CHINESE = {
    1: {"max_chars_per_sentence": 20, "min_sentences": 4,  "max_sentences": 6,  "min_vocab": 3, "label": "一年级：用课文中出现的常用字，句子极短，贴近儿童日常生活"},
    2: {"max_chars_per_sentence": 30, "min_sentences": 5,  "max_sentences": 8,  "min_vocab": 4, "label": "二年级：句子简短，可使用简单形容词和动词搭配，贴近校园和家庭生活"},
    3: {"max_chars_per_sentence": 50, "min_sentences": 8,  "max_sentences": 12, "min_vocab": 5, "label": "三年级：可使用比喻等简单修辞，开始有完整的起承转合"},
    4: {"max_chars_per_sentence": 60, "min_sentences": 10, "max_sentences": 14, "min_vocab": 5, "label": "四年级：可使用成语和多种修辞手法，情节更丰富"},
    5: {"max_chars_per_sentence": 80, "min_sentences": 12, "max_sentences": 18, "min_vocab": 6, "label": "五年级：鼓励使用文学性表达，可涉及情感变化和人物心理"},
    6: {"max_chars_per_sentence": 100, "min_sentences": 14, "max_sentences": 20, "min_vocab": 6, "label": "六年级：可使用较复杂的叙事结构，允许倒叙、插叙，语言更成熟"},
}

GRADE_CONSTRAINTS_ENGLISH = {
    3: {"max_words_per_sentence": 8,  "min_sentences": 5,  "max_sentences": 8,  "min_vocab": 4, "label": "Grade 3: Simple present tense only, basic subject-verb-object, vocabulary from unit word list"},
    4: {"max_words_per_sentence": 12, "min_sentences": 6,  "max_sentences": 10, "min_vocab": 5, "label": "Grade 4: Simple present and present continuous, can use adjectives and prepositions"},
    5: {"max_words_per_sentence": 15, "min_sentences": 8,  "max_sentences": 12, "min_vocab": 5, "label": "Grade 5: Simple past tense allowed, can use conjunctions (and, but, because)"},
    6: {"max_words_per_sentence": 18, "min_sentences": 10, "max_sentences": 14, "min_vocab": 6, "label": "Grade 6: Mixed tenses, comparative/superlative, more complex sentence structures"},
}


# ============================================================
# 语文故事生成 Prompt
# ============================================================

STORY_PROMPT_CHINESE = """# 角色
你是一名有丰富经验的小学语文教师兼儿童文学作家。你擅长用生动有趣的语言为小学生写短故事，故事既好玩又能巩固课堂所学。

# 任务
为 **统编版小学语文{textbook}** 第{unit_number}单元「{unit_title}」创作 {story_count} 篇原创短故事，并为每篇编写阅读理解题。

# 本单元知识点
{knowledge_points_detail}

# 创作约束

## 年级与难度
- {grade_label}
- 每篇故事 {min_sentences}~{max_sentences} 句
- 每句话不超过 {max_chars} 个汉字

## 词汇要求
- 必须自然地使用本单元涉及的词汇和概念（至少用 {min_vocab} 个相关词汇/知识点）
- 不要使用超出该年级认知水平的生僻字或术语
- 在 vocabulary_used 字段中列出故事实际使用的本单元关键词汇

## 故事质量
- 每篇有独立的标题、完整的起承转合
- 故事主题须与单元主题「{unit_title}」相关
- 要有趣味性，不要说教
- {story_count} 篇故事之间内容不要雷同，角色和场景要有变化

# 阅读理解题规范

每篇故事配 3~5 道题，必须满足：
- 至少 1 道 true_false（判断题）：answer 只能填"对"或"错"，options 为空数组
- 至少 1 道 choice（选择题）：恰好 4 个选项，answer 填正确选项的完整内容（不要填 A/B/C/D）
- 至少 1 道 fill_blank_text（填空题）：答案为 1~4 个字，从故事原文中可找到，options 为空数组

题目考查方向：
- 事实细节（故事里发生了什么）
- 词义理解（某个词在文中的意思）
- 主旨归纳（故事想告诉我们什么）

## 输出格式
严格按照 JSON Schema 输出。sentences 数组中每个元素是故事的一句话（含标点）。"""


# ============================================================
# 英语故事生成 Prompt
# ============================================================

STORY_PROMPT_ENGLISH = """# Role
You are an experienced primary school English teacher and children's story writer. You write fun, engaging short stories that help students practice what they learned in class.

# Task
Create {story_count} original short stories for **PEP Primary English {textbook}** Unit {unit_number} "{unit_title}", with reading comprehension questions for each story.

# Unit Knowledge Points
{knowledge_points_detail}

# Writing Constraints

## Grade Level
- {grade_label}
- Each story: {min_sentences}~{max_sentences} sentences
- Each sentence: no more than {max_words} words

## Vocabulary Requirements
- Naturally use vocabulary and sentence patterns from this unit (at least {min_vocab} key words/patterns)
- Do NOT use vocabulary beyond this grade level
- List actually used unit vocabulary in the vocabulary_used field

## Story Quality
- Each story has a unique title and a complete mini-plot
- Stories must relate to the unit theme "{unit_title}"
- Make stories fun and relatable for Chinese primary school students
- The {story_count} stories should have different characters and settings

# Reading Comprehension Questions

Each story must have 3~5 questions:
- At least 1 true_false: answer is exactly "True" or "False", options is empty array
- At least 1 choice: exactly 4 options, answer is the full text of the correct option (NOT A/B/C/D)
- At least 1 fill_blank_text: answer is 1~3 words found in the story text, options is empty array

Questions should test:
- Factual details (what happened in the story)
- Vocabulary in context (what a word means)
- Main idea (what the story is about)

## Output Format
Follow the JSON Schema strictly. Each element in the sentences array is one sentence of the story (including punctuation)."""


# ============================================================
# JSON Schema — 故事输出（语文 & 英语共用）
# ============================================================

STORY_SCHEMA = {
    "name": "stories_output",
    "strict": True,
    "schema": {
        "type": "object",
        "properties": {
            "stories": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "title": {"type": "string"},
                        "sentences": {
                            "type": "array",
                            "items": {"type": "string"},
                        },
                        "vocabulary_used": {
                            "type": "array",
                            "items": {"type": "string"},
                        },
                        "questions": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "id": {"type": "integer"},
                                    "type": {
                                        "type": "string",
                                        "enum": ["true_false", "choice", "fill_blank_text"],
                                    },
                                    "question": {"type": "string"},
                                    "options": {
                                        "type": "array",
                                        "items": {"type": "string"},
                                    },
                                    "answer": {"type": "string"},
                                    "explanation": {"type": "string"},
                                },
                                "required": ["id", "type", "question", "options", "answer", "explanation"],
                                "additionalProperties": False,
                            },
                        },
                    },
                    "required": ["title", "sentences", "vocabulary_used", "questions"],
                    "additionalProperties": False,
                },
            },
        },
        "required": ["stories"],
        "additionalProperties": False,
    },
}
