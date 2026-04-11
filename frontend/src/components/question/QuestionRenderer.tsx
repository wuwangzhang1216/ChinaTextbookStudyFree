"use client";

/**
 * QuestionRenderer — 根据题型分发到对应的子组件。
 *
 * 设计：受控组件，父组件持有 currentAnswer 和 disabled 状态。
 * 子组件负责呈现选项 / 输入框，并在用户操作时调用 onChange。
 */

import type { Question } from "@/types";
import { ChoiceQuestion } from "./ChoiceQuestion";
import { TrueFalseQuestion } from "./TrueFalseQuestion";
import { FillBlankQuestion } from "./FillBlankQuestion";
import { FillBlankTextQuestion } from "./FillBlankTextQuestion";
import { WordOrderQuestion } from "./WordOrderQuestion";
import { MatchingQuestion } from "./MatchingQuestion";

export type QuestionPhase = "answering" | "checked";

export interface QuestionRendererProps {
  question: Question;
  answer: string;
  phase: QuestionPhase;
  isCorrect: boolean | null;
  onChange: (value: string) => void;
}

export function QuestionRenderer(props: QuestionRendererProps) {
  const { question } = props;

  switch (question.type) {
    case "choice":
      return <ChoiceQuestion {...props} />;
    case "true_false":
      return <TrueFalseQuestion {...props} />;
    case "fill_blank":
    case "calculation":
    case "word_problem":
      return <FillBlankQuestion {...props} />;
    case "fill_blank_text":
      return <FillBlankTextQuestion {...props} />;
    case "word_order":
      return <WordOrderQuestion {...props} />;
    case "matching":
      return <MatchingQuestion {...props} />;
    default:
      return <div className="text-danger">未知题型: {question.type}</div>;
  }
}
