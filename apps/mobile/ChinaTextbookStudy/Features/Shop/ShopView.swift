import SwiftUI

/// The gem shop — functional power-ups plus the cosmetic collection.
struct ShopView: View {
    @ObservedObject var progressStore: ProgressStore
    @State private var flash: String?
    /// 未拥有的装扮点开先看大图确认（ios-economy-15）——不再一击误买。
    @State private var previewItem: CosmeticItem?
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.dynamicTypeSize) private var typeSize

    private let refillCost = Economy.heartRefillCost
    private let freezeCost = Economy.freezeCost

    var body: some View {
      ScrollViewReader { proxy in
        ScrollView {
            VStack(alignment: .leading, spacing: Space.xl) {
                LearningPageHeader(eyebrow: "聪聪的奖励小铺", title: "努力，值得一点奖励", subtitle: "用学习赚来的宝石，装扮属于你的学堂。", tint: DuoColors.beetle, mood: .proud)
                balanceHeader

                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(["红心 & 连胜", "聪聪皮肤", "界面主题", "课程背景"], id: \.self) { category in
                            Button {
                                withAnimation(reduceMotion ? nil : Motion.reveal) { proxy.scrollTo(category, anchor: .top) }
                            } label: {
                                Text(category).duoFont(.caption).foregroundStyle(DuoColors.ink)
                                    .padding(.horizontal, 14).frame(minHeight: 44)
                                    .background(DuoColors.surface, in: Capsule())
                                    .overlay { Capsule().strokeBorder(DuoColors.border, lineWidth: 2) }
                            }.buttonStyle(.plain)
                        }
                    }
                }

                if let flash {
                    Text(flash)
                        .duoFont(.caption)
                        .foregroundStyle(DuoColors.primary)
                        .padding(.horizontal, 12).padding(.vertical, 8)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(DuoColors.primary.opacity(0.14), in: .rect(cornerRadius: Radius.control))
                        .transition(.opacity)
                }

                powerUps.id("红心 & 连胜")
                cosmeticSection("聪聪皮肤", items: Cosmetics.mascotSkins)
                cosmeticSection("界面主题", items: Cosmetics.uiThemes.map(\.item))
                cosmeticSection("课程背景", items: Cosmetics.lessonBackdrops.map(\.item))
            }
            .learningContent()
        }
      }
        .background(DuoColors.canvas.ignoresSafeArea())
        .navigationTitle("商店")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(item: $previewItem) { item in
            CosmeticPreviewSheet(
                item: item,
                gems: progressStore.gems,
                preview: { AnyView(cosmeticPreview(item, large: true)) },
                onConfirm: { confirmPurchase(item) }
            )
            .presentationDetents([.large])
            .presentationDragIndicator(.visible)
        }
    }

    // MARK: - Balance

    private var balanceHeader: some View {
        HStack(spacing: 14) {
            balanceChip(icon: "diamond.fill", value: progressStore.gems, tint: DuoColors.secondary)
            balanceChip(icon: "heart.fill", value: progressStore.hearts, tint: DuoColors.danger)
            Spacer()
        }
    }

    private func balanceChip(icon: String, value: Int, tint: Color) -> some View {
        HStack(spacing: 6) {
            Image(systemName: icon).font(.system(size: 18, weight: .heavy)).foregroundStyle(tint)
            Text("\(value)").duoNumeral(.subhead).foregroundStyle(DuoColors.ink)
        }
        .padding(.horizontal, 14).padding(.vertical, 9)
        .background(tint.opacity(0.12), in: .capsule)
    }

    // MARK: - Power-ups

    private var powerUps: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionHeader("红心 & 连胜")

            functionalRow(
                icon: "heart.fill", tint: DuoColors.danger,
                title: "补满红心", subtitle: progressStore.hearts >= ProgressStore.maxHearts ? "红心已满" : "立即恢复 5 颗红心",
                cost: refillCost,
                enabled: progressStore.hearts < ProgressStore.maxHearts && progressStore.gems >= refillCost
            ) {
                if progressStore.buyHeartRefill(cost: refillCost) {
                    SFXEngine.shared.play(.purchase)
                    win("红心已补满！")
                } else { fail() }
            }

            functionalRow(
                icon: "snowflake", tint: DuoColors.secondary,
                title: "连胜护盾",
                subtitle: progressStore.streakFreezes >= Economy.maxFreezes
                    ? "护盾已满 \(Economy.maxFreezes)/\(Economy.maxFreezes)"
                    : "当前拥有 \(progressStore.streakFreezes)/\(Economy.maxFreezes) 个 · 断签时自动顶替",
                cost: freezeCost,
                enabled: progressStore.streakFreezes < Economy.maxFreezes && progressStore.gems >= freezeCost
            ) {
                if progressStore.buyStreakFreeze(cost: freezeCost) {
                    SFXEngine.shared.play(.purchase)
                    win("已购买连胜护盾！")
                } else { fail() }
            }
        }
    }

    private func functionalRow(icon: String, tint: Color, title: String, subtitle: String, cost: Int, enabled: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 12) {
                ZStack {
                    Circle().fill(tint.opacity(0.18)).frame(width: 46, height: 46)
                    Image(systemName: icon).font(.system(size: 22, weight: .heavy)).foregroundStyle(tint)
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).duoFont(.subhead).foregroundStyle(DuoColors.ink)
                    Text(subtitle).duoFont(.caption).foregroundStyle(DuoColors.inkMuted)
                }
                Spacer()
                costPill(cost, enabled: enabled)
            }
            .padding(14)
            .background(DuoColors.surface, in: .rect(cornerRadius: Radius.card))
            .overlay { RoundedRectangle(cornerRadius: Radius.card).strokeBorder(DuoColors.border, lineWidth: 2) }
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
    }

    private func costPill(_ cost: Int, enabled: Bool) -> some View {
        HStack(spacing: 4) {
            Image(systemName: "diamond.fill").font(.system(size: 12, weight: .heavy))
            Text("\(cost)").duoNumeral(.caption)
        }
        .foregroundStyle(enabled ? DuoColors.secondary : DuoColors.inkSofter)
        .padding(.horizontal, 10).padding(.vertical, 6)
        .background((enabled ? DuoColors.secondary : DuoColors.inkSofter).opacity(0.16), in: .capsule)
    }

    // MARK: - Cosmetics

    private func cosmeticSection(_ title: String, items: [CosmeticItem]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionHeader(title)
            LazyVGrid(columns: typeSize.isAccessibilitySize ? [GridItem(.flexible())] : [GridItem(.adaptive(minimum: 104), spacing: 12)], spacing: 12) {
                    ForEach(items) { item in
                        cosmeticTile(item)
                    }
            }
        }
        .id(title)
    }

    private func cosmeticTile(_ item: CosmeticItem) -> some View {
        let owned = progressStore.isOwned(item.id)
        let equipped = progressStore.isEquipped(item.id)
        let affordable = progressStore.gems >= item.cost
        return Button {
            tapCosmetic(item, owned: owned, equipped: equipped, affordable: affordable)
        } label: {
            VStack(spacing: 8) {
                ZStack {
                    RoundedRectangle(cornerRadius: Radius.card)
                        .fill(item.rarity.color.opacity(0.16))
                        .frame(width: 108, height: 92)
                    cosmeticPreview(item)
                }
                .frame(width: 108, height: 92)
                .overlay(alignment: .topTrailing) {
                    if equipped {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.system(size: 20))
                            .foregroundStyle(DuoColors.primary)
                            .padding(6)
                    } else if owned {
                        Image(systemName: "checkmark.seal.fill")
                            .font(.system(size: 18))
                            .foregroundStyle(item.rarity.color)
                            .padding(6)
                    }
                }

                Text(item.name).duoFont(.caption).foregroundStyle(DuoColors.ink).lineLimit(1)

                Group {
                    if equipped {
                        Text("使用中").duoFont(.micro).foregroundStyle(DuoColors.primary)
                    } else if owned {
                        Text("点击使用").duoFont(.micro).foregroundStyle(DuoColors.secondary)
                    } else {
                        HStack(spacing: 3) {
                            Image(systemName: "diamond.fill").font(.system(size: 10, weight: .heavy))
                            Text("\(item.cost)").duoNumeral(.micro)
                        }
                        .foregroundStyle(affordable ? DuoColors.secondary : DuoColors.inkSofter)
                    }
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 10)
            .background(DuoColors.surface, in: .rect(cornerRadius: Radius.card))
            .overlay {
                RoundedRectangle(cornerRadius: Radius.card)
                    .strokeBorder(equipped ? DuoColors.primary : DuoColors.border, lineWidth: equipped ? 2.5 : 2)
            }
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("cosmetic-\(item.id)")
        .accessibilityLabel("\(item.name)，\(equipped ? "使用中" : owned ? "已拥有，点击使用" : "\(item.cost) 宝石，点击预览")")
    }

    /// 已拥有 → 一击装备；未拥有 → 先弹预览确认 sheet（ios-economy-15）。
    private func tapCosmetic(_ item: CosmeticItem, owned: Bool, equipped: Bool, affordable: Bool) {
        if equipped { return }
        if owned {
            HapticEngine.shared.tap(); SFXEngine.shared.play(.tap)
            progressStore.equipCosmetic(item)
        } else {
            HapticEngine.shared.tap()
            previewItem = item
        }
    }

    /// 预览 sheet 里点了「确认购买」。
    private func confirmPurchase(_ item: CosmeticItem) {
        previewItem = nil
        guard progressStore.gems >= item.cost else {
            fail("宝石不够，继续学习赚取更多吧")
            return
        }
        if progressStore.buyCosmetic(item) {
            progressStore.equipCosmetic(item)
            HapticEngine.shared.success(); SFXEngine.shared.play(.purchase)
            win("已解锁「\(item.name)」！")
        } else { fail() }
    }

    // MARK: - Helpers

    private func sectionHeader(_ text: String) -> some View {
        LearningSectionTitle(title: text)
    }

    private func win(_ msg: String) {
        withAnimation(Motion.reveal) { flash = msg }
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) { withAnimation { flash = nil } }
    }
    private func fail(_ msg: String = "宝石不够") {
        HapticEngine.shared.wrong()
        withAnimation(Motion.reveal) { flash = msg }
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) { withAnimation { flash = nil } }
    }

    /// Live preview of what the item actually does — the mascot wearing the
    /// skin, the theme's own colors, the backdrop's own gradient.
    /// `large` = the confirm sheet's hero rendition of the same preview.
    @ViewBuilder
    private func cosmeticPreview(_ item: CosmeticItem, large: Bool = false) -> some View {
        let scale: CGFloat = large ? 2 : 1
        switch item.type {
        case .mascotSkin:
            MascotView(size: 78 * scale, skin: item.id)

        case .uiTheme:
            if let data = Cosmetics.uiThemes.first(where: { $0.item.id == item.id })?.data {
                ZStack {
                    RoundedRectangle(cornerRadius: 10 * scale).fill(data.bg)
                    VStack(spacing: 5 * scale) {
                        Capsule().fill(data.primary).frame(width: 46 * scale, height: 13 * scale)
                        HStack(spacing: 5 * scale) {
                            Circle().fill(data.accent).frame(width: 13 * scale, height: 13 * scale)
                            Capsule().fill(data.primary.opacity(0.35)).frame(width: 28 * scale, height: 8 * scale)
                        }
                    }
                }
                .frame(width: 74 * scale, height: 60 * scale)
                .overlay { RoundedRectangle(cornerRadius: 10 * scale).strokeBorder(.black.opacity(0.10), lineWidth: 1) }
            }

        case .lessonBackdrop:
            if let data = Cosmetics.lessonBackdrops.first(where: { $0.item.id == item.id })?.data {
                ZStack {
                    if data.stops.isEmpty {
                        RoundedRectangle(cornerRadius: 10 * scale).fill(data.bg)
                    } else {
                        RoundedRectangle(cornerRadius: 10 * scale)
                            .fill(LinearGradient(colors: data.stops, startPoint: .top, endPoint: .bottom))
                    }
                    Image(systemName: "text.alignleft")
                        .font(.system(size: 17 * scale, weight: .bold))
                        .foregroundStyle(data.needsOverlay ? .white.opacity(0.85) : DuoColors.eel.opacity(0.45))
                }
                .frame(width: 74 * scale, height: 60 * scale)
                .overlay { RoundedRectangle(cornerRadius: 10 * scale).strokeBorder(.black.opacity(0.10), lineWidth: 1) }
            }
        }
    }

}

