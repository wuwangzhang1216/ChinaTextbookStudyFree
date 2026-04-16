import SwiftUI

/// Walks through the SRS-due mistakes one at a time, scoring each via
/// `Grade.gradeAnswer` and feeding the result back to `ProgressStore.reviewMistake`
/// so the Leitner box / cooldown advances.
///
/// Structurally similar to LessonRunnerView but distinct enough that
/// duplicating the ~150 lines keeps both runners simpler than a shared
/// abstraction would be.
struct MistakeReviewRunnerView: View {
    @ObservedObject var progressStore: ProgressStore
    @Binding var path: [AppRoute]

    @State private var queue: [MistakeEntry] = []
    @State private var index: Int = 0
    @State private var phase: LessonRunnerView.QuestionPhase = .answering
    @State private var currentAnswer: String = ""
    @State private var isCorrect: Bool? = nil
    @State private var correctCount: Int = 0

    var body: some View {
        Group {
            if queue.isEmpty {
                emptyState
            } else if index >= queue.count {
                summary
            } else {
                runner
            }
        }
        .navigationTitle("错题复习")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .topBarTrailing) { MuteToggle() } }
        .onAppear {
            if queue.isEmpty {
                queue = progressStore.dueMistakes
            }
        }
        .onDisappear { AudioPlayer.shared.stop() }
    }

    private var emptyState: some View {
        VStack(spacing: 12) {
            Image(systemName: "checkmark.seal.fill").font(.largeTitle).foregroundStyle(.green)
            Text("没有要复习的错题").font(.headline)
        }
    }

    private var summary: some View {
        VStack(spacing: 18) {
            Image(systemName: "rosette").font(.system(size: 60)).foregroundStyle(.yellow)
            Text("复习完成！").font(.title.bold())
            Text("答对 \(correctCount) / \(queue.count)").font(.headline)
            Button {
                path.removeLast() // back to ReviewView
            } label: {
                Text("返回错题本")
                    .frame(maxWidth: .infinity).padding(.vertical, 12)
            }
            .buttonStyle(.borderedProminent)
            .padding(.horizontal, 32)
        }
        .padding()
    }

    private var runner: some View {
        let entry = queue[index]
        let q = entry.question
        return VStack(spacing: 0) {
            VStack(spacing: 8) {
                ProgressView(value: Double(index + 1), total: Double(queue.count))
                Text("\(index + 1) / \(queue.count) · 来自 \(entry.lessonTitle ?? entry.lessonId)")
                    .font(.caption).foregroundStyle(.secondary)
            }
            .padding()

            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    HStack(alignment: .top, spacing: 8) {
                        Text(q.question)
                            .font(.title3.weight(.semibold))
                            .frame(maxWidth: .infinity, alignment: .leading)
                        TTSButton(path: q.audio?.question)
                    }
                    QuestionRendererView(
                        question: q,
                        answer: currentAnswer,
                        phase: phase,
                        isCorrect: isCorrect,
                        onChange: { currentAnswer = $0 }
                    )
                    .id(q.id)
                    if phase == .checked {
                        feedback(question: q)
                    }
                }
                .padding()
            }

            Divider()
            Button {
                phase == .answering ? check(entry: entry) : advance()
            } label: {
                Text(phase == .answering ? "检查答案" : (index + 1 >= queue.count ? "完成复习" : "下一题"))
                    .frame(maxWidth: .infinity).padding(.vertical, 12)
            }
            .buttonStyle(.borderedProminent)
            .disabled(phase == .answering && currentAnswer.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            .padding()
        }
    }

    private func feedback(question: Question) -> some View {
        let ok = isCorrect ?? false
        return HStack {
            Image(systemName: ok ? "checkmark.circle.fill" : "xmark.circle.fill")
                .foregroundStyle(ok ? .green : .red)
            Text(ok ? "答对了！" : "正确答案：\(question.answer)")
                .font(.subheadline)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background((ok ? Color.green : Color.red).opacity(0.10), in: .rect(cornerRadius: 12))
    }

    private func check(entry: MistakeEntry) {
        let ok = Grade.gradeAnswer(question: entry.question, userAnswer: currentAnswer)
        phase = .checked
        isCorrect = ok
        if ok { correctCount += 1 }
        progressStore.reviewMistake(
            lessonId: entry.lessonId,
            questionId: entry.question.id,
            isCorrect: ok
        )
    }

    private func advance() {
        index += 1
        currentAnswer = ""
        isCorrect = nil
        phase = .answering
    }
}
