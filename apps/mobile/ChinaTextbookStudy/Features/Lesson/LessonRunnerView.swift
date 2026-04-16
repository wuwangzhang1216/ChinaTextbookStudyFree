import SwiftUI

/// Top-level lesson runner — drives one question at a time through
/// answering → checked → next, then pushes a result view at the end.
///
/// Hearts / mascot / combo / sound effects are intentionally deferred to
/// later phases; this view focuses on the correctness loop + persistence.
struct LessonRunnerView: View {
    let bookId: String
    let lessonId: String
    @ObservedObject var progressStore: ProgressStore
    @Binding var path: [AppRoute]

    @State private var lesson: Lesson?
    @State private var loadError: String?
    @State private var index: Int = 0
    @State private var phase: QuestionPhase = .answering
    @State private var currentAnswer: String = ""
    @State private var isCorrect: Bool? = nil
    @State private var correctCount: Int = 0
    @State private var attemptedAnyMistakeThisQuestion: Bool = false
    @ObservedObject private var settings = SettingsStore.shared
    @ObservedObject private var audioPlayer = AudioPlayer.shared

    enum QuestionPhase { case answering, checked }

    var body: some View {
        Group {
            if let lesson, !lesson.questions.isEmpty {
                runner(lesson: lesson)
            } else if let loadError {
                VStack(spacing: 12) {
                    Text("加载失败").font(.headline)
                    Text(loadError).font(.footnote).foregroundStyle(.secondary)
                }
                .padding()
            } else {
                ProgressView()
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) { MuteToggle() }
        }
        .task { load() }
        .onDisappear { audioPlayer.stop() }
    }

    @ViewBuilder
    private func runner(lesson: Lesson) -> some View {
        let q = lesson.questions[index]
        VStack(spacing: 0) {
            // Header: progress bar + title
            VStack(spacing: 8) {
                ProgressView(value: Double(index + 1), total: Double(lesson.questions.count))
                Text("\(index + 1) / \(lesson.questions.count) · \(lesson.title)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
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
                        onChange: { newValue in
                            currentAnswer = newValue
                        }
                    )
                    .id(q.id)  // reset child state on question change

                    if phase == .checked {
                        feedbackBlock(question: q)
                    }
                }
                .padding()
            }
            .onChange(of: q.id) { _, _ in autoNarrate(q) }
            .onAppear { autoNarrate(q) }

            footer(question: q, lesson: lesson)
        }
    }

    private func feedbackBlock(question: Question) -> some View {
        let ok = isCorrect ?? false
        return VStack(alignment: .leading, spacing: 8) {
            HStack {
                Image(systemName: ok ? "checkmark.circle.fill" : "xmark.circle.fill")
                    .foregroundStyle(ok ? .green : .red)
                Text(ok ? "答对啦！" : "答错了")
                    .font(.headline)
                    .foregroundStyle(ok ? .green : .red)
                Spacer()
                TTSButton(path: question.audio?.explanation, size: 16)
            }
            if !ok {
                Text("正确答案：\(question.answer)")
                    .font(.subheadline)
            }
            if !question.explanation.isEmpty {
                Text(question.explanation)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background((ok ? Color.green : Color.red).opacity(0.10),
                    in: .rect(cornerRadius: 14))
    }

    private func autoNarrate(_ q: Question) {
        guard settings.autoNarrate, !settings.isMuted else { return }
        guard let path = q.audio?.question else { return }
        audioPlayer.play(path: path, settings: settings)
    }

    private func footer(question: Question, lesson: Lesson) -> some View {
        VStack(spacing: 12) {
            Divider()
            HStack {
                if phase == .answering {
                    Button {
                        check(question: question, lessonTitle: lesson.title)
                    } label: {
                        Text("检查答案")
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(currentAnswer.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                } else {
                    Button {
                        advance(lesson: lesson)
                    } label: {
                        Text(index + 1 >= lesson.questions.count ? "完成本节" : "下一题")
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                    }
                    .buttonStyle(.borderedProminent)
                }
            }
            .padding(.horizontal)
            .padding(.bottom, 8)
        }
    }

    // MARK: - Actions

    private func check(question: Question, lessonTitle: String) {
        let ok = Grade.gradeAnswer(question: question, userAnswer: currentAnswer)
        phase = .checked
        isCorrect = ok
        if ok {
            if !attemptedAnyMistakeThisQuestion {
                correctCount += 1
            }
        } else {
            attemptedAnyMistakeThisQuestion = true
            progressStore.recordMistake(
                lessonId: lessonId,
                lessonTitle: lessonTitle,
                question: question
            )
        }
    }

    private func advance(lesson: Lesson) {
        if index + 1 >= lesson.questions.count {
            finish(lesson: lesson)
        } else {
            index += 1
            currentAnswer = ""
            isCorrect = nil
            phase = .answering
            attemptedAnyMistakeThisQuestion = false
        }
    }

    private func finish(lesson: Lesson) {
        let total = lesson.questions.count
        let result = LessonRunResult(
            bookId: bookId,
            lessonId: lessonId,
            lessonTitle: lesson.title,
            questionCount: total,
            correctCount: correctCount
        )
        progressStore.completeLesson(
            lessonId: lessonId,
            accuracy: result.accuracy,
            questionCount: total
        )
        // Replace the runner with the result so back doesn't re-enter the lesson.
        path.removeLast()
        path.append(.lessonResult(result))
    }

    // MARK: - Loading

    private func load() {
        do {
            self.lesson = try DataLoader.shared.loadLesson(bookId: bookId, lessonId: lessonId)
        } catch {
            self.loadError = (error as? LocalizedError)?.errorDescription ?? String(describing: error)
        }
    }
}
