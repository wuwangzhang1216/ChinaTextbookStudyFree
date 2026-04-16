import SwiftUI

/// Mistake bank — lists every entry in the SRS scheduler.
/// Tapping "开始复习" enters a runner that walks every due mistake.
struct ReviewView: View {
    @ObservedObject var progressStore: ProgressStore
    @Binding var path: [AppRoute]

    var body: some View {
        let due = progressStore.dueMistakes
        let all = progressStore.progress.mistakesBank

        ScrollView {
            VStack(spacing: 16) {
                summaryCard(due: due.count, total: all.count)

                if due.isEmpty {
                    emptyState(allCount: all.count)
                } else {
                    Button {
                        path.append(.reviewRunner)
                    } label: {
                        Text("\(due.count > 1 ? "复习 \(due.count) 道题" : "复习 1 道题")")
                            .font(.headline)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                    }
                    .buttonStyle(.borderedProminent)
                    .accessibilityIdentifier("review-start")

                    VStack(spacing: 8) {
                        ForEach(due, id: \.question.id) { entry in
                            mistakeRow(entry)
                        }
                    }
                }
            }
            .padding()
        }
        .navigationTitle("错题本")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func summaryCard(due: Int, total: Int) -> some View {
        HStack(spacing: 16) {
            stat(value: "\(due)", label: "今日待复习", tint: .orange)
            stat(value: "\(total)", label: "总错题数", tint: .blue)
        }
    }

    private func stat(value: String, label: String, tint: Color) -> some View {
        VStack(spacing: 4) {
            Text(value).font(.title.bold()).foregroundStyle(tint)
            Text(label).font(.caption).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 14)
        .background(Color(.secondarySystemBackground), in: .rect(cornerRadius: 14))
    }

    private func emptyState(allCount: Int) -> some View {
        VStack(spacing: 12) {
            Image(systemName: allCount == 0 ? "checkmark.seal.fill" : "moon.zzz.fill")
                .font(.largeTitle)
                .foregroundStyle(allCount == 0 ? .green : .secondary)
            Text(allCount == 0 ? "目前没有错题" : "今天的复习已经完成 🎉")
                .font(.headline)
            if allCount > 0 {
                Text("剩余 \(allCount) 道题在 SRS 排程中等待")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(40)
        .frame(maxWidth: .infinity)
        .background(Color(.secondarySystemBackground), in: .rect(cornerRadius: 16))
    }

    private func mistakeRow(_ entry: MistakeEntry) -> some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 4) {
                Text(entry.question.question)
                    .font(.subheadline)
                    .lineLimit(2)
                Text("Box \(entry.box ?? 1) · 来自 \(entry.lessonTitle ?? entry.lessonId)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
        }
        .padding(12)
        .background(Color(.tertiarySystemBackground), in: .rect(cornerRadius: 10))
    }
}
