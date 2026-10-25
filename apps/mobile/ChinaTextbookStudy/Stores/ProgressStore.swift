import Foundation
import Combine

/// User progress store — port of apps/web/src/store/progress.ts.
///
/// State is persisted to `Application Support/cstf/progress.json` after every
/// mutation.
@MainActor
final class ProgressStore: ObservableObject {
    static let shared = ProgressStore()

    static let maxHearts = Economy.maxHearts
    /// 5 minutes per heart, matching the shared economy spec.
    static let heartRechargeSeconds: TimeInterval = TimeInterval(Economy.heartRegenSeconds)

    @Published private(set) var progress: UserProgress

    /// Currently selected grade for the home screen (1-6, 0 = none picked yet).
    @Published var selectedGrade: Int

    /// The book currently displayed on the home/path tab. Nil = pick one first.
    @Published var activeBookId: String?

    /// Whether the first-run onboarding flow has been completed.
    @Published var hasCompletedOnboarding: Bool

    private static let progressFile = "progress.json"
    private static let prefsFile = "prefs.json"

    private struct Prefs: Codable {
        var selectedGrade: Int
        var activeBookId: String?
        var hasCompletedOnboarding: Bool?
    }

    init() {
        #if DEBUG
        // UI tests launch with `-uitest` to get a hermetic, deterministic state:
        // no persisted progress, onboarding already done, seed book selected.
        if ProcessInfo.processInfo.arguments.contains("-uitest") {
            var fresh = Self.freshProgress()
            fresh.gems = 500
            fresh.hearts = ProcessInfo.processInfo.arguments.contains("-uitest-zero-hearts") ? 0 : Self.maxHearts
            if fresh.hearts == 0 { fresh.nextHeartAt = (Date().timeIntervalSince1970 + Self.heartRechargeSeconds) * 1000 }
            // Keep UI tests deterministic: no login-reward card popping over
            // the flows under test.
            fresh.lastDailyRewardDate = SRS.todayString()
            self.progress = fresh
            self.selectedGrade = 1
            let args = ProcessInfo.processInfo.arguments
            if let flag = args.firstIndex(of: "-uitest-book"), args.indices.contains(flag + 1) {
                self.activeBookId = args[flag + 1]
            } else {
                self.activeBookId = "g1up"
            }
            self.hasCompletedOnboarding = !ProcessInfo.processInfo.arguments.contains("-uitest-onboarding")
            return
        }
        #endif

        if let restored = PersistenceService.read(UserProgress.self, from: Self.progressFile) {
            var p = restored
            // One-time shield migration: old saves get topped up to the new
            // 2-shield baseline; anything above 2 is kept (never confiscated),
            // only new purchases are capped.
            if p.freezesMigrated != true {
                p.streakFreezes = max(p.streakFreezes ?? 0, Economy.initialFreezes)
                p.freezesMigrated = true
            }
            self.progress = p
        } else {
            self.progress = Self.freshProgress()
        }
        if let prefs = PersistenceService.read(Prefs.self, from: Self.prefsFile) {
            self.selectedGrade = prefs.selectedGrade
            self.activeBookId = prefs.activeBookId
            self.hasCompletedOnboarding = prefs.hasCompletedOnboarding ?? true  // existing users: skip
        } else {
            self.selectedGrade = 0
            self.activeBookId = nil
            self.hasCompletedOnboarding = false
        }

        // One-time achievement-ledger migration, aligned with web's persist
        // migrate: historical unlocks enter the permanent ledger silently —
        // no retroactive gem payout. Only unlocks from here on pay rewards.
        var migrated = progress
        var didMigrate = false
        if migrated.unlockedAchievements == nil {
            migrated.unlockedAchievements = Achievements.latchUnlocked(
                prevLedger: [],
                currentUnlockedIds: Achievements.unlockedIds(for: snapshot(of: migrated))
            )
            didMigrate = true
        }
        // Wave D claim-ledger migration: Wave B paid gems at unlock time, so
        // every already-unlocked badge counts as already claimed — claiming it
        // again would double-pay. Only unlocks from here on use the claim flow.
        if migrated.claimedAchievements == nil {
            migrated.claimedAchievements = migrated.unlockedAchievements ?? []
            didMigrate = true
        }
        // parity-1 阅读 id 迁移：历史存档里的裸 id / `-followup` 后缀键一次性
        // 升级成规范阅读 id（`reading:{kind}:{rawId}`），与 web / 备份信封共用
        // 同一个 key 空间。归一化幂等，重复启动不会再改动。
        let normalizedReadings = Reading.normalizeIds(migrated.completedReadings ?? [])
        if Set(normalizedReadings) != Set(migrated.completedReadings ?? []) {
            migrated.completedReadings = normalizedReadings
            didMigrate = true
        }
        // Wave D joinedDate backfill: earliest lesson completion, else today.
        if migrated.joinedDate == nil {
            let earliest = migrated.completedLessons.values.map(\.completedAt).min()
            migrated.joinedDate = earliest.map { String($0.prefix(10)) } ?? SRS.todayString()
            didMigrate = true
        }
        if didMigrate {
            progress = migrated
            save()
        }
        // iCloud 键值库的内容是异步下载的 —— 值到货时系统发通知，收到就重探
        // 一次恢复弹窗并放行后续镜像（iosstore-4）。
        startObservingCloudChanges()
    }

    deinit {
        if let observer = cloudChangeObserver {
            NotificationCenter.default.removeObserver(observer)
        }
    }

    // MARK: - Mutations

    /// A brand-new save file: Wave B economy baseline (2 streak shields) +
    /// Wave D ledgers (empty claim ledger, joinedDate = today). The empty
    /// claim ledger matters: it marks the save as post-Wave-D so the launch
    /// migration never mistakes fresh unlocks for legacy auto-paid ones.
    private static func freshProgress() -> UserProgress {
        var p = UserProgress(
            xp: 0,
            streak: 0,
            lastActiveDate: "",
            completedLessons: [:],
            mistakesBank: []
        )
        p.streakFreezes = Economy.initialFreezes
        p.freezesMigrated = true
        p.unlockedAchievements = []
        p.claimedAchievements = []
        p.joinedDate = SRS.todayString()
        return p
    }

    /// Award XP + record the result for a finished lesson.
    ///
    /// Wave B economy (single source of truth = packages/core/src/economy.ts):
    ///   - accuracy = first-try correct / total; stars via `Economy.starsFromAccuracy`
    ///   - XP = correctCount×10, +5 perfect, +5 first-ever 3 stars, weekend ×2
    ///   - gems via `Economy.lessonGemDrip`; streak milestones + achievement
    ///     rewards are banked on top (reported separately in the outcome).
    @discardableResult
    func completeLesson(
        lessonId: String,
        correctCount: Int,
        questionCount: Int,
        now: Date = Date()
    ) -> LessonOutcome {
        // Hearts may have recharged while the learner sat in the lesson —
        // settle the timer before anything below reads a stale count.
        tickHeartRecharge(now: now)

        let total = max(1, questionCount)
        let correct = min(max(0, correctCount), total)
        let accuracy = Double(correct) / Double(total)
        let stars = Economy.starsFromAccuracy(accuracy)
        let perfect = correct >= total
        let isWeekend = Economy.isWeekend(now)
        // 单元挑战（"{bookId}-u{n}-exam"）：XP ×2，宝石 drip 不翻倍。
        let isExam = Economy.isExamLessonId(lessonId)

        let result = LessonResult(
            lessonId: lessonId,
            stars: stars,
            accuracy: accuracy,
            completedAt: ISO8601DateFormatter().string(from: now)
        )

        let goal = dailyGoal
        // Read "today's XP so far" against the injected `now` (not the
        // wall-clock `todayXp` accessor) so the whole mutation shares one
        // notion of "today" — otherwise the one-time goal bonus repeats.
        let todayKey = SRS.todayString(now: now)
        let todayXpBefore = progress.lastXpDate == todayKey ? (progress.todayXp ?? 0) : 0
        let streakBefore = progress.streak

        var p = progress
        rollDailyIfNeeded(&p, now: now)

        // A finished lesson has no session to resume (parity-13 invariant).
        if p.activeLesson?.lessonId == lessonId { p.activeLesson = nil }

        let priorStars = p.completedLessons[lessonId]?.stars ?? 0
        let firstPerfect = stars == 3 && priorStars < 3

        let xpGain = Economy.xpForLesson(
            correctCount: correct,
            perfect: perfect,
            firstPerfect: firstPerfect,
            isWeekend: isWeekend,
            isExam: isExam
        )
        recordXP(&p, xpGain, now: now)
        p.dailyLessons = (p.dailyLessons ?? 0) + 1

        // Take the best result so a re-run can only improve stars.
        if let prior = p.completedLessons[lessonId] {
            if stars >= prior.stars { p.completedLessons[lessonId] = result }
        } else {
            p.completedLessons[lessonId] = result
        }
        let streakAdvance = bumpStreak(&p, now: now)

        let dailyGoalReachedNow = todayXpBefore < goal && (p.todayXp ?? 0) >= goal
        let gemsGained = Economy.lessonGemDrip(
            stars: stars,
            isFirstPerfect: firstPerfect,
            crossedDailyGoal: dailyGoalReachedNow
        )
        p.gems = (p.gems ?? 0) + gemsGained
        p.lifetimeGems = (p.lifetimeGems ?? 0) + gemsGained

        let newAchievements = latchAchievements(&p)

        progress = p
        save()
        NotificationService.shared.rescheduleStreakReminder(streak: p.streak, studiedToday: true)

        return LessonOutcome(
            xpGained: xpGain,
            stars: stars,
            streakBefore: streakBefore,
            streakAfter: p.streak,
            dailyGoalReachedNow: dailyGoalReachedNow,
            gemsGained: gemsGained,
            newAchievements: newAchievements,
            milestoneGems: streakAdvance.milestoneGems,
            weekendDoubled: isWeekend && xpGain > 0,
            freezesConsumed: streakAdvance.freezesConsumed,
            examDoubled: isExam && xpGain > 0
        )
    }

