import SwiftUI

/// The learner's identity screen — avatar, stats, streak, achievements, settings.
struct ProfileView: View {
    @ObservedObject var progressStore: ProgressStore
    @Binding var path: [AppRoute]

    @State private var editingName = false
    @State private var nameDraft = ""

    private var achievementSnapshot: AchievementProgressSnapshot { progressStore.achievementSnapshot }
    private var unlockedCount: Int { progressStore.unlockedAchievementIds.count }

    /// "加入于 2026年8月" from the D0 joinedDate (YYYY-MM-DD).
    private var joinedLabel: String? {
        let parts = progressStore.joinedDate.split(separator: "-")
        guard parts.count >= 2, let year = Int(parts[0]), let month = Int(parts[1]) else { return nil }
        return "加入于 \(year)年\(month)月"
    }

    var body: some View {
        ScrollView {
            VStack(spacing: Space.xl) {
                header
                statGrid
                dailyGoalCard
                DailyQuestsCard(progressStore: progressStore)
                WeeklyReportCard(progressStore: progressStore)
                achievementsCard
                settingsRow
            }
            .learningContent()
        }
        .background(DuoColors.canvas.ignoresSafeArea())
        .navigationTitle("我的")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { path.append(.settings) } label: {
                    Image(systemName: "gearshape.fill")
                        .foregroundStyle(DuoColors.inkMuted)
                        .frame(width: 44, height: 44)
                }
                .accessibilityLabel("学习设置")
                .accessibilityIdentifier("profile-settings")
            }
        }
        // ios-feel-20: 改名从系统 alert 换成品牌 sheet（圆角输入 + Chunky 保存）。
        .sheet(isPresented: $editingName) {
            RenameSheet(
                draft: $nameDraft,
                onSave: {
                    progressStore.displayName = nameDraft.trimmingCharacters(in: .whitespacesAndNewlines)
                    HapticEngine.shared.success()
                }
            )
            .presentationDetents([.medium])
            .presentationDragIndicator(.visible)
        }
    }

    // MARK: - Header

    private var header: some View {
        VStack(spacing: 12) {
            ZStack {
                Circle().fill(DuoColors.secondary.opacity(0.14)).frame(width: 120, height: 120)
                MascotView(mood: .happy, size: 104, allowsTap: true)
            }
            HStack(spacing: 8) {
                Text(progressStore.displayName).duoFont(.title).foregroundStyle(DuoColors.ink)
                Button {
                    nameDraft = progressStore.displayName
                    editingName = true
                } label: {
                    Image(systemName: "pencil.circle.fill")
                        .font(.system(size: 22))
                        .foregroundStyle(DuoColors.inkSofter)
                        // ≥44pt hit target (ios-feel-18) — visual stays 22pt.
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("修改昵称")
            }
            Text("已完成 \(progressStore.totalCompletedLessons) 节 · \(progressStore.progress.xp) XP")
                .duoFont(.caption)
                .foregroundStyle(DuoColors.inkMuted)
            if let joinedLabel {
                Text(joinedLabel)
                    .duoFont(.micro)
                    .foregroundStyle(DuoColors.inkMuted)
                    .accessibilityIdentifier("profile-joined-date")
            }
            Text("每一次认真，都值得被看见。")
                .duoFont(.caption).foregroundStyle(DuoColors.inkMuted)
        }
        .frame(maxWidth: .infinity)
        .learningCard(tint: DuoColors.secondary)
    }

    // MARK: - Stat grid

    private var statGrid: some View {
        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
            statCard(icon: "flame.fill", value: "\(progressStore.displayStreak)", label: "连胜天数", tint: DuoColors.fox)
            statCard(icon: "bolt.fill", value: "\(progressStore.progress.xp)", label: "总经验值", tint: DuoColors.secondary)
            statCard(icon: "checkmark.seal.fill", value: "\(progressStore.totalCompletedLessons)", label: "完成课程", tint: DuoColors.primary)
            statCard(icon: "star.fill", value: "\(progressStore.perfectedLessonCount)", label: "完美通关", tint: DuoColors.bee)
        }
    }

    private func statCard(icon: String, value: String, label: String, tint: Color) -> some View {
        HStack(spacing: 12) {
            ZStack {
                Circle().fill(tint.opacity(0.16)).frame(width: 44, height: 44)
                Image(systemName: icon).font(.system(size: 20, weight: .heavy)).foregroundStyle(tint)
            }
            VStack(alignment: .leading, spacing: 1) {
                Text(value).duoNumeral(.heading).foregroundStyle(DuoColors.ink)
                Text(label).duoFont(.caption).foregroundStyle(DuoColors.inkMuted)
            }
            Spacer(minLength: 0)
        }
        .padding(14)
        .background(DuoColors.surface, in: .rect(cornerRadius: Radius.card))
        .overlay { RoundedRectangle(cornerRadius: Radius.card).strokeBorder(DuoColors.border, lineWidth: 2) }
    }

    // MARK: - Daily goal

    private var dailyGoalCard: some View {
        HStack(spacing: 16) {
            DailyGoalRingView(progressStore: progressStore, size: 70)
            VStack(alignment: .leading, spacing: 4) {
                Text("今日目标").duoFont(.subhead).foregroundStyle(DuoColors.ink)
                Text("\(progressStore.todayXp) / \(progressStore.dailyGoal) XP")
                    .duoFont(.caption).foregroundStyle(DuoColors.inkMuted)
                if progressStore.dailyGoalReached {
                    Text("今日目标已完成 🎉").duoFont(.caption).foregroundStyle(DuoColors.primary)
                }
            }
            Spacer()
        }
        .padding(16)
        .background(DuoColors.surface, in: .rect(cornerRadius: Radius.card))
        .overlay { RoundedRectangle(cornerRadius: Radius.card).strokeBorder(DuoColors.border, lineWidth: 2) }
    }

    // MARK: - Achievements preview

    private var achievementsCard: some View {
        Button { path.append(.achievements) } label: {
            HStack(spacing: 14) {
                ZStack {
                    Circle().fill(DuoColors.beetle.opacity(0.16)).frame(width: 46, height: 46)
                    Image(systemName: "rosette").font(.system(size: 22, weight: .heavy)).foregroundStyle(DuoColors.beetle)
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text("成就墙").duoFont(.subhead).foregroundStyle(DuoColors.ink)
                    Text("已解锁 \(unlockedCount) / \(Achievements.all.count)").duoFont(.caption).foregroundStyle(DuoColors.inkMuted)
                }
                Spacer()
                if progressStore.claimableAchievementCount > 0 {
                    Text("\(progressStore.claimableAchievementCount) 个可领取")
                        .duoFont(.micro)
                        .foregroundStyle(.white)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(DuoColors.danger, in: .capsule)
                        .accessibilityIdentifier("achievements-claimable-pill")
                }
                Image(systemName: "chevron.right").font(.system(size: 15, weight: .heavy)).foregroundStyle(DuoColors.inkSofter)
            }
            .padding(16)
            .background(DuoColors.surface, in: .rect(cornerRadius: Radius.card))
            .overlay { RoundedRectangle(cornerRadius: Radius.card).strokeBorder(DuoColors.border, lineWidth: 2) }
        }
        .buttonStyle(.plain)
    }

    private var settingsRow: some View {
        Button { path.append(.settings) } label: {
            HStack(spacing: 14) {
                ZStack {
                    Circle().fill(DuoColors.inkSofter.opacity(0.16)).frame(width: 46, height: 46)
                    Image(systemName: "gearshape.fill").font(.system(size: 20, weight: .heavy)).foregroundStyle(DuoColors.inkMuted)
                }
                Text("设置").duoFont(.subhead).foregroundStyle(DuoColors.ink)
                Spacer()
                Image(systemName: "chevron.right").font(.system(size: 15, weight: .heavy)).foregroundStyle(DuoColors.inkSofter)
            }
            .padding(16)
            .background(DuoColors.surface, in: .rect(cornerRadius: Radius.card))
            .overlay { RoundedRectangle(cornerRadius: Radius.card).strokeBorder(DuoColors.border, lineWidth: 2) }
        }
        .buttonStyle(.plain)
    }
}

