import SwiftUI

/// Duolingo-style home: the learning path IS the home screen.
///
/// Top: dark stats strip (book-flag / streak / gems / hearts).
/// Middle: unit section banner + PathMap.
/// Overlay: green "current lesson" callout anchored to the active node.
/// Toolbar: flag button opens a sheet to switch book/grade.
struct HomeView: View {
    @ObservedObject var progressStore: ProgressStore
    @ObservedObject var downloader: AssetDownloader
    let siteIndex: SiteIndex
    @Binding var path: [AppRoute]

    @State private var showBookPicker = false
    @State private var outline: Outline?
    @State private var pathNodes: [PathMapNode] = []
    @State private var loadError: String?
    /// Lesson metas (incl. question counts) cached per book — peeking at every
    /// lesson file is too expensive to repeat on each appearance.
    @State private var pathMetas: [PathLessonMeta] = []
    @State private var metasBookId: String?
    /// 单元挑战槽位（outline 声明 + 本地 exam 课文件都齐才有），随 metas 缓存。
    @State private var examSlots: [ExamSlot] = []
    /// A path chest the learner tapped and is currently opening.
    @State private var activeChest: ActiveChest?
    /// 0 红心预拦截（ios-lesson-8）：没有红心时点课程节点弹红心详情而不是进课。
    @State private var showZeroHeartsSheet = false

    private struct ActiveChest: Identifiable { let id: String }

    private var activeBook: Book? {
        if let id = progressStore.activeBookId {
            return siteIndex.books.first(where: { $0.id == id })
        }
        // Default: first book of selected grade, or first book overall
        let grade = progressStore.selectedGrade
        if grade > 0 {
            return siteIndex.books.first(where: { $0.grade == grade && $0.supersededBy == nil })
                ?? siteIndex.books.first(where: { $0.supersededBy == nil })
        }
        return siteIndex.books.first(where: { $0.supersededBy == nil })
    }

    var body: some View {
        ZStack(alignment: .top) {
            DuoColors.darkBg.ignoresSafeArea()

            if let book = activeBook {
                pathContent(book: book)
            } else {
                emptyState
            }
        }
        // Chest open modal — full-screen cover so the tab bar can't be tapped
        // mid-claim; rolls the reward, then banks + marks it.
        .fullScreenCover(item: $activeChest) { chest in
            ChestModalView(
                onClaim: { gems in
                    progressStore.addGems(gems)
                    progressStore.claimChest(chest.id)
                },
                onDismiss: {
                    activeChest = nil
                    reloadOutline()   // refresh the claimed chest's node
                }
            )
            .presentationBackground(.clear)
        }
        .toolbar(.hidden, for: .navigationBar)
        // 联赛周一结算幕（Wave E1）：打开 app 落在首页时若上周结果没看，
        // 全屏弹出（宝石已入账，看完即清）。
        .fullScreenCover(item: Binding(
            get: { progressStore.pendingLeagueResult },
            set: { if $0 == nil { progressStore.clearPendingLeagueResult() } }
        )) { result in
            LeagueResultView(result: result) {
                progressStore.clearPendingLeagueResult()
            }
        }
        // Daily login reward — light celebration card the first time the app
        // is opened each day (gems were already banked by the store).
        .overlay {
            if let claim = progressStore.pendingDailyReward {
                DailyRewardCard(claim: claim) {
                    withAnimation(.easeOut(duration: 0.25)) {
                        progressStore.pendingDailyReward = nil
                    }
                }
                .transition(.opacity)
                .zIndex(2)
            }
        }
        // 0 心预拦截：先看倒计时/补心，别把孩子放进一节答不了错的课。
        .sheet(isPresented: $showZeroHeartsSheet) {
            HeartDetailSheet(progressStore: progressStore)
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
        }
        .sheet(isPresented: $showBookPicker) {
            BookPickerSheet(
                siteIndex: siteIndex,
                progressStore: progressStore,
                downloader: downloader,
                isPresented: $showBookPicker,
                onPick: { bookId in
                    progressStore.setActiveBook(bookId)
                    reloadOutline()
                }
            )
            .presentationDetents([.large])
        }
        .onAppear { reloadOutline() }
        .onChange(of: progressStore.activeBookId) { _, _ in reloadOutline() }
    }

    // MARK: - Main path layout

