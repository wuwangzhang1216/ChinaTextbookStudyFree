import SwiftUI

/// 排行 tab —— 本地模拟联赛（Wave E1）。
///
/// - 未解锁（完成课程 < 10）：奖杯引导页 + 解锁进度条。
/// - 已解锁：段位横幅（6 段位徽章 + 当前段位名 + 周日倒计时）+
///   16 人实时榜（用户行高亮；第 5 名后晋级线、第 11 名后降级线）。
/// - 上周结算结果（pendingLeagueResult）以 fullScreenCover 弹出。
///
/// 榜单完全本地确定性生成：同一台设备同一周任何时刻重算结果一致，
/// bot 的 XP 随一天中的时间单调爬升（见 Domain/League.swift）。
struct LeagueView: View {
    @ObservedObject var progressStore: ProgressStore

    /// 榜单的「现在」——每分钟刷新一次，bot XP 与倒计时随之推进。
    @State private var now = Date()
    private let timer = Timer.publish(every: 60, on: .main, in: .common).autoconnect()

    var body: some View {
        ZStack {
            DuoColors.bg.ignoresSafeArea()
            if progressStore.leagueUnlocked {
                unlockedContent
            } else {
                lockedGuide
            }
        }
        .onAppear {
            progressStore.refreshLeague(now: Date())
            now = Date()
        }
        .onReceive(timer) { t in
            now = t
            // 跨过周一 0 点仍开着 app：分钟心跳里也做一次幂等结算检查。
            progressStore.refreshLeague(now: t)
        }
        // 结算幕：进入排行页时若上周结果还没看，立刻弹出。
        .fullScreenCover(item: leagueResultBinding) { result in
            LeagueResultView(result: result) {
                progressStore.clearPendingLeagueResult()
            }
        }
    }

    private var leagueResultBinding: Binding<LeagueWeekResult?> {
        Binding(
            get: { progressStore.pendingLeagueResult },
            set: { if $0 == nil { progressStore.clearPendingLeagueResult() } }
        )
    }

    // MARK: - 未解锁引导

    private var lockedGuide: some View {
        let done = min(progressStore.totalCompletedLessons, League.unlockLessons)
        return VStack(spacing: 18) {
            Spacer()

            ZStack {
                Circle()
                    .fill(DuoColors.bee.opacity(0.14))
                    .frame(width: 130, height: 130)
                Image(systemName: "trophy.fill")
                    .font(.system(size: 64, weight: .heavy))
                    .foregroundStyle(DuoColors.inkSofter)
            }

            Text("排行榜还没解锁")
                .duoFont(.title)
                .foregroundStyle(DuoColors.ink)

            Text("完成 \(League.unlockLessons) 节课，开启每周挑战。\n和模拟学伴一起，保持自己的学习节奏。")
                .duoFont(.body)
                .foregroundStyle(DuoColors.inkMuted)
                .multilineTextAlignment(.center)

            VStack(spacing: 8) {
                StyledProgressBar(
                    progress: Double(done) / Double(League.unlockLessons),
                    height: 16,
                    trackColor: DuoColors.surfaceAlt
                )
                Text("已完成 \(done) / \(League.unlockLessons) 节课")
                    .duoFont(.caption)
                    .foregroundStyle(DuoColors.inkMuted)
                    .monospacedDigit()
            }
            .padding(.horizontal, 48)

            Spacer()
            Spacer()
        }
        .accessibilityIdentifier("league-locked")
    }

    // MARK: - 已解锁：段位横幅 + 实时榜

    /// 当前周键（本地时区本周周一）。
    private var weekKey: String { League.weekKeyFor(now) }

    private var tier: League.Tier { League.tier(progressStore.leagueTierId) }

    /// salt 在 refreshLeague 入组时生成；首帧可能还没写入，兜底空串只影响
    /// 这一帧的展示（onAppear 立刻会触发重算）。
    private var salt: String { progressStore.leagueSalt ?? "" }

