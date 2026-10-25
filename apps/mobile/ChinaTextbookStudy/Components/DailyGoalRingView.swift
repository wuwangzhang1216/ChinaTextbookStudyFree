import SwiftUI

/// Circular progress ring for daily XP goal — ported from `DailyGoalRing.tsx`.
/// Solid green while in progress, gold when complete.
struct DailyGoalRingView: View {
    @ObservedObject var progressStore: ProgressStore
    var size: CGFloat = 72
    @State private var showGoalSheet = false

    private var lineWidth: CGFloat { max(5, size * 0.11) }

    private var progress: Double {
        let goal = progressStore.dailyGoal
        guard goal > 0 else { return 0 }
        return min(1.0, Double(progressStore.todayXp) / Double(goal))
    }

    private var isComplete: Bool { progress >= 1.0 }

    var body: some View {
        Button {
            showGoalSheet = true
        } label: {
            ZStack {
                // Track
                Circle()
                    .stroke(DuoColors.bgSofter, lineWidth: lineWidth)

                // Progress arc
                Circle()
                    .trim(from: 0, to: progress)
                    .stroke(
                        isComplete ? DuoColors.bee : DuoColors.primary,
                        style: StrokeStyle(lineWidth: lineWidth, lineCap: .round)
                    )
                    .rotationEffect(.degrees(-90))
                    .animation(.spring(response: 0.5, dampingFraction: 0.7), value: progress)

                // Center content
                VStack(spacing: 1) {
                    if isComplete {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.system(size: size * 0.26, weight: .bold))
                            .foregroundStyle(DuoColors.primary)
                    } else {
                        Image(systemName: "bolt.fill")
                            .font(.system(size: size * 0.18))
                            .foregroundStyle(DuoColors.secondary)
                    }
                    Text("\(progressStore.todayXp)")
                        .font(.system(size: size * 0.24, weight: .heavy, design: .rounded))
                        .foregroundStyle(DuoColors.ink)
                        .monospacedDigit()
                        .contentTransition(.numericText())
                }
            }
            .frame(width: size, height: size)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("每日目标，今天 \(progressStore.todayXp) / \(progressStore.dailyGoal) 经验")
        .accessibilityIdentifier("daily-goal")
        .sheet(isPresented: $showGoalSheet) {
            goalAdjustSheet
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
        }
    }

    // MARK: - Goal adjustment sheet

    @ViewBuilder
    private var goalAdjustSheet: some View {
        ScrollView {
            VStack(spacing: 20) {
                Text("每日目标").duoFont(.heading).foregroundStyle(DuoColors.ink)
                Text("选择你的每日 XP 目标").duoFont(.body).foregroundStyle(DuoColors.inkMuted)
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 100))], spacing: 12) {
                    ForEach(Economy.dailyGoalOptions, id: \.self) { goal in
                        let selected = progressStore.dailyGoal == goal
                        Button {
                            progressStore.setDailyGoal(goal); showGoalSheet = false
                        } label: {
                            VStack(spacing: 4) {
                                Text("\(goal)").duoNumeral(.heading)
                                Text("XP").duoFont(.caption)
                            }
                            .foregroundStyle(selected ? DuoColors.linkInk : DuoColors.ink)
                            .frame(maxWidth: .infinity).padding(.vertical, 16)
                            .background(selected ? DuoColors.selectedFill : DuoColors.surface, in: RoundedRectangle(cornerRadius: Radius.card))
                            .overlay { RoundedRectangle(cornerRadius: Radius.card).strokeBorder(selected ? DuoColors.selectedBorder : DuoColors.border, lineWidth: 2) }
                        }
                        .buttonStyle(.plain).accessibilityAddTraits(selected ? [.isSelected] : [])
                        .accessibilityIdentifier("daily-goal-option-\(goal)")
                    }
                }
            }.learningContent()
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            LearningActionDock {
                Button("完成") { showGoalSheet = false }.buttonStyle(ChunkyButtonStyle(.primary))
                    .accessibilityIdentifier("dock-dismiss")
            }
        }
        .background(DuoColors.bg)
    }
}