    // MARK: - Lesson session persistence (parity-13)

    /// The suspended session for `lessonId`, if one was saved. A session
    /// belonging to a different lesson is ignored (a new run of another
    /// lesson simply overwrites it via `upsertLessonSession`).
    func activeSession(for lessonId: String) -> ActiveLessonSession? {
        guard let session = progress.activeLesson, session.lessonId == lessonId else { return nil }
        return session
    }

    /// Persist the in-flight lesson session so quitting mid-lesson (or the
    /// app being killed) resumes at the same question next time. Only one
    /// session is kept — starting another lesson replaces it.
    func upsertLessonSession(_ session: ActiveLessonSession) {
        var p = progress
        p.activeLesson = session
        progress = p
        save()
    }

    /// Drop the suspended session (lesson finished or explicitly abandoned).
    func clearLessonSession() {
        guard progress.activeLesson != nil else { return }
        var p = progress
        p.activeLesson = nil
        progress = p
        save()
    }

    /// Add a mistaken question to the SRS bank if it isn't already there.
    func recordMistake(lessonId: String, lessonTitle: String?, question: Question, now: Date = Date()) {
        var p = progress
        let exists = p.mistakesBank.contains { $0.lessonId == lessonId && $0.question.id == question.id }
        if !exists {
            p.mistakesBank.append(SRS.newEntry(
                lessonId: lessonId,
                lessonTitle: lessonTitle,
                question: question,
                now: now
            ))
        }
        progress = p
        save()
    }

    /// Apply a review result against the SRS bank (parity-7, aligned with
    /// web's Wave C semantics). Graduation — box ≥ 3 with at least 2 correct
    /// reviews — no longer deletes the entry: it sets the `graduated` flag
    /// instead, keeping the record in the「已掌握」bucket and keeping the
    /// achievement snapshot's `reviewedMistakeCount` from regressing.
    /// Graduated entries never enter the due queue; a wrong answer
    /// defensively sends the entry back to the oven (graduated cleared),
    /// mirroring the web store.
    ///
    /// - Returns: `true` when this review newly graduated the entry.
    @discardableResult
    func reviewMistake(lessonId: String, questionId: Int, isCorrect: Bool, now: Date = Date()) -> Bool {
        var p = progress
        guard let idx = p.mistakesBank.firstIndex(where: {
            $0.lessonId == lessonId && $0.question.id == questionId
        }) else { return false }
        let wasGraduated = SRS.isGraduated(p.mistakesBank[idx])
        var updated = SRS.review(entry: p.mistakesBank[idx], isCorrect: isCorrect, now: now)
        var newlyGraduated = false
        if !isCorrect {
            // 防御性：答错回炉（毕业条目理论上不会再进队列）。
            updated.graduated = false
        } else if SRS.isGraduated(graduated: nil, box: updated.box, correctCount: updated.correctCount) {
            updated.graduated = true
            newlyGraduated = !wasGraduated
        }
        p.mistakesBank[idx] = updated
        _ = latchAchievements(&p)
        progress = p
        save()
        return newlyGraduated
    }

    /// Persist the user's selected grade preference.
    func setSelectedGrade(_ grade: Int) {
        selectedGrade = grade
        persistPrefs()
    }

    /// Persist which book the user is currently on (the home-tab path).
    func setActiveBook(_ bookId: String?) {
        activeBookId = bookId
        persistPrefs()
    }

    /// Mark first-run onboarding complete.
    func completeOnboarding() {
        hasCompletedOnboarding = true
        persistPrefs()
    }

    private func persistPrefs() {
        try? PersistenceService.write(
            Prefs(
                selectedGrade: selectedGrade,
                activeBookId: activeBookId,
                hasCompletedOnboarding: hasCompletedOnboarding
            ),
            to: Self.prefsFile
        )
    }

    // MARK: - Queries

    func isLessonCompleted(_ lessonId: String) -> Bool {
        progress.completedLessons[lessonId] != nil
    }

    func stars(for lessonId: String) -> Int? {
        progress.completedLessons[lessonId]?.stars
    }

    var totalCompletedLessons: Int { progress.completedLessons.count }
    var perfectedLessonCount: Int { progress.completedLessons.values.filter { $0.stars == 3 }.count }

    /// Snapshot used by Achievements.unlockedIds / newlyUnlocked.
    var achievementSnapshot: AchievementProgressSnapshot {
        AchievementProgressSnapshot(
            xp: progress.xp,
            streak: progress.streak,
            lifetimeGems: progress.lifetimeGems ?? gems,
            completedLessonCount: totalCompletedLessons,
            perfectedLessonCount: perfectedLessonCount,
            ownedCosmeticCount: ownedCosmetics.count,
            reviewedMistakeCount: progress.mistakesBank.filter { ($0.correctCount ?? 0) > 0 }.count
        )
    }

    /// Unlocked achievements = the permanent ledger ∪ whatever the live
    /// snapshot currently satisfies. The union means a badge shown as earned
    /// can never flip back to locked when a streak breaks or a reviewed
    /// mistake graduates out of the bank.
    var unlockedAchievementIds: Set<String> {
        Set(progress.unlockedAchievements ?? [])
            .union(Achievements.unlockedIds(for: achievementSnapshot))
    }

    // MARK: - Gamification Accessors (hearts / gems / daily XP)

    var hearts: Int { progress.hearts ?? Self.maxHearts }
    var gems: Int { progress.gems ?? 0 }
    var dailyGoal: Int { progress.dailyGoal ?? Economy.defaultDailyGoal }
    var streakFreezes: Int { progress.streakFreezes ?? 0 }

    /// A login reward claimed this launch/foreground that the UI hasn't
    /// presented yet. HomeView shows a light card and clears it.
    @Published var pendingDailyReward: DailyRewardClaim?

    struct DailyRewardClaim: Equatable {
        /// Gems banked by this claim.
        let gems: Int
        /// The effective (salvageable) streak the tier was read from; 0 when
        /// the chain is broken — copy must not brag about a dead streak.
        let effectiveStreak: Int
    }

    /// Claim today's login reward if it hasn't been claimed yet (once per
    /// local day, `lastDailyRewardDate` ledger). Tier = min(有效连胜, 7); a
    /// broken chain honestly drops to tier 0. Publishes `pendingDailyReward`
    /// for the home screen to celebrate.
    ///
    /// parity-4：发放时把「按哪一档发的」记进 `lastDailyRewardStreak`。断签当天
    /// 先按 0 档发 5💎，用户随后补卡成功时 `topUpDailyRewardAfterMakeup` 会补发
    /// 差额，总额与 web「补卡决定之后再发」完全一致（见该方法注释）。
    func claimDailyRewardIfDue(now: Date = Date()) {
        let today = SRS.todayString(now: now)
        guard progress.lastDailyRewardDate != today else { return }
        let effectiveStreak = salvageableStreak(now: now)
        let gems = Economy.dailyRewardForStreak(effectiveStreak)
        var p = progress
        p.lastDailyRewardDate = today
        p.lastDailyRewardStreak = effectiveStreak
        p.gems = (p.gems ?? 0) + gems
        p.lifetimeGems = (p.lifetimeGems ?? 0) + gems
        progress = p
        save()
        pendingDailyReward = DailyRewardClaim(gems: gems, effectiveStreak: effectiveStreak)
    }

    /// 补卡成功后补发今日登录奖励的差额（parity-4）。
    ///
    /// web 的顺序是「先弹补卡 → 用户决定 → 再按决定后的有效连胜发奖」；
    /// iOS 在 `refreshForNow` 第一时间就发了奖（不依赖任何 UI 出场，
    /// 断签用户换个 tab 也不会漏发）。两边最终收益必须相等：
    ///   - 用户补卡成功：web 一次发 table[min(streak,7)]；
    ///     iOS 先发 table[0]=5，这里补发 table[min(streak,7)] − 5 → 总额相同。
    ///   - 用户不补卡：两边都只有 table[0]=5 → 相同。
    /// 差额只在「今天已发过奖 且 新档位更高」时补，永不重复发放。
    private func topUpDailyRewardAfterMakeup(now: Date = Date()) {
        let today = SRS.todayString(now: now)
        guard progress.lastDailyRewardDate == today,
              let paidStreak = progress.lastDailyRewardStreak
        else { return }
        let effectiveStreak = salvageableStreak(now: now)
        guard effectiveStreak > paidStreak else { return }
        let delta = Economy.dailyRewardForStreak(effectiveStreak)
            - Economy.dailyRewardForStreak(paidStreak)
        guard delta > 0 else { return }
        var p = progress
        p.lastDailyRewardStreak = effectiveStreak
        p.gems = (p.gems ?? 0) + delta
        p.lifetimeGems = (p.lifetimeGems ?? 0) + delta
        progress = p
        save()
        // 卡片还没被首页消费掉就并进同一张卡，已消费则单独报喜。
        let shown = (pendingDailyReward?.gems ?? 0) + delta
        pendingDailyReward = DailyRewardClaim(gems: shown, effectiveStreak: effectiveStreak)
    }

