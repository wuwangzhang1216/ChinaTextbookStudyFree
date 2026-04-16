import SwiftUI

/// Top-level home screen — equivalent to apps/web/src/app/HomeClient.tsx (subset).
/// Shows XP / streak / a "continue learning" jump and a "pick grade" entry.
struct HomeView: View {
    @ObservedObject var progressStore: ProgressStore
    @ObservedObject var downloader: AssetDownloader
    let siteIndex: SiteIndex
    @Binding var path: [AppRoute]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                statsCard
                quickLinks
                gradePicker
                continueLearning
            }
            .padding(20)
        }
        .navigationTitle("课本学习")
        .navigationBarTitleDisplayMode(.large)
    }

    private var quickLinks: some View {
        HStack(spacing: 12) {
            quickTile(title: "错题本", icon: "exclamationmark.bubble.fill", tint: .orange) {
                path.append(.review)
            }
            .accessibilityIdentifier("home-review")
            quickTile(title: "成就墙", icon: "rosette", tint: .purple) {
                path.append(.achievements)
            }
            .accessibilityIdentifier("home-achievements")
        }
    }

    private func quickTile(title: String, icon: String, tint: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack {
                Image(systemName: icon).font(.title3).foregroundStyle(tint)
                Text(title).font(.subheadline.bold())
                Spacer()
                Image(systemName: "chevron.right").foregroundStyle(.tertiary)
            }
            .padding(14)
            .background(Color(.secondarySystemBackground), in: .rect(cornerRadius: 14))
        }
        .buttonStyle(.plain)
    }

    private var statsCard: some View {
        HStack(spacing: 16) {
            statTile(value: "\(progressStore.progress.xp)", label: "总经验", icon: "bolt.fill", tint: .yellow)
            statTile(value: "\(progressStore.progress.streak)", label: "连续天数", icon: "flame.fill", tint: .orange)
            statTile(value: "\(progressStore.totalCompletedLessons)", label: "已完成", icon: "checkmark.seal.fill", tint: .green)
        }
    }

    private func statTile(value: String, label: String, icon: String, tint: Color) -> some View {
        VStack(spacing: 6) {
            Image(systemName: icon).font(.title2).foregroundStyle(tint)
            Text(value).font(.title2.bold())
            Text(label).font(.caption).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 14)
        .background(Color(.secondarySystemBackground), in: .rect(cornerRadius: 16))
    }

    private var gradePicker: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("选择年级").font(.headline)
            Button {
                path.append(.gradePicker)
            } label: {
                HStack {
                    Image(systemName: "books.vertical.fill").foregroundStyle(.blue)
                    if progressStore.selectedGrade > 0 {
                        Text("当前：\(progressStore.selectedGrade)年级")
                    } else {
                        Text("挑一个年级开始学习")
                    }
                    Spacer()
                    Image(systemName: "chevron.right").foregroundStyle(.tertiary)
                }
                .padding()
                .background(Color(.secondarySystemBackground), in: .rect(cornerRadius: 14))
            }
            .buttonStyle(.plain)
        }
    }

    private var continueLearning: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("可以学的书").font(.headline)
            let books = booksForCurrentGrade
            if books.isEmpty {
                Text("先选一个年级吧").foregroundStyle(.secondary)
            } else {
                ForEach(books, id: \.id) { book in
                    Button {
                        path.append(.bookDetail(bookId: book.id))
                    } label: {
                        bookCard(book)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private var booksForCurrentGrade: [Book] {
        let grade = progressStore.selectedGrade
        if grade <= 0 { return Array(siteIndex.books.prefix(6)) }
        return siteIndex.books.filter { $0.grade == grade }
    }

    private func bookCard(_ book: Book) -> some View {
        let cfg = Subjects.resolve(book: book)
        let isDownloaded = downloader.isBookDownloaded(book.id)
        return HStack(spacing: 12) {
            Circle().fill(cfg.accent.opacity(0.15)).frame(width: 44, height: 44)
                .overlay(Text(cfg.label).font(.callout.bold()).foregroundStyle(cfg.accent))
            VStack(alignment: .leading, spacing: 4) {
                Text(book.fullName).font(.subheadline.bold())
                Text("\(book.unitsCount) 单元 · \(book.lessonsCount) 节小课")
                    .font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            if isDownloaded {
                Image(systemName: "checkmark.circle.fill").foregroundStyle(.green)
                    .accessibilityLabel("已下载")
            } else {
                Image(systemName: "arrow.down.circle").foregroundStyle(.secondary)
                    .accessibilityLabel("未下载")
            }
        }
        .padding(12)
        .background(Color(.secondarySystemBackground), in: .rect(cornerRadius: 14))
    }
}
