import SwiftUI

/// Walks the SRS-due mistakes one at a time — same tactile feel as a lesson,
/// but no hearts are lost and finishing awards review XP.
struct MistakeReviewRunnerView: View {
    @ObservedObject var progressStore: ProgressStore
    @Binding var path: [AppRoute]

    @State private var queue: [MistakeEntry] = []
    @State private var index: Int = 0
    @State private var phase: LessonRunnerView.QuestionPhase = .answering
    @State private var currentAnswer: String = ""
    @State private var isCorrect: Bool? = nil
    @State private var correctCount: Int = 0
    @State private var awarded = false
    /// 本轮里新毕业（🎓 已掌握）的题数 — reviewMistake 返回值累加。
    @State private var graduatedCount: Int = 0
    /// 本轮真的领到了那颗心（content-7 断心联动）；结算页展示用。
    /// 只由 `claimReviewHeartIfEligible` 的返回值决定 —— 领没领得成由 store
    /// 的按天账本说了算，这里的 @State 只负责显示（iosretention-4）。
    @State private var heartRewarded = false

    private let xpPerCorrect = 5

    /// A lesson result can enter review directly while the learning tab is
    /// underneath. "返回错题本" must still return to the actual review tab.
    private func exitToReview() {
        path.removeAll()
        path.append(.review)
    }

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
        .background(DuoColors.bg.ignoresSafeArea())
        .toolbar(.hidden, for: .navigationBar)
        .onAppear { if queue.isEmpty { queue = progressStore.dueMistakes } }
        .onDisappear { AudioPlayer.shared.stop() }
    }

    private var emptyState: some View {
        VStack(spacing: 14) {
            MascotView(mood: .proud, size: 96)
            Text("没有要复习的错题").duoFont(.heading).foregroundStyle(DuoColors.ink)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .safeAreaInset(edge: .bottom, spacing: 0) {
            LearningActionDock {
                Button("返回错题本", action: exitToReview).buttonStyle(ChunkyButtonStyle(.primary))
            }
        }
    }

    private var summary: some View {
        LearningCelebrationBody {
            VStack(spacing: 18) {
                MascotView(mood: .proud, size: 110, reactTo: .levelup)
                Text("复习完成！").duoFont(.title).foregroundStyle(DuoColors.ink)
                Text("答对 \(correctCount) / \(queue.count)").duoFont(.subhead).foregroundStyle(DuoColors.inkMuted)

                HStack(spacing: 10) {
                    HStack(spacing: 6) {
                        Image(systemName: "bolt.fill").font(.system(size: 15, weight: .heavy))
                        Text("+\(correctCount * xpPerCorrect) XP").duoNumeral(.subhead)
                    }
                    .foregroundStyle(DuoColors.secondary)
                    .padding(.horizontal, 16).padding(.vertical, 9)
                    .background(DuoColors.secondary.opacity(0.14), in: .capsule)

                    if heartRewarded {
                        HStack(spacing: 6) {
                            Image(systemName: "heart.fill").font(.system(size: 15, weight: .heavy))
                            Text("+1").duoNumeral(.subhead)
                        }
                        .foregroundStyle(DuoColors.danger)
                        .padding(.horizontal, 16).padding(.vertical, 9)
                        .background(DuoColors.danger.opacity(0.12), in: .capsule)
                        .accessibilityLabel("恢复一颗红心")
                    }
                }

                if heartRewarded {
                    Text("坚持复习，补回一颗红心！").duoFont(.caption).foregroundStyle(DuoColors.inkMuted)
                }

                if graduatedCount > 0 {
                    Text("🎓 \(graduatedCount) 道题毕业了！")
                        .duoFont(.subhead).foregroundStyle(DuoColors.primary)
                        .padding(.horizontal, 16).padding(.vertical, 9)
                        .background(DuoColors.primary.opacity(0.12), in: .capsule)
                }

            }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            LearningActionDock {
                Button("返回错题本", action: exitToReview).buttonStyle(ChunkyButtonStyle(.primary))
                    .accessibilityIdentifier("review-result-done")
            }
        }
        .onAppear {
            guard !awarded else { return }
            awarded = true
            progressStore.awardReviewXP(correctCount * xpPerCorrect, reviewedCount: queue.count)
            // content-7 断心联动：走完一整轮到期错题，缺心时补 1 颗。
            // 领取资格（最低答对数 + 按天账本）全在 store 里判，@State 挡不住
            // 「答错→立刻到期→再刷一轮」的循环（iosretention-4）。
            heartRewarded = progressStore.claimReviewHeartIfEligible(
                correctCount: correctCount,
                now: Date()
            )
            SFXEngine.shared.play(.complete); HapticEngine.shared.success()
        }
    }

    private var runner: some View {
        let entry = queue[index]
        let q = entry.question
        return VStack(spacing: 0) {
            LearningActivityHeader(progress: Double(index) / Double(max(queue.count, 1)),
                                   position: "\(index + 1)/\(queue.count)", showsMute: true,
                                   onClose: exitToReview)

            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    Text("复习错题").duoFont(.caption).foregroundStyle(DuoColors.fox)
                    HStack(alignment: .top, spacing: 8) {
                        Text(MathText.render(q.question)).duoFont(.subhead, weight: .medium).foregroundStyle(DuoColors.ink)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        SlowTTSButton(path: q.audio?.question)
                    }
                    QuestionRendererView(question: q, answer: currentAnswer, phase: phase, isCorrect: isCorrect, onChange: { currentAnswer = $0 })
                        .id(q.id)
                }
                .learningContent()
            }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            footer(entry: entry, q: q)
        }
    }

    @ViewBuilder
    private func footer(entry: MistakeEntry, q: Question) -> some View {
        if phase == .checked, let ok = isCorrect {
            LearningFeedbackPanel(correct: ok, title: ok ? "答对了！" : "再学会一点", answer: q.answer,
                                  explanation: q.explanation, audio: q.audio?.explanation,
                                  buttonTitle: index + 1 >= queue.count ? "完成复习" : "继续",
                                  onContinue: { advance() })
        } else {
            LearningActionDock {
                Button("检查答案") { check(entry: entry) }
                    .buttonStyle(ChunkyButtonStyle(currentAnswer.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? .disabled : .primary))
                    .disabled(currentAnswer.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    .accessibilityIdentifier("检查答案")
            }
        }
    }

    private func check(entry: MistakeEntry) {
        let ok = Grade.gradeAnswer(question: entry.question, userAnswer: currentAnswer)
        withAnimation(Motion.reveal) { phase = .checked; isCorrect = ok }
        if ok { correctCount += 1; SFXEngine.shared.play(.correct); HapticEngine.shared.correct() }
        else { SFXEngine.shared.play(.wrong); HapticEngine.shared.wrong() }
        let newlyGraduated = progressStore.reviewMistake(lessonId: entry.lessonId, questionId: entry.question.id, isCorrect: ok)
        if newlyGraduated { graduatedCount += 1 }
        // 答错时自动朗读解析，帮孩子当场弄懂（content-7）。
        if !ok, let explanationAudio = entry.question.audio?.explanation {
            AudioPlayer.shared.play(path: explanationAudio)
        }
    }

    private func advance() {
        SFXEngine.shared.play(.progressTick); HapticEngine.shared.tap()
        withAnimation(.easeInOut(duration: 0.2)) {
            index += 1; currentAnswer = ""; isCorrect = nil; phase = .answering
        }
    }
}
