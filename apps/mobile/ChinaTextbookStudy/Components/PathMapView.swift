import SwiftUI

/// Duolingo-style lesson path.
///
/// - Column-centered zig-zag with gentle offsets
/// - Lesson glyphs cycle star/video with a trophy closing each unit; chest
///   nodes are REAL reward slots (every 5th lesson, see `Chest.slots`) that
///   the caller claims via `onTap`
/// - Current node bobs gently, wears a real unit-progress ring + "开始" pill
/// - Tapping a lesson opens an anchored start popup (title · lesson n/m · +XP)
/// - Tapping a locked node shakes it and shows a hint
struct PathMapView: View {
    let lessons: [PathMapNode]
    let onTap: (PathMapNode) -> Void
    /// 单元 banner 的指南按钮（Wave E2）：打开该单元的知识手册。
    var onGuideTap: ((Int) -> Void)? = nil
    /// 锁定单元 banner 的「⚡ 跳到这里」（Wave E2）：发起跳级测试。
    var onJumpTap: ((Int) -> Void)? = nil
    var introduction: AnyView? = nil

    private static let offsets: [CGFloat] = [0, 35, 45, 35, 0, -35, -45, -35]
    private let nodeSize: CGFloat = 72
    private let stepY: CGFloat = 96
    private let bannerHeight: CGFloat = 72
    @State private var stageWidth: CGFloat = 340

    // MARK: - 单元主题色循环（Wave F ios-path-6）
    //
    // 6 色循环，banner / 当前节点 / 进度环 / 开始气泡同步换装。
    // hex 对照（web 侧同色表）：
    //   1 绿  top 0x58CC02  ledge 0x46A302
    //   2 蓝  top 0x1CB0F6  ledge 0x1899D6
    //   3 紫  top 0xCE82FF  ledge 0xA560E8
    //   4 橙  top 0xFF9600  ledge 0xE08600
    //   5 青  top 0x00CD9C  ledge 0x00B589
    //   6 粉  top 0xEE5DA9  ledge 0xC94A8C
    static let unitPalette: [(top: Color, ledge: Color)] = [
        (Color(hex: 0x58CC02), Color(hex: 0x46A302)),
        (Color(hex: 0x1CB0F6), Color(hex: 0x1899D6)),
        (Color(hex: 0xCE82FF), Color(hex: 0xA560E8)),
        (Color(hex: 0xFF9600), Color(hex: 0xE08600)),
        (Color(hex: 0x00CD9C), Color(hex: 0x00B589)),
        (Color(hex: 0xEE5DA9), Color(hex: 0xC94A8C)),
    ]

    /// 单元 → 主题色（1 号单元从绿色开始，往后 6 色循环）。
    private func unitColors(_ unitNumber: Int) -> (top: Color, ledge: Color) {
        let count = Self.unitPalette.count
        let index = ((unitNumber - 1) % count + count) % count
        return Self.unitPalette[index]
    }

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    @State private var selectedIndex: Int?
    @State private var lockedShake = 0
    @State private var lockedIndex: Int?
    @State private var showLockedToast = false
    /// 锁定提示文案 —— 挑战节点与普通节点的解锁条件不同。
    @State private var lockedToastText = "先完成前面的课程再解锁哦"
    /// 结算返回时，刚从 current 变 completed 的节点做完成庆祝（金色 bounce + 星粒）。
    @State private var celebrationId: String?
    /// 「回到当前」浮动胶囊：当前节点在视口中的 y（视口坐标系；nil = 未知）。
    @State private var currentNodeViewportY: CGFloat?
    /// 视口高度（由外层 GeometryReader 提供）。
    @State private var viewportHeight: CGFloat = 0
    /// 内容滚动偏移（内容顶端到视口顶端的距离，>0 表示已向下滚动）。
    @State private var scrollOffset: CGFloat = 0