    private var bots: [League.Bot] {
        League.botsForWeek(weekKey: weekKey, tier: tier.id, salt: salt)
    }

    private var standings: [League.StandingEntry] {
        let botXps = (0..<League.botCount).map {
            League.botXpAt(weekKey: weekKey, tier: tier.id, salt: salt, botIndex: $0, date: now)
        }
        return League.standings(userXp: progressStore.leagueWeeklyXp(now: now), botXps: botXps)
    }

    private var unlockedContent: some View {
        let rows = standings
        let botList = bots
        return ScrollView {
            VStack(spacing: 16) {
                tierBanner
                    .padding(.top, 8)
                Label("本地模拟学伴榜 · 无真人在线排名", systemImage: "info.circle")
                    .duoFont(.caption).foregroundStyle(DuoColors.inkMuted)

                VStack(spacing: 0) {
                    ForEach(Array(rows.enumerated()), id: \.offset) { _, entry in
                        standingRow(entry, bots: botList)
                        if entry.rank == League.promoteZone && tier.id != .diamond {
                            zoneSeparator(promote: true)
                        }
                        if entry.rank == League.groupSize - League.demoteZone && tier.id != .bronze {
                            zoneSeparator(promote: false)
                        }
                    }
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 24)
            }
            .frame(maxWidth: LearningLayout.contentWidth)
            .frame(maxWidth: .infinity)
        }
        .accessibilityIdentifier("league-board")
    }

    // MARK: 段位横幅

    private var tierBanner: some View {
        VStack(spacing: 12) {
            // 6 段位徽章：已到过的 & 当前的亮色，更高的灰色。
            HStack(spacing: 10) {
                ForEach(League.tiers, id: \.id) { t in
                    let reached = t.order <= tier.order
                    let isCurrent = t.id == tier.id
                    Image(systemName: "trophy.fill")
                        .font(.system(size: isCurrent ? 34 : 22, weight: .heavy))
                        .foregroundStyle(reached ? Color(hex: t.colorHex) : DuoColors.inkSofter.opacity(0.5))
                        .shadow(
                            color: isCurrent ? Color(hex: t.colorHex).opacity(0.55) : .clear,
                            radius: 8
                        )
                        .accessibilityLabel("\(t.name)\(isCurrent ? "，当前段位" : "")")
                }
            }
            .frame(maxWidth: .infinity)

            Text(tier.name)
                .duoFont(.title)
                .foregroundStyle(DuoColors.ink)

            HStack(spacing: 14) {
                Label("前 \(League.promoteZone) 名晋级", systemImage: "arrow.up")
                    .duoFont(.micro)
                    .foregroundStyle(DuoColors.primary)
                Label(countdownText, systemImage: "clock.fill")
                    .duoFont(.micro)
                    .foregroundStyle(DuoColors.fox)
                    .monospacedDigit()
            }
        }
        .padding(.vertical, 16)
        .padding(.horizontal, 16)
        .frame(maxWidth: .infinity)
        .background(DuoColors.surface, in: .rect(cornerRadius: Radius.large))
        .overlay {
            RoundedRectangle(cornerRadius: Radius.large)
                .strokeBorder(Color(hex: tier.colorHex).opacity(0.5), lineWidth: 2)
        }
        .padding(.horizontal, 16)
    }

    /// 距下周一 00:00（结算时刻）的倒计时文案。
    private var countdownText: String {
        guard let monday = SRS.dateFormatter.date(from: weekKey),
              let nextMonday = Calendar.current.date(byAdding: .day, value: 7, to: Calendar.current.startOfDay(for: monday))
        else { return "周日晚结算" }
        let remaining = max(0, nextMonday.timeIntervalSince(now))
        let days = Int(remaining) / 86_400
        let hours = (Int(remaining) % 86_400) / 3_600
        let minutes = (Int(remaining) % 3_600) / 60
        if days > 0 { return "距结算 \(days) 天 \(hours) 小时" }
        if hours > 0 { return "距结算 \(hours) 小时 \(minutes) 分" }
        return "距结算 \(minutes) 分钟"
    }