    /// Spend 50 gems to pull `lastActiveDate` back to yesterday, reviving a
    /// streak the shields could not cover. Only offered when nothing was
    /// studied today AND the gap is ≥2 days AND the chain is otherwise dead.
    @discardableResult
    func makeUpYesterdayStreak(now: Date = Date()) -> Bool {
        let today = SRS.todayString(now: now)
        guard progress.streak > 0,
              !progress.lastActiveDate.isEmpty,
              progress.lastActiveDate != today,
              SRS.daysBetween(progress.lastActiveDate, today) >= 2,
              salvageableStreak(now: now) == 0
        else { return false }
        guard spendGems(Economy.streakMakeupCost) else { return false }
        var p = progress
        p.lastActiveDate = SRS.dateString(daysFromNow: -1, now: now)
        progress = p
        save()
        // 连胜救回来了 → 今日登录奖励按新档位补发差额（parity-4）。
        topUpDailyRewardAfterMakeup(now: now)
        return true
    }

    /// XP earned today (resets when date changes).
    var todayXp: Int {
        let today = SRS.todayString()
        if progress.lastXpDate == today {
            return progress.todayXp ?? 0
        }
        return 0
    }

    /// Whether the daily XP goal has been reached today.
    var dailyGoalReached: Bool { todayXp >= dailyGoal }

    /// Whether any study activity (lesson / review / reading) happened today.
    var studiedToday: Bool { progress.lastActiveDate == SRS.todayString() }

    /// The streak value that studying today could still continue (incl. shield
    /// coverage): the current streak while it's salvageable, else 0. Shared by
    /// the HUD (`displayStreak`) and the reminder copy (`reminderStreak`) so
    /// neither ever quotes a streak that is already gone.
    func salvageableStreak(now: Date = Date()) -> Int {
        let today = SRS.todayString(now: now)
        if progress.lastActiveDate == today { return progress.streak }
        let adv = Streak.advance(
            streak: progress.streak,
            streakFreezes: progress.streakFreezes ?? 0,
            lastActiveDate: progress.lastActiveDate,
            today: today
        )
        return adv.streak == progress.streak + 1 ? progress.streak : 0
    }

    /// Honest streak for the home HUD: a stale "连续 N 天" never survives a
    /// broken chain — once shields can't cover the gap this drops to 0.
    var displayStreak: Int { salvageableStreak() }

    /// The streak value a reminder may truthfully quote; 0 makes the
    /// notification fall back to generic copy instead of promising to save a
    /// streak that is already gone.
    var reminderStreak: Int { salvageableStreak() }

    /// Unix timestamp (seconds) for the next heart recharge, or nil if full.
    var nextHeartAt: Date? {
        guard let ms = progress.nextHeartAt else { return nil }
        return Date(timeIntervalSince1970: ms / 1000)
    }

    /// Lose one heart. Called on wrong answer in lesson runner.
    func loseHeart(now: Date = Date()) {
        // Settle any pending recharge first so we never eat a heart the timer
        // already gave back while no UI was ticking it.
        tickHeartRecharge(now: now)
        var p = progress
        let current = p.hearts ?? Self.maxHearts
        guard current > 0 else { return }
        p.hearts = current - 1
        // Start recharge timer if not already running.
        if p.nextHeartAt == nil {
            p.nextHeartAt = (now.timeIntervalSince1970 + Self.heartRechargeSeconds) * 1000
        }
        progress = p
        save()
    }

    /// Win back heart(s) mid-lesson (ios-economy-4: practice earn-back).
    /// Capped at `maxHearts`; reaching the cap stops the recharge timer.
    func addHeart(_ n: Int = 1, now: Date = Date()) {
        guard n > 0 else { return }
        // Settle the timer first so the cap is applied to the true count.
        tickHeartRecharge(now: now)
        var p = progress
        let current = p.hearts ?? Self.maxHearts
        guard current < Self.maxHearts else { return }
        let next = min(Self.maxHearts, current + n)
        p.hearts = next
        if next >= Self.maxHearts { p.nextHeartAt = nil }
        progress = p
        save()
    }

    /// 一轮错题复习的补心结算（iosretention-4）。
    ///
    /// 账本按天：`lastReviewHeartDate` 与登录奖励同款写法 —— 一天只补一次，
    /// 杜绝「进复习 → 随便答 → 看结算 → 返回」的无限回心。数额走 core 常量
    /// （答对 < `Economy.reviewHeartMinCorrect` 不发；满心不发；一次最多 1 颗）。
    ///
    /// - Returns: 本次是否真的补了心（false = 不够格 / 今天补过 / 已满心）。
    @discardableResult
    func claimReviewHeartIfEligible(correctCount: Int, now: Date = Date()) -> Bool {
        tickHeartRecharge(now: now)
        let today = SRS.todayString(now: now)
        guard progress.lastReviewHeartDate != today else { return false }
        let reward = Economy.reviewHeartReward(correctCount: correctCount, hearts: hearts)
        guard reward > 0 else { return false }
        var p = progress
        p.lastReviewHeartDate = today
        progress = p
        addHeart(reward, now: now)   // 内部会 save()
        return true
    }

    /// 今天是否还能靠复习补心（UI 提示用：不够格时别承诺补心）。
    func canClaimReviewHeart(now: Date = Date()) -> Bool {
        progress.lastReviewHeartDate != SRS.todayString(now: now) && hearts < Self.maxHearts
    }

    /// Tick the heart recharge timer, restoring hearts as needed.
    ///
    /// 自愈（webstore-1 iOS 半边）：**缺心却没有回心计时**（导入的存档、老档、
    /// 任何一次漏设计时的写入）会让红心永远停在原地 —— 这里当场补种计时，
    /// 而不是直接返回。满心则顺手清掉残留计时。
    func tickHeartRecharge(now: Date = Date()) {
        var p = progress
        var currentHearts = p.hearts ?? Self.maxHearts
        guard currentHearts < Self.maxHearts else {
            if p.nextHeartAt != nil {
                p.nextHeartAt = nil
                progress = p
                save()
            }
            return
        }
        guard var nextMs = p.nextHeartAt else {
            p.nextHeartAt = (now.timeIntervalSince1970 + Self.heartRechargeSeconds) * 1000
            progress = p
            save()
            return
        }
        let nowMs = now.timeIntervalSince1970 * 1000
        while nextMs <= nowMs && currentHearts < Self.maxHearts {
            currentHearts += 1
            nextMs += Self.heartRechargeSeconds * 1000
        }
        p.hearts = currentHearts
        p.nextHeartAt = currentHearts < Self.maxHearts ? nextMs : nil
        progress = p
        save()
    }

    /// Day key the published state was last rendered against — lets
    /// `refreshForNow` detect a calendar rollover while the app was inactive.
    private var lastKnownDay = SRS.todayString()

    /// Re-sync every time-derived piece of state with the wall clock: recharge
    /// hearts, poke observers when the calendar day changed (todayXp /
    /// studiedToday / displayStreak are all computed against "today"), and
    /// refresh the rolling reminder window. Called at launch, on returning to
    /// foreground, and on the system's day-changed notification — so an app
    /// left overnight never shows yesterday's state.
    func refreshForNow(now: Date = Date()) {
        tickHeartRecharge(now: now)
        // 每次刷新都重探一次云端恢复（iosstore-6）：KVS 首次下载是异步的，
        // 冷启动那一下往往读不到值 —— 只在冷启动探一次等于把弹窗押在时序上。
        // 必须排在结算与镜像**之前**：探到了就立起弹窗，后面两件事自动让路。
        checkCloudRestoreOffer(now: now)
        // 云端恢复还没决定时，当前进度可能是一份「等着被覆盖」的空档 ——
        // 不在这份空档上发奖 / 结算联赛，等用户选完再说。
        if pendingCloudRestore == nil {
            claimDailyRewardIfDue(now: now)
            refreshLeague(now: now)
        }
        let today = SRS.todayString(now: now)
        if today != lastKnownDay {
            lastKnownDay = today
            // Derived accessors read the wall clock; nothing stored changed,
            // so fire the publisher by hand to make every view recompute.
            objectWillChange.send()
        }
        NotificationService.shared.rescheduleStreakReminder(
            streak: salvageableStreak(now: now),
            studiedToday: progress.lastActiveDate == today,
            now: now
        )
        // 存档尽力镜像进 iCloud（Wave E2）：启动 / 回前台各刷一次，失败静默。
        mirrorBackupToCloud(now: now)
    }

