import SwiftUI

/// Four small decisions, one stable action area, and an explicit opt-in to reminders.
struct OnboardingView: View {
    @ObservedObject var progressStore: ProgressStore
    let siteIndex: SiteIndex
    let onDone: () -> Void

    @State private var step = 0
    @State private var selectedGrade = 1
    @State private var selectedBookId: String?
    @State private var selectedGoal = 50
    @State private var requestingAuth = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private let goals: [(label: String, xp: Int, sub: String)] = [
        ("轻松起步", 20, "留一点时间给好奇心"),
        ("每天进步", 50, "从一个小目标开始"),
        ("多学一点", 100, "给自己多一点挑战"),
        ("认真探索", 200, "按自己的节奏完成"),
    ]
    private var booksForGrade: [Book] {
        siteIndex.books.filter { $0.grade == selectedGrade && $0.supersededBy == nil }
    }
    private var stepLabel: String { ["认识聪聪", "选择课本", "每日目标", "学习提醒"][step] }

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 14) {
                Button {
                    withAnimation(reduceMotion ? nil : Motion.reveal) { step -= 1 }
                } label: {
                    Image(systemName: "arrow.left").font(.system(size: 20, weight: .bold))
                        .frame(width: 44, height: 44)
                }
                .foregroundStyle(DuoColors.inkMuted)
                .disabled(step == 0 || requestingAuth)
                .opacity(step == 0 ? 0 : 1)
                .accessibilityLabel("上一步")
                StyledProgressBar(progress: Double(step + 1) / 4, height: 12)
                Text("\(step + 1)/4").duoNumeral(.caption).foregroundStyle(DuoColors.inkMuted)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
            .frame(maxWidth: LearningLayout.contentWidth)

            ScrollView {
                VStack(spacing: 24) {
                    if step == 0 {
                        greeting
                    } else if step == 1 {
                        bookSelection
                    } else if step == 2 {
                        goalSelection
                    } else {
                        notificationPrimer
                    }
                }
                .learningContent()
            }
            .safeAreaInset(edge: .bottom, spacing: 0) { footer }
        }
        .background(DuoColors.bg.ignoresSafeArea())
        .onChange(of: selectedGrade) { _, _ in selectedBookId = nil }
    }

    private var greeting: some View {
        VStack(spacing: 24) {
            Text("聪聪学堂").duoFont(.caption).foregroundStyle(DuoColors.successInk)
            MascotView(mood: .wave, size: 180, allowsTap: true)
                .padding(24)
                .background(DuoColors.primary.opacity(0.10), in: Circle())
            VStack(spacing: 12) {
                Text("你好，我是聪聪！").duoFont(.title).foregroundStyle(DuoColors.ink)
                Text("学习，从好奇心开始。")
                    .duoFont(.subhead).foregroundStyle(DuoColors.inkMuted)
                Text("跟着课本闯关，听一篇故事，\n把每一次小进步变成自己的收获。")
                    .duoFont(.body).foregroundStyle(DuoColors.inkMuted)
                    .multilineTextAlignment(.center).lineSpacing(5)
            }
            HStack(spacing: 20) {
                Label("小学全科", systemImage: "books.vertical.fill")
                Label("免费开源", systemImage: "heart.fill")
            }
            .duoFont(.caption).foregroundStyle(DuoColors.successInk)
        }
        .padding(.top, 24)
    }

    private var bookSelection: some View {
        VStack(alignment: .leading, spacing: 20) {
            LearningPageHeader(eyebrow: stepLabel, title: "从你的课本开始", subtitle: "先选年级，再选一本正在学的课本。以后随时可以更换。")
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 10), count: 3), spacing: 10) {
                ForEach(1...6, id: \.self) { grade in
                    Button {
                        HapticEngine.shared.tap()
                        selectedGrade = grade
                    } label: {
                        Text("\(grade) 年级").duoFont(.button)
                            .frame(maxWidth: .infinity, minHeight: 48)
                            .foregroundStyle(selectedGrade == grade ? DuoColors.successInk : DuoColors.inkMuted)
                            .background(selectedGrade == grade ? DuoColors.primary.opacity(0.14) : DuoColors.surface,
                                        in: RoundedRectangle(cornerRadius: Radius.control))
                            .overlay { RoundedRectangle(cornerRadius: Radius.control).strokeBorder(selectedGrade == grade ? DuoColors.primary : DuoColors.border, lineWidth: 2) }
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(selectedGrade == grade ? [.isSelected] : [])
                }
            }
            ForEach(booksForGrade, id: \.id) { book in
                bookRow(book)
            }
            if booksForGrade.isEmpty {
                Text("这个年级暂无课本，可以先选其他年级。")
                    .duoFont(.body).foregroundStyle(DuoColors.inkMuted)
            }
        }
    }

    private func bookRow(_ book: Book) -> some View {
        let selected = selectedBookId == book.id
        let subject = Subjects.resolve(book: book)
        return Button {
            HapticEngine.shared.tap()
            selectedBookId = book.id
        } label: {
            HStack(spacing: 12) {
                Text(subject.label).duoFont(.caption)
                    .foregroundStyle(DuoColors.ink)
                    .frame(width: 48, height: 48)
                    .background(subject.accent.opacity(0.16), in: RoundedRectangle(cornerRadius: 14))
                VStack(alignment: .leading, spacing: 5) {
                    Text(book.fullName).duoFont(.subhead).foregroundStyle(DuoColors.ink)
                        .multilineTextAlignment(.leading)
                    Text("\(book.unitsCount) 单元 · \(book.lessonsCount) 节小课")
                        .duoFont(.caption).foregroundStyle(DuoColors.inkMuted)
                }.frame(maxWidth: .infinity, alignment: .leading)
                Image(systemName: selected ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 24, weight: .semibold))
                    .foregroundStyle(selected ? DuoColors.successInk : DuoColors.border)
            }
            .learningCard(tint: selected ? DuoColors.primary : nil)
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("onboarding-book-\(book.id)")
        .accessibilityAddTraits(selected ? [.isSelected] : [])
    }

    private var goalSelection: some View {
        VStack(spacing: 20) {
            LearningPageHeader(eyebrow: stepLabel, title: "每天，进步一点点", subtitle: "选一个轻松坚持的经验目标。目标可以在个人中心调整。", mood: .proud)
            ForEach(goals, id: \.xp) { goal in
                Button {
                    HapticEngine.shared.tap()
                    selectedGoal = goal.xp
                } label: {
                    HStack(spacing: 12) {
                        Image(systemName: selectedGoal == goal.xp ? "checkmark.circle.fill" : "circle")
                            .font(.system(size: 24, weight: .semibold))
                            .foregroundStyle(selectedGoal == goal.xp ? DuoColors.successInk : DuoColors.border)
                        VStack(alignment: .leading, spacing: 5) {
                            Text(goal.label).duoFont(.subhead).foregroundStyle(DuoColors.ink)
                            Text(goal.sub).duoFont(.caption).foregroundStyle(DuoColors.inkMuted)
                        }.frame(maxWidth: .infinity, alignment: .leading)
                        Text("\(goal.xp) XP").duoNumeral(.caption).foregroundStyle(DuoColors.linkInk)
                    }
                    .learningCard(tint: selectedGoal == goal.xp ? DuoColors.primary : nil)
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(selectedGoal == goal.xp ? [.isSelected] : [])
            }
        }
    }

    private var notificationPrimer: some View {
        VStack(spacing: 24) {
            MascotView(mood: .wave, size: 160).padding(.top, 32)
            Text("需要一声温柔的提醒吗？").duoFont(.title).foregroundStyle(DuoColors.ink)
            Text("每天最多一条，学过就不打扰。\n你可以随时在设置里关闭提醒。")
                .duoFont(.body).foregroundStyle(DuoColors.inkMuted)
                .multilineTextAlignment(.center).lineSpacing(6)
            Label("由你决定，现在跳过也没关系", systemImage: "bell.badge")
                .duoFont(.caption).foregroundStyle(DuoColors.linkInk)
        }
        .multilineTextAlignment(.center)
    }

    private var footer: some View {
        VStack(spacing: 10) {
            if step == 3 {
                Button(requestingAuth ? "正在开启…" : "开启学习提醒") { requestReminder() }
                    .buttonStyle(ChunkyButtonStyle(.primary))
                    .disabled(requestingAuth)
                    .accessibilityIdentifier("onboarding-notify-yes")
                Button("暂时不用，开始学习") { finish() }
                    .buttonStyle(ChunkyButtonStyle(.ghost))
                    .disabled(requestingAuth)
                    .accessibilityIdentifier("onboarding-notify-later")
            } else {
                Button(step == 0 ? "和聪聪一起出发" : "继续") { advance() }
                    .buttonStyle(ChunkyButtonStyle(step == 1 && selectedBookId == nil ? .disabled : .primary))
                    .disabled(step == 1 && selectedBookId == nil)
                    .accessibilityIdentifier("onboarding-continue")
            }
        }
        .frame(maxWidth: LearningLayout.contentWidth - 40)
        .padding(20)
        .frame(maxWidth: .infinity)
        .background(DuoColors.bg)
        .overlay(alignment: .top) { Divider().overlay(DuoColors.border) }
    }

    private func advance() {
        if step == 1 {
            guard let id = selectedBookId, booksForGrade.contains(where: { $0.id == id }) else { return }
            progressStore.setSelectedGrade(selectedGrade)
            progressStore.setActiveBook(id)
        }
        if step == 2 { progressStore.setDailyGoal(selectedGoal) }
        HapticEngine.shared.tap()
        withAnimation(reduceMotion ? nil : Motion.reveal) { step += 1 }
    }

    private func requestReminder() {
        guard !requestingAuth else { return }
        requestingAuth = true
        Task {
            if await NotificationService.shared.requestAuthorization() {
                SettingsStore.shared.streakReminderEnabled = true
                NotificationService.shared.rescheduleStreakReminder(streak: progressStore.reminderStreak, studiedToday: progressStore.studiedToday)
            }
            finish()
        }
    }

    private func finish() {
        progressStore.completeOnboarding()
        onDone()
    }
}