    @ViewBuilder
    private func pathContent(book: Book) -> some View {
        VStack(spacing: 0) {
            // Top stats strip
            HomeStatsStrip(
                book: book,
                progressStore: progressStore,
                onFlagTap: { showBookPicker = true }
            )
            .padding(.horizontal, 14)
            .padding(.top, 8)
            .padding(.bottom, 12)

            // Hairline separating the fixed HUD from the scrolling path.
            Rectangle().fill(DuoColors.border).frame(height: 1)

            // Reading & stories entry — only for books that actually ship the
            // content (content-13); math books render neither.
            let showReading = book.hasPassages == true
            let showStories = book.hasStories == true
            if showReading || showStories {
                HStack(spacing: 10) {
                    if showReading {
                        sideEntry("课文听读", icon: "text.book.closed.fill", tint: DuoColors.secondary) {
                            path.append(.reading(bookId: book.id))
                        }
                    }
                    if showStories {
                        sideEntry("课外故事", icon: "book.closed.fill", tint: DuoColors.beetle) {
                            path.append(.stories(bookId: book.id))
                        }
                    }
                }
                .padding(.horizontal, 14)
                .padding(.top, 10)
                .padding(.bottom, 2)
            }

            if outline != nil {
                PathMapView(
                    lessons: pathNodes,
                    onTap: { node in
                        if node.kind == .chest {
                            activeChest = ActiveChest(id: node.id)
                        } else {
                            // 0 红心预拦截（ios-lesson-8）：先结算回复计时器再看余量，
                            // 没红心就弹红心详情（倒计时 + 宝石补满），不进课。
                            progressStore.tickHeartRecharge()
                            if progressStore.hearts == 0 {
                                HapticEngine.shared.wrong()
                                showZeroHeartsSheet = true
                            } else {
                                path.append(.lesson(bookId: book.id, lessonId: node.id))
                            }
                        }
                    },
                    onGuideTap: { unitNumber in
                        path.append(.guide(bookId: book.id, unitNumber: unitNumber))
                    },
                    onJumpTap: { unitNumber in
                        // 跳级失败要扣 1 心 —— 0 心时先弹补心，别让孩子白考。
                        progressStore.tickHeartRecharge()
                        if progressStore.hearts == 0 {
                            HapticEngine.shared.wrong()
                            showZeroHeartsSheet = true
                        } else {
                            path.append(.jumpTest(bookId: book.id, unitNumber: unitNumber))
                        }
                    }
                )
                .id(book.id)   // re-instantiate on book switch so scroll resets
            } else if let err = loadError {
                VStack(spacing: 12) {
                    Spacer()
                    Image(systemName: "tray.and.arrow.down")
                        .font(.largeTitle)
                        .foregroundStyle(DuoColors.darkInkMuted)
                    Text("这本书还没下载")
                        .duoFont(.subhead)
                        .foregroundStyle(DuoColors.darkInk)
                    Text(err)
                        .duoFont(.caption)
                        .foregroundStyle(DuoColors.darkInkMuted)
                    if let entry = downloader.manifest?.books.first(where: { $0.bookId == book.id }) {
                        BookDownloadCard(entry: entry, downloader: downloader) { reloadOutline() }
                            .padding(.horizontal, 24)
                    }
                    Spacer()
                }
                .padding()
            } else {
                Spacer()
                ProgressView().tint(DuoColors.primary)
                Spacer()
            }
        }
    }

    private func sideEntry(_ label: String, icon: String, tint: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 8) {
                Image(systemName: icon).font(.system(size: 16, weight: .bold)).foregroundStyle(tint)
                Text(label).duoFont(.caption).foregroundStyle(DuoColors.ink)
            }
            .frame(maxWidth: .infinity, minHeight: 42)
            .background(DuoColors.surface, in: .rect(cornerRadius: Radius.control))
            .overlay { RoundedRectangle(cornerRadius: Radius.control).strokeBorder(DuoColors.border, lineWidth: 2) }
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder
    private var emptyState: some View {
        VStack(spacing: 16) {
            Spacer()
            MascotView(mood: .wave, size: 120)
            Text("挑一本书开始学习吧")
                .duoFont(.heading)
                .foregroundStyle(DuoColors.darkInk)
            Button("选择课本") { showBookPicker = true }
                .buttonStyle(ChunkyButtonStyle(.primary))
                .padding(.horizontal, 40)
            Spacer()
        }
    }

    // MARK: - Data loading

    private func reloadOutline() {
        guard let book = activeBook else {
            outline = nil
            pathNodes = []
            return
        }
        // Ensure active book id is persisted
        if progressStore.activeBookId != book.id {
            progressStore.setActiveBook(book.id)
        }
        do {
            // Loading metas peeks at every lesson file for its question count
            // (start-popup XP line) — do that once per book, not per appear.
            if metasBookId != book.id || outline == nil {
                let o = try DataLoader.shared.loadOutline(bookId: book.id)
                outline = o
                pathMetas = o.pathLessonMetas(bookId: book.id) { lessonId in
                    (try? DataLoader.shared.loadLesson(bookId: book.id, lessonId: lessonId).questions.count) ?? 0
                }
                // 单元挑战槽位也要读文件确认存在，随 metas 一起缓存。
                examSlots = o.examSlots(bookId: book.id)
                metasBookId = book.id
            }
            // Status/stars/chest state refresh is cheap and runs every time.
            pathNodes = PathNodeBuilder.nodes(
                bookId: book.id,
                lessons: pathMetas,
                progressStore: progressStore,
                examSlots: examSlots
            )
            loadError = nil
        } catch {
            outline = nil
            pathNodes = []
            metasBookId = nil
            loadError = (error as? LocalizedError)?.errorDescription ?? String(describing: error)
        }
    }
}

