import SwiftUI

/// Mistake bank hub — a hero card that launches review, plus the due list.
struct ReviewView: View {
    @ObservedObject var progressStore: ProgressStore
    @Binding var path: [AppRoute]
    var onContinueLearning: (() -> Void)? = nil
    @State private var selectedBucket: ReviewBucket = .today

    private enum ReviewBucket: String, CaseIterable {
        case today = "今天", tomorrow = "明天", later = "之后", mastered = "已掌握"
    }

    private func entries(in bucket: ReviewBucket) -> [MistakeEntry] {
        let bank = progressStore.progress.mistakesBank
        let today = SRS.todayString()
        let tomorrow = SRS.dateString(daysFromNow: 1)
        switch bucket {
        case .today: return progressStore.dueMistakes
        case .tomorrow: return bank.filter { !SRS.isGraduated($0) && $0.nextReviewDate == tomorrow }
        case .later: return bank.filter { !SRS.isGraduated($0) && ($0.nextReviewDate ?? today) > tomorrow }
        case .mastered: return bank.filter { SRS.isGraduated($0) }
        }
    }

    var body: some View {
        let due = progressStore.dueMistakes
        let all = progressStore.progress.mistakesBank

        ScrollView {
            VStack(spacing: 16) {
                LearningPageHeader(eyebrow: "复习，也是进步", title: "把不会的，变成会的", subtitle: "聪聪会在合适的时候，陪你再练一次。", tint: DuoColors.fox, mood: .think)
                hero(due: due.count, total: all.count)
                if !all.isEmpty {
                    bucketsBar
                }
                if !all.isEmpty {
                    VStack(alignment: .leading, spacing: 10) {
                        LearningSectionTitle(title: "\(selectedBucket.rawValue) · \(entries(in: selectedBucket).count) 道题")
                        ForEach(Array(entries(in: selectedBucket).enumerated()), id: \.offset) { _, entry in
                            mistakeRow(entry)
                        }
                        if entries(in: selectedBucket).isEmpty {
                            Text("这里暂时没有题目，按自己的节奏学习就好。")
                                .duoFont(.body).foregroundStyle(DuoColors.inkMuted)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .learningCard()
                        }
                    }
                }
            }
            .learningContent()
        }
        .background(DuoColors.canvas.ignoresSafeArea())
        .navigationTitle("错题本")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func hero(due: Int, total: Int) -> some View {
        VStack(spacing: 16) {
            if due > 0 {
                Text("有 \(due) 道题等你复习").duoFont(.heading).foregroundStyle(DuoColors.ink)
                Label("复习不扣红心，答对每题 +5 XP", systemImage: "heart.fill")
                    .duoFont(.caption).foregroundStyle(DuoColors.successInk)
                Button { path.append(.reviewRunner) } label: { Text("开始复习  答对每题 +5 XP") }
                    .buttonStyle(ChunkyButtonStyle(.primary))
                    .accessibilityIdentifier("review-start")
            } else {
                Text(total == 0 ? "还没有错题" : "今天的复习完成啦！").duoFont(.heading).foregroundStyle(DuoColors.ink)
                Text(total == 0 ? "答错的题目会自动收进这里" : "\(total) 道题在记忆排程中等待")
                    .duoFont(.caption).foregroundStyle(DuoColors.inkMuted)
                if let bookId = progressStore.activeBookId {
                    Button("继续学习") {
                        if let onContinueLearning { onContinueLearning() }
                        else { path.append(.bookDetail(bookId: bookId)) }
                    }
                        .buttonStyle(ChunkyButtonStyle(.primary))
                        .accessibilityIdentifier("review-continue-learning")
                }
            }

            HStack(spacing: 24) {
                miniStat(value: due, label: "今日待复习", tint: DuoColors.fox)
                miniStat(value: total, label: "错题总数", tint: DuoColors.secondary)
            }
            .padding(.top, 4)
        }
        .frame(maxWidth: .infinity)
        .padding(20)
        .background(DuoColors.surface, in: .rect(cornerRadius: Radius.large))
        .overlay { RoundedRectangle(cornerRadius: Radius.large).strokeBorder(DuoColors.border, lineWidth: 2) }
    }

    /// SRS 四桶概览：今天 / 明天 / 之后 / 已掌握（对照 web ReviewClient）。
    /// 已毕业的条目只进「已掌握」，其余按 nextReviewDate 分桶。
    ///
    /// ⚠️ 毕业判定必须走 `SRS.isGraduated`（派生语义），不能手抄
    /// `graduated != true`：老档 / 从 web 导入的条目常常只有 box + correctCount，
    /// 手抄判定会把它们算进「今天要复习」，而 hero 用的 `dueMistakes` 又不算 ——
    /// 同一屏给出两个互相打架的数字（core-2）。
    private var bucketsBar: some View {
        let bank = progressStore.progress.mistakesBank
        let active = bank.filter { !SRS.isGraduated($0) }
        let today = SRS.todayString()
        let tomorrow = SRS.dateString(daysFromNow: 1)
        let todayCount = active.filter { ($0.nextReviewDate ?? today) <= today }.count
        let tomorrowCount = active.filter { $0.nextReviewDate == tomorrow }.count
        let laterCount = active.filter { ($0.nextReviewDate ?? "") > tomorrow }.count
        let graduatedCount = bank.count - active.count

        return HStack(spacing: 8) {
            srsBucket(label: "今天", count: todayCount, tint: DuoColors.danger)
            srsBucket(label: "明天", count: tomorrowCount, tint: DuoColors.fox)
            srsBucket(label: "之后", count: laterCount, tint: DuoColors.secondary)
            srsBucket(label: "已掌握", count: graduatedCount, tint: DuoColors.primary)
        }
    }

    private func srsBucket(label: String, count: Int, tint: Color) -> some View {
        Button {
            HapticEngine.shared.tap()
            selectedBucket = ReviewBucket(rawValue: label) ?? .today
        } label: {
          VStack(spacing: 3) {
            Text("\(count)").duoNumeral(.heading).foregroundStyle(tint)
            Text(label).duoFont(.micro).tracking(1).foregroundStyle(DuoColors.inkMuted)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 10)
        .background(tint.opacity(0.10), in: .rect(cornerRadius: Radius.control))
        .overlay { RoundedRectangle(cornerRadius: Radius.control).strokeBorder(selectedBucket.rawValue == label ? tint : .clear, lineWidth: 2) }
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(label) \(count) 道题")
        .accessibilityIdentifier("review-bucket-\(label)")
        .accessibilityAddTraits(selectedBucket.rawValue == label ? [.isSelected] : [])
    }

    private func miniStat(value: Int, label: String, tint: Color) -> some View {
        VStack(spacing: 2) {
            Text("\(value)").duoNumeral(.title).foregroundStyle(tint)
            Text(label).duoFont(.micro).foregroundStyle(DuoColors.inkMuted)
        }
    }

    private func mistakeRow(_ entry: MistakeEntry) -> some View {
        HStack(spacing: 10) {
            ZStack {
                Circle().fill(DuoColors.fox.opacity(0.16)).frame(width: 38, height: 38)
                Text("\(entry.box ?? 1)").duoNumeral(.caption).foregroundStyle(DuoColors.fox)
            }
            VStack(alignment: .leading, spacing: 3) {
                Text(entry.question.question).duoFont(.body).foregroundStyle(DuoColors.ink).lineLimit(2)
                Text("来自 \(entry.lessonTitle ?? entry.lessonId)").duoFont(.micro).foregroundStyle(DuoColors.inkMuted).lineLimit(1)
            }
            Spacer(minLength: 0)
        }
        .padding(12)
        .background(DuoColors.surface, in: .rect(cornerRadius: Radius.card))
        .overlay { RoundedRectangle(cornerRadius: Radius.card).strokeBorder(DuoColors.border, lineWidth: 2) }
    }
}
