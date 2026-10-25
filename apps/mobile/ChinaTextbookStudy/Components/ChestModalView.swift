import SwiftUI
import UIKit

/// Chest open animation modal — ported from `ChestModal.tsx`, rebuilt in
/// Wave F (ios-feel-8 / ios-lesson-19)：
/// - 自绘两段式宝箱（箱盖 + 箱身），开箱时盖子沿铰链向后上翻
/// - 卡片底改用 `DuoColors.surface`（替代 .ultraThinMaterial）
/// - 开箱瞬间宝石粒子迸发
/// - 按稀有度分层演出：common 标准 / rare 蓝光 +「稀有！」/
///   epic 紫金光圈 + 更长礼花 + 重触感
/// - 播 `.chestOpen`（上行琶音 + shimmer，替代旧 unlock）
/// - Reduce Motion：不呼吸、不迸发、盖子直接打开
struct ChestModalView: View {
    let onClaim: (Int) -> Void  // Called with gem amount
    var onDismiss: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    @State private var opened = false
    @State private var gemAmount = 0
    @State private var tier: ChestRewardTier = .common
    @State private var showResult = false
    @State private var breatheY: CGFloat = 0
    @State private var glowScale: CGFloat = 1.0
    @State private var burstFired = false
    @State private var confettiActive = false

    var body: some View {
        ZStack {
            LearningDialog(preferredHeight: 420, onDismiss: { if showResult { onDismiss() } }) {
            VStack(spacing: 20) {
                // 宝箱始终是同一个视图，openAmount 从 0 → 1 时盖子真的翻开。
                ZStack {
                    if !opened {
                        Circle()
                            .fill(DuoColors.bee.opacity(0.25))
                            .frame(width: 130, height: 130)
                            .scaleEffect(glowScale)
                    } else {
                        tierAura
                    }

                    ChestFigure(openAmount: opened ? 1 : 0)
                        .offset(y: opened ? 0 : breatheY)

                    if burstFired {
                        GemBurstView(
                            count: tier == .epic ? 18 : tier == .rare ? 13 : 9,
                            color: tier == .epic ? DuoColors.beetle : DuoColors.sea
                        )
                    }
                }
                .frame(width: 150, height: 130)
                .contentShape(Rectangle())
                .onTapGesture { openChest() }
                .onAppear {
                    guard !reduceMotion else { return }
                    withAnimation(.easeInOut(duration: 1.5).repeatForever(autoreverses: true)) {
                        breatheY = -4
                        glowScale = 1.25
                    }
                }

                if !opened {
                    Text("点击打开宝箱！")
                        .duoFont(.heading)
                        .foregroundStyle(DuoColors.ink)

                } else {
                    if showResult {
                        VStack(spacing: 8) {
                            if let badge = tierBadgeText {
                                Text(badge)
                                    .duoFont(.subhead)
                                    .foregroundStyle(tierColor)
                                    .padding(.horizontal, 14)
                                    .padding(.vertical, 5)
                                    .background(tierColor.opacity(0.14), in: .capsule)
                                    .transition(.scale.combined(with: .opacity))
                            }

                            HStack(spacing: 8) {
                                Image(systemName: "diamond.fill")
                                    .font(.system(size: 30))
                                    .foregroundStyle(DuoColors.beetle)
                                Text("+\(gemAmount) 宝石")
                                    .duoNumeral(.title)
                                    .foregroundStyle(DuoColors.beetle)
                            }
                        }
                    }
                }
            }
            } actions: {
                if !opened {
                    Button("打开") { openChest() }.buttonStyle(ChunkyButtonStyle(.primary)).accessibilityIdentifier("chest-open")
                } else if showResult {
                    Button("收下", action: onDismiss).buttonStyle(ChunkyButtonStyle(.primary)).accessibilityIdentifier("chest-claim")
                } else {
                    ProgressView().frame(height: 54).tint(DuoColors.primary)
                }
            }
            if confettiActive {
                ConfettiView(active: true, burstDuration: 0.9).ignoresSafeArea().allowsHitTesting(false)
            }
        }
    }

    // MARK: - Tier presentation

    private var tierColor: Color {
        switch tier {
        case .common: return DuoColors.bee
        case .rare:   return DuoColors.macaw
        case .epic:   return DuoColors.beetle
        }
    }

    private var tierBadgeText: String? {
        switch tier {
        case .common: return nil
        case .rare:   return "稀有！"
        case .epic:   return "史诗！"
        }
    }

    /// 开箱后的分层光圈：common 金色微光 / rare 蓝光 / epic 紫金双环。
    @ViewBuilder
    private var tierAura: some View {
        switch tier {
        case .common:
            Circle()
                .fill(DuoColors.bee.opacity(0.22))
                .frame(width: 130, height: 130)
        case .rare:
            Circle()
                .fill(DuoColors.macaw.opacity(0.28))
                .frame(width: 140, height: 140)
                .shadow(color: DuoColors.macaw.opacity(0.5), radius: 16)
        case .epic:
            ZStack {
                Circle()
                    .fill(DuoColors.beetle.opacity(0.30))
                    .frame(width: 150, height: 150)
                    .shadow(color: DuoColors.beetle.opacity(0.6), radius: 20)
                Circle()
                    .strokeBorder(DuoColors.bee.opacity(0.85), lineWidth: 3)
                    .frame(width: 132, height: 132)
            }
        }
    }

    // MARK: - Open