// MARK: - Top stats strip (flag / streak / gems / hearts)

private struct HomeStatsStrip: View {
    let book: Book
    @ObservedObject var progressStore: ProgressStore
    let onFlagTap: () -> Void

    @State private var activeSheet: StatSheet?

    private enum StatSheet: Identifiable {
        case streak, gems, hearts
        var id: Int { hashValue }
    }

    var body: some View {
        HStack(spacing: 18) {
            // Flag / book badge
            Button(action: onFlagTap) {
                ZStack {
                    RoundedRectangle(cornerRadius: 6)
                        .fill(Subjects.resolve(book: book).accent)
                        .frame(width: 34, height: 26)
                        .overlay {
                            RoundedRectangle(cornerRadius: 6)
                                .stroke(Color.black.opacity(0.3), lineWidth: 1.5)
                        }
                    Text(Subjects.resolve(book: book).label)
                        .duoFont(.micro, weight: .heavy)
                        .foregroundStyle(.white)
                }
            }
            .buttonStyle(.plain)

            Button { activeSheet = .streak } label: {
                // Three honest flame states: studied today = lit orange;
                // not yet but still savable = grey ("今天还没保住");
                // chain broken = grey with a truthful 0.
                statItem(
                    icon: Image(systemName: "flame.fill"),
                    value: "\(progressStore.displayStreak)",
                    color: progressStore.studiedToday ? DuoColors.fox : DuoColors.darkInkSofter
                )
            }
            .buttonStyle(.plain)
            .accessibilityLabel("连胜 \(progressStore.displayStreak) 天")

            Button { activeSheet = .gems } label: {
                statItem(
                    icon: Image(systemName: "diamond.fill"),
                    value: "\(progressStore.gems)",
                    color: DuoColors.secondary
                )
            }
            .buttonStyle(.plain)
            .accessibilityLabel("宝石 \(progressStore.gems)")

            Button { activeSheet = .hearts } label: {
                statItem(
                    icon: Image(systemName: "heart.fill"),
                    value: "\(progressStore.hearts)",
                    color: DuoColors.danger
                )
            }
            .buttonStyle(.plain)
            .accessibilityLabel("红心 \(progressStore.hearts)")

            Spacer(minLength: 8)

            // Daily-goal ring — today's XP toward the goal (tap to adjust).
            DailyGoalRingView(progressStore: progressStore, size: 46)
        }
        .frame(maxWidth: .infinity)
        .sheet(item: $activeSheet) { sheet in
            Group {
                switch sheet {
                case .streak: StreakDetailSheet(progressStore: progressStore)
                case .gems:   GemShopSheet(progressStore: progressStore)
                case .hearts: HeartDetailSheet(progressStore: progressStore)
                }
            }
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
        }
    }

    @ViewBuilder
    private func statItem(icon: Image, value: String, color: Color) -> some View {
        HStack(spacing: 5) {
            icon
                .font(.system(size: 18, weight: .heavy))
                .foregroundStyle(color)
            Text(value)
                .duoNumeral(.button)
                .foregroundStyle(color)
        }
    }
}

// MARK: - Daily login reward card

/// 聪聪递宝石：每天第一次打开应用时的轻量登录奖励卡。
/// 文案诚实：断签时按 0 档发放，不吹嘘一条已经断掉的连胜。
private struct DailyRewardCard: View {
    let claim: ProgressStore.DailyRewardClaim
    let onDismiss: () -> Void

    private var subtitle: String {
        claim.effectiveStreak > 0
            ? "已连续学习 \(claim.effectiveStreak) 天，继续加油！"
            : "今天也来学一点吧！"
    }

    var body: some View {
        ZStack {
            Color.black.opacity(0.55).ignoresSafeArea()
                .onTapGesture { onDismiss() }

            VStack(spacing: 14) {
                MascotView(mood: .happy, size: 88, reactTo: .correct)

                Text("每日见面礼")
                    .duoFont(.heading, weight: .black)
                    .foregroundStyle(DuoColors.ink)

                HStack(spacing: 6) {
                    Image(systemName: "diamond.fill")
                        .font(.system(size: 20, weight: .heavy))
                    Text("+\(claim.gems)")
                        .duoNumeral(.title, weight: .black)
                }
                .foregroundStyle(DuoColors.beetle)
                .padding(.horizontal, 18)
                .padding(.vertical, 9)
                .background(DuoColors.beetle.opacity(0.14), in: .capsule)

                Text(subtitle)
                    .duoFont(.caption)
                    .foregroundStyle(DuoColors.inkMuted)
                    .multilineTextAlignment(.center)

                Button("收下啦") { onDismiss() }
                    .buttonStyle(ChunkyButtonStyle(.primary))
            }
            .padding(24)
            .frame(maxWidth: 320)
            .background(DuoColors.surface, in: .rect(cornerRadius: Radius.large))
            .overlay {
                RoundedRectangle(cornerRadius: Radius.large)
                    .strokeBorder(DuoColors.border, lineWidth: 2)
            }
            .padding(28)
        }
        .onAppear { SFXEngine.shared.play(.unlock) }
        .accessibilityIdentifier("daily-reward-card")
    }
}