    /// Refill hearts to max (used by streak freeze or debug).
    func refillHearts() {
        var p = progress
        p.hearts = Self.maxHearts
        p.nextHeartAt = nil
        progress = p
        save()
    }

    /// Add gems (from chest reward, quests, etc.). Tracks a lifetime total
    /// so "earn N gems" achievements don't reset when the balance is spent.
    func addGems(_ amount: Int) {
        var p = progress
        p.gems = (p.gems ?? 0) + amount
        if amount > 0 { p.lifetimeGems = (p.lifetimeGems ?? 0) + amount }
        _ = latchAchievements(&p)   // gem-collector can unlock right here
        progress = p
        save()
    }

    /// Spend gems if enough balance. Returns true if successful.
    @discardableResult
    func spendGems(_ amount: Int) -> Bool {
        var p = progress
        let current = p.gems ?? 0
        guard current >= amount else { return false }
        p.gems = current - amount
        progress = p
        save()
        return true
    }

    /// Spend gems to add one streak freeze shield. Holdings are capped at
    /// `Economy.maxFreezes` (legacy saves above the cap keep what they have —
    /// they just can't buy more). Returns true on success.
    @discardableResult
    func buyStreakFreeze(cost: Int = Economy.freezeCost) -> Bool {
        guard streakFreezes < Economy.maxFreezes else { return false }
        guard spendGems(cost) else { return false }
        var p = progress
        p.streakFreezes = (p.streakFreezes ?? 0) + 1
        progress = p
        save()
        return true
    }

    /// Spend gems to refill all hearts. Returns true on success. Ticks the
    /// recharge timer first — hearts that came back on their own while the UI
    /// was stale must never be sold back to the learner for gems.
    @discardableResult
    func buyHeartRefill(cost: Int = Economy.heartRefillCost, now: Date = Date()) -> Bool {
        tickHeartRecharge(now: now)
        guard hearts < Self.maxHearts else { return false }
        guard spendGems(cost) else { return false }
        refillHearts()
        return true
    }

    // MARK: - Cosmetics

    /// Starter cosmetics are owned for free; plus anything purchased.
    var ownedCosmetics: Set<String> {
        Set(Cosmetics.starters.map(\.id)).union(progress.ownedCosmetics ?? [])
    }
    func isOwned(_ id: String) -> Bool { ownedCosmetics.contains(id) }

    var equippedMascotSkin: String { progress.equippedMascotSkin ?? Cosmetics.defaultEquipped.mascotSkin }
    var equippedTheme: String { progress.equippedTheme ?? Cosmetics.defaultEquipped.uiTheme }
    var equippedBackdrop: String { progress.equippedBackdrop ?? Cosmetics.defaultEquipped.lessonBackdrop }

    func isEquipped(_ id: String) -> Bool {
        id == equippedMascotSkin || id == equippedTheme || id == equippedBackdrop
    }

    /// Buy a cosmetic with gems. Returns true on success (or if already owned).
    @discardableResult
    func buyCosmetic(_ item: CosmeticItem) -> Bool {
        if isOwned(item.id) { return true }
        guard spendGems(item.cost) else { return false }
        var p = progress
        var owned = p.ownedCosmetics ?? []
        owned.append(item.id)
        p.ownedCosmetics = owned
        _ = latchAchievements(&p)   // first-cosmetic
        progress = p
        save()
        return true
    }

    /// Equip an owned cosmetic in its slot.
    func equipCosmetic(_ item: CosmeticItem) {
        guard isOwned(item.id) else { return }
        var p = progress
        switch item.type {
        case .mascotSkin:     p.equippedMascotSkin = item.id
        case .uiTheme:        p.equippedTheme = item.id
        case .lessonBackdrop: p.equippedBackdrop = item.id
        }
        progress = p
        save()
        applyEquippedTheme()
    }

    /// The `UiThemeData` behind the equipped theme id (nil for the stock theme).
    var equippedThemeData: UiThemeData? {
        Cosmetics.uiThemes.first { $0.item.id == equippedTheme }?.data
    }

    /// The gradient behind the equipped lesson backdrop (nil for the plain one).
    var equippedBackdropData: LessonBackdropData? {
        Cosmetics.lessonBackdrops.first { $0.item.id == equippedBackdrop }?.data
    }

    /// Push the equipped theme into the design system. Called at launch and
    /// whenever a theme is equipped.
    func applyEquippedTheme() {
        DuoColors.themeOverride = equippedThemeData
    }

    /// Award XP for a mistake review (feeds the daily goal + streak, no hearts).
    /// A session with zero correct answers still counts as review activity —
    /// the quest counter and streak track effort, not the score.
    func awardReviewXP(_ amount: Int, reviewedCount: Int = 0, now: Date = Date()) {
        guard amount > 0 || reviewedCount > 0 else { return }
        var p = progress
        rollDailyIfNeeded(&p, now: now)
        recordXP(&p, amount, now: now)
        p.dailyReviews = (p.dailyReviews ?? 0) + max(0, reviewedCount)
        bumpStreak(&p, now: now)
        _ = latchAchievements(&p)
        progress = p
        save()
        NotificationService.shared.rescheduleStreakReminder(streak: p.streak, studiedToday: true)
    }

    // MARK: - Reading (passages & stories)

    /// 已完成的阅读（**规范阅读 id**，`reading:{kind}:{rawId}`）。
    var completedReadings: Set<String> { Set(progress.completedReadings ?? []) }

    /// 是否读完。入参既可以是规范 id，也可以是历史裸 id / `-followup` 写法
    /// （内部统一归一化），老调用点不改也不会误判为未读。
    func isReadingCompleted(_ id: String) -> Bool {
        let key = Reading.normalize(id)
        guard !key.isEmpty else { return false }
        return completedReadings.contains(key)
    }

    /// 按类型 + 原始 id 查询（推荐写法：`isReadingCompleted(.followup, passage.id)`）。
    func isReadingCompleted(_ kind: Reading.Kind, _ rawId: String) -> Bool {
        completedReadings.contains(Reading.id(kind, rawId))
    }

    /// A reading activity whose XP the store can quote (content-5): the
    /// completion gate UI shows「读完了 +N XP」before committing.
    enum ReadingActivity: Hashable {
        case listen                     // 课文听读
        case followup                   // 跟读
        case storyQuiz(accuracy: Double) // 故事测验（按正确率取档）
    }

    /// Convenience read of `Economy.ReadingXP` for a given activity.
    func readingRewardXP(for kind: ReadingActivity) -> Int {
        switch kind {
        case .listen:                   return Economy.ReadingXP.listen
        case .followup:                 return Economy.ReadingXP.followup
        case .storyQuiz(let accuracy):  return Economy.storyQuizXp(accuracy: accuracy)
        }
    }

    /// Mark a passage/story as read. Awards XP + advances the daily goal & streak
    /// the first time only, so reading feeds the same loop as lessons.
    ///
    /// `id` 归一化后入账（规范阅读 id），历史调用点传裸 id 也不会写脏 key。
    func completeReading(id: String, xp: Int, now: Date = Date()) {
        let key = Reading.normalize(id)
        guard !key.isEmpty else { return }
        var p = progress
        var set = Set(p.completedReadings ?? [])
        guard set.insert(key).inserted else { return }   // already read
        p.completedReadings = Array(set)
        rollDailyIfNeeded(&p, now: now)
        recordXP(&p, xp, now: now)
        p.dailyReadings = (p.dailyReadings ?? 0) + 1
        bumpStreak(&p, now: now)
        _ = latchAchievements(&p)
        progress = p
        save()
        NotificationService.shared.rescheduleStreakReminder(streak: p.streak, studiedToday: true)
    }

    /// 按类型 + 原始 id 记完成（推荐写法，UI 不必自己拼 key）。
    func completeReading(_ kind: Reading.Kind, rawId: String, xp: Int, now: Date = Date()) {
        completeReading(id: Reading.id(kind, rawId), xp: xp, now: now)
    }

    // MARK: - Profile

    /// First-use date, YYYY-MM-DD (ios-retention-12). Backfilled at load from
    /// the earliest lesson completion; a brand-new save gets today.
    var joinedDate: String { progress.joinedDate ?? SRS.todayString() }

    var displayName: String {
        get { progress.displayName ?? "小学员" }
        set {
            var p = progress
            p.displayName = newValue.isEmpty ? nil : newValue
            progress = p
            save()
        }
    }

    /// Reset all learning progress (used by Settings). Keeps nothing.
    func resetProgress() {
        progress = Self.freshProgress()
        pendingDailyReward = nil
        // 本机重置 ≠ 新设备。不记下这个决定的话，下次回前台会因为「本地空档」
        // 把重置误判成换新机，弹出「发现 iCloud 备份」——用户顺手点「从头开始」
        // 就会 disown 掉云端那份真备份，下一课把它洗成空档。
        // 想彻底覆盖云端存档仍可走设置页的手动恢复/备份入口。
        UserDefaults.standard.set(true, forKey: Self.cloudRestoreHandledKey)
        save()
    }

    /// Set the daily XP goal.
    func setDailyGoal(_ goal: Int) {
        var p = progress
        p.dailyGoal = goal
        progress = p
        save()
    }

