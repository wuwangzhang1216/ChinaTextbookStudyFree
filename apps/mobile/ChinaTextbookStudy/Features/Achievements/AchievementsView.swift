import SwiftUI

/// Achievement wall (Wave D, ios-retention-10) — tiered families with a claim
/// flow: each family shows its current badge tier + progress toward the next,
/// and an unlocked-but-unclaimed tier surfaces a bright「领取 +N💎」button.
struct AchievementsView: View {
    @ObservedObject var progressStore: ProgressStore

    private var snapshot: AchievementProgressSnapshot { progressStore.achievementSnapshot }
    /// Permanent ledger ∪ live snapshot — an earned badge never re-locks.
    private var unlockedIds: Set<String> { progressStore.unlockedAchievementIds }

    /// Family id → gems just claimed; drives the transient "+N 💎" flash.
    @State private var recentClaims: [String: Int] = [:]

    /// 成就领取时刻的分享卡（Wave E2）：领取后弹小卡片，可分享可关闭。
    @State private var shareMoment: ShareMoment?

    private struct ShareMoment: Identifiable {
        let id: String          // achievement id
        let name: String
        let image: UIImage
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Space.l) {
                summary
                ForEach(Achievements.families) { family in
                    familyCard(family)
                }
            }
            .learningContent()
        }
        .background(DuoColors.bg.ignoresSafeArea())
        .navigationTitle("成就墙")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(item: $shareMoment) { moment in
            shareMomentSheet(moment)
        }
    }

    /// 领取成就后的分享小卡：预览 + ShareLink + 关闭。
    private func shareMomentSheet(_ moment: ShareMoment) -> some View {
        ScrollView {
            VStack(spacing: 16) {
                Text("成就到手！晒一晒？").duoFont(.heading).foregroundStyle(DuoColors.ink)
                Image(uiImage: moment.image).resizable().scaledToFit().frame(maxHeight: 300)
                    .clipShape(RoundedRectangle(cornerRadius: Radius.card))
            }.learningContent()
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            LearningActionDock {
                VStack(spacing: 10) {
                    ShareCardLink(image: moment.image, filename: "成就-\(moment.name).png", previewTitle: "成就「\(moment.name)」", label: "分享成就卡")
                    Button("先不啦") { shareMoment = nil }.buttonStyle(ChunkyButtonStyle(.ghost))
                        .accessibilityIdentifier("achievement-share-dismiss")
                }
            }
        }
        .background(DuoColors.bg)
        .presentationDetents([.large]).presentationDragIndicator(.visible)
    }

    // MARK: - Summary

    private var summary: some View {
        let unlocked = unlockedIds.count
        let total = Achievements.all.count
        return HStack(spacing: 14) {
            ZStack {
                Circle().fill(DuoColors.bee.opacity(0.16)).frame(width: 56, height: 56)
                Image(systemName: "rosette").font(.system(size: 28, weight: .heavy)).foregroundStyle(DuoColors.bee)
            }
            VStack(alignment: .leading, spacing: 4) {
                Text("已解锁 \(unlocked) / \(total)").duoFont(.heading).foregroundStyle(DuoColors.ink)
                StyledProgressBar(progress: Double(unlocked) / Double(max(total, 1)), height: 10, trackColor: DuoColors.surfaceAlt)
            }
            Spacer()
        }
        .padding(16)
        .background(DuoColors.surface, in: .rect(cornerRadius: Radius.card))
        .overlay { RoundedRectangle(cornerRadius: Radius.card).strokeBorder(DuoColors.border, lineWidth: 2) }
    }

    // MARK: - Family card

    /// The lowest unlocked-but-unclaimed tier — claims flow bottom-up so the
    /// learner always collects in goal order.
    private func claimableTier(of family: Achievements.Family) -> Achievement? {
        let claimable = progressStore.claimableAchievementIds
        return family.tiers.first { claimable.contains($0.id) }
    }

    @ViewBuilder
    private func familyCard(_ family: Achievements.Family) -> some View {
        let highest = family.highestUnlocked(unlockedIds: unlockedIds)
        let next = family.nextTier(unlockedIds: unlockedIds)
        let claimable = claimableTier(of: family)
        // The badge shows the earned tier's look; before any unlock it
        // previews tier 1 in a dimmed state.
        let display = highest ?? family.tiers[0]
        let tint = Color(hex: UInt32(display.colorHex))
        let earned = highest != nil

        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 14) {
                ZStack {
                    Image(systemName: family.iconKey.symbolName)
                        .font(.system(size: 30, weight: .semibold))
                        .foregroundStyle(earned ? .white : tint.opacity(0.5))
                        .frame(width: 60, height: 60)
                        .background(earned ? tint : DuoColors.surfaceAlt, in: .circle)
                }
                .scaleEffect(recentClaims[family.id] != nil ? 1.12 : 1)
                .animation(Motion.bounce, value: recentClaims[family.id] != nil)

                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 8) {
                        Text(family.name).duoFont(.subhead).foregroundStyle(DuoColors.ink)
                        Spacer()
                        tierPips(family)
                    }
                    Text(earned ? display.name : display.description)
                        .duoFont(.caption)
                        .foregroundStyle(earned ? tint : DuoColors.inkMuted)

                    if let next {
                        let progress = next.progress(snapshot)
                        StyledProgressBar(
                            progress: min(1.0, Double(progress) / Double(max(next.goal, 1))),
                            height: 8,
                            fillColor: tint,
                            trackColor: DuoColors.surfaceAlt
                        )
                        Text("\(min(progress, next.goal)) / \(next.goal) · 下一级：\(next.description)")
                            .duoFont(.micro)
                            .foregroundStyle(DuoColors.inkMuted)
                            .lineLimit(2)
                    } else {
                        Text("全部达成，太棒啦 🎉")
                            .duoFont(.micro)
                            .foregroundStyle(DuoColors.primary)
                    }
                }
            }

            if let gems = recentClaims[family.id] {
                HStack(spacing: 6) {
                    Image(systemName: "diamond.fill").font(.system(size: 13, weight: .heavy))
                    Text("+\(gems) 已入账！").duoFont(.caption)
                }
                .foregroundStyle(DuoColors.beetle)
                .frame(maxWidth: .infinity, alignment: .center)
                .transition(.scale.combined(with: .opacity))
            } else if let claimable {
                Button {
                    claim(claimable, in: family)
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "diamond.fill").font(.system(size: 14, weight: .heavy))
                        Text("领取「\(claimable.name)」 +\(claimable.reward)")
                    }
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(ChunkyButtonStyle(.primary))
                .accessibilityIdentifier("ach-claim-\(claimable.id)")
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(DuoColors.surface, in: .rect(cornerRadius: Radius.card))
        .overlay {
            RoundedRectangle(cornerRadius: Radius.card)
                .strokeBorder(claimable != nil ? tint : DuoColors.border, lineWidth: 2)
        }
    }

    /// One pip per tier — filled in the family tint once that tier is earned.
    private func tierPips(_ family: Achievements.Family) -> some View {
        HStack(spacing: 4) {
            ForEach(family.tiers, id: \.id) { tier in
                let earned = unlockedIds.contains(tier.id)
                Image(systemName: earned ? "star.fill" : "star")
                    .font(.system(size: 11, weight: .heavy))
                    .foregroundStyle(earned ? Color(hex: UInt32(tier.colorHex)) : DuoColors.inkSofter.opacity(0.5))
            }
        }
    }

    // MARK: - Claiming

    private func claim(_ tier: Achievement, in family: Achievements.Family) {
        let gems = progressStore.claimAchievement(tier.id)
        guard gems > 0 else {
            HapticEngine.shared.wrong()
            return
        }
        HapticEngine.shared.success()
        SFXEngine.shared.play(.unlock)
        withAnimation(Motion.bounce) { recentClaims[family.id] = gems }
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.4) {
            withAnimation(.easeOut(duration: 0.25)) {
                _ = recentClaims.removeValue(forKey: family.id)
            }
        }
        // 成就领取时刻的分享卡（Wave E2）。
        if let image = ShareCard.renderBadge(ShareCard.BadgeData(
            icon: family.iconKey.symbolName,
            tint: Color(hex: UInt32(tier.colorHex)),
            headline: "成就解锁！",
            title: tier.name,
            subtitle: tier.description
        )) {
            shareMoment = ShareMoment(id: tier.id, name: tier.name, image: image)
        }
    }
}