    var body: some View {
        GeometryReader { outer in
            ScrollViewReader { proxy in
                ScrollView {
                  VStack(spacing: 16) {
                    if let introduction { introduction }
                    ZStack(alignment: .top) {
                        trail
                        decorations

                        ForEach(unitBannerPositions, id: \.unitNumber) { banner in
                            unitBannerView(banner)
                                .position(x: stageWidth / 2, y: banner.y)
                        }

                        ForEach(Array(lessons.enumerated()), id: \.element.id) { index, node in
                            nodeView(node: node, index: index)
                                .id(node.id)
                                .position(nodePosition(at: index))
                        }

                        // Dismiss layer + anchored start popup
                        if selectedIndex != nil {
                            Color.black.opacity(0.001)
                                .frame(width: stageWidth, height: totalHeight)
                                .contentShape(Rectangle())
                                .onTapGesture { withAnimation(Motion.press) { selectedIndex = nil } }

                        }
                    }
                    .frame(width: stageWidth, height: totalHeight)
                    .frame(maxWidth: .infinity)
                    // 汇报内容顶端在视口坐标系里的位置（驱动 sticky 头 + 回到当前）。
                    .background {
                        GeometryReader { g in
                            Color.clear.preference(
                                key: PathContentTopKey.self,
                                value: g.frame(in: .named("pathViewport")).minY
                            )
                        }
                    }
                    .padding(.vertical, 20)
                  }
                  .padding(.top, 16)
                }
                .coordinateSpace(name: "pathViewport")
                .background(DuoColors.bg.ignoresSafeArea())
                // A native bottom preview keeps the action visible on small
                // phones and with enlarged text. Position-based popovers can
                // land below the viewport when the learner taps a low node.
                .safeAreaInset(edge: .bottom, spacing: 0) {
                    if let selectedIndex, lessons.indices.contains(selectedIndex) {
                        startPopup(index: selectedIndex)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 12)
                            .frame(maxWidth: .infinity)
                            .background(DuoColors.bg)
                            .overlay(alignment: .top) { Divider() }
                            .transition(.move(edge: .bottom).combined(with: .opacity))
                    }
                }
                .overlay(alignment: .bottom) { lockedToast }
                // 滚动跟随的 sticky 当前单元头（Wave F ios-path-9）。
                .overlay(alignment: .top) { stickyUnitHeader }
                // 「回到当前」浮动胶囊（Wave F ios-path-11）。
                .overlay(alignment: .bottomTrailing) {
                    backToCurrentButton(proxy: proxy)
                        .padding(.trailing, 16)
                        .padding(.bottom, 88)
                }
                .onPreferenceChange(PathContentTopKey.self) { top in
                    scrollOffset = -top
                    updateCurrentNodeViewportY(contentTop: top)
                }
                .onAppear {
                    stageWidth = min(440, max(240, outer.size.width - 32))
                    viewportHeight = outer.size.height
                    scrollToCurrent(proxy, animated: false)
                }
                .onChange(of: outer.size.height) { _, h in viewportHeight = h }
                .onChange(of: outer.size.width) { _, width in stageWidth = min(440, max(240, width - 32)) }
                // Follow the learner's progress, but only when the current node
                // actually moves — a chest claim also mutates `lessons`, and
                // yanking the viewport away from the chest would be jarring.
                // 挑战节点解锁不抢占自动滚动的锚点（下一节普通课才是主线）。
                //
                // Wave F (ios-path-7)：结算返回时，先给刚完成的节点放一段
                // 「current → completed」金色庆祝，再滚到新的当前节点。
                .onChange(of: currentMainlineId) { oldId, _ in
                    let justCompleted = oldId.flatMap { id in
                        lessons.first { $0.id == id && $0.status == .completed }
                    }
                    if let done = justCompleted, !reduceMotion {
                        celebrationId = done.id
                        DispatchQueue.main.asyncAfter(deadline: .now() + 1.15) {
                            celebrationId = nil
                            scrollToCurrent(proxy, animated: true)
                        }
                    } else {
                        scrollToCurrent(proxy, animated: true)
                    }
                }
            }
        }
    }

    /// 主线（非挑战）当前节点 id。
    private var currentMainlineId: String? {
        lessons.first(where: { $0.status == .current && $0.kind != .exam })?.id
    }

    /// 由内容顶端位置推算当前节点在视口中的 y。
    private func updateCurrentNodeViewportY(contentTop: CGFloat) {
        guard let id = currentMainlineId,
              let idx = lessons.firstIndex(where: { $0.id == id }) else {
            currentNodeViewportY = nil
            return
        }
        // 内容坐标 → 视口坐标（preference 直接量的是 ZStack 顶端，含 padding）。
        currentNodeViewportY = nodePosition(at: idx).y + contentTop
    }

    private func scrollToCurrent(_ proxy: ScrollViewProxy, animated: Bool) {
        guard let current = lessons.first(where: { $0.status == .current && $0.kind != .exam }),
              let idx = lessons.firstIndex(where: { $0.id == current.id }), idx > 1 else { return }
        let scroll = { proxy.scrollTo(current.id, anchor: .center) }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
            if animated { withAnimation(.easeOut(duration: 0.4)) { scroll() } } else { scroll() }
        }
    }

    // MARK: - Start popup

    @ViewBuilder
    private func startPopup(index: Int) -> some View {
        let node = lessons[index]
        let isExam = node.kind == .exam
        let unitNodes = lessons.filter { $0.kind == .lesson && $0.unitNumber == node.unitNumber }
        let lessonNo = (unitNodes.firstIndex(where: { $0.id == node.id }) ?? 0) + 1
        let accent: Color = isExam
            ? DuoColors.beetle
            : (node.status == .completed ? DuoColors.bee : unitColors(node.unitNumber).top)
        let subtitle: String = isExam
            ? "\(node.questionCount) 道题 · ⚔️ 挑战双倍 XP · 最多 +\(maxXp(for: node)) XP"
            : "第 \(lessonNo) / \(unitNodes.count) 节" +
              (node.questionCount > 0 ? " · 最多 +\(maxXp(for: node)) XP" : "")

        VStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 12) {
              HStack(alignment: .top, spacing: 10) {
                Text(isExam ? "⚔️ \(node.title)" : node.title)
                    .duoFont(.subhead)
                    .foregroundStyle(DuoColors.readableInk(on: accent))
                    .multilineTextAlignment(.leading)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Button { withAnimation(Motion.press) { selectedIndex = nil } } label: {
                    Image(systemName: "xmark").font(.system(size: 14, weight: .heavy))
                        .foregroundStyle(DuoColors.readableInk(on: accent))
                        .frame(width: 44, height: 44)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("关闭课程预览")
              }
                Text(subtitle)
                    .duoFont(.caption)
                    .foregroundStyle(DuoColors.readableInk(on: accent))
                if isExam, node.status != .completed {
                    Text("答对 80% 以上就能征服这个单元，赢得金色奖杯！")
                        .duoFont(.micro)
                        .foregroundStyle(DuoColors.readableInk(on: accent))
                }
                Button {
                    selectedIndex = nil
                    onTap(node)
                } label: {
                    Text(isExam
                         ? (node.status == .completed ? "再战一次" : "开始挑战")
                         : (node.status == .completed ? "再练一次" : "开始"))
                        .duoFont(.button)
                        .foregroundStyle(DuoColors.brandInk)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 13)
                        .background(.white, in: .capsule)
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier(isExam ? "exam-start" : "lesson-start")
            }
            .padding(16)
            .frame(maxWidth: LearningLayout.contentWidth - 72)
            .background(accent, in: .rect(cornerRadius: Radius.large))
        }
    }

    /// Honest XP ceiling for the start bubble: full marks + perfect bonus,
    /// plus the first-3-star bonus while it's still winnable, weekend-aware.
    /// 挑战节点按 ×2 口径展示（与结算一致）。
    private func maxXp(for node: PathMapNode) -> Int {
        Economy.xpForLesson(
            correctCount: node.questionCount,
            perfect: true,
            firstPerfect: node.stars < 3,
            isWeekend: Economy.isWeekend(),
            isExam: node.kind == .exam
        )
    }

    // MARK: - Layout calculations

    private func bannerOffsetBefore(index: Int) -> CGFloat {
        guard index > 0 else { return 0 }
        var offset: CGFloat = 0
        for i in 1..<min(index + 1, lessons.count) {
            if lessons[i].unitNumber != lessons[i - 1].unitNumber {
                offset += bannerHeight + 24
            }
        }
        return offset
    }

    private func nodePosition(at index: Int) -> CGPoint {
        let xOffset = Self.offsets[index % Self.offsets.count]
        let extraY = bannerOffsetBefore(index: index)
        return CGPoint(
            x: stageWidth / 2 + xOffset,
            y: nodeSize / 2 + CGFloat(index) * stepY + extraY + bannerHeight + 24
        )
    }

    private var totalHeight: CGFloat {
        guard let last = lessons.indices.last else { return nodeSize }
        return nodePosition(at: last).y + nodeSize / 2 + 160
    }

    // MARK: - Unit banner

    private struct BannerPosition: Hashable {
        let unitNumber: Int
        let unitTitle: String
        let y: CGFloat
        var unitLabel: String? = nil
        var displayLabel: String { unitLabel ?? "第 \(unitNumber) 单元" }
    }

    private var unitBannerPositions: [BannerPosition] {
        var result: [BannerPosition] = []
        if let first = lessons.first {
            result.append(BannerPosition(unitNumber: first.unitNumber, unitTitle: first.unitTitle, y: bannerHeight / 2 + 4, unitLabel: first.unitLabel))
        }
        for i in 1..<max(1, lessons.count) {
            if lessons[i].unitNumber != lessons[i - 1].unitNumber {
                let prevPos = nodePosition(at: i - 1)
                let nextPos = nodePosition(at: i)
                result.append(BannerPosition(unitNumber: lessons[i].unitNumber, unitTitle: lessons[i].unitTitle, y: (prevPos.y + nextPos.y) / 2, unitLabel: lessons[i].unitLabel))
            }
        }
        return result
    }

    /// 该单元是否整体锁定（所有普通课都还没解锁）—— 跳级入口只挂在这种
    /// banner 上；含当前节点的单元不满足。
    private func isUnitLocked(_ unitNumber: Int) -> Bool {
        let unitLessons = lessons.filter { $0.kind == .lesson && $0.unitNumber == unitNumber }
        guard !unitLessons.isEmpty else { return false }
        return unitLessons.allSatisfy { $0.status == .locked }
    }

    @ViewBuilder
    private func unitBannerView(_ banner: BannerPosition) -> some View {
        let showJump = onJumpTap != nil && isUnitLocked(banner.unitNumber)
        let colors = unitColors(banner.unitNumber)

        ZStack {
            RoundedRectangle(cornerRadius: Radius.card)
                .fill(colors.ledge)
                .frame(width: stageWidth - 16, height: bannerHeight)
                .offset(y: 4)

            HStack(spacing: 0) {
                VStack(alignment: .leading, spacing: showJump ? 6 : 4) {
                    if showJump {
                        // 锁定单元：标题压成一行，给「跳到这里」腾出空间。
                        Text("\(banner.displayLabel) · \(banner.unitTitle)")
                            .duoFont(.caption)
                            .foregroundStyle(.white.opacity(0.9))
                            .lineLimit(1)
                            .minimumScaleFactor(0.7)
                        Button {
                            HapticEngine.shared.tap()
                            SFXEngine.shared.play(.tap)
                            onJumpTap?(banner.unitNumber)
                        } label: {
                            HStack(spacing: 5) {
                                Text("⚡").font(.system(size: 12))
                                Text("跳到这里")
                                    .duoFont(.caption)
                            }
                            .foregroundStyle(colors.top)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 5)
                            .background(.white, in: .capsule)
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("jump-here-u\(banner.unitNumber)")
                        .accessibilityLabel("跳级测试，跳到\(banner.displayLabel)")
                    } else {
                        Text("\(banner.displayLabel)")
                            .duoFont(.micro)
                            .tracking(1.2)
                            .foregroundStyle(.white.opacity(0.85))
                        Text(banner.unitTitle)
                            .duoFont(.subhead)
                            .foregroundStyle(.white)
                            .lineLimit(1)
                            .minimumScaleFactor(0.7)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 18)

                Rectangle().fill(.white.opacity(0.25)).frame(width: 1).padding(.vertical, 14)

                // 单元知识手册入口（ios-path-5 收尾）：从假图标变成真按钮。
                Button {
                    HapticEngine.shared.tap()
                    SFXEngine.shared.play(.tap)
                    onGuideTap?(banner.unitNumber)
                } label: {
                    Image(systemName: "list.bullet.rectangle.portrait.fill")
                        .font(.system(size: 22, weight: .bold))
                        .foregroundStyle(.white)
                        .frame(width: 64, height: bannerHeight)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .disabled(onGuideTap == nil)
                .accessibilityIdentifier("unit-guide-u\(banner.unitNumber)")
                .accessibilityLabel("\(banner.displayLabel)知识手册")
            }
            .frame(width: stageWidth - 16, height: bannerHeight)
            .background(colors.top, in: .rect(cornerRadius: Radius.card))
        }
    }

    // MARK: - Node rendering

    enum NodeKind { case star, video, chest, trophy, exam }

    private func nodeKind(at index: Int, node: PathMapNode) -> NodeKind {
        if node.kind == .chest { return .chest }
        if node.kind == .exam { return .exam }
        let hasLaterLessonInUnit = lessons[(index + 1)...].contains {
            $0.kind == .lesson && $0.unitNumber == node.unitNumber
        }
        if !hasLaterLessonInUnit { return .trophy }
        return index % 4 == 2 ? .video : .star
    }

    /// Whether the learner has zero progress in this book — the current (first)
    /// node then wears a pulsing halo as an onboarding "start here" guide.
    private var isFreshBook: Bool {
        !lessons.contains { $0.status == .completed }
    }

    /// Fraction of the node's unit already completed (drives the current ring).
    private func unitProgress(for node: PathMapNode) -> Double {
        let unitNodes = lessons.filter { $0.kind == .lesson && $0.unitNumber == node.unitNumber }
        guard !unitNodes.isEmpty else { return 0 }
        let done = unitNodes.filter { $0.status == .completed }.count
        return Double(done) / Double(unitNodes.count)
    }

    @ViewBuilder
    private func nodeView(node: PathMapNode, index: Int) -> some View {
        let kind = nodeKind(at: index, node: node)
        let isCurrent = node.status == .current

        Button {
            if node.status == .locked {
                lockedIndex = index
                HapticEngine.shared.wrong()
                withAnimation(.linear(duration: 0.4)) { lockedShake += 1 }
                // 挑战节点的解锁条件是「本单元全通」，提示要说清楚。
                lockedToastText = node.kind == .exam
                    ? "完成本单元全部课程，就能开启单元挑战啦"
                    : "先完成前面的课程再解锁哦"
                showLockedHint()
            } else if node.kind == .chest {
                // Unlocked chest: claim directly (no start popup). Already-
                // opened chests just acknowledge the tap.
                HapticEngine.shared.tap()
                if !node.chestClaimed {
                    SFXEngine.shared.play(.tap)
                    onTap(node)
                }
            } else {
                HapticEngine.shared.tap(); SFXEngine.shared.play(.tap)
                withAnimation(Motion.bounce) {
                    selectedIndex = (selectedIndex == index) ? nil : index
                }
            }
        } label: {
            VStack(spacing: 6) {
                ZStack {
                    // 新手引导（onboarding 收尾）：全书零进度时给第一个节点一圈
                    // 脉冲光环，指着「从这里开始」。挑战节点不参与主线引导。
                    // Reduce Motion 下换成静态光环。
                    if isCurrent && isFreshBook && node.kind != .exam {
                        PulseHalo(size: nodeSize, animated: !reduceMotion)
                    }
                    if isCurrent && node.kind != .exam {
                        progressRing(
                            progress: unitProgress(for: node),
                            tint: unitColors(node.unitNumber).top
                        )
                    }

                    // 3D 底座 —— 按压时底座不动，顶面下沉（ios-path-12）。
                    Circle()
                        .fill(nodeLedgeColor(for: node))
                        .frame(width: nodeSize, height: nodeSize)
                        .offset(y: 5)

                    NodePressSink {
                        ZStack {
                            Circle()
                                .fill(nodeTopColor(for: node))
                                .frame(width: nodeSize, height: nodeSize)

                            nodeIcon(node: node, kind: kind)
                        }
                    }

                    // 结算返回的完成庆祝：金色光晕 + 星粒迸发（ios-path-7）。
                    if celebrationId == node.id {
                        NodeCompletionBurst(size: nodeSize)
                    }
                }
                if isCurrent {
                    if node.kind == .exam { examPill } else { startPill(for: node) }
                }
            }
            .modifier(ShakeEffect(animatableData: CGFloat(lockedIndex == index ? lockedShake : 0)))
            .modifier(IdleBob(active: isCurrent && !reduceMotion))
            .modifier(CelebrationPop(active: celebrationId == node.id))
        }
        .buttonStyle(PathNodeButtonStyle())
        .accessibilityIdentifier(
            node.kind == .chest ? "chest-node-\(node.id)"
            : node.kind == .exam ? "exam-node-\(node.id)"
            : "lesson-row-\(node.id)")
        .accessibilityLabel(node.kind == .chest
            ? "宝箱, \(node.status == .locked ? "未解锁" : node.chestClaimed ? "已领取" : "可领取")"
            : node.kind == .exam
            ? "\(node.title), \(node.status == .locked ? "未解锁" : node.conquered ? "已征服" : node.status == .completed ? "已完成" : "可挑战")"
            : "\(node.title), \(node.status == .completed ? "已完成" : node.status == .current ? "当前" : "未解锁")")
    }

    /// 节点顶面颜色（挑战节点走紫金配色，征服后金色态；
    /// 当前节点跟随单元主题色循环）。
    private func nodeTopColor(for node: PathMapNode) -> Color {
        if node.kind == .chest && node.chestClaimed { return DuoColors.lockedNodeTop }
        if node.kind == .exam {
            if node.status == .locked { return DuoColors.lockedNodeTop }
            return node.conquered ? DuoColors.bee : DuoColors.beetle
        }
        switch node.status {
        case .completed: return DuoColors.bee
        case .current:   return unitColors(node.unitNumber).top
        case .locked:    return DuoColors.lockedNodeTop
        }
    }

    /// 节点 3D 底座颜色。
    private func nodeLedgeColor(for node: PathMapNode) -> Color {
        if node.kind == .chest && node.chestClaimed { return DuoColors.lockedNodeLedge }
        if node.kind == .exam {
            if node.status == .locked { return DuoColors.lockedNodeLedge }
            return node.conquered ? Color(hex: 0xCC9E00) : Color(hex: 0xA45FD6)
        }
        switch node.status {
        case .completed: return Color(hex: 0xCC9E00)
        case .current:   return unitColors(node.unitNumber).ledge
        case .locked:    return DuoColors.lockedNodeLedge
        }
    }

    // MARK: - Node visuals

    private func progressRing(progress: Double, tint: Color) -> some View {
        ZStack {
            Circle()
                .stroke(DuoColors.surfaceAlt, style: StrokeStyle(lineWidth: 5, lineCap: .round, dash: [3, 6]))
                .frame(width: nodeSize + 18, height: nodeSize + 18)
            Circle()
                .trim(from: 0, to: max(0.001, progress))
                .stroke(tint, style: StrokeStyle(lineWidth: 5, lineCap: .round))
                .frame(width: nodeSize + 18, height: nodeSize + 18)
                .rotationEffect(.degrees(-90))
                .animation(Motion.reveal, value: progress)
        }
    }

    private func startPill(for node: PathMapNode) -> some View {
        Text("开始")
            .duoFont(.caption)
            .tracking(0.6)
            .foregroundStyle(unitColors(node.unitNumber).top)
            .padding(.horizontal, 14)
            .padding(.vertical, 6)
            .background(DuoColors.bg, in: .capsule)
            .overlay { Capsule().strokeBorder(DuoColors.border, lineWidth: 2) }
            .offset(y: 6)
    }

    /// 解锁但未通关的挑战节点：紫色「挑战」小药丸。
    private var examPill: some View {
        Text("挑战")
            .duoFont(.caption)
            .tracking(0.6)
            .foregroundStyle(DuoColors.beetle)
            .padding(.horizontal, 14)
            .padding(.vertical, 6)
            .background(DuoColors.bg, in: .capsule)
            .overlay { Capsule().strokeBorder(DuoColors.border, lineWidth: 2) }
            .offset(y: 6)
    }

    @ViewBuilder
    private func nodeIcon(node: PathMapNode, kind: NodeKind) -> some View {
        let color: Color = node.status == .locked ? DuoColors.inkSofter : .white

        switch kind {
        case .star:
            if node.status == .completed, node.stars > 0 {
                VStack(spacing: 2) {
                    Image(systemName: "crown.fill").font(.system(size: 18, weight: .bold)).foregroundStyle(color)
                    HStack(spacing: 1) {
                        ForEach(0..<3, id: \.self) { i in
                            Image(systemName: i < node.stars ? "star.fill" : "star")
                                .font(.system(size: 7))
                                .foregroundStyle(color.opacity(i < node.stars ? 1 : 0.5))
                        }
                    }
                }
            } else {
                Image(systemName: "star.fill").font(.system(size: 26, weight: .bold)).foregroundStyle(color)
            }
        case .video:
            // Wave F：练习节点用中性的哑铃图标（video.fill 会被误会成看视频）。
            Image(systemName: "dumbbell.fill").font(.system(size: 24, weight: .bold)).foregroundStyle(color)
        case .chest:
            if node.chestClaimed {
                ZStack(alignment: .bottomTrailing) {
                    Image(systemName: "shippingbox.fill")
                        .font(.system(size: 24, weight: .bold))
                        .foregroundStyle(DuoColors.bee.opacity(0.55))
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 13, weight: .black))
                        .foregroundStyle(DuoColors.primary)
                        .offset(x: 5, y: 5)
                }
            } else {
                Image(systemName: "shippingbox.fill").font(.system(size: 24, weight: .bold)).foregroundStyle(color)
            }
        case .trophy:
            // Wave F：单元结尾用奖杯收束（替换旧 gearshape + 小旗）。
            Image(systemName: "trophy.fill")
                .font(.system(size: 28, weight: .bold))
                .foregroundStyle(color)
        case .exam:
            // 紫金奖杯挑战节点：未解锁灰奖杯；可挑战紫底金奖杯；
            // 通关未征服加小对勾；accuracy ≥ 0.8 征服 = 金底白奖杯 + 星星。
            if node.status == .locked {
                Image(systemName: "trophy.fill")
                    .font(.system(size: 26, weight: .bold))
                    .foregroundStyle(DuoColors.inkSofter)
            } else if node.conquered {
                VStack(spacing: 1) {
                    Image(systemName: "trophy.fill")
                        .font(.system(size: 24, weight: .bold))
                        .foregroundStyle(.white)
                    Image(systemName: "star.fill")
                        .font(.system(size: 9, weight: .black))
                        .foregroundStyle(.white)
                }
            } else if node.status == .completed {
                ZStack(alignment: .bottomTrailing) {
                    Image(systemName: "trophy.fill")
                        .font(.system(size: 26, weight: .bold))
                        .foregroundStyle(DuoColors.bee)
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 13, weight: .black))
                        .foregroundStyle(.white)
                        .offset(x: 6, y: 5)
                }
            } else {
                Image(systemName: "trophy.fill")
                    .font(.system(size: 26, weight: .bold))
                    .foregroundStyle(DuoColors.bee)
            }
        }
    }

    // MARK: - Locked toast

    @ViewBuilder
    private var lockedToast: some View {
        if showLockedToast {
            Text(lockedToastText)
                .duoFont(.caption)
                .foregroundStyle(.white)
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
                .background(DuoColors.ink.opacity(0.9), in: .capsule)
                .padding(.bottom, 24)
                .transition(.move(edge: .bottom).combined(with: .opacity))
        }
    }

    private func showLockedHint() {
        withAnimation(Motion.reveal) { showLockedToast = true }
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.8) {
            withAnimation(.easeOut(duration: 0.3)) { showLockedToast = false }
        }
    }

    // MARK: - Sticky current unit header (Wave F ios-path-9)

    /// 视口顶端第一个（部分）可见的节点所属单元；未滚动或算不出时为 nil。
    private var topVisibleUnit: PathMapNode? {
        // 视口顶端在内容坐标系中的位置。
        let topContentY = scrollOffset + 8
        guard topContentY > bannerHeight + 24 else { return nil }   // 第一条 banner 还在视口里，不用 sticky
        guard let idx = lessons.indices.first(where: { nodePosition(at: $0).y + nodeSize / 2 >= topContentY })
        else { return nil }
        let node = lessons[idx]
        return node
    }

    @ViewBuilder
    private var stickyUnitHeader: some View {
        if let unit = topVisibleUnit {
            let colors = unitColors(unit.unitNumber)
            HStack(spacing: 10) {
                VStack(alignment: .leading, spacing: 1) {
                    Text("\(unit.displayLabel)")
                        .duoFont(.micro)
                        .tracking(1.0)
                        .foregroundStyle(.white.opacity(0.85))
                    Text(unit.unitTitle)
                        .duoFont(.caption)
                        .foregroundStyle(.white)
                        .lineLimit(1)
                        .minimumScaleFactor(0.75)
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                if onGuideTap != nil {
                    Button {
                        HapticEngine.shared.tap()
                        SFXEngine.shared.play(.tap)
                        onGuideTap?(unit.unitNumber)
                    } label: {
                        Image(systemName: "list.bullet.rectangle.portrait.fill")
                            .font(.system(size: 16, weight: .bold))
                            .foregroundStyle(.white)
                            .frame(width: 36, height: 32)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("sticky-unit-guide")
                    .accessibilityLabel("\(unit.displayLabel)知识手册")
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .background(colors.top, in: .rect(cornerRadius: Radius.card))
            .overlay(alignment: .bottom) {
                RoundedRectangle(cornerRadius: Radius.card)
                    .strokeBorder(colors.ledge.opacity(0.5), lineWidth: 1.5)
            }
            .shadow(color: .black.opacity(0.12), radius: 6, y: 3)
            .padding(.horizontal, 16)
            .padding(.top, 6)
            .transition(.move(edge: .top).combined(with: .opacity))
            .animation(Motion.reveal, value: unit.unitNumber)
            .accessibilityElement(children: .contain)
            .accessibilityLabel("当前单元：\(unit.displayLabel) \(unit.unitTitle)")
        }
    }

    // MARK: - Back-to-current capsule (Wave F ios-path-11)

    /// current 节点在视口内（含少量余量）时不显示按钮。
    private var isCurrentNodeVisible: Bool {
        guard let y = currentNodeViewportY, viewportHeight > 0 else { return true }
        return y > 40 && y < viewportHeight - 40
    }

    @ViewBuilder
    private func backToCurrentButton(proxy: ScrollViewProxy) -> some View {
        if let y = currentNodeViewportY, !isCurrentNodeVisible, currentMainlineId != nil {
            let isAbove = y <= 40
            Button {
                HapticEngine.shared.tap()
                SFXEngine.shared.play(.tap)
                if let id = currentMainlineId {
                    withAnimation(.easeOut(duration: 0.4)) {
                        proxy.scrollTo(id, anchor: .center)
                    }
                }
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: isAbove ? "arrow.up" : "arrow.down")
                        .font(.system(size: 13, weight: .heavy))
                    Text("回到当前")
                        .duoFont(.caption)
                }
                .foregroundStyle(.white)
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
                .background(DuoColors.secondary, in: .capsule)
                .overlay { Capsule().strokeBorder(DuoColors.secondaryDark, lineWidth: 2) }
                .shadow(color: .black.opacity(0.18), radius: 6, y: 3)
            }
            .buttonStyle(.plain)
            .transition(.scale(scale: 0.8).combined(with: .opacity))
            .accessibilityIdentifier("back-to-current")
            .accessibilityLabel("回到当前课程")
        }
    }

    // MARK: - Decorations

    private var trail: some View {
        Path { path in
            guard lessons.count > 1 else { return }
            for index in 1..<lessons.count where lessons[index].unitNumber == lessons[index - 1].unitNumber {
                let from = nodePosition(at: index - 1)
                let to = nodePosition(at: index)
                path.move(to: from)
                path.addCurve(to: to,
                              control1: CGPoint(x: from.x, y: from.y + stepY / 2),
                              control2: CGPoint(x: to.x, y: to.y - stepY / 2))
            }
        }
        .stroke(DuoColors.border, style: StrokeStyle(lineWidth: 3, lineCap: .round, dash: [3, 9]))
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }

    @ViewBuilder
    private var decorations: some View {
        if lessons.count >= 4 {
            let starPos = nodePosition(at: min(3, lessons.count - 1))
            HStack(spacing: 4) {
                Image(systemName: "star.fill").font(.system(size: 14))
                Image(systemName: "star.fill").font(.system(size: 16))
                Image(systemName: "star.fill").font(.system(size: 14))
            }
            .foregroundStyle(DuoColors.surfaceAlt)
            .position(x: stageWidth - 40, y: starPos.y + 4)
        }
    }
}

// MARK: - Scroll metrics preference

/// 内容顶端在视口坐标系中的 minY（驱动 sticky 单元头与「回到当前」）。
private struct PathContentTopKey: PreferenceKey {
    static var defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = nextValue()
    }
}