// MARK: - Streak sheet

private struct StreakDetailSheet: View {
    @ObservedObject var progressStore: ProgressStore
    @Environment(\.dismiss) private var dismiss

    private let freezeCost = Economy.freezeCost
    private let makeupCost = Economy.streakMakeupCost

    /// Same tri-state as the HUD flame: studied today = lit, otherwise grey.
    private var flameColor: Color {
        progressStore.studiedToday ? DuoColors.fox : DuoColors.darkInkSofter
    }

    private var freezesFull: Bool { progressStore.streakFreezes >= Economy.maxFreezes }

    /// The broken-chain state where the 50-gem make-up can still revive it:
    /// nothing studied today, shields can't cover the gap, streak not yet
    /// overwritten by a new run.
    private var canOfferMakeup: Bool {
        !progressStore.studiedToday
            && progressStore.displayStreak == 0
            && progressStore.progress.streak > 0
            && SRS.daysBetween(progressStore.progress.lastActiveDate, SRS.todayString()) >= 2
    }

    /// Status line at the top: studied / still savable / already broken.
    private var statusText: String? {
        if progressStore.studiedToday { return "今日已打卡 ✓" }
        let display = progressStore.displayStreak
        if display > 0 { return "今天再学一节，保住 \(display) 天连胜" }
        if progressStore.progress.streak > 0 { return "连胜中断了，今天重新出发" }
        return nil   // brand-new learner: "开始你的连胜" below says it all
    }

    private var statusColor: Color {
        if progressStore.studiedToday { return DuoColors.primary }
        return progressStore.displayStreak > 0 ? DuoColors.fox : DuoColors.darkInkMuted
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 22) {
                VStack(spacing: 8) {
                    if let statusText {
                        Text(statusText)
                            .duoFont(.caption, weight: .heavy)
                            .foregroundStyle(statusColor)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 7)
                            .background(statusColor.opacity(0.14), in: .capsule)
                    }

                    ZStack {
                        Circle()
                            .fill(flameColor.opacity(0.18))
                            .frame(width: 112, height: 112)
                        Image(systemName: "flame.fill")
                            .font(.system(size: 66, weight: .heavy))
                            .foregroundStyle(flameColor)
                    }

                    Text("\(progressStore.displayStreak)")
                        .font(.system(size: 54, weight: .black))
                        .foregroundStyle(DuoColors.darkInk)
                        .monospacedDigit()

                    Text(progressStore.displayStreak > 0 ? "天连胜" : "开始你的连胜")
                        .duoFont(.body, weight: .heavy)
                        .foregroundStyle(DuoColors.darkInkMuted)
                }
                .padding(.top, 8)

                // 本周 7 格日历（ios-path-8）：哪天学了一眼看清。
                VStack(alignment: .leading, spacing: 10) {
                    Text("本周")
                        .duoFont(.caption)
                        .tracking(1.2)
                        .foregroundStyle(DuoColors.darkInkMuted)
                    StreakCalendarView(
                        entries: progressStore.weekXPEntries().map { (dateKey: $0.date, studied: $0.xp > 0) },
                        todayIndex: progressStore.todayIndexInWeek(),
                        todayStudied: progressStore.studiedToday
                    )
                }
                .padding(14)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(DuoColors.darkSurface, in: .rect(cornerRadius: 16))
                .overlay {
                    RoundedRectangle(cornerRadius: 16)
                        .strokeBorder(DuoColors.darkSurfaceAlt, lineWidth: 2)
                }

                VStack(alignment: .leading, spacing: 14) {
                    // Broken chain + makeup still possible → the 50-gem revive.
                    if canOfferMakeup {
                        VStack(alignment: .leading, spacing: 10) {
                            HStack(spacing: 10) {
                                Image(systemName: "bandage.fill")
                                    .font(.system(size: 24, weight: .heavy))
                                    .foregroundStyle(DuoColors.fox)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text("补回 \(progressStore.progress.streak) 天连胜")
                                        .duoFont(.body, weight: .heavy)
                                        .foregroundStyle(DuoColors.darkInk)
                                    Text("用宝石补上昨天的卡，今天再学一节就接上啦")
                                        .duoFont(.caption)
                                        .foregroundStyle(DuoColors.darkInkMuted)
                                }
                                Spacer()
                            }
                            Button {
                                if progressStore.makeUpYesterdayStreak() {
                                    HapticEngine.shared.success()
                                    SFXEngine.shared.play(.purchase)
                                } else {
                                    HapticEngine.shared.wrong()
                                }
                            } label: {
                                HStack(spacing: 8) {
                                    Image(systemName: "diamond.fill").font(.system(size: 14, weight: .heavy))
                                    Text("连胜补卡  \(makeupCost)")
                                }
                            }
                            .buttonStyle(ChunkyButtonStyle(
                                progressStore.gems >= makeupCost ? .primary : .disabled
                            ))
                            .disabled(progressStore.gems < makeupCost)
                            .accessibilityIdentifier("streak-makeup")
                        }
                        .padding(14)
                        .background(DuoColors.fox.opacity(0.12), in: .rect(cornerRadius: 16))
                        .overlay {
                            RoundedRectangle(cornerRadius: 16)
                                .strokeBorder(DuoColors.fox.opacity(0.4), lineWidth: 2)
                        }
                    }