// MARK: - 改名品牌 sheet（ios-feel-20）

private struct RenameSheet: View {
    @Binding var draft: String
    let onSave: () -> Void
    @Environment(\.dismiss) private var dismiss
    @FocusState private var focused: Bool

    private var trimmed: String {
        draft.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var body: some View {
        VStack(spacing: 18) {
            MascotView(mood: .happy, size: 72)
                .padding(.top, 20)

            Text("给自己起个名字")
                .duoFont(.heading)
                .foregroundStyle(DuoColors.ink)

            TextField("昵称", text: $draft)
                .duoFont(.subhead)
                .foregroundStyle(DuoColors.ink)
                .multilineTextAlignment(.center)
                .submitLabel(.done)
                .focused($focused)
                .padding(.horizontal, 16)
                .frame(height: 54)
                .background(DuoColors.surfaceAlt, in: .rect(cornerRadius: Radius.card))
                .overlay {
                    RoundedRectangle(cornerRadius: Radius.card)
                        .strokeBorder(focused ? DuoColors.primary : DuoColors.border, lineWidth: 2)
                }
                .padding(.horizontal, 24)
                .accessibilityIdentifier("rename-field")

            Text("最多 12 个字，随时可以再改")
                .duoFont(.micro)
                .foregroundStyle(DuoColors.inkMuted)

            Spacer(minLength: 0)

            VStack(spacing: 10) {
                Button("保存") {
                    onSave()
                    dismiss()
                }
                .buttonStyle(ChunkyButtonStyle(trimmed.isEmpty ? .disabled : .primary))
                .disabled(trimmed.isEmpty)
                .accessibilityIdentifier("rename-save")

                Button("取消") { dismiss() }
                    .buttonStyle(ChunkyButtonStyle(.ghost))
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 20)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(DuoColors.bg.ignoresSafeArea())
        .onAppear { focused = true }
        .onChange(of: draft) { _, newValue in
            if newValue.count > 12 { draft = String(newValue.prefix(12)) }
        }
    }
}
