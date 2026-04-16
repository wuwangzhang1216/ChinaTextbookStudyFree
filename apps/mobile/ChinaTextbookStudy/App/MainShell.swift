import SwiftUI

/// Size-class-aware top-level layout.
///
/// - **Compact** (iPhone portrait) → one NavigationStack driven by `$path`,
///   root = HomeView.
/// - **Regular** (iPad, iPhone Pro Max landscape) → NavigationSplitView with
///   a persistent sidebar (grade + quick links) and a detail column that
///   owns its own navigation stack. Mirrors the commit `bff43ed` "桌面三栏"
///   intent for the Web side.
struct MainShell: View {
    @ObservedObject var progressStore: ProgressStore
    @ObservedObject var downloader: AssetDownloader
    let siteIndex: SiteIndex

    @Environment(\.horizontalSizeClass) private var hSize
    @State private var path: [AppRoute] = []
    @State private var selectedSidebar: SidebarItem? = .home

    enum SidebarItem: Hashable, Identifiable {
        case home
        case grade(Int)
        case review
        case achievements
        var id: String {
            switch self {
            case .home: return "home"
            case .grade(let g): return "grade-\(g)"
            case .review: return "review"
            case .achievements: return "achievements"
            }
        }
    }

    var body: some View {
        if hSize == .regular {
            regularLayout
        } else {
            compactLayout
        }
    }

    // MARK: - Compact (iPhone)

    @ViewBuilder
    private var compactLayout: some View {
        NavigationStack(path: $path) {
            HomeView(
                progressStore: progressStore,
                downloader: downloader,
                siteIndex: siteIndex,
                path: $path
            )
            .navigationDestination(for: AppRoute.self) { route in
                RouteView(
                    route: route,
                    progressStore: progressStore,
                    downloader: downloader,
                    siteIndex: siteIndex,
                    path: $path
                )
            }
        }
    }

    // MARK: - Regular (iPad)

    @ViewBuilder
    private var regularLayout: some View {
        NavigationSplitView {
            sidebar
        } detail: {
            NavigationStack(path: $path) {
                sidebarRootView
                    .navigationDestination(for: AppRoute.self) { route in
                        RouteView(
                            route: route,
                            progressStore: progressStore,
                            downloader: downloader,
                            siteIndex: siteIndex,
                            path: $path
                        )
                    }
            }
        }
        .navigationSplitViewStyle(.balanced)
    }

    // MARK: - Sidebar

    private var sidebar: some View {
        List(selection: $selectedSidebar) {
            Section("主菜单") {
                row(.home, label: "首页", icon: "house.fill", tint: .blue)
                row(.review, label: "错题本", icon: "exclamationmark.bubble.fill", tint: .orange)
                row(.achievements, label: "成就墙", icon: "rosette", tint: .purple)
            }
            Section("按年级") {
                ForEach(1...6, id: \.self) { grade in
                    row(.grade(grade), label: "\(grade) 年级", icon: "books.vertical.fill", tint: .green)
                }
            }
        }
        .navigationTitle("课本学习")
        .onChange(of: selectedSidebar) { _, _ in
            // Reset the detail-column stack when the sidebar pick changes
            // so pushes from the previous item don't leak.
            path.removeAll()
        }
    }

    private func row(_ item: SidebarItem, label: String, icon: String, tint: Color) -> some View {
        Label {
            Text(label)
        } icon: {
            Image(systemName: icon).foregroundStyle(tint)
        }
        .tag(item)
        .accessibilityIdentifier("sidebar-\(item.id)")
    }

    // MARK: - Detail root

    @ViewBuilder
    private var sidebarRootView: some View {
        switch selectedSidebar ?? .home {
        case .home:
            HomeView(
                progressStore: progressStore,
                downloader: downloader,
                siteIndex: siteIndex,
                path: $path
            )
        case .grade(let grade):
            BookListView(
                grade: grade,
                siteIndex: siteIndex,
                path: $path
            )
        case .review:
            ReviewView(progressStore: progressStore, path: $path)
        case .achievements:
            AchievementsView(progressStore: progressStore)
        }
    }
}

/// Extracted from RootView so both compact and regular layouts can reuse it.
struct RouteView: View {
    let route: AppRoute
    @ObservedObject var progressStore: ProgressStore
    @ObservedObject var downloader: AssetDownloader
    let siteIndex: SiteIndex
    @Binding var path: [AppRoute]

    var body: some View {
        switch route {
        case .gradePicker:
            GradePickerView(progressStore: progressStore, path: $path)
        case .bookList(let grade):
            BookListView(grade: grade, siteIndex: siteIndex, path: $path)
        case .bookDetail(let bookId):
            BookDetailView(
                bookId: bookId,
                progressStore: progressStore,
                downloader: downloader,
                path: $path
            )
        case .lesson(let bookId, let lessonId):
            LessonRunnerView(
                bookId: bookId,
                lessonId: lessonId,
                progressStore: progressStore,
                path: $path
            )
        case .lessonResult(let result):
            LessonResultView(
                result: result,
                progressStore: progressStore,
                path: $path
            )
        case .review:
            ReviewView(progressStore: progressStore, path: $path)
        case .reviewRunner:
            MistakeReviewRunnerView(progressStore: progressStore, path: $path)
        case .achievements:
            AchievementsView(progressStore: progressStore)
        case .stories(let bookId):
            StoryListView(bookId: bookId, path: $path)
        case .storyReader(let bookId, let storyId):
            StoryReaderView(bookId: bookId, storyId: storyId)
        case .reading(let bookId):
            PassageListView(bookId: bookId, path: $path)
        case .passageReader(let bookId, let passageId):
            PassageReaderView(bookId: bookId, passageId: passageId)
        }
    }
}
