import SwiftUI
import Combine
import StoreKit

/// App entry — delegates to `MainShell` once the site index is loaded.
///
/// Everything route-related moved into [MainShell.swift](MainShell.swift) so
/// the split-view / stack-view fork lives in one place.
struct RootView: View {
    /// One-time global UIKit appearance (nav bar titles in heavy SF Rounded).
    init() {
        Self.configureNavigationBarAppearance()
    }
    @StateObject private var progressStore = ProgressStore.shared
    @StateObject private var downloader = AssetDownloader.shared
    @ObservedObject private var settings = SettingsStore.shared
    @Environment(\.scenePhase) private var scenePhase
    @State private var siteIndex: SiteIndex?
    @State private var loadError: String?

    /// A purchased dark theme forces dark; otherwise the user's own preference.
    private var effectiveColorScheme: ColorScheme? {
        if progressStore.equippedThemeData?.isDark == true { return .dark }
        return settings.appearance.colorScheme
    }

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
                    Text("加载失败").duoFont(.subhead)
                    Text(loadError).duoFont(.caption).foregroundStyle(DuoColors.inkMuted)
                }
                .padding()
            } else {
                ProgressView("加载中…")
            }
        }
        // Rounded typeface app-wide: any Text that doesn't specify its own
        // `design:` inherits SF Rounded, so the whole app reads "Duolingo".
        .fontDesign(.rounded)
        // One opt-in appearance switch (light-first default); a purchased dark
        // theme (暗夜模式 / 曜石黑) wins over the preference while equipped.
        .preferredColorScheme(effectiveColorScheme)
        .tint(DuoColors.primary)
        .onAppear { progressStore.applyEquippedTheme() }
        .onChange(of: progressStore.equippedTheme) { _, _ in
            progressStore.applyEquippedTheme()
        }
        // First-run onboarding covers the shell until the learner picks a
        // book and a daily goal.
        .overlay {
            if let siteIndex, !progressStore.hasCompletedOnboarding {
                OnboardingView(progressStore: progressStore, siteIndex: siteIndex, onDone: {})
                    .transition(.opacity)
                    .zIndex(1)
            }
        }
        // Wave E2: 新装设备发现 iCloud 备份 → 弹「要恢复吗？」（压在引导之上）。
        .overlay {
            if let envelope = progressStore.pendingCloudRestore {
                CloudRestorePrompt(
                    envelope: envelope,
                    onRestore: { progressStore.acceptCloudRestore() },
                    onDecline: { progressStore.declineCloudRestore() }
                )
                .transition(.opacity)
                .zIndex(2)
            }
        }
        .animation(.easeInOut(duration: 0.35), value: progressStore.hasCompletedOnboarding)
        .task {
            SeedInstaller.installIfNeeded()
            do {
                siteIndex = try DataLoader.shared.loadSiteIndex()
            } catch {
                loadError = String(describing: error)
            }
            _ = downloader.loadCachedManifest()
            Task { try? await downloader.loadManifest() }
            // ⚠️ 顺序不可颠倒（iosstore-1）：先探测 iCloud 备份，再做每日结算。
            // refreshForNow 末尾会镜像存档进 iCloud —— 放在前面会让新装设备用
            // 空档盖掉真实备份，恢复弹窗读回的正是自己写的空信封，用户换机即
            // 永久丢档。checkCloudRestoreOffer 先跑，pendingCloudRestore 一旦
            // 立起来，镜像与每日结算都会自动让路。
            progressStore.checkCloudRestoreOffer()
            // Settle hearts / day-derived state / the rolling reminder window
            // once at launch (the reminder part is a no-op unless the toggle
            // is on).
            progressStore.refreshForNow()
        }
        // An app left in the background overnight must not wake up showing
        // yesterday: re-sync clocked state on every return to foreground and
        // whenever the calendar day rolls over while we stay frontmost.
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { progressStore.refreshForNow() }
        }
        .onReceive(NotificationCenter.default.publisher(for: .NSCalendarDayChanged)) { _ in
            progressStore.refreshForNow()
        }
    }

    // MARK: - Global navigation bar look (ios-feel-6)

    /// Titles & large titles in heavy SF Rounded — configured once here so
    /// every `navigationTitle` in the app reads "Duolingo" without per-screen
    /// styling. Uses font descriptors, so Dynamic Type keeps working.
    private static var didConfigureNavBar = false
    static func configureNavigationBarAppearance() {
        guard !didConfigureNavBar else { return }
        didConfigureNavBar = true

        func roundedHeavy(size: CGFloat) -> UIFont {
            let base = UIFont.systemFont(ofSize: size, weight: .bold)
            guard let descriptor = base.fontDescriptor.withDesign(.rounded) else { return base }
            return UIFont(descriptor: descriptor, size: size)
        }

        let appearance = UINavigationBarAppearance()
        appearance.configureWithDefaultBackground()
        appearance.titleTextAttributes = [
            .font: UIFontMetrics(forTextStyle: .headline).scaledFont(for: roundedHeavy(size: 17))
        ]
        appearance.largeTitleTextAttributes = [
            .font: roundedHeavy(size: 34)
        ]

        let bar = UINavigationBar.appearance()
        bar.standardAppearance = appearance
        bar.compactAppearance = appearance
        bar.scrollEdgeAppearance = appearance
    }
}

// MARK: - App Store review prompt (critic-8)

/// Asks for a rating only at真正的高光时刻 (7-day streak milestone celebration
/// closed / first three-star result exit) — never on a negative path. A local
/// ledger caps requests at 2 per app version so learners aren't nagged.
enum ReviewPrompter {
    static let maxRequestsPerVersion = 2
    static let versionKey = "review.requestedVersion"
    static let countKey = "review.requestCount"

