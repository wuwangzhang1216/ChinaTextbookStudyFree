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
    @State private var activeTab: AppTab = .learn
    /// 聪聪's "我们马上开始第一课！" toast shown right after onboarding.
    @State private var showFirstLessonToast = false
    /// 自动进第一课只允许发生一次（iosretention-3），避免任何重复推进。
    @State private var didAutoStartFirstLesson = false
    #if DEBUG
    @State private var didPrepareUITestSurface = false
    #endif

    enum SidebarItem: Hashable, Identifiable {
        case home
        case grade(Int)
        case league
        case review
        case shop
        case profile
        case achievements
        var id: String {
            switch self {
            case .home: return "home"
            case .grade(let g): return "grade-\(g)"
            case .league: return "league"
            case .review: return "review"
            case .shop: return "shop"
            case .profile: return "profile"
            case .achievements: return "achievements"
            }
        }
    }

    var body: some View {
        Group {
            if hSize == .regular {
                regularLayout
            } else {
                compactLayout
            }
        }
        .task { prepareUITestSurface() }
        // 立刻进第一课 (ios-retention-11): the moment onboarding completes,
        // push the learner straight into lesson one — no empty home screen
        // between "I committed to a goal" and "I'm learning".
        .onChange(of: progressStore.hasCompletedOnboarding) { _, done in
            if done, isBrandNewLearner { startFirstLessonAfterOnboarding() }
        }
        .overlay(alignment: .top) {
            if showFirstLessonToast {
                firstLessonToast
                    .transition(.move(edge: .top).combined(with: .opacity))
                    .zIndex(10)
            }
        }
    }

    // MARK: - Post-onboarding first lesson (ios-retention-11)

    /// `hasCompletedOnboarding` 变真有两条路：真的走完新手引导，以及
    /// `acceptCloudRestore()` 里「恢复存档的老学员不用再走引导」（iosretention-3）。
    /// 只有前者该被推进第一课 —— 带着一身进度回来的孩子被塞进第一课，
    /// 既莫名其妙又会盖掉他真正的进度页。
    ///
    /// 判据用「一点进度都没有」：云端恢复提示本身就要求备份里
    /// `completedLessons` 非空或 `xp > 0`（见 `checkCloudRestoreOffer`），
    /// 所以恢复完成时这两项必有其一不为零，恒被挡在门外。
    private var isBrandNewLearner: Bool {
        progressStore.totalCompletedLessons == 0 && progressStore.progress.xp == 0
    }

    /// Resolve the active book's very first path lesson and push it. If the
    /// book isn't downloaded yet (outline load throws) we simply stay on the
    /// home screen, where the download card takes over.
    private func startFirstLessonAfterOnboarding() {
        guard !didAutoStartFirstLesson else { return }
        guard
            let bookId = progressStore.activeBookId,
            let outline = try? DataLoader.shared.loadOutline(bookId: bookId),
            let first = outline.pathLessonMetas(bookId: bookId).first
        else { return }

        didAutoStartFirstLesson = true
        activeTab = .learn
        selectedSidebar = .home
        withAnimation(Motion.bounce) { showFirstLessonToast = true }
        // Let the onboarding fade + toast land, then push the lesson.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) {
            path.append(.lesson(bookId: bookId, lessonId: first.id))
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 3.0) {
            withAnimation(.easeOut(duration: 0.3)) { showFirstLessonToast = false }
        }
    }

    private var firstLessonToast: some View {
        HStack(spacing: 10) {
            MascotView(mood: .cheer, size: 52, reactTo: .correct)
            Text("我们马上开始第一课！")
                .duoFont(.subhead)
                .foregroundStyle(DuoColors.ink)
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 10)
        .background(DuoColors.surface, in: .capsule)
        .overlay { Capsule().strokeBorder(DuoColors.border, lineWidth: 2) }
        .shadow(color: .black.opacity(0.12), radius: 8, y: 4)
        .padding(.top, 8)
        .allowsHitTesting(false)
        .accessibilityIdentifier("first-lesson-toast")
    }

    /// Whether the tab bar should be hidden (immersive screens).
    private var hideTabBar: Bool {
        guard let last = path.last else { return false }
        switch last {
        case .lesson, .lessonResult, .reviewRunner, .storyReader, .passageReader,
             .guide, .jumpTest:
            return true
        default:
            return false
        }
    }

    // MARK: - Compact (iPhone)

    @ViewBuilder
    private var compactLayout: some View {
      VStack(spacing: 0) {
        NavigationStack(path: $path) {
            compactTabRoot
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
        // Give the navigation stack real layout space above the bar. A bottom
        // inset attached outside NavigationStack does not reliably propagate
        // through nested readers/insets, and can cover their primary action.
        if !hideTabBar {
                BottomTabBar(activeTab: $activeTab, progressStore: progressStore)
                    .transition(.move(edge: .bottom))
        }
      }
        .background(DuoColors.bg)
        .animation(.easeInOut(duration: 0.2), value: hideTabBar)
        .onChange(of: activeTab) { _, _ in
            // Clear navigation stack when switching tabs.
            path.removeAll()
        }
        .onChange(of: path) { _, routes in
            // Result/recovery actions target the actual tab, so the selected
            // navigation item always describes the screen on display.
            guard let route = routes.last else { return }
            switch route {
            case .profile: activeTab = .profile; path.removeAll()
            case .shop: activeTab = .shop; path.removeAll()
            case .review: activeTab = .review; path.removeAll()
            default: break
            }
        }
    }

    @ViewBuilder
    private var compactTabRoot: some View {
        switch activeTab {
        case .learn:
            HomeView(
                progressStore: progressStore,
                downloader: downloader,
                siteIndex: siteIndex,
                path: $path
            )
        case .league:
            LeagueView(progressStore: progressStore)
        case .review:
            ReviewView(progressStore: progressStore, path: $path, onContinueLearning: { activeTab = .learn })
        case .shop:
            ShopView(progressStore: progressStore)
        case .profile:
            ProfileView(progressStore: progressStore, path: $path)
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
        .onChange(of: path) { _, routes in
            guard let route = routes.last else { return }
            switch route {
            case .profile: selectedSidebar = .profile; path.removeAll()
            case .shop: selectedSidebar = .shop; path.removeAll()
            case .review: selectedSidebar = .review; path.removeAll()
            default: break
            }
        }
    }

    // MARK: - Sidebar

    private var sidebar: some View {
        List(selection: $selectedSidebar) {
            Section {
                row(.home, label: "学习", icon: "house.fill", tint: DuoColors.primary)
                row(.league, label: "排行", icon: "trophy.fill", tint: DuoColors.bee)
                row(.review, label: "错题本", icon: "book.fill", tint: DuoColors.fox)
                row(.shop, label: "商店", icon: "bag.fill", tint: DuoColors.beetle)
                row(.profile, label: "我的", icon: "person.crop.circle.fill", tint: DuoColors.secondary)
                row(.achievements, label: "成就墙", icon: "rosette", tint: DuoColors.beetle)
            } header: {
                sectionHeader("主菜单")
            }
            Section {
                ForEach(1...6, id: \.self) { grade in
                    row(.grade(grade), label: "\(grade) 年级", icon: "books.vertical.fill", tint: DuoColors.primary)
                }
            } header: {
                sectionHeader("按年级")
            }
        }
        // De-stock the iPad sidebar (ios-feel-14): brand surfaces instead of
        // the system grouped-gray, heavy rounded labels instead of SF default.
        .scrollContentBackground(.hidden)
        .background(DuoColors.bg.ignoresSafeArea())
        .navigationTitle("聪聪学堂")
        .onChange(of: selectedSidebar) { _, _ in
            // Reset the detail-column stack when the sidebar pick changes
            // so pushes from the previous item don't leak.
            path.removeAll()
        }
    }

    private func sectionHeader(_ text: String) -> some View {
        Text(text)
            .duoFont(.caption)
            .tracking(1)
            .foregroundStyle(DuoColors.inkMuted)
    }

    private func row(_ item: SidebarItem, label: String, icon: String, tint: Color) -> some View {
        Label {
            Text(label)
                .duoFont(.subhead)
                .foregroundStyle(DuoColors.ink)
        } icon: {
            Image(systemName: icon)
                .font(.system(size: 17, weight: .heavy))
                .foregroundStyle(tint)
        }
        .padding(.vertical, 2)
        .tag(item)
        .listRowBackground(
            RoundedRectangle(cornerRadius: Radius.control)
                .fill(selectedSidebar == item ? DuoColors.surfaceAlt : DuoColors.bg)
                .padding(.vertical, 2)
        )
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
        case .league:
            LeagueView(progressStore: progressStore)
        case .review:
            ReviewView(progressStore: progressStore, path: $path, onContinueLearning: { selectedSidebar = .home })
        case .shop:
            ShopView(progressStore: progressStore)
        case .profile:
            ProfileView(progressStore: progressStore, path: $path)
        case .achievements:
            AchievementsView(progressStore: progressStore)
        }
    }

    /// Deterministic audit entry points reuse real bundled lessons and store
    /// operations. They are absent from release builds and never change an
    /// ordinary user's launch or saved progress.
    private func prepareUITestSurface() {
        #if DEBUG
        let args = ProcessInfo.processInfo.arguments
        guard args.contains("-uitest"), !didPrepareUITestSurface else { return }
        didPrepareUITestSurface = true
        let bookId = progressStore.activeBookId ?? "g1up"
        if args.contains("-uitest-earned"), let outline = try? DataLoader.shared.loadOutline(bookId: bookId) {
            // Twelve real lessons reach the first five-lesson chest slot in
            // the bundled edition, as well as unlocking the league.
            for meta in outline.pathLessonMetas(bookId: bookId).prefix(12) {
                if let lesson = try? DataLoader.shared.loadLesson(bookId: bookId, lessonId: meta.id) {
                    progressStore.completeLesson(lessonId: lesson.id, correctCount: lesson.questions.count, questionCount: lesson.questions.count)
                }
            }
        }
        guard let flag = args.firstIndex(of: "-uitest-route"), args.indices.contains(flag + 1) else { return }
        switch args[flag + 1] {
        case "guide": path = [.guide(bookId: bookId, unitNumber: 1)]
        case "jump": path = [.jumpTest(bookId: bookId, unitNumber: 2)]
        case "books": path = [.bookList(grade: 1)]
        case "book": path = [.bookDetail(bookId: bookId)]
        case "league": activeTab = .league; selectedSidebar = .league
        case "review", "review-direct", "result":
            guard let outline = try? DataLoader.shared.loadOutline(bookId: bookId),
                  let first = outline.pathLessonMetas(bookId: bookId).first,
                  let lesson = try? DataLoader.shared.loadLesson(bookId: bookId, lessonId: first.id) else { return }
            if args[flag + 1].hasPrefix("review"), let question = lesson.questions.first {
                progressStore.recordMistake(lessonId: lesson.id, lessonTitle: lesson.title, question: question)
                if args[flag + 1] == "review-direct" {
                    path = [.reviewRunner]
                } else {
                    activeTab = .review
                    selectedSidebar = .review
                }
            } else {
                let outcome = progressStore.completeLesson(lessonId: lesson.id, correctCount: lesson.questions.count, questionCount: lesson.questions.count)
                path = [.lessonResult(LessonRunResult(bookId: bookId, lessonId: lesson.id, lessonTitle: lesson.title,
                                                    questionCount: lesson.questions.count, correctCount: lesson.questions.count, outcome: outcome))]
            }
        default: break
        }
        #endif
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
        case .shop:
            ShopView(progressStore: progressStore)
        case .profile:
            ProfileView(progressStore: progressStore, path: $path)
        case .settings:
            SettingsView(progressStore: progressStore)
        case .guide(let bookId, let unitNumber):
            UnitGuideView(bookId: bookId, unitNumber: unitNumber)
        case .jumpTest(let bookId, let unitNumber):
            JumpTestView(
                bookId: bookId,
                unitNumber: unitNumber,
                progressStore: progressStore,
                path: $path
            )
        }
    }
}