    /// Mark a chest as claimed.
    func claimChest(_ chestId: String) {
        var p = progress
        var claimed = p.claimedChests ?? [:]
        claimed[chestId] = true
        p.claimedChests = claimed
        progress = p
        save()
    }

    func isChestClaimed(_ chestId: String) -> Bool {
        progress.claimedChests?[chestId] == true
    }

    /// Mistakes the SRS scheduler thinks are due for review today.
    ///
    /// 毕业（已掌握）条目留在错题本里但永不到期 —— 判定走 `SRS.isGraduated`
    /// 的**派生语义**（显式标记 or box≥3 且答对≥2，core-2）：老档与从 web
    /// 导入的条目往往只有 box/correctCount，只认标记会让它们永远在队列里打转。
    var dueMistakes: [MistakeEntry] {
        SRS.dueEntries(progress.mistakesBank)
    }

    /// Entries mastered through the SRS loop (the「已掌握」bucket).
    var graduatedMistakes: [MistakeEntry] {
        progress.mistakesBank.filter { SRS.isGraduated($0) }
    }

    // MARK: - Internal

    // MARK: - Daily counters, XP history & quests

    /// Roll the per-day counters over when the calendar day changes.
    private func rollDailyIfNeeded(_ p: inout UserProgress, now: Date) {
        let today = SRS.todayString(now: now)
        guard p.dailyDate != today else { return }
        p.dailyDate = today
        p.dailyLessons = 0
        p.dailyReviews = 0
        p.dailyReadings = 0
    }

    /// Single place that records earned XP: lifetime, today, and the rolling
    /// per-day history the weekly report reads.
    private func recordXP(_ p: inout UserProgress, _ amount: Int, now: Date) {
        guard amount > 0 else { return }
        let today = SRS.todayString(now: now)
        p.xp += amount
        if p.lastXpDate == today {
            p.todayXp = (p.todayXp ?? 0) + amount
        } else {
            p.todayXp = amount
            p.lastXpDate = today
        }
        var history = p.xpHistory ?? [:]
        history[today] = (history[today] ?? 0) + amount
        // Keep the map small — the report only ever looks back two weeks.
        if history.count > 21 {
            for key in history.keys.sorted().prefix(history.count - 21) { history.removeValue(forKey: key) }
        }
        p.xpHistory = history
    }

    /// Today's three quests (stable for the calendar day).
    var todayQuests: [Quest] { Quests.daily(for: SRS.todayString()) }

    /// How far along today's counters are for a given quest.
    func questProgress(_ quest: Quest, now: Date = Date()) -> Int {
        let today = SRS.todayString(now: now)
        guard progress.dailyDate == today else {
            // Counters belong to a previous day — only XP has its own tracking.
            return quest.kind == .earnXP ? todayXp : 0
        }
        switch quest.kind {
        case .earnXP:          return todayXp
        case .finishLessons:   return progress.dailyLessons ?? 0
        case .reviewMistakes:  return progress.dailyReviews ?? 0
        case .readTexts:       return progress.dailyReadings ?? 0
        }
    }

    func isQuestComplete(_ quest: Quest) -> Bool { questProgress(quest) >= quest.target }

    /// One quest's frozen state (ios-retention-4) — the result screen captures
    /// a snapshot before and after committing a lesson to animate the deltas.
    struct QuestSnapshot: Identifiable, Hashable {
        let quest: Quest
        /// Raw progress (not clamped to the target).
        let progress: Int
        let claimed: Bool
        var id: String { quest.id }
        var isComplete: Bool { progress >= quest.target }
    }

    /// Pure read of today's three quests with their current progress + claim
    /// state. Never mutates — safe to call before/after a mutation to diff.
    func questsSnapshot(now: Date = Date()) -> [QuestSnapshot] {
        todayQuests.map { quest in
            QuestSnapshot(
                quest: quest,
                progress: questProgress(quest, now: now),
                claimed: isQuestClaimed(quest)
            )
        }
    }

    /// Finished-but-unclaimed quests (tab red dot; header pill on the card).
    var claimableQuestCount: Int {
        todayQuests.filter { isQuestComplete($0) && !isQuestClaimed($0) }.count
    }

    private func questKey(_ quest: Quest, now: Date = Date()) -> String {
        "\(SRS.todayString(now: now)):\(quest.id)"
    }

    func isQuestClaimed(_ quest: Quest) -> Bool {
        (progress.claimedQuests ?? []).contains(questKey(quest))
    }

    /// Claim a finished quest's gem reward. Returns false if not claimable.
    @discardableResult
    func claimQuest(_ quest: Quest) -> Bool {
        guard isQuestComplete(quest), !isQuestClaimed(quest) else { return false }
        var p = progress
        var claimed = p.claimedQuests ?? []
        claimed.append(questKey(quest))
        // Trim old claims so the ledger doesn't grow forever.
        if claimed.count > 60 { claimed.removeFirst(claimed.count - 60) }
        p.claimedQuests = claimed
        progress = p
        addGems(quest.reward)   // persists
        return true
    }

    /// 某一个日历周（周一 → 周日）每天的 XP，共 7 格（parity-6）。
    ///
    /// 周窗口的单一事实源是 `Week`（core `week.ts` 的镜像）——联赛周榜、周报、
    /// 连胜日历必须共用同一个「本周」，不再各写一套滚动 7 天。
    func weekXP(weekKey: String, now: Date = Date()) -> [(date: String, xp: Int)] {
        let history = progress.xpHistory ?? [:]
        return Week.weekDateKeys(weekKey, now: now).map { ($0, history[$0] ?? 0) }
    }

    /// 本周（now 所在的日历周）每天的 XP，周一 → 周日。
    func weekXP(now: Date = Date()) -> [(date: String, xp: Int)] {
        weekXP(weekKey: Week.weekStartKey(now), now: now)
    }

    /// 今天在本周 7 格里的下标（周一=0 … 周日=6）。
    /// ⚠️ 连胜日历 / 周报的「今天」高亮请用它，别再假设「最后一格 = 今天」。
    func todayIndexInWeek(now: Date = Date()) -> Int {
        min(max(0, Week.dayIndexInWeek(weekKey: Week.weekStartKey(now), date: now, now: now)), 6)
    }

    /// 本周 7 格 XP（周一 → 周日）。
    ///
    /// parity-6：口径已从「最近滚动 7 天」改为**日历周**，与 web 周报 / 联赛
    /// 周榜一致。`days` 参数保留只为不打断既有调用点，周窗口恒为 7 格。
    func weekXPEntries(now: Date = Date()) -> [(date: String, xp: Int)] {
        weekXP(now: now)
    }

    /// 某个日历周的 XP 总和：`weeksAgo` = 0 本周、1 上周……
    func weeklyTotal(weeksAgo: Int, now: Date = Date()) -> Int {
        weekXP(weekKey: Week.weekStartKey(weeksAgo: weeksAgo, now: now), now: now)
            .reduce(0) { $0 + $1.xp }
    }

    /// 兼容旧调用点：`endingDaysAgo` 现按「往前几周」解读（0 = 本周，7 = 上周）。
    func weeklyTotal(endingDaysAgo: Int = 0, now: Date = Date()) -> Int {
        weeklyTotal(weeksAgo: max(0, endingDaysAgo) / 7, now: now)
    }

    /// Advance the streak for study activity on `now`, then pay out any
    /// newly-reached streak milestone (once per tier, `claimedStreakRewards`
    /// ledger). Returns the milestone gems banked (0 = none) plus how many
    /// shields the advance consumed covering missed days (ios-economy-6, the
    /// result screen surfaces the「护盾保住了连胜」moment).
    @discardableResult
    private func bumpStreak(_ p: inout UserProgress, now: Date) -> (milestoneGems: Int, freezesConsumed: Int) {
        let adv = Streak.advance(
            streak: p.streak,
            streakFreezes: p.streakFreezes ?? 0,
            lastActiveDate: p.lastActiveDate,
            today: SRS.todayString(now: now)
        )
        p.streak = adv.streak
        p.streakFreezes = adv.streakFreezes
        p.lastActiveDate = adv.lastActiveDate

        let reward = Economy.streakMilestoneReward(p.streak)
        var claimed = p.claimedStreakRewards ?? []
        guard reward > 0, !claimed.contains(p.streak) else {
            return (0, adv.freezesConsumed)
        }
        claimed.append(p.streak)
        p.claimedStreakRewards = claimed
        p.gems = (p.gems ?? 0) + reward
        p.lifetimeGems = (p.lifetimeGems ?? 0) + reward
        return (reward, adv.freezesConsumed)
    }

    // MARK: - League (Wave E1: 本地模拟联赛)

    /// 联赛解锁门槛：累计完成 10 节课。
    var leagueUnlocked: Bool { totalCompletedLessons >= League.unlockLessons }

    /// 当前段位 id（未入组时为青铜；无效老档容错落回青铜）。
    var leagueTierId: League.TierId {
        League.tier(progress.leagueTier ?? League.TierId.bronze.rawValue).id
    }

    /// 本设备的联赛 salt；入组时一次性生成后不再变化。
    var leagueSalt: String? { progress.leagueSalt }

    /// 已入组的周键；nil = 尚未入组。
    var leagueWeekKey: String? { progress.leagueWeekKey }