                    HStack(spacing: 10) {
                        Image(systemName: "snowflake")
                            .font(.system(size: 28, weight: .heavy))
                            .foregroundStyle(DuoColors.secondary)
                        VStack(alignment: .leading, spacing: 2) {
                            Text("连胜护盾 \(progressStore.streakFreezes)/\(Economy.maxFreezes)")
                                .duoFont(.subhead, weight: .heavy)
                                .foregroundStyle(DuoColors.darkInk)
                            Text("一天没学习时，自动顶替你的连胜 · 每周一自动补 1 个")
                                .duoFont(.caption)
                                .foregroundStyle(DuoColors.darkInkMuted)
                        }
                        Spacer()
                    }
                    .padding(14)
                    .background(DuoColors.darkSurface, in: .rect(cornerRadius: 16))
                    .overlay {
                        RoundedRectangle(cornerRadius: 16)
                            .strokeBorder(DuoColors.darkSurfaceAlt, lineWidth: 2)
                    }

                    Button {
                        if progressStore.buyStreakFreeze(cost: freezeCost) {
                            HapticEngine.shared.success()
                            SFXEngine.shared.play(.purchase)
                        } else {
                            HapticEngine.shared.wrong()
                        }
                    } label: {
                        HStack(spacing: 8) {
                            Image(systemName: "diamond.fill").font(.system(size: 14, weight: .heavy))
                            Text(freezesFull
                                 ? "护盾已满 \(Economy.maxFreezes)/\(Economy.maxFreezes)"
                                 : "购买护盾  \(freezeCost)")
                        }
                    }
                    .buttonStyle(ChunkyButtonStyle(
                        (!freezesFull && progressStore.gems >= freezeCost) ? .secondary : .disabled
                    ))
                    .disabled(freezesFull || progressStore.gems < freezeCost)
                }

                Spacer(minLength: 4)

                Button("知道了") { dismiss() }
                    .buttonStyle(ChunkyButtonStyle(.primary))
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 24)
        }
        .navigationTitle("连胜")
        .background(DuoColors.darkBg.ignoresSafeArea())
    }
}

// MARK: - Gem shop sheet

private struct GemShopSheet: View {
    @ObservedObject var progressStore: ProgressStore
    @Environment(\.dismiss) private var dismiss

    private let refillCost = Economy.heartRefillCost
    private let freezeCost = Economy.freezeCost