// MARK: - Pulse halo (onboarding "start here" guide)

/// A soft ring that repeatedly swells out of the node — draws a brand-new
/// learner's eye to the very first lesson.
/// `animated == false`（Reduce Motion）时退化为一圈静态光环。
private struct PulseHalo: View {
    let size: CGFloat
    var animated: Bool = true
    @State private var pulsing = false

    var body: some View {
        Circle()
            .stroke(DuoColors.primary.opacity(pulsing ? 0 : 0.55), lineWidth: 4)
            .frame(width: size + 8, height: size + 8)
            .scaleEffect(pulsing ? 1.55 : 1.0)
            .onAppear {
                guard animated else { return }
                withAnimation(.easeOut(duration: 1.4).repeatForever(autoreverses: false)) {
                    pulsing = true
                }
            }
            .allowsHitTesting(false)
    }
}

// MARK: - Idle bob (current node breathes)

private struct IdleBob: ViewModifier {
    let active: Bool
    @State private var up = false
    func body(content: Content) -> some View {
        content
            .offset(y: active && up ? -6 : 0)
            .onAppear {
                guard active else { return }
                withAnimation(.easeInOut(duration: 0.9).repeatForever(autoreverses: true)) { up = true }
            }
    }
}

// MARK: - Press style (顶面下沉，底座不动 — ios-path-12)