    /// 待展示的上周结算结果（宝石已入账）。
    var pendingLeagueResult: LeagueWeekResult? { progress.pendingLeagueResult }

    /// 某一周（周一 weekKey 起 7 天）用户实际获得的 XP —— xpHistory 求和。
    /// 保留天数不足一周时按可得数据尽力求和。
    func leagueWeeklyXp(weekKey: String) -> Int {
        guard Week.isDateKey(weekKey) else { return 0 }
        let history = progress.xpHistory ?? [:]
        // 周窗口走 Week（core week.ts 的镜像）—— 与周报 / 连胜日历同一口径。
        return Week.weekDateKeys(weekKey).reduce(0) { $0 + (history[$1] ?? 0) }
    }

    /// 本周（now 所在周）的用户 XP。
    func leagueWeeklyXp(now: Date = Date()) -> Int {
        leagueWeeklyXp(weekKey: League.weekKeyFor(now))
    }

    /// 入组 + 周一结算（幂等，App 启动 / 回前台 / 打开排行页时调用）：
    ///   - 未解锁（完成课程 < 10）什么都不做；
    ///   - 首次解锁：生成一次性 salt、段位从青铜起步、锁定本周周键；
    ///   - 周键变化：按上周末终值排名结算——前 5 晋级（钻石封顶）、
    ///     后 5 降级（青铜保底）、其余原地；宝石按名次表 + 晋级奖励入账；
    ///     结果存 `pendingLeagueResult` 由 UI 弹结算幕。
    ///   - 每周只结一次：结算后周键即翻到本周，重复调用不再触发。
    func refreshLeague(now: Date = Date()) {
        guard leagueUnlocked else { return }
        let currentWeek = League.weekKeyFor(now)
        var p = progress
        var changed = false

        if p.leagueSalt == nil {
            p.leagueSalt = UUID().uuidString
            changed = true
        }
        if p.leagueTier == nil {
            p.leagueTier = League.TierId.bronze.rawValue
            changed = true
        }
        if p.leagueWeekKey == nil {
            p.leagueWeekKey = currentWeek
            changed = true
        }

        if let lastWeek = p.leagueWeekKey, lastWeek != currentWeek, let salt = p.leagueSalt {
            let tierId = League.tier(p.leagueTier ?? "").id
            // 上周末终值：botXpAt 在周日之后收敛到周目标全额。
            let botXps = (0..<League.botCount).map {
                League.botWeeklyGoal(weekKey: lastWeek, tier: tierId, salt: salt, botIndex: $0)
            }
            let userXp = leagueWeeklyXp(weekKey: lastWeek)
            let rank = League.userRank(userXp: userXp, botXps: botXps)
            let settle = League.settleRank(rank, tierId: tierId)
            let afterTier: League.TierId = settle.promoted
                ? League.nextTierId(tierId)
                : settle.demoted ? League.prevTierId(tierId) : tierId

            p.pendingLeagueResult = LeagueWeekResult(
                weekKey: lastWeek,
                rank: rank,
                tierBefore: tierId.rawValue,
                tierAfter: afterTier.rawValue,
                promoted: settle.promoted,
                demoted: settle.demoted,
                gems: settle.gems
            )
            if settle.gems > 0 {
                p.gems = (p.gems ?? 0) + settle.gems
                p.lifetimeGems = (p.lifetimeGems ?? 0) + settle.gems
            }
            p.leagueTier = afterTier.rawValue
            p.leagueWeekKey = currentWeek
            _ = latchAchievements(&p)   // 宝石入账可能解锁 gem-collector
            changed = true
        }

        if changed {
            progress = p
            save()
        }
    }

    /// UI 弹过结算幕后清除（宝石早已入账，清除不回滚）。
    func clearPendingLeagueResult() {
        guard progress.pendingLeagueResult != nil else { return }
        var p = progress
        p.pendingLeagueResult = nil
        progress = p
        save()
    }

    // MARK: - Wave E2: 跳级（jump ahead）

    /// 跳级测试通过后批量补标前置课程。
    ///
    /// 防刷口径（双端一致）：只把未完成的课程标记为
    /// completed{stars: 1, accuracy: 0.8}，**不发 XP、不发宝石、不推进连胜、
    /// 不计入每日任务**；已完成的课程保持原成绩不动。跳级测试本身是合成
    /// 会话，不写 completedLessons —— 调用方只在通过时调用这里。
    ///
    /// - Returns: 实际新标记的课程数。
    @discardableResult
    func applyJumpUnlock(lessonIds: [String], now: Date = Date()) -> Int {
        var p = progress
        let stamp = ISO8601DateFormatter().string(from: now)
        var marked = 0
        for id in lessonIds where p.completedLessons[id] == nil {
            p.completedLessons[id] = LessonResult(lessonId: id, stars: 1, accuracy: 0.8, completedAt: stamp)
            marked += 1
        }
        guard marked > 0 else { return 0 }
        // 完成课程数类成就照常入账（领取才发宝石，不构成刷分通道）。
        _ = latchAchievements(&p)
        progress = p
        save()
        return marked
    }

    // MARK: - Wave E2: 课前讲解已读标记（content-2）

    func hasSeenIntro(_ lessonId: String) -> Bool {
        (progress.seenIntros ?? []).contains(lessonId)
    }

    /// 记住「这节课的讲解看过了」，下次直接进题目不再打断。
    func markIntroSeen(_ lessonId: String) {
        guard !hasSeenIntro(lessonId) else { return }
        var p = progress
        var seen = p.seenIntros ?? []
        seen.append(lessonId)
        p.seenIntros = seen
        progress = p
        save()
    }

    // MARK: - Wave E2: 题目报错（纯本地）

    var reports: [QuestionReport] { progress.reports ?? [] }

    /// 记录一条题目报错。同一题同一类型只记一次（重复点按静默去重）。
    /// - Returns: 是否新记录了一条。
    @discardableResult
    func addReport(
        lessonId: String,
        questionId: Int,
        kind: QuestionReport.Kind,
        userAnswer: String? = nil,
        questionText: String? = nil,
        now: Date = Date()
    ) -> Bool {
        var p = progress
        var list = p.reports ?? []
        guard !list.contains(where: {
            $0.lessonId == lessonId && $0.questionId == questionId && $0.kind == kind
        }) else { return false }
        list.append(QuestionReport(
            lessonId: lessonId,
            questionId: questionId,
            kind: kind,
            createdAt: ISO8601DateFormatter().string(from: now),
            userAnswer: userAnswer?.isEmpty == true ? nil : userAnswer,
            questionText: questionText
        ))
        // 报错列表封顶，别让存档无限膨胀。
        if list.count > 200 { list.removeFirst(list.count - 200) }
        p.reports = list
        progress = p
        save()
        return true
    }

    /// 报错列表导出（设置页 ShareLink 用）。
    func exportReportsData() throws -> Data {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        return try encoder.encode(reports)
    }

    // MARK: - Wave E2: 存档备份（BackupEnvelope v1，双端互通）

    /// 导出当前进度为中立信封。
    func exportBackupEnvelope(now: Date = Date()) -> Backup.Envelope {
        Backup.makeEnvelope(from: progress, exportedAt: now)
    }

    /// 导出为 JSON 数据（ShareLink / iCloud 镜像共用）。
    func exportBackupData(now: Date = Date()) throws -> Data {
        try Backup.encode(exportBackupEnvelope(now: now))
    }

    /// 用一份已校验的信封整体覆盖当前进度。
    ///
    /// - 错题条目缺题面快照时按 lessonId 从本地题库找回，找不到丢弃；
    /// - 联赛 salt 是设备指纹，保留本机值；
    /// - 今日 XP / 每日任务领取账本随档恢复（iosstore-2 / parity-3）：
    ///   不恢复的话当日目标进度归零 + 任务回到可领 → 导出再导入就能刷宝石；
    /// - 复习补心账本（`lastReviewHeartDate`）是本机按天的防刷账本，保留本机值
    ///   （iosretention-4）：被覆盖掉的话「补 1 心 → 导出 → 导入」当天能刷满心；
    /// - 真·瞬态（课程会话 / 今日任务计数）不导入；
    /// - 调用方负责导入前的「将覆盖当前进度」确认与导入后的全量刷新。
    func importBackup(_ envelope: Backup.Envelope, now: Date = Date()) {
        let restored = Backup.userProgress(
            from: envelope,
            questionLookup: { lessonId, questionId in
                guard let bookId = Backup.bookId(fromLessonId: lessonId),
                      let lesson = try? DataLoader.shared.loadLesson(bookId: bookId, lessonId: lessonId)
                else { return nil }
                return lesson.questions.first { $0.id == questionId }
            },
            keepLeagueSalt: progress.leagueSalt,
            keepReviewHeartDate: progress.lastReviewHeartDate,
            now: now,
            today: SRS.todayString(now: now)
        )
        progress = restored
        pendingDailyReward = nil
        save()
        applyEquippedTheme()
    }

    // MARK: - Wave E2: iCloud 键值备份镜像（尽力而为，失败静默）