    private func openChest() {
        guard !opened else { return }
        let reward = Chest.rollReward()
        gemAmount = reward.gems
        tier = reward.tier

        SFXEngine.shared.play(.chestOpen)
        HapticEngine.shared.success()
        if reward.tier == .epic {
            // 史诗级：加一记重触感，身体也知道「这次不一样」。
            UIImpactFeedbackGenerator(style: .heavy).impactOccurred()
        }

        if reduceMotion {
            opened = true
            showResult = true
            onClaim(gemAmount)
            return
        }

        withAnimation(.spring(response: 0.4, dampingFraction: 0.6)) {
            opened = true
        }
        // 盖子翻开的瞬间宝石迸发。
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
            burstFired = true
            if tier == .epic { confettiActive = true }
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
            onClaim(gemAmount)
            withAnimation(.spring(response: 0.35, dampingFraction: 0.6)) {
                showResult = true
            }
        }
    }
}

// MARK: - Self-drawn chest (lid + body)

/// 两段式宝箱：`openAmount` 0 = 合上，1 = 盖子向后上翻约 115°。
private struct ChestFigure: View {
    /// 0...1
    var openAmount: Double

    private let bodyGold = Color(hex: 0xE0A800)
    private let bodyGoldDark = Color(hex: 0xB8860B)
    private let lidGold = Color(hex: 0xFFC800)
    private let strap = Color(hex: 0x8B5A2B)

    var body: some View {
        ZStack(alignment: .top) {
            // 箱身（底座不动）
            VStack(spacing: 0) {
                Spacer().frame(height: 30)
                ZStack {
                    UnevenRoundedRectangle(
                        topLeadingRadius: 4, bottomLeadingRadius: 12,
                        bottomTrailingRadius: 12, topTrailingRadius: 4
                    )
                    .fill(
                        LinearGradient(
                            colors: [bodyGold, bodyGoldDark],
                            startPoint: .top, endPoint: .bottom
                        )
                    )
                    .frame(width: 96, height: 56)

                    // 竖向皮带
                    HStack(spacing: 52) {
                        Rectangle().fill(strap).frame(width: 8, height: 56)
                        Rectangle().fill(strap).frame(width: 8, height: 56)
                    }

                    // 锁扣
                    RoundedRectangle(cornerRadius: 4)
                        .fill(Color(hex: 0xFFDE00))
                        .frame(width: 18, height: 20)
                        .overlay {
                            Circle()
                                .fill(strap)
                                .frame(width: 6, height: 6)
                                .offset(y: 2)
                        }
                        .offset(y: -18)
                }
            }

            // 开箱时露出的「内里光」
            if openAmount > 0.5 {
                Ellipse()
                    .fill(Color(hex: 0xFFF3B0))
                    .frame(width: 84, height: 16)
                    .offset(y: 24)
                    .transition(.opacity)
            }

            // 箱盖（沿下缘铰链向后上翻）
            UnevenRoundedRectangle(
                topLeadingRadius: 16, bottomLeadingRadius: 4,
                bottomTrailingRadius: 4, topTrailingRadius: 16
            )
            .fill(
                LinearGradient(
                    colors: [lidGold, bodyGold],
                    startPoint: .top, endPoint: .bottom
                )
            )
            .frame(width: 102, height: 32)
            .overlay {
                HStack(spacing: 52) {
                    Rectangle().fill(strap).frame(width: 8, height: 32)
                    Rectangle().fill(strap).frame(width: 8, height: 32)
                }
            }
            .rotation3DEffect(
                .degrees(-115 * openAmount),
                axis: (x: 1, y: 0, z: 0),
                anchor: .bottom,
                perspective: 0.45
            )
        }
        .frame(width: 110, height: 90, alignment: .top)
        .accessibilityHidden(true)
    }
}

// MARK: - Gem particle burst

/// 开箱瞬间从箱口迸出的宝石粒子（复用 Confetti 的「一次性向外飞散」思路，
/// 但用 SwiftUI 实现，粒子是 diamond.fill）。
private struct GemBurstView: View {
    let count: Int
    var color: Color = DuoColors.sea

    var body: some View {
        ZStack {
            ForEach(0..<count, id: \.self) { i in
                GemParticle(
                    angle: Double(i) / Double(max(count, 1)) * 2 * .pi + Double.random(in: -0.2...0.2),
                    distance: CGFloat.random(in: 46...86),
                    size: CGFloat.random(in: 8...15),
                    delay: Double.random(in: 0...0.08),
                    color: Bool.random() ? color : DuoColors.bee
                )
            }
        }
        .allowsHitTesting(false)
    }
}

private struct GemParticle: View {
    let angle: Double
    let distance: CGFloat
    let size: CGFloat
    let delay: Double
    let color: Color

    @State private var flown = false

    var body: some View {
        Image(systemName: "diamond.fill")
            .font(.system(size: size))
            .foregroundStyle(color)
            .opacity(flown ? 0 : 1)
            .rotationEffect(.degrees(flown ? Double.random(in: 90...240) : 0))
            .offset(
                x: flown ? cos(angle) * distance : 0,
                // 起点在箱口略偏上，向外抛时整体带一点向上的冲劲。
                y: flown ? sin(angle) * distance * 0.8 - 22 : -6
            )
            .onAppear {
                withAnimation(.easeOut(duration: 0.7).delay(delay)) {
                    flown = true
                }
            }
    }
}