/// ButtonStyle 把按压状态注入 environment，让 label 里的 `NodePressSink`
/// 只下沉顶面 —— 3D 底座保持原位，更接近真实按钮的物理感。
private struct NodePressedKey: EnvironmentKey {
    static let defaultValue = false
}

private extension EnvironmentValues {
    var pathNodePressed: Bool {
        get { self[NodePressedKey.self] }
        set { self[NodePressedKey.self] = newValue }
    }
}

private struct PathNodeButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .environment(\.pathNodePressed, configuration.isPressed)
    }
}

/// 包住节点「顶面」的容器：按压时向下沉到底座上。
private struct NodePressSink<Content: View>: View {
    @Environment(\.pathNodePressed) private var pressed
    @ViewBuilder var content: Content

    var body: some View {
        content
            .offset(y: pressed ? 5 : 0)
            .animation(.easeOut(duration: 0.1), value: pressed)
    }
}

// MARK: - Completion celebration (ios-path-7)

/// current → completed 的金色弹跳：结算返回时该节点先「跳一下」再交棒。
private struct CelebrationPop: ViewModifier {
    let active: Bool
    @State private var popped = false

    func body(content: Content) -> some View {
        content
            .scaleEffect(active && popped ? 1.0 : (active ? 0.98 : 1.0))
            .onChange(of: active) { _, isActive in
                guard isActive else { popped = false; return }
                withAnimation(.spring(response: 0.35, dampingFraction: 0.45)) { popped = true }
            }
            .onAppear {
                if active {
                    withAnimation(.spring(response: 0.35, dampingFraction: 0.45)) { popped = true }
                }
            }
    }
}