    @State private var flash: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                // Balance banner
                HStack(spacing: 10) {
                    Image(systemName: "diamond.fill")
                        .font(.system(size: 28, weight: .heavy))
                        .foregroundStyle(DuoColors.secondary)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("\(progressStore.gems)")
                            .duoNumeral(.title, weight: .black)
                            .foregroundStyle(DuoColors.darkInk)
                        Text("我的宝石")
                            .duoFont(.micro, weight: .heavy)
                            .foregroundStyle(DuoColors.darkInkMuted)
                    }
                    Spacer()
                }
                .padding(16)
                .frame(maxWidth: .infinity)
                .background(DuoColors.secondary.opacity(0.14), in: .rect(cornerRadius: 18))
                .overlay {
                    RoundedRectangle(cornerRadius: 18)
                        .strokeBorder(DuoColors.secondary.opacity(0.4), lineWidth: 2)
                }

                if let flash {
                    Text(flash)
                        .duoFont(.caption, weight: .heavy)
                        .foregroundStyle(DuoColors.primary)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(DuoColors.primary.opacity(0.15), in: .rect(cornerRadius: 10))
                }

                Text("宝石商店")
                    .duoFont(.caption)
                    .tracking(1.2)
                    .foregroundStyle(DuoColors.darkInkMuted)

                shopRow(
                    icon: "heart.fill",
                    iconColor: DuoColors.danger,
                    title: "补满红心",
                    subtitle: progressStore.hearts >= ProgressStore.maxHearts ? "红心已满" : "立即补满 5 颗红心",
                    cost: refillCost,
                    enabled: progressStore.hearts < ProgressStore.maxHearts && progressStore.gems >= refillCost
                ) {
                    if progressStore.buyHeartRefill(cost: refillCost) {
                        HapticEngine.shared.success()
                        SFXEngine.shared.play(.purchase)
                        flash = "红心已补满！"
                    } else {
                        HapticEngine.shared.wrong()
                    }
                }

                shopRow(
                    icon: "snowflake",
                    iconColor: DuoColors.secondary,
                    title: "连胜护盾",
                    subtitle: progressStore.streakFreezes >= Economy.maxFreezes
                        ? "护盾已满 \(Economy.maxFreezes)/\(Economy.maxFreezes)"
                        : "当前拥有 \(progressStore.streakFreezes)/\(Economy.maxFreezes) 个",
                    cost: freezeCost,
                    enabled: progressStore.streakFreezes < Economy.maxFreezes && progressStore.gems >= freezeCost
                ) {
                    if progressStore.buyStreakFreeze(cost: freezeCost) {
                        HapticEngine.shared.success()
                        SFXEngine.shared.play(.purchase)
                        flash = "已购买连胜护盾！"
                    } else {
                        HapticEngine.shared.wrong()
                    }
                }

                Text("完成课程可获得更多宝石")
                    .duoFont(.caption)
                    .foregroundStyle(DuoColors.darkInkMuted)
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding(.top, 8)

                Button("关闭") { dismiss() }
                    .buttonStyle(ChunkyButtonStyle(.primary))
                    .padding(.top, 4)
            }
            .padding(.horizontal, 20)
            .padding(.top, 12)
            .padding(.bottom, 24)
        }
        .background(DuoColors.darkBg.ignoresSafeArea())
    }

    @ViewBuilder
    private func shopRow(
        icon: String,
        iconColor: Color,
        title: String,
        subtitle: String,
        cost: Int,
        enabled: Bool,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack(spacing: 12) {
                ZStack {
                    Circle().fill(iconColor.opacity(0.22)).frame(width: 44, height: 44)
                    Image(systemName: icon).font(.system(size: 22, weight: .heavy)).foregroundStyle(iconColor)
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).duoFont(.body, weight: .heavy).foregroundStyle(DuoColors.darkInk)
                    Text(subtitle).duoFont(.caption).foregroundStyle(DuoColors.darkInkMuted)
                }
                Spacer()
                HStack(spacing: 4) {
                    Image(systemName: "diamond.fill").font(.system(size: 13, weight: .heavy))
                    Text("\(cost)").duoNumeral(.caption, weight: .black)
                }
                .foregroundStyle(enabled ? DuoColors.secondary : DuoColors.darkInkSofter)
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(
                    (enabled ? DuoColors.secondary.opacity(0.18) : DuoColors.darkSurfaceAlt.opacity(0.4)),
                    in: .capsule
                )
            }
            .padding(14)
            .background(DuoColors.darkSurface, in: .rect(cornerRadius: 16))
            .overlay {
                RoundedRectangle(cornerRadius: 16)
                    .strokeBorder(DuoColors.darkSurfaceAlt, lineWidth: 2)
            }
            .opacity(enabled ? 1.0 : 0.55)
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
    }
}

// MARK: - Heart detail sheet

private struct HeartDetailSheet: View {
    @ObservedObject var progressStore: ProgressStore
    @Environment(\.dismiss) private var dismiss

    @State private var tick = Date()
    private let timer = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    var body: some View {
        ScrollView {
            VStack(spacing: 22) {
                Text("红心")
                    .duoFont(.title, weight: .black)
                    .foregroundStyle(DuoColors.darkInk)
                    .padding(.top, 6)

                HStack(spacing: 10) {
                    ForEach(0..<ProgressStore.maxHearts, id: \.self) { i in
                        Image(systemName: "heart.fill")
                            .font(.system(size: 32, weight: .heavy))
                            .foregroundStyle(i < progressStore.hearts ? DuoColors.danger : DuoColors.darkSurfaceAlt)
                    }
                }

                if progressStore.hearts >= ProgressStore.maxHearts {
                    Text("你的红心已满！")
                        .duoFont(.body, weight: .heavy)
                        .foregroundStyle(DuoColors.darkInkMuted)
                } else if let next = progressStore.nextHeartAt {
                    VStack(spacing: 4) {
                        Text("下一颗红心还需")
                            .duoFont(.caption, weight: .heavy)
                            .foregroundStyle(DuoColors.darkInkMuted)
                        Text(formatCountdown(to: next, now: tick))
                            .font(.system(size: 40, weight: .black, design: .rounded))
                            .foregroundStyle(DuoColors.danger)
                            .monospacedDigit()
                        Text("每 5 分钟恢复 1 颗红心")
                            .duoFont(.micro)
                            .foregroundStyle(DuoColors.darkInkMuted)
                    }
                }

                if progressStore.streakFreezes > 0 {
                    HStack(spacing: 8) {
                        Image(systemName: "snowflake").foregroundStyle(DuoColors.secondary)
                        Text("连胜护盾 × \(progressStore.streakFreezes)")
                            .duoFont(.caption, weight: .heavy)
                            .foregroundStyle(DuoColors.secondary)
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(DuoColors.secondary.opacity(0.14), in: .rect(cornerRadius: 12))
                    .overlay {
                        RoundedRectangle(cornerRadius: 12)
                            .strokeBorder(DuoColors.secondary.opacity(0.35), lineWidth: 2)
                    }
                }

                Button {
                    if progressStore.buyHeartRefill(cost: Economy.heartRefillCost) {
                        HapticEngine.shared.success()
                        SFXEngine.shared.play(.purchase)
                    } else {
                        HapticEngine.shared.wrong()
                    }
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "diamond.fill").font(.system(size: 13, weight: .heavy))
                        Text("补满红心  \(Economy.heartRefillCost)")
                    }
                }
                .buttonStyle(ChunkyButtonStyle(
                    (progressStore.hearts < ProgressStore.maxHearts && progressStore.gems >= Economy.heartRefillCost) ? .secondary : .disabled
                ))
                .disabled(progressStore.hearts >= ProgressStore.maxHearts || progressStore.gems < Economy.heartRefillCost)

                Button("知道了") { dismiss() }
                    .buttonStyle(ChunkyButtonStyle(.primary))
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 24)
        }
        .background(DuoColors.darkBg.ignoresSafeArea())
        .onReceive(timer) { _ in
            tick = Date()
            progressStore.tickHeartRecharge()
        }
    }

    private func formatCountdown(to date: Date, now: Date) -> String {
        let remaining = max(0, date.timeIntervalSince(now))
        let minutes = Int(remaining) / 60
        let seconds = Int(remaining) % 60
        return String(format: "%d:%02d", minutes, seconds)
    }
}

