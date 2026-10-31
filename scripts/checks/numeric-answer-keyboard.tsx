import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { gradeAnswer } from "../../packages/core/src/grade";
import type { Question } from "../../packages/core/src/types";

// Run the real component's button and window handlers without audio or animation.
const source = readFileSync(new URL("../../apps/web/src/components/question/FillBlankQuestion.tsx", import.meta.url), "utf8");
const handlers = new Map<string, (event: any) => void>();
const exports: any = {};
const jsx = (type: any, props: any) => ({ type, props });
runInNewContext(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
}).outputText, {
  exports,
  window: {
    addEventListener: (type: string, fn: any) => handlers.set(type, fn),
    removeEventListener: (type: string) => handlers.delete(type),
  },
  require: (name: string) => {
    if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
    if (name === "react") return { useEffect: (fn: () => void) => fn() };
    if (name === "framer-motion") return { motion: { div: "div", button: "button" } };
    if (name === "@/lib/cn") return { cn: (...values: string[]) => values.join(" ") };
    if (name === "@/lib/useAutoNarrate") return { useAutoNarrate: () => () => {} };
    if (name === "@/lib/sfx") return { playSfx: () => {} };
    if (name === "@/lib/haptic") return { haptic: () => {} };
    if (name === "./keyboard") return { shouldIgnoreKey: () => false };
    return {};
  },
});

function buttons(node: any): any[] {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(buttons);
  return [...(node.type === "button" ? [node] : []), ...buttons(node.props?.children)];
}

for (const type of ["fill_blank", "calculation", "word_problem"] as const) {
  for (const expected of ["1234567890", "12345678901", "1000000000000", "-1234567890.12", "12345678901/2"]) {
    for (const method of ["screen", "physical"] as const) {
      const question: Question = { id: 56, type, question: "填入答案", answer: expected, options: [], score: 1, difficulty: 1, knowledge_point: "", explanation: "" };
      let answer = "";
      const press = (key: string, locked = false, phase = "answering") => {
        handlers.clear();
        const tree = exports.FillBlankQuestion({ question, answer, phase, locked, onChange: (value: string) => { answer = value; } });
        if (method === "screen") {
          buttons(tree).find(button => button.props.children === key)?.props.onClick();
        } else {
          handlers.get("keydown")?.({ key: key === "⌫" ? "Backspace" : key, preventDefault() {} });
        }
      };
      for (const key of expected) press(key);
      assert.equal(answer, expected, `${type} ${method}: the entire answer must be enterable`);
      assert(gradeAnswer(question, answer), "the complete input must grade correctly");
      press("⌫");
      assert.equal(answer, expected.slice(0, -1), "long answers can still be edited");
      press(expected.at(-1)!);
      press("9", true);
      press("9", false, "checked");
      assert.equal(answer, expected, "locked and checked answers cannot change");
    }
  }
}
console.log("PASS: numeric answers beyond 10 characters can be entered, edited and graded through both keyboards.");