    static var currentVersion: String {
        Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0"
    }

    /// Pure gate — unit-testable with an injected defaults suite.
    static func shouldRequest(version: String, defaults: UserDefaults = .standard) -> Bool {
        let recordedVersion = defaults.string(forKey: versionKey)
        let count = recordedVersion == version ? defaults.integer(forKey: countKey) : 0
        return count < maxRequestsPerVersion
    }

    /// Book-keeping — a new version resets the counter.
    static func recordRequest(version: String, defaults: UserDefaults = .standard) {
        let recordedVersion = defaults.string(forKey: versionKey)
        let count = recordedVersion == version ? defaults.integer(forKey: countKey) : 0
        defaults.set(version, forKey: versionKey)
        defaults.set(count + 1, forKey: countKey)
    }

    /// Call from a highlight moment. Debounced by the per-version ledger; the
    /// small delay lets the celebration dismissal animation settle first, so
    /// the system sheet never stomps on the confetti.
    static func requestAtHighlight() {
        let version = currentVersion
        guard shouldRequest(version: version) else { return }
        recordRequest(version: version)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) {
            guard let scene = UIApplication.shared.connectedScenes
                .first(where: { $0.activationState == .foregroundActive }) as? UIWindowScene
            else { return }
            SKStoreReviewController.requestReview(in: scene)
        }
    }
}

/// Wave E2：发现 iCloud 备份的恢复提示卡（新装设备启动时）。
private struct CloudRestorePrompt: View {
    let envelope: Backup.Envelope
    let onRestore: () -> Void
    let onDecline: () -> Void

    private var summary: String {
        let lessons = envelope.data.completedLessons.count
        let xp = envelope.data.xp
        return "已完成 \(lessons) 节课 · \(xp) XP"
    }

    var body: some View {
        LearningDialog {
            VStack(spacing: 16) {
                Image(systemName: "icloud.fill").font(.system(size: 44, weight: .bold)).foregroundStyle(DuoColors.secondary)
                Text("发现 iCloud 备份").duoFont(.title).foregroundStyle(DuoColors.ink)
                Text("这台设备是新的，但云端有你之前的学习进度。")
                    .duoFont(.body).foregroundStyle(DuoColors.inkMuted)
                Text(summary).duoFont(.subhead).foregroundStyle(DuoColors.linkInk)
            }.multilineTextAlignment(.center)
        } actions: {
            VStack(spacing: 10) {
                Button("恢复进度", action: onRestore).buttonStyle(ChunkyButtonStyle(.primary))
                    .accessibilityIdentifier("cloud-restore-accept")
                Button("从头开始", action: onDecline).buttonStyle(ChunkyButtonStyle(.ghost))
                    .accessibilityIdentifier("cloud-restore-decline")
            }
        }
    }
}

/// Book list for one grade — used by the iPad sidebar's "按年级" items to show
/// a persistent book list on the detail column (the bookList route).
struct BookListView: View {
    let grade: Int
    let siteIndex: SiteIndex
    @Binding var path: [AppRoute]

    @State private var includeLegacy = false

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                LearningSectionTitle(title: "挑一本课本，开始探索", detail: "优先展示当前教材，旧版进度继续保留。")
                Toggle("显示旧版教材", isOn: $includeLegacy).duoFont(.caption).tint(DuoColors.primary)
                ForEach(siteIndex.books.filter { $0.grade == grade && (includeLegacy || $0.supersededBy == nil) }, id: \.id) { book in
                    Button {
                        HapticEngine.shared.tap()
                        path.append(.bookDetail(bookId: book.id))
                    } label: {
                        bookCard(book)
                    }
                    .buttonStyle(.plain)
                }
            }
            .learningContent()
        }
        .background(DuoColors.bg.ignoresSafeArea())
        .navigationTitle("\(grade) 年级")
        .navigationBarTitleDisplayMode(.inline)
    }

    /// Brand card — same chunky sticker language as the home book picker.
    private func bookCard(_ book: Book) -> some View {
        let cfg = Subjects.resolve(book: book)
        return HStack(spacing: 14) {
            ZStack {
                RoundedRectangle(cornerRadius: Radius.control)
                    .fill(cfg.accent)
                    .frame(width: 52, height: 52)
                    .overlay {
                        RoundedRectangle(cornerRadius: Radius.control)
                            .stroke(Color.black.opacity(0.25), lineWidth: 2)
                    }
                Text(cfg.label)
                    .duoFont(.subhead)
                    .minimumScaleFactor(0.6)   // XXL 档在固定贴纸里自动收缩
                    .foregroundStyle(.white)
                    .padding(.horizontal, 2)
            }
            .frame(width: 52, height: 52)
            VStack(alignment: .leading, spacing: 4) {
                Text(book.fullName)
                    .duoFont(.subhead)
                    .foregroundStyle(DuoColors.ink)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                Text("\(book.unitsCount) 单元 · \(book.lessonsCount) 节小课")
                    .duoFont(.caption)
                    .foregroundStyle(DuoColors.inkMuted)
            }
            Spacer(minLength: 0)
            Image(systemName: "chevron.right")
                .font(.system(size: 15, weight: .heavy))
                .foregroundStyle(DuoColors.inkSofter)
        }
        .padding(14)
        .background(DuoColors.surface, in: .rect(cornerRadius: Radius.card))
        .overlay {
            RoundedRectangle(cornerRadius: Radius.card)
                .strokeBorder(DuoColors.border, lineWidth: 2)
        }
    }
}

#Preview {
    RootView()
}
