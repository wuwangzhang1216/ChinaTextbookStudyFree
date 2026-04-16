import SwiftUI

/// Lesson completion summary. Shows xp award + stars + per-question accuracy.
struct LessonResultView: View {
    let result: LessonRunResult
    @ObservedObject var progressStore: ProgressStore
    @Binding var path: [AppRoute]

    var body: some View {
        VStack(spacing: 28) {
            Spacer(minLength: 40)

            VStack(spacing: 12) {
                Text("恭喜完成！")
                    .font(.largeTitle.bold())
                Text(result.lessonTitle)
                    .font(.headline)
                    .foregroundStyle(.secondary)
            }

            HStack(spacing: 16) {
                ForEach(0..<3, id: \.self) { i in
                    Image(systemName: i < result.stars ? "star.fill" : "star")
                        .font(.system(size: 56))
                        .foregroundStyle(.yellow)
                        .scaleEffect(i < result.stars ? 1.0 : 0.85)
                }
            }
            .padding(.vertical, 8)

            VStack(spacing: 8) {
                summaryRow(label: "正确率", value: "\(Int(round(result.accuracy * 100)))%")
                summaryRow(label: "答对题数", value: "\(result.correctCount) / \(result.questionCount)")
                summaryRow(label: "本节获得 XP", value: "+\(awardedXp)")
            }
            .padding()
            .background(Color(.secondarySystemBackground), in: .rect(cornerRadius: 16))
            .padding(.horizontal)

            Spacer()

            Button {
                // Pop everything until we're back at the book detail (or home).
                while path.count > 1 { path.removeLast() }
                if path.last.map({ if case .bookDetail = $0 { return false } else { return true } }) ?? true {
                    path.removeAll()
                }
            } label: {
                Text("继续学习")
                    .font(.headline)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
            }
            .buttonStyle(.borderedProminent)
            .padding(.horizontal)
            .padding(.bottom, 24)
        }
        .navigationTitle("结算")
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(true)
    }

    private var awardedXp: Int {
        let base = result.questionCount * 10
        return result.stars == 3 ? base * 2 : base
    }

    private func summaryRow(label: String, value: String) -> some View {
        HStack {
            Text(label).foregroundStyle(.secondary)
            Spacer()
            Text(value).font(.headline)
        }
    }
}
