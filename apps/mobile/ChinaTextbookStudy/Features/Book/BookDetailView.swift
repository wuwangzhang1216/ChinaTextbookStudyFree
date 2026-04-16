import SwiftUI

/// Plain lesson list for one book — placeholder for the eventual PathMap.
/// This phase aims for a working learning loop, not the Duolingo-style art.
/// The PathMap visual treatment is deferred to Phase 6/7.
struct BookDetailView: View {
    let bookId: String
    @ObservedObject var progressStore: ProgressStore
    @ObservedObject var downloader: AssetDownloader
    @Binding var path: [AppRoute]

    @State private var outline: Outline?
    @State private var loadError: String?
    @State private var lessons: [LessonRow] = []

    /// Lightweight row metadata derived from outline + on-disk lesson files.
    struct LessonRow: Identifiable, Hashable {
        let id: String
        let title: String
        let unitNumber: Int
        let unitTitle: String
        let kpIndex: Int
        let kpTotal: Int
        let questionCount: Int
    }

    var body: some View {
        Group {
            if let outline {
                content(outline: outline)
            } else if let loadError {
                VStack(spacing: 12) {
                    Image(systemName: "tray.and.arrow.down").font(.largeTitle).foregroundStyle(.secondary)
                    Text("这本书还没下载").font(.headline)
                    Text(loadError).font(.footnote).foregroundStyle(.secondary)
                    if let entry = downloader.manifest?.books.first(where: { $0.bookId == bookId }) {
                        Button {
                            Task {
                                try? await downloader.ensureBookDownloaded(entry)
                                load()
                            }
                        } label: {
                            Label("下载这本", systemImage: "arrow.down.circle.fill")
                        }
                        .buttonStyle(.borderedProminent)
                    }
                }
                .padding()
            } else {
                ProgressView()
            }
        }
        .navigationTitle(outline?.textbook ?? bookId)
        .navigationBarTitleDisplayMode(.inline)
        .task { load() }
    }

    private func content(outline: Outline) -> some View {
        List {
            Section {
                HStack(spacing: 12) {
                    sideEntry(label: "课文听读", icon: "text.book.closed", tint: .blue) {
                        path.append(.reading(bookId: bookId))
                    }
                    sideEntry(label: "课外故事", icon: "book.closed", tint: .purple) {
                        path.append(.stories(bookId: bookId))
                    }
                }
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets(top: 8, leading: 0, bottom: 8, trailing: 0))
            }
            ForEach(Array(groupedByUnit(outline: outline).enumerated()), id: \.offset) { _, group in
                Section {
                    ForEach(group.rows) { row in
                        Button {
                            path.append(.lesson(bookId: bookId, lessonId: row.id))
                        } label: {
                            lessonRowView(row)
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("lesson-row-\(row.id)")
                    }
                } header: {
                    Text("第\(group.unitNumber)单元 · \(group.unitTitle)")
                }
            }
        }
        .listStyle(.insetGrouped)
    }

    private func sideEntry(label: String, icon: String, tint: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 6) {
                Image(systemName: icon).font(.title3).foregroundStyle(tint)
                Text(label).font(.caption.bold())
            }
            .frame(maxWidth: .infinity, minHeight: 60)
            .background(Color(.secondarySystemBackground), in: .rect(cornerRadius: 12))
        }
        .buttonStyle(.plain)
    }

    private func lessonRowView(_ row: LessonRow) -> some View {
        let stars = progressStore.stars(for: row.id) ?? 0
        let isDone = stars > 0
        return HStack(spacing: 12) {
            ZStack {
                Circle()
                    .fill(isDone ? Color.green.opacity(0.18) : Color(.tertiarySystemFill))
                Text("\(row.kpIndex + 1)")
                    .font(.headline.bold())
                    .foregroundStyle(isDone ? .green : .primary)
            }
            .frame(width: 44, height: 44)
            VStack(alignment: .leading, spacing: 4) {
                Text(row.title).font(.subheadline.bold())
                Text("\(row.questionCount) 题")
                    .font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            if isDone {
                HStack(spacing: 2) {
                    ForEach(0..<3, id: \.self) { i in
                        Image(systemName: i < stars ? "star.fill" : "star")
                            .font(.caption2)
                            .foregroundStyle(.yellow)
                    }
                }
            }
            Image(systemName: "chevron.right").foregroundStyle(.tertiary)
        }
        .padding(.vertical, 4)
    }

    // MARK: - Loading

    private func load() {
        do {
            let outline = try DataLoader.shared.loadOutline(bookId: bookId)
            self.outline = outline
            self.lessons = expandLessons(outline: outline)
            self.loadError = nil
        } catch {
            self.loadError = (error as? LocalizedError)?.errorDescription ?? String(describing: error)
        }
    }

    private func expandLessons(outline: Outline) -> [LessonRow] {
        var rows: [LessonRow] = []
        for unit in outline.units {
            for (i, kp) in unit.knowledgePoints.enumerated() {
                let lessonId = "\(bookId)-u\(unit.unitNumber)-kp\(i + 1)"
                // Try to peek at the file to get question count, but degrade gracefully.
                let count = (try? DataLoader.shared.loadLesson(bookId: bookId, lessonId: lessonId).questions.count) ?? 0
                rows.append(LessonRow(
                    id: lessonId,
                    title: kp.name,
                    unitNumber: unit.unitNumber,
                    unitTitle: unit.title,
                    kpIndex: i,
                    kpTotal: unit.knowledgePoints.count,
                    questionCount: count
                ))
            }
        }
        return rows
    }

    private struct UnitGroup {
        let unitNumber: Int
        let unitTitle: String
        let rows: [LessonRow]
    }

    private func groupedByUnit(outline: Outline) -> [UnitGroup] {
        outline.units.map { u in
            UnitGroup(
                unitNumber: u.unitNumber,
                unitTitle: u.title,
                rows: lessons.filter { $0.unitNumber == u.unitNumber }
            )
        }
    }
}
