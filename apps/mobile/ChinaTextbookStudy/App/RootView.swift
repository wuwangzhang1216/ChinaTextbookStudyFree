import SwiftUI

/// App entry — delegates to `MainShell` once the site index is loaded.
///
/// Everything route-related moved into [MainShell.swift](MainShell.swift) so
/// the split-view / stack-view fork lives in one place.
struct RootView: View {
    @StateObject private var progressStore = ProgressStore.shared
    @StateObject private var downloader = AssetDownloader.shared
    @State private var siteIndex: SiteIndex?
    @State private var loadError: String?

    var body: some View {
        Group {
            if let siteIndex {
                MainShell(
                    progressStore: progressStore,
                    downloader: downloader,
                    siteIndex: siteIndex
                )
            } else if let loadError {
                VStack(spacing: 12) {
                    Text("加载失败").font(.headline)
                    Text(loadError).font(.footnote).foregroundStyle(.secondary)
                }
                .padding()
            } else {
                ProgressView("加载中…")
            }
        }
        .task {
            SeedInstaller.installIfNeeded()
            do {
                siteIndex = try DataLoader.shared.loadSiteIndex()
            } catch {
                loadError = String(describing: error)
            }
            _ = downloader.loadCachedManifest()
            Task { try? await downloader.loadManifest() }
        }
    }
}

/// Optional intermediate view — kept as a stub for the bookList route.
/// Currently used by the iPad sidebar's "按年级" items to show a persistent
/// book list on the detail column.
struct BookListView: View {
    let grade: Int
    let siteIndex: SiteIndex
    @Binding var path: [AppRoute]

    var body: some View {
        List(siteIndex.books.filter { $0.grade == grade }, id: \.id) { book in
            Button {
                path.append(.bookDetail(bookId: book.id))
            } label: {
                VStack(alignment: .leading, spacing: 4) {
                    Text(book.fullName).font(.headline)
                    Text("\(book.unitsCount) 单元 · \(book.lessonsCount) 节小课")
                        .font(.caption).foregroundStyle(.secondary)
                }
            }
            .buttonStyle(.plain)
        }
        .navigationTitle("\(grade) 年级")
        .navigationBarTitleDisplayMode(.inline)
    }
}

#Preview {
    RootView()
}