/// 金色光晕 + 星粒迸发（配合节点从绿变金 + 单元进度环生长）。
private struct NodeCompletionBurst: View {
    let size: CGFloat
    @State private var burst = false

    var body: some View {
        ZStack {
            // 金色光晕扩散
            Circle()
                .stroke(DuoColors.bee.opacity(burst ? 0 : 0.8), lineWidth: 5)
                .frame(width: size + 6, height: size + 6)
                .scaleEffect(burst ? 1.8 : 1.0)

            // 星粒向外迸发
            ForEach(0..<8, id: \.self) { i in
                let angle = Double(i) / 8 * 2 * .pi
                Image(systemName: "star.fill")
                    .font(.system(size: 11))
                    .foregroundStyle(DuoColors.bee)
                    .opacity(burst ? 0 : 1)
                    .offset(
                        x: burst ? cos(angle) * (size * 0.95) : cos(angle) * (size * 0.4),
                        y: burst ? sin(angle) * (size * 0.95) : sin(angle) * (size * 0.4)
                    )
            }
        }
        .allowsHitTesting(false)
        .onAppear {
            SFXEngine.shared.play(.star)
            HapticEngine.shared.success()
            withAnimation(.easeOut(duration: 0.85)) { burst = true }
        }
    }
}

// MARK: - Callout triangle (shared by the start popup)