    static let cloudBackupKey = "cstf.backup.v1"
    /// NSUbiquitousKeyValueStore 总额 1MB —— 超过 900KB 就不写。
    private static let cloudBackupByteLimit = 900_000
    /// 用户已经对「云端那份档」做过决定（恢复 / 暂不）→ 不再弹恢复提示。
    static let cloudRestoreHandledKey = "cstf.cloudRestoreHandled"
    /// 本设备已与云端那份档**做过了断**：记下那份档的身份标记（见 `archiveMark`）。
    /// 用户选了「暂不恢复 / 从头开始」之后，那份档就不再是这台设备的上位档，
    /// 「本地弱于云端」的闸门对它失效 —— 否则这台设备会永远写不出新备份。
    static let cloudArchiveDisownedKey = "cstf.cloudArchiveDisowned"
    /// 本设备是否**确认**读到过 iCloud 键值库的真实内容（见 `CloudReadState`）。
    static let cloudReadConfirmedKey = "cstf.cloudReadConfirmed"
    /// 第一次尝试读云端的时间戳（Unix 秒）——「未知」态的宽限期从这里起算。
    static let cloudFirstReadAtKey = "cstf.cloudFirstReadAt"
    /// 首次尝试读云端起，多久还读不到值就认定「云端确实没有备份」。
    ///
    /// iCloud 键值库的首次下载是异步的，`synchronize()` 只负责落盘、不会拉取远端。
    /// 没有这个宽限期，全新用户（iCloud 里本来就没有备份、也永远收不到变更通知）
    /// 会永远停在「未知」态、一份备份都写不出去 —— 那是比原 bug 更糟的倒退。
    static let cloudUnknownGraceSeconds: TimeInterval = 24 * 3600

    /// 发现的 iCloud 备份（新装设备）——RootView 弹「要恢复吗？」。
    @Published var pendingCloudRestore: Backup.Envelope?

    /// iCloud 键值库变更监听（值到货 / 账号切换）。
    private var cloudChangeObserver: NSObjectProtocol?

    /// 读云端的**三态**结果（iosstore-4）。
    ///
    /// `data(forKey:) == nil` 有两种截然不同的含义，混为一谈就会用弱档盖掉真备份：
    ///   - `.empty`：确认云端没有备份（读到过真实内容 / 宽限期已过）→ 可以写；
    ///   - `.unknown`：本设备还没确认过云端内容（首次下载没到货 / 刚登录 iCloud /
    ///     弱网）→ **只读不写**，等 `didChangeExternallyNotification` 或宽限期。
    enum CloudReadState: Equatable {
        case unknown
        case empty
        case archive(Backup.Envelope)
    }

    /// 镜像判定用的进度概要（本地 / 云端各取一份对比）。
    struct CloudSnapshot: Equatable {
        var xp: Int
        var lessonCount: Int
        /// 空档 = 一节课没上、一点 XP 没有（刚装好的新设备）。
        var isEmpty: Bool { lessonCount == 0 && xp <= 0 }

        init(xp: Int, lessonCount: Int) {
            self.xp = xp
            self.lessonCount = lessonCount
        }

        init(_ p: UserProgress) {
            self.init(xp: p.xp, lessonCount: p.completedLessons.count)
        }

        init(_ envelope: Backup.Envelope) {
            self.init(xp: envelope.data.xp, lessonCount: envelope.data.completedLessons.count)
        }
    }

    /// **纯判定**：当前本地进度该不该覆盖云端那份备份（iosstore-1 / integration-1）。
    ///
    /// 换机丢档的根因是「无条件覆盖」：新设备第一帧就把空档写进 KVS，真实备份
    /// 当场蒸发，恢复弹窗也因为读回自己写的空信封而永不出现。四道闸门：
    ///   1. `restorePending`：用户还没决定要不要恢复 —— 一个字节都不许写；
    ///   2. 本地是空档 —— 空档没有任何值得备份的东西，绝不覆盖；
    ///   3. `cloudReadConfirmed == false`（`cloud == nil` 时）—— 「读不到」不等于
    ///      「云端没有」：KVS 首次下载是异步的，未知态一律只读不写（iosstore-4）；
    ///   4. 本地进度弱于云端（XP 或完成课数更少）—— 只可能是「云端才是真身」
    ///      的场景（新装 / 重置），保留云端，等本地追上再镜像。
    ///
    /// 第 4 道闸门保护的是**尚未被恢复的用户存档**。用户在恢复弹窗里明确选了
    /// 「暂不恢复 / 从头开始」之后，那份档就与这台设备两清了（`cloudArchiveDisowned`），
    /// 闸门必须放行 —— 否则新学习者的进度长期弱于那份旧档，这台设备学一整年都
    /// 写不出一份备份，再换机时一年进度全丢（iosstore-5）。
    static func shouldMirrorBackup(
        local: CloudSnapshot,
        cloud: CloudSnapshot?,
        restorePending: Bool,
        cloudArchiveDisowned: Bool = false,
        cloudReadConfirmed: Bool = true
    ) -> Bool {
        if restorePending { return false }
        if local.isEmpty { return false }
        guard let cloud else { return cloudReadConfirmed }
        if cloud.isEmpty { return true }
        if cloudArchiveDisowned { return true }
        return local.xp >= cloud.xp && local.lessonCount >= cloud.lessonCount
    }

    /// 云端档的身份标记：优先导出时间，缺失时退回「进度指纹」。
    /// 用来记「用户放弃的是哪一份档」—— 换成另一份（别的设备刚推上来的真备份）
    /// 时标记对不上，单调性闸门自动重新生效。
    static func archiveMark(_ envelope: Backup.Envelope) -> String {
        envelope.exportedAt.isEmpty
            ? "xp\(envelope.data.xp)-lessons\(envelope.data.completedLessons.count)"
            : envelope.exportedAt
    }

    /// 这份云端档是不是用户已经明确「了断」过的那一份？
    func isCloudArchiveDisowned(_ envelope: Backup.Envelope) -> Bool {
        guard let mark = UserDefaults.standard.string(forKey: Self.cloudArchiveDisownedKey),
              !mark.isEmpty
        else { return false }
        return mark == Self.archiveMark(envelope)
    }

    /// 记下「本设备已与这份云端档做过了断」（恢复 / 暂不恢复都算）。
    private func rememberCloudArchiveDecision(_ envelope: Backup.Envelope?) {
        guard let envelope else { return }
        UserDefaults.standard.set(Self.archiveMark(envelope), forKey: Self.cloudArchiveDisownedKey)
    }

    /// 标记「本设备确认读到过 iCloud 键值库的内容」（读到值 / 收到变更通知 /
    /// 自己写成功过）—— 之后 `nil` 就可以放心当成「云端没有备份」。
    private func markCloudReadConfirmed() {
        UserDefaults.standard.set(true, forKey: Self.cloudReadConfirmedKey)
    }

    /// 读不到值时，能否认定「云端确实没有备份」？
    /// 确认过一次就永久成立；否则从首次尝试起等满 `cloudUnknownGraceSeconds`。
    private func isCloudEmptinessConfirmed(now: Date) -> Bool {
        let defaults = UserDefaults.standard
        if defaults.bool(forKey: Self.cloudReadConfirmedKey) { return true }
        let firstAttempt = defaults.double(forKey: Self.cloudFirstReadAtKey)
        guard firstAttempt > 0 else {
            defaults.set(now.timeIntervalSince1970, forKey: Self.cloudFirstReadAtKey)
            return false
        }
        guard now.timeIntervalSince1970 - firstAttempt >= Self.cloudUnknownGraceSeconds
        else { return false }
        markCloudReadConfirmed()
        return true
    }

    /// 读云端（三态）。坏档按「云端为空」处理 —— 读不懂的字节没有任何值得
    /// 保护的内容，继续拦着只会让这台设备永远备份不了。
    func cloudRead(now: Date = Date()) -> CloudReadState {
        let store = NSUbiquitousKeyValueStore.default
        // synchronize() 只把本地改动落盘；远端内容由系统异步下载 —— 所以下面
        // 读不到值时绝不能直接下「云端没有备份」的结论。
        store.synchronize()
        if let data = store.data(forKey: Self.cloudBackupKey) {
            markCloudReadConfirmed()
            if case .success(let envelope) = Backup.validate(data) { return .archive(envelope) }
            return .empty
        }
        return isCloudEmptinessConfirmed(now: now) ? .empty : .unknown
    }

    /// 把当前进度镜像进 iCloud 键值存储。任何失败（超限 / 无 iCloud /
    /// 无授权）都静默 —— 镜像是加分项，绝不打扰学习。
    ///
    /// 写之前先读云端比对（见 `shouldMirrorBackup`）：镜像只会让云端变得更新，
    /// 永远不会用更弱的进度盖掉更强的存档；云端状态未知时干脆不写。
    func mirrorBackupToCloud(now: Date = Date()) {
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("-uitest") { return }
        #endif
        let local = CloudSnapshot(progress)
        // 空档 / 待决定：连云端都不必读（后两个参数取最宽松值，只留这两道闸门）。
        guard Self.shouldMirrorBackup(
            local: local,
            cloud: nil,
            restorePending: pendingCloudRestore != nil,
            cloudArchiveDisowned: true,
            cloudReadConfirmed: true
        ) else { return }

        let cloudSnapshot: CloudSnapshot?
        let disowned: Bool
        switch cloudRead(now: now) {
        case .unknown:
            return                      // 还没确认过云端内容 —— 只读不写
        case .empty:
            cloudSnapshot = nil
            disowned = false
        case .archive(let envelope):
            cloudSnapshot = CloudSnapshot(envelope)
            disowned = isCloudArchiveDisowned(envelope)
        }
        guard Self.shouldMirrorBackup(
            local: local,
            cloud: cloudSnapshot,
            restorePending: false,
            cloudArchiveDisowned: disowned,
            cloudReadConfirmed: true     // 走到这里云端状态已确认
        ) else { return }

        guard let data = try? JSONEncoder().encode(exportBackupEnvelope(now: now)),
              data.count < Self.cloudBackupByteLimit else { return }
        let store = NSUbiquitousKeyValueStore.default
        store.set(data, forKey: Self.cloudBackupKey)
        store.synchronize()
        // 自己写进去的值之后一定读得到 —— 云端状态从此确定。
        markCloudReadConfirmed()
    }