    // MARK: 榜单行

    @ViewBuilder
    private func standingRow(_ entry: League.StandingEntry, bots: [League.Bot]) -> some View {
        let name: String = entry.isUser
            ? progressStore.displayName
            : (entry.botIndex.flatMap { i in bots.indices.contains(i) ? bots[i].name : nil } ?? "小伙伴")

        HStack(spacing: 12) {
            rankBadge(entry.rank)

            HStack(spacing: 6) {
                Text(name)
                    .duoFont(.subhead)
                    .foregroundStyle(DuoColors.ink)
                    .lineLimit(1)
                if entry.isUser {
                    Text("我")
                        .duoFont(.micro)
                        .foregroundStyle(.white)
                        .padding(.horizontal, 7)
                        .padding(.vertical, 2)
                        .background(DuoColors.primary, in: .capsule)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            HStack(spacing: 3) {
                Image(systemName: "bolt.fill")
                    .font(.system(size: 12, weight: .heavy))
                Text("\(entry.xp)")
                    .duoNumeral(.body)
            }
            .foregroundStyle(entry.isUser ? DuoColors.secondary : DuoColors.inkMuted)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(
            entry.isUser ? DuoColors.primary.opacity(0.12) : DuoColors.surface,
            in: .rect(cornerRadius: Radius.card)
        )
        .overlay {
            RoundedRectangle(cornerRadius: Radius.card)
                .strokeBorder(
                    entry.isUser ? DuoColors.primary.opacity(0.6) : DuoColors.border,
                    lineWidth: 2
                )
        }
        .padding(.vertical, 3)
        .accessibilityIdentifier(entry.isUser ? "league-row-me" : "league-row-\(entry.rank)")
        .accessibilityLabel("第 \(entry.rank) 名，\(name)，\(entry.xp) 经验")
    }

    /// 名次徽章：前三名奖牌色圆底，其余素色数字。
    @ViewBuilder
    private func rankBadge(_ rank: Int) -> some View {
        let medal: Color? = switch rank {
        case 1: DuoColors.bee
        case 2: Color(hex: 0xA8B8C8)
        case 3: Color(hex: 0xCD7F32)
        default: nil
        }
        ZStack {
            Circle()
                .fill(medal?.opacity(0.9) ?? DuoColors.surfaceAlt)
                .frame(width: 32, height: 32)
            Text("\(rank)")
                .duoNumeral(.body)
                .foregroundStyle(medal != nil ? .white : DuoColors.inkMuted)
        }
    }

    /// 晋级 / 降级分隔线。
    private func zoneSeparator(promote: Bool) -> some View {
        HStack(spacing: 8) {
            Rectangle()
                .fill((promote ? DuoColors.primary : DuoColors.danger).opacity(0.4))
                .frame(height: 2)
            HStack(spacing: 4) {
                Image(systemName: promote ? "arrow.up" : "arrow.down")
                    .font(.system(size: 11, weight: .black))
                Text(promote ? "晋级区" : "降级区")
                    .duoFont(.micro)
            }
            .foregroundStyle(promote ? DuoColors.primary : DuoColors.danger)
            Rectangle()
                .fill((promote ? DuoColors.primary : DuoColors.danger).opacity(0.4))
                .frame(height: 2)
        }
        .padding(.vertical, 6)
        .accessibilityIdentifier(promote ? "league-promote-line" : "league-demote-line")
    }
}

// MARK: - 周一结算幕

/// 上周联赛结算的全屏庆祝幕（复用彩带 + 聪聪 + chunky 按钮的庆祝语言）。
/// 宝石已在结算时入账，这里只负责把好消息讲出来。
struct LeagueResultView: View {
    let result: LeagueWeekResult
    let onDismiss: () -> Void

    @State private var showConfetti = false

    private var tierBefore: League.Tier { League.tier(result.tierBefore) }
    private var tierAfter: League.Tier { League.tier(result.tierAfter) }

    private var headline: String {
        if result.promoted { return "晋级啦！" }
        if result.demoted { return "别灰心！" }
        return "本周结算"
    }

    private var subline: String {
        if result.promoted { return "你升入了「\(tierAfter.name)」，继续冲！" }
        if result.demoted { return "来到了「\(tierAfter.name)」，本周再冲回去！" }
        return "你留在「\(tierAfter.name)」，稳住节奏！"
    }

    private var mascotMood: MascotMood {
        if result.promoted { return .proud }
        if result.demoted { return .think }
        return .happy
    }

    var body: some View {
        ZStack {
            DuoColors.bg.ignoresSafeArea()

            ConfettiView(active: showConfetti)
                .ignoresSafeArea()
                .allowsHitTesting(false)

            VStack(spacing: 18) {
                Spacer()

                MascotView(mood: mascotMood, size: 100, reactTo: result.promoted ? .levelup : .correct)

                Image(systemName: "trophy.fill")
                    .font(.system(size: 72, weight: .heavy))
                    .foregroundStyle(Color(hex: tierAfter.colorHex))
                    .shadow(color: Color(hex: tierAfter.colorHex).opacity(0.55), radius: 18)

                Text(headline)
                    .font(.system(size: 30, weight: .black))
                    .foregroundStyle(DuoColors.ink)

                Text("上周你在「\(tierBefore.name)」拿到第 \(result.rank) 名")
                    .duoFont(.body)
                    .foregroundStyle(DuoColors.inkMuted)

                // 段位变化：升 / 降时展示 旧 → 新。
                if result.tierBefore != result.tierAfter {
                    HStack(spacing: 10) {
                        Text(tierBefore.name)
                            .duoFont(.caption)
                            .foregroundStyle(DuoColors.inkMuted)
                        Image(systemName: result.promoted ? "arrow.up.right" : "arrow.down.right")
                            .font(.system(size: 14, weight: .black))
                            .foregroundStyle(result.promoted ? DuoColors.primary : DuoColors.fox)
                        Text(tierAfter.name)
                            .duoFont(.subhead)
                            .foregroundStyle(Color(hex: tierAfter.colorHex))
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 9)
                    .background(DuoColors.surface, in: .capsule)
                    .overlay { Capsule().strokeBorder(DuoColors.border, lineWidth: 2) }
                }

                if result.gems > 0 {
                    HStack(spacing: 6) {
                        Image(systemName: "diamond.fill")
                            .font(.system(size: 18, weight: .heavy))
                        Text("+\(result.gems)")
                            .font(.system(size: 24, weight: .black))
                            .monospacedDigit()
                    }
                    .foregroundStyle(DuoColors.beetle)
                    .padding(.horizontal, 18)
                    .padding(.vertical, 9)
                    .background(DuoColors.beetle.opacity(0.14), in: .capsule)
                    .accessibilityLabel("获得 \(result.gems) 宝石")
                }

                Text(subline)
                    .duoFont(.body)
                    .foregroundStyle(DuoColors.inkMuted)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)

                Spacer()

                Button("继续加油！") { onDismiss() }
                    .buttonStyle(ChunkyButtonStyle(.primary))
                    .padding(.horizontal, 24)
                    .padding(.bottom, 28)
                    .accessibilityIdentifier("league-result-continue")
            }
        }
        .onAppear {
            SFXEngine.shared.play(.complete)
            HapticEngine.shared.success()
            if result.promoted || result.rank <= 3 {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { showConfetti = true }
            }
        }
        .accessibilityIdentifier("league-result")
    }
}