struct CalloutTriangle: Shape {
    func path(in rect: CGRect) -> Path {
        var p = Path()
        p.move(to: CGPoint(x: rect.midX, y: rect.minY))
        p.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY))
        p.addLine(to: CGPoint(x: rect.minX, y: rect.maxY))
        p.closeSubpath()
        return p
    }
}

// MARK: - Node building

/// Shared builder for a book's path nodes: lesson nodes with status/stars, a
/// chest node after every 5th lesson of a unit (see `Chest.slots`), plus a
/// trophy「单元挑战」node closing each unit that ships an exam lesson
/// (Wave E1). Used by both the Home tab and BookDetailView so the two paths
/// can't drift.
@MainActor
enum PathNodeBuilder {
    static func nodes(
        bookId: String,
        lessons: [PathLessonMeta],
        progressStore: ProgressStore,
        examSlots: [ExamSlot] = []
    ) -> [PathMapNode] {
        var foundCurrent = false
        let chestByAfterLesson = Dictionary(
            uniqueKeysWithValues: Chest.slots(bookId: bookId, lessons: lessons)
                .map { ($0.afterLessonId, $0) }
        )
        let examByUnit = Dictionary(
            uniqueKeysWithValues: examSlots.map { ($0.unitNumber, $0) }
        )
        var nodes: [PathMapNode] = []
        for (i, row) in lessons.enumerated() {
            let stars = progressStore.stars(for: row.id) ?? 0
            let isCompleted = stars > 0
            let status: LessonStatus
            if isCompleted {
                status = .completed
            } else if !foundCurrent {
                status = .current
                foundCurrent = true
            } else {
                status = .locked
            }
            nodes.append(PathMapNode(
                id: row.id,
                title: row.title,
                unitNumber: row.unitNumber,
                unitTitle: row.unitTitle,
                status: status,
                stars: stars,
                questionCount: row.questionCount,
                unitLabel: row.unitLabel
            ))
            if let slot = chestByAfterLesson[row.id] {
                nodes.append(PathMapNode(
                    id: slot.id,
                    title: "宝箱",
                    unitNumber: slot.unitNumber,
                    unitTitle: slot.unitTitle,
                    status: isCompleted ? .completed : .locked,
                    stars: 0,
                    kind: .chest,
                    chestClaimed: progressStore.isChestClaimed(slot.id),
                    unitLabel: row.unitLabel
                ))
            }
            // 单元最后一节普通课之后挂「单元挑战」奖杯节点：
            // 本单元全部普通课完成才解锁；accuracy ≥ 0.8 视为征服（金色态）。
            let isLastOfUnit = i + 1 >= lessons.count || lessons[i + 1].unitNumber != row.unitNumber
            if isLastOfUnit, let exam = examByUnit[row.unitNumber] {
                let unitDone = lessons
                    .filter { $0.unitNumber == row.unitNumber }
                    .allSatisfy { progressStore.isLessonCompleted($0.id) }
                let result = progressStore.progress.completedLessons[exam.lessonId]
                let examStatus: LessonStatus = result != nil
                    ? .completed
                    : unitDone ? .current : .locked
                nodes.append(PathMapNode(
                    id: exam.lessonId,
                    title: exam.title,
                    unitNumber: exam.unitNumber,
                    unitTitle: exam.unitTitle,
                    status: examStatus,
                    stars: result?.stars ?? 0,
                    kind: .exam,
                    conquered: (result?.accuracy ?? 0) >= 0.8,
                    questionCount: exam.questionCount,
                    unitLabel: row.unitLabel
                ))
            }
        }
        return nodes
    }
}

// MARK: - Data model

struct PathMapNode: Identifiable, Hashable {
    enum Kind: Hashable { case lesson, chest, exam }

    let id: String
    let title: String
    let unitNumber: Int
    let unitTitle: String
    let status: LessonStatus
    let stars: Int
    var kind: Kind = .lesson
    /// Chest nodes only: whether the reward was already collected.
    var chestClaimed: Bool = false
    /// Exam nodes only: accuracy ≥ 0.8 conquered the unit (golden trophy).
    var conquered: Bool = false
    /// Lesson nodes only: drives the "+N XP" line in the start popup (0 = unknown).
    var questionCount: Int = 0
    var unitLabel: String? = nil
    var displayLabel: String { unitLabel ?? "第 \(unitNumber) 单元" }
}