    /// 探测：本地还是空档、用户也没对云端那份档做过决定，而云端有真档 →
    /// 立起恢复提示。启动、每次回前台、以及 iCloud 值到货时都会重跑。
    ///
    /// ⚠️ 门槛只看「本地是不是空档」，**不看引导有没有做完**（iosstore-6）：
    /// 换机首启时 KVS 常常还没到货，用户会先把引导走完 —— 拿
    /// `hasCompletedOnboarding` 当闸门等于把弹窗永久关死，用户主观就是「换机丢档」。
    func checkCloudRestoreOffer(now: Date = Date()) {
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("-uitest") { return }
        #endif
        guard Self.shouldOfferCloudRestore(
            local: CloudSnapshot(progress),
            restoreHandled: UserDefaults.standard.bool(forKey: Self.cloudRestoreHandledKey),
            promptShowing: pendingCloudRestore != nil
        ) else { return }
        guard case .archive(let envelope) = cloudRead(now: now),
              !envelope.data.completedLessons.isEmpty || envelope.data.xp > 0
        else { return }
        pendingCloudRestore = envelope
    }

    /// **纯判定**：本地这一侧允不允许弹「从 iCloud 恢复」？
    ///
    /// 只看两件事：本地还是不是空档、用户有没有对云端那份档做过决定。
    /// 刻意**不看引导有没有做完** —— 那是第一轮修复把弹窗押在时序上的根因。
    static func shouldOfferCloudRestore(
        local: CloudSnapshot,
        restoreHandled: Bool,
        promptShowing: Bool
    ) -> Bool {
        if promptShowing { return false }
        if restoreHandled { return false }
        return local.isEmpty
    }

    /// iCloud 值到货 / 账号切换：确认云端状态，并重跑一次恢复探测。
    /// （KVS 首次下载是异步的，冷启动那一下往往什么都读不到。）
    func handleCloudStoreChangedExternally(now: Date = Date()) {
        markCloudReadConfirmed()
        checkCloudRestoreOffer(now: now)
    }

    /// 注册 iCloud 键值库的外部变更监听（值到货 / 账号切换 / 配额）。
    private func startObservingCloudChanges() {
        guard cloudChangeObserver == nil else { return }
        cloudChangeObserver = NotificationCenter.default.addObserver(
            forName: NSUbiquitousKeyValueStore.didChangeExternallyNotification,
            object: NSUbiquitousKeyValueStore.default,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in self?.handleCloudStoreChangedExternally() }
        }
    }

    /// 接受云端恢复：导入 + 跳过引导 + 尽力选回原来的课本。
    func acceptCloudRestore(now: Date = Date()) {
        guard let envelope = pendingCloudRestore else { return }
        applyCloudRestore(envelope, now: now)
    }

    /// 用一份云端信封覆盖本地进度（恢复弹窗 / 设置页手动恢复共用）。
    func applyCloudRestore(_ envelope: Backup.Envelope, now: Date = Date()) {
        importBackup(envelope, now: now)
        // 恢复的老学员不需要再走新手引导；课本落到最近学过的一本。
        if let latest = progress.completedLessons.values.max(by: { $0.completedAt < $1.completedAt }),
           let bookId = Backup.bookId(fromLessonId: latest.lessonId) {
            activeBookId = bookId
            if let gradeChar = bookId.dropFirst().first, let grade = gradeChar.wholeNumberValue,
               (1...6).contains(grade) {
                selectedGrade = grade
            }
        }
        hasCompletedOnboarding = true
        persistPrefs()
        UserDefaults.standard.set(true, forKey: Self.cloudRestoreHandledKey)
        rememberCloudArchiveDecision(envelope)
        pendingCloudRestore = nil
        refreshForNow(now: now)
    }

    /// 「暂不恢复 / 从头开始」：记住选择，不再打扰。
    ///
    /// 「暂不」≠「删掉云端存档」，但**确实**等于「这台设备与那份档两清了」：
    /// 决定必须落盘（`rememberCloudArchiveDecision`），否则那份旧档会一直当这台
    /// 设备的上位档，把此后每一次镜像都拦下来 —— 新学习者学一整年也备份不了。
    func declineCloudRestore(now: Date = Date()) {
        UserDefaults.standard.set(true, forKey: Self.cloudRestoreHandledKey)
        // 正常路径上弹窗手里就攥着那份信封；万一没有（防御性调用），现读一次。
        var archive = pendingCloudRestore
        if archive == nil, case .archive(let envelope) = cloudRead(now: now) { archive = envelope }
        rememberCloudArchiveDecision(archive)
        pendingCloudRestore = nil
        // 决定做完了，把之前被挡下的每日结算补上（此时不会再写云端空档）。
        refreshForNow(now: now)
    }

    // MARK: - Achievement ledger (permanent, never re-locks)

    /// Snapshot of an arbitrary progress value (not necessarily the published
    /// one) — used to latch achievements mid-mutation.
    private func snapshot(of p: UserProgress) -> AchievementProgressSnapshot {
        AchievementProgressSnapshot(
            xp: p.xp,
            streak: p.streak,
            lifetimeGems: p.lifetimeGems ?? (p.gems ?? 0),
            completedLessonCount: p.completedLessons.count,
            perfectedLessonCount: p.completedLessons.values.filter { $0.stars == 3 }.count,
            ownedCosmeticCount: Set(Cosmetics.starters.map(\.id)).union(p.ownedCosmetics ?? []).count,
            reviewedMistakeCount: p.mistakesBank.filter { ($0.correctCount ?? 0) > 0 }.count
        )
    }

    /// Merge currently-unlocked achievements into the permanent
    /// `unlockedAchievements` ledger (only ever grows — a streak falling back
    /// can never re-lock an earned badge). Returns the newly unlocked ones.
    ///
    /// Wave D (ios-retention-10): unlocking no longer pays gems. The badge
    /// enters the ledger here; the learner taps「领取」and `claimAchievement`
    /// pays the reward exactly once (claim ledger `claimedAchievements`).
    private func latchAchievements(_ p: inout UserProgress) -> [Achievement] {
        let current = Achievements.unlockedIds(for: snapshot(of: p))
        let ledger = p.unlockedAchievements ?? []
        let ledgerSet = Set(ledger)
        let newlyUnlocked = Achievements.all.filter {
            current.contains($0.id) && !ledgerSet.contains($0.id)
        }
        guard !newlyUnlocked.isEmpty else { return [] }
        p.unlockedAchievements = Achievements.latchUnlocked(prevLedger: ledger, currentUnlockedIds: current)
        return newlyUnlocked
    }

    // MARK: - Achievement claiming (Wave D: unlock ≠ payout)

    /// Achievement ids whose reward has been collected.
    var claimedAchievementIds: Set<String> {
        Set(progress.claimedAchievements ?? [])
    }

    /// Unlocked-but-unclaimed achievement ids (claim buttons + tab badge).
    var claimableAchievementIds: Set<String> {
        unlockedAchievementIds.subtracting(claimedAchievementIds)
    }

    /// How many achievements can be claimed right now (profile tab red dot).
    var claimableAchievementCount: Int { claimableAchievementIds.count }

    /// Collect an unlocked achievement's gem reward. Idempotent: pays exactly
    /// once per achievement; returns the gems banked (0 = not unlocked yet,
    /// unknown id, or already claimed).
    @discardableResult
    func claimAchievement(_ id: String) -> Int {
        guard let achievement = Achievements.byId(id),
              unlockedAchievementIds.contains(id),
              !claimedAchievementIds.contains(id)
        else { return 0 }
        var p = progress
        // The live snapshot may satisfy an id the ledger hasn't latched yet
        // (claim from a view between mutations) — latch first so the claim
        // ledger never references an id missing from the unlock ledger.
        _ = latchAchievements(&p)
        var claimed = p.claimedAchievements ?? []
        claimed.append(id)
        p.claimedAchievements = claimed
        p.gems = (p.gems ?? 0) + achievement.reward
        p.lifetimeGems = (p.lifetimeGems ?? 0) + achievement.reward
        // The payout itself can unlock gem-collector — latch that too.
        _ = latchAchievements(&p)
        progress = p
        save()
        return achievement.reward
    }

    private func save() {
        try? PersistenceService.write(progress, to: Self.progressFile)
    }
}
