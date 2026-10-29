import SwiftUI

/// First-run onboarding: greet → pick grade & book → commit to a daily goal
/// → notification soft-ask. Warm and animated, never a settings form.
struct OnboardingView: View {
    @ObservedObject var progressStore: ProgressStore
    let siteIndex: SiteIndex
    let onDone: () -> Void

    @State private var step = 0
    @State private var selectedGrade = 1
    @State private var selectedBookId: String?
    @State private var schoolSystem = "6-3"
    /// Guards double-taps on the primer buttons while the system alert is up.
    @State private var requestingAuth = false

    private let stepCount = 4

    /// 每日目标档位 —— 与 Economy.dailyGoalOptions（20/50/100/200）一致。
    private let goals: [(label: String, xp: Int, sub: String)] = [
        ("轻松", 20, "每天几分钟"),
        ("标准", 50, "每天 1 节"),
        ("认真", 100, "每天 2 节"),
        ("学霸", 200, "每天 4 节"),
    ]

    var body: some View {
        ZStack {
            DuoColors.bg.ignoresSafeArea()

            VStack(spacing: 0) {
                progressDots
                    .padding(.top, 16)

                Group {
                    switch step {
                    case 0: greetStep
                    case 1: pickStep
                    case 2: goalStep
                    default: notifyStep
                    }
                }
                .transition(.asymmetric(
                    insertion: .move(edge: .trailing).combined(with: .opacity),
                    removal: .move(edge: .leading).combined(with: .opacity)
                ))
                .frame(maxHeight: .infinity)
            }
        }
    }

    private var progressDots: some View {
        HStack(spacing: 8) {
            ForEach(0..<stepCount, id: \.self) { i in
                Capsule()
                    .fill(i <= step ? DuoColors.primary : DuoColors.border)
                    .frame(width: i == step ? 28 : 10, height: 10)
                    .animation(Motion.reveal, value: step)
            }
        }
    }

    // MARK: - Step 0 — greeting