// MARK: - Book picker sheet (unified with home-page chunky sticker language)

private struct BookPickerSheet: View {
    let siteIndex: SiteIndex
    @ObservedObject var progressStore: ProgressStore
    @ObservedObject var downloader: AssetDownloader
    @Binding var isPresented: Bool
    let onPick: (String) -> Void

    @State private var selectedGrade: Int
    @State private var includeLegacy = false
    @State private var schoolSystem: String

    init(siteIndex: SiteIndex, progressStore: ProgressStore, downloader: AssetDownloader, isPresented: Binding<Bool>, onPick: @escaping (String) -> Void) {
        self.siteIndex = siteIndex
        self.progressStore = progressStore
        self.downloader = downloader
        self._isPresented = isPresented
        self.onPick = onPick
        self._selectedGrade = State(initialValue: progressStore.selectedGrade > 0 ? progressStore.selectedGrade : 1)
        self._schoolSystem = State(initialValue: siteIndex.books.first(where: { $0.id == progressStore.activeBookId })?.schoolSystem ?? "6-3")
    }

    var body: some View {
        ZStack(alignment: .top) {
            DuoColors.darkBg.ignoresSafeArea()

            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    header
                        .padding(.top, 8)

                    sectionLabel("选择年级")
                    gradeChips

                    sectionLabel("选择课本")
                    Picker("学制", selection: $schoolSystem) {
                        Text("六三制").tag("6-3")
                        Text("五四制").tag("5-4")
                    }
                    .pickerStyle(.segmented)
                    .onChange(of: schoolSystem) { _, value in
                        if value == "5-4" && selectedGrade > 5 { selectedGrade = 5 }
                    }
                    Toggle("显示旧版教材", isOn: $includeLegacy)
                        .tint(DuoColors.primary)
                        .foregroundStyle(DuoColors.darkInk)
                    VStack(spacing: 12) {
                        ForEach(booksForGrade, id: \.id) { book in
                            Button {
                                HapticEngine.shared.tap()
                                progressStore.setSelectedGrade(selectedGrade)
                                onPick(book.id)
                                isPresented = false
                            } label: {
                                bookCard(book)
                            }
                            .buttonStyle(.plain)
                        }
                        if booksForGrade.isEmpty {
                            Text("这个年级暂无课本")
                                .duoFont(.body, weight: .bold)
                                .foregroundStyle(DuoColors.darkInkMuted)
                                .frame(maxWidth: .infinity, alignment: .center)
                                .padding(.vertical, 20)
                        }
                    }
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 32)
            }
        }
    }

    private var booksForGrade: [Book] {
        siteIndex.books.filter { $0.grade == selectedGrade && ($0.schoolSystem ?? "6-3") == schoolSystem && (includeLegacy || $0.supersededBy == nil) }
    }

    // MARK: Header

    private var header: some View {
        HStack(alignment: .center) {
            VStack(alignment: .leading, spacing: 2) {
                Text("课本库")
                    .duoFont(.caption, weight: .heavy)
                    .tracking(1.5)
                    .foregroundStyle(DuoColors.darkInkMuted)
                Text("换本课本")
                    .duoFont(.title, weight: .black)
                    .foregroundStyle(DuoColors.darkInk)
            }
            Spacer()
            Button {
                isPresented = false
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 16, weight: .black))
                    .foregroundStyle(DuoColors.darkInkMuted)
                    .frame(width: 40, height: 40)
                    .background(DuoColors.darkSurface, in: .circle)
                    .overlay(Circle().strokeBorder(DuoColors.darkSurfaceAlt, lineWidth: 2))
                    // ≥44pt hit target (ios-feel-18) — visual stays 40pt.
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("关闭")
        }
    }

    private func sectionLabel(_ text: String) -> some View {
        Text(text)
            .duoFont(.caption)
            .tracking(1.2)
            .foregroundStyle(DuoColors.darkInkMuted)
    }

    // MARK: Grade chips — chunky 3D pills

    private var gradeChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                ForEach(1...(schoolSystem == "5-4" ? 5 : 6), id: \.self) { g in
                    gradeChip(g)
                }
            }
            .padding(.vertical, 2)
        }
    }

    @ViewBuilder
    private func gradeChip(_ g: Int) -> some View {
        let selected = selectedGrade == g
        Button {
            withAnimation(.spring(response: 0.25, dampingFraction: 0.75)) {
                selectedGrade = g
            }
            HapticEngine.shared.tap()
        } label: {
            ZStack {
                // 3D shadow layer
                Capsule()
                    .fill(selected ? DuoColors.primaryDark : DuoColors.darkSurfaceAlt)
                    .frame(width: 76, height: 42)
                    .offset(y: 3)
                // Top surface
                Text("\(g)年级")
                    .duoFont(.body, weight: .heavy)
                    .minimumScaleFactor(0.6)   // XXL 档在固定宽度里自动收缩
                    .foregroundStyle(selected ? .white : DuoColors.darkInkMuted)
                    .frame(width: 76, height: 42)
                    .background(selected ? DuoColors.primary : DuoColors.darkSurface, in: .capsule)
            }
            .frame(width: 76, height: 45)
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder
    private func downloadStatusBadge(_ book: Book) -> some View {
        if downloader.isBookDownloaded(book.id) {
            Label("已下载", systemImage: "checkmark.circle.fill")
                .duoFont(.micro)
                .foregroundStyle(DuoColors.primary)
        } else if let entry = downloader.manifest?.books.first(where: { $0.bookId == book.id }) {
            let size = ByteCountFormatter.string(fromByteCount: entry.data.bytes + entry.audio.bytes, countStyle: .file)
            Label("需下载 · \(size)", systemImage: "arrow.down.circle")
                .duoFont(.micro)
                .foregroundStyle(DuoColors.secondary)
        }
    }

    // MARK: Book card — 3D chunky card with sticker badge

    @ViewBuilder
    private func bookCard(_ book: Book) -> some View {
        let cfg = Subjects.resolve(book: book)
        let isActive = progressStore.activeBookId == book.id

        let borderColor: Color = isActive ? DuoColors.primary : DuoColors.darkSurfaceAlt
        let shadowColor: Color = isActive ? DuoColors.primaryDark : DuoColors.darkSurface.opacity(0.8)

        ZStack {
            // Bottom depth layer (3D shadow peek)
            RoundedRectangle(cornerRadius: 18)
                .fill(shadowColor)
                .offset(y: 4)

            // Top card surface
            HStack(spacing: 14) {
                SubjectStickerBadge(label: cfg.label, color: cfg.accent)
                    .frame(width: 56, height: 56)

                VStack(alignment: .leading, spacing: 4) {
                    Text(book.fullName)
                        .duoFont(.subhead)
                        .foregroundStyle(DuoColors.ink)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                    if let edition = book.sourceEdition {
                        Text(edition).duoFont(.caption).foregroundStyle(DuoColors.inkMuted)
                    }
                    HStack(spacing: 4) {
                        Text("\(book.unitsCount) 单元")
                        Text("·").foregroundStyle(DuoColors.inkSofter)
                        Text("\(book.lessonsCount) 节小课")
                    }
                    .duoFont(.caption)
                    .foregroundStyle(DuoColors.inkMuted)
                    downloadStatusBadge(book)
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                if isActive {
                    ZStack {
                        Circle().fill(DuoColors.primary).frame(width: 28, height: 28)
                        Image(systemName: "checkmark")
                            .font(.system(size: 14, weight: .black))
                            .foregroundStyle(.white)
                    }
                }
            }
            .padding(14)
            .background(DuoColors.darkSurface, in: .rect(cornerRadius: 18))
            .overlay {
                RoundedRectangle(cornerRadius: 18)
                    .strokeBorder(borderColor, lineWidth: 2)
            }
        }
        .frame(minHeight: 80)
    }
}

// MARK: - Subject sticker badge (matches tab-bar icon language)

private struct SubjectStickerBadge: View {
    let label: String
    let color: Color

    var body: some View {
        GeometryReader { geo in
            let s = min(geo.size.width, geo.size.height) / 56
            ZStack {
                // Bottom depth layer
                RoundedRectangle(cornerRadius: 12 * s)
                    .fill(color.opacity(0.7))
                    .offset(y: 3 * s)
                // Top surface
                RoundedRectangle(cornerRadius: 12 * s)
                    .fill(color)
                    .overlay {
                        RoundedRectangle(cornerRadius: 12 * s)
                            .stroke(Color.black.opacity(0.35), lineWidth: 2 * s)
                    }
                Text(label)
                    .font(.system(size: 18 * s, weight: .black))
                    .foregroundStyle(.white)
                    .shadow(color: .black.opacity(0.25), radius: 0, x: 0, y: 1)
            }
            .frame(width: geo.size.width, height: geo.size.height)
        }
    }
}