// MARK: - 装扮预览确认 sheet（ios-economy-15）

/// 大图预览 + 价格 + 明确的「确认购买」——孩子不会再因为点了一下小格子
/// 就意外花掉宝石。
private struct CosmeticPreviewSheet: View {
    let item: CosmeticItem
    let gems: Int
    let preview: () -> AnyView
    let onConfirm: () -> Void
    @Environment(\.dismiss) private var dismiss

    private var affordable: Bool { gems >= item.cost }

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                Capsule()
                    .fill(Color.clear)
                    .frame(height: 4)
                    .padding(.top, 8)

                ZStack {
                    RoundedRectangle(cornerRadius: Radius.large)
                        .fill(item.rarity.color.opacity(0.14))
                    preview()
                        .padding(16)
                }
                .frame(maxWidth: 280, minHeight: 180)

                VStack(spacing: 6) {
                    Text(item.name)
                        .duoFont(.heading)
                        .foregroundStyle(DuoColors.ink)
                    HStack(spacing: 5) {
                        Image(systemName: "diamond.fill").font(.system(size: 15, weight: .heavy))
                        Text("\(item.cost)").duoNumeral(.subhead)
                    }
                    .foregroundStyle(affordable ? DuoColors.secondary : DuoColors.inkMuted)
                    if !affordable {
                        Text("宝石不够，继续学习赚取更多吧")
                            .duoFont(.caption)
                            .foregroundStyle(DuoColors.inkMuted)
                    }
                }

            }.learningContent()
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            LearningActionDock {
                VStack(spacing: 10) {
                    Button {
                        onConfirm()
                    } label: {
                        HStack(spacing: 6) {
                            Image(systemName: "diamond.fill").font(.system(size: 14, weight: .heavy))
                            Text("确认购买  \(item.cost)")
                        }
                    }
                    .buttonStyle(ChunkyButtonStyle(affordable ? .primary : .disabled))
                    .disabled(!affordable)
                    .accessibilityIdentifier("cosmetic-confirm-buy")

                    Button("再想想") { dismiss() }
                        .buttonStyle(ChunkyButtonStyle(.ghost))
                        .accessibilityIdentifier("cosmetic-cancel-buy")
                }
            }
        }
        .background(DuoColors.bg.ignoresSafeArea())
    }
}