    private var greetStep: some View {
        VStack(spacing: Space.l) {
            Spacer()
            MascotView(mood: .wave, size: 150, reactTo: .correct)
            SpeechBubbleView(text: "嗨，我是聪聪！", mood: .happy)
            Text("欢迎来到课本学习")
                .duoFont(.title)
                .foregroundStyle(DuoColors.ink)
            Text("每天几分钟，把课本变成闯关游戏")
                .duoFont(.body)
                .foregroundStyle(DuoColors.inkMuted)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)
            Spacer()
            Button("开始吧") { withAnimation(Motion.reveal) { step = 1 } }
                .buttonStyle(ChunkyButtonStyle(.primary))
                .padding(.horizontal, 32)
                .padding(.bottom, 40)
        }
    }

    // MARK: - Step 1 — grade + book

    private var pickStep: some View {
        VStack(alignment: .leading, spacing: Space.l) {
            Text("选择你的课本")
                .duoFont(.title)
                .foregroundStyle(DuoColors.ink)
                .padding(.horizontal, 20)
                .padding(.top, 20)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 10) {
                    ForEach(1...(schoolSystem == "5-4" ? 5 : 6), id: \.self) { g in
                        gradeChip(g)
                    }
                }
                .padding(.horizontal, 20)
            }

            ScrollView {
                VStack(spacing: 12) {
                    Picker("学制", selection: $schoolSystem) {
                        Text("六三制").tag("6-3")
                        Text("五四制").tag("5-4")
                    }
                    .pickerStyle(.segmented)
                    ForEach(booksForGrade, id: \.id) { book in
                        bookRow(book)
                    }
                    if booksForGrade.isEmpty {
                        Text("这个年级暂无课本")
                            .duoFont(.subhead)
                            .foregroundStyle(DuoColors.inkMuted)
                            .padding(.vertical, 20)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 20)
            }
            .onChange(of: schoolSystem) { _, value in
                selectedBookId = nil
                if value == "5-4" && selectedGrade > 5 { selectedGrade = 5 }
            }
            .onChange(of: selectedGrade) { _, _ in selectedBookId = nil }

            Button(selectedBookId == nil ? "先选一本课本" : "下一步") {
                withAnimation(Motion.reveal) { step = 2 }
            }
            .buttonStyle(ChunkyButtonStyle(selectedBookId == nil ? .disabled : .primary))
            .disabled(selectedBookId == nil)
            .padding(.horizontal, 32)
            .padding(.bottom, 32)
        }
    }

    private var booksForGrade: [Book] {
        siteIndex.books.filter { $0.grade == selectedGrade && ($0.schoolSystem ?? "6-3") == schoolSystem }
    }

    private func gradeChip(_ g: Int) -> some View {
        let selected = selectedGrade == g
        return Button {
            HapticEngine.shared.tap()
            withAnimation(Motion.press) { selectedGrade = g }
        } label: {
            Text("\(g)年级")
                .duoFont(.caption)
                .foregroundStyle(selected ? .white : DuoColors.inkMuted)
                .frame(width: 76, height: 42)
                .background(selected ? DuoColors.primary : DuoColors.surface, in: .capsule)
                .overlay { Capsule().strokeBorder(selected ? .clear : DuoColors.border, lineWidth: 2) }
        }
        .buttonStyle(.plain)
    }

    private func bookRow(_ book: Book) -> some View {
        let cfg = Subjects.resolve(book: book)
        let selected = selectedBookId == book.id
        return Button {
            HapticEngine.shared.tap(); SFXEngine.shared.play(.tap)
            withAnimation(Motion.press) { selectedBookId = book.id }
            progressStore.setSelectedGrade(selectedGrade)
            progressStore.setActiveBook(book.id)
        } label: {
            HStack(spacing: 14) {
                ZStack {
                    RoundedRectangle(cornerRadius: Radius.control).fill(cfg.accent).frame(width: 48, height: 48)
                    Text(cfg.label).duoFont(.subhead).foregroundStyle(.white)
                }
                VStack(alignment: .leading, spacing: 3) {
                    Text(book.fullName).duoFont(.subhead).foregroundStyle(DuoColors.ink).lineLimit(2).multilineTextAlignment(.leading)
                    if let edition = book.sourceEdition {
                        Text(edition).duoFont(.caption).foregroundStyle(DuoColors.inkMuted)
                    }
                    Text("\(book.unitsCount) 单元 · \(book.lessonsCount) 节")
                        .duoFont(.caption).foregroundStyle(DuoColors.inkMuted)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                if selected {
                    Image(systemName: "checkmark.circle.fill").font(.system(size: 24)).foregroundStyle(DuoColors.primary)
                }
            }
            .padding(14)
            .background(DuoColors.surface, in: .rect(cornerRadius: Radius.card))
            .overlay {
                RoundedRectangle(cornerRadius: Radius.card)
                    .strokeBorder(selected ? DuoColors.primary : DuoColors.border, lineWidth: selected ? 2.5 : 2)
            }
        }
        .buttonStyle(.plain)
    }

    // MARK: - Step 2 — daily goal

    private var goalStep: some View {
        VStack(spacing: Space.l) {
            Spacer(minLength: 8)
            MascotView(mood: .proud, size: 110, reactTo: .levelup)
            Text("设定每日目标")
                .duoFont(.title)
                .foregroundStyle(DuoColors.ink)
            Text("坚持就是胜利，选一个适合你的目标")
                .duoFont(.body)
                .foregroundStyle(DuoColors.inkMuted)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)

            VStack(spacing: 10) {
                ForEach(goals, id: \.xp) { goal in
                    goalRow(goal)
                }
            }
            .padding(.horizontal, 24)

            Spacer(minLength: 8)
        }
        .padding(.bottom, 24)
    }

    private func goalRow(_ goal: (label: String, xp: Int, sub: String)) -> some View {
        Button {
            HapticEngine.shared.success(); SFXEngine.shared.play(.complete)
            progressStore.setDailyGoal(goal.xp)
            withAnimation(Motion.reveal) { step = 3 }
        } label: {
            HStack(spacing: 14) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(goal.label).duoFont(.subhead).foregroundStyle(DuoColors.ink)
                    Text(goal.sub).duoFont(.caption).foregroundStyle(DuoColors.inkMuted)
                }
                Spacer()
                HStack(spacing: 4) {
                    Image(systemName: "bolt.fill").font(.system(size: 13, weight: .heavy))
                    Text("\(goal.xp) XP").duoFont(.caption)
                }
                .foregroundStyle(DuoColors.secondary)
                .padding(.horizontal, 12).padding(.vertical, 7)
                .background(DuoColors.secondary.opacity(0.14), in: .capsule)
            }
            .padding(16)
            .background(DuoColors.surface, in: .rect(cornerRadius: Radius.card))
            .overlay { RoundedRectangle(cornerRadius: Radius.card).strokeBorder(DuoColors.border, lineWidth: 2) }
        }
        .buttonStyle(.plain)
    }

    // MARK: - Step 3 — notification soft-ask primer (ios-retention-2)

    /// 聪聪 asks first; the scary system alert only appears after an explicit
    /// 「好呀」. A refusal here never re-prompts — the Settings toggle remains
    /// the one place to opt in later.
    private var notifyStep: some View {
        VStack(spacing: Space.l) {
            Spacer()
            MascotView(mood: .wave, size: 130, reactTo: .correct)
            SpeechBubbleView(text: "每天一条小提醒，帮你保住连胜 🔥", mood: .happy)
            Text("要聪聪提醒你吗？")
                .duoFont(.title)
                .foregroundStyle(DuoColors.ink)
            Text("每天最多一条，学过就不打扰，随时可以在设置里关掉")
                .duoFont(.body)
                .foregroundStyle(DuoColors.inkMuted)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)
            Spacer()
            VStack(spacing: 10) {
                Button("好呀") {
                    guard !requestingAuth else { return }
                    requestingAuth = true
                    HapticEngine.shared.tap(); SFXEngine.shared.play(.tap)
                    Task {
                        let granted = await NotificationService.shared.requestAuthorization()
                        if granted {
                            SettingsStore.shared.streakReminderEnabled = true
                            NotificationService.shared.rescheduleStreakReminder(
                                streak: progressStore.reminderStreak,
                                studiedToday: progressStore.studiedToday
                            )
                            HapticEngine.shared.success()
                        }
                        finish()
                    }
                }
                .buttonStyle(ChunkyButtonStyle(.primary))
                .accessibilityIdentifier("onboarding-notify-yes")

                Button("暂时不用") {
                    guard !requestingAuth else { return }
                    HapticEngine.shared.tap()
                    finish()
                }
                .buttonStyle(ChunkyButtonStyle(.ghost))
                .accessibilityIdentifier("onboarding-notify-later")
            }
            .padding(.horizontal, 32)
            .padding(.bottom, 40)
        }
    }

    /// Common exit for the last step — mark onboarding done and hand control
    /// back to the shell (which pushes the first lesson, ios-retention-11).
    private func finish() {
        progressStore.completeOnboarding()
        onDone()
    }
}
