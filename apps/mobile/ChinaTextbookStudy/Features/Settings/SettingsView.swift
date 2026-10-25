import SwiftUI
import UniformTypeIdentifiers

/// App settings — appearance, sound & haptics, data, about.
struct SettingsView: View {
    @ObservedObject var progressStore: ProgressStore
    @ObservedObject private var settings = SettingsStore.shared
    @State private var showResetConfirm = false
    @State private var deniedHint = false

    // Wave E2: 存档备份 & 报错列表
    @State private var showImportPicker = false
    /// 已选中并通过校验、等待「覆盖确认」的信封。
    @State private var pendingImport: Backup.Envelope?
    @State private var importError: String?
    @State private var importedFlash = false
    @State private var showReports = false

    // iCloud 手动恢复（iosstore-6 兜底入口）
    /// 云端读到的那份档，等待「覆盖确认」。
    @State private var pendingCloudImport: Backup.Envelope?
    /// 云端没有备份 / 还没同步下来时的提示文案。
    @State private var cloudRestoreNote: String?

    private var appVersion: String {
        let v = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0"
        let b = Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "1"
        return "\(v) (\(b))"
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Space.xl) {
                appearanceSection
                reminderSection
                soundSection
                dataSection
                aboutSection
            }
            .learningContent()
        }
        .background(DuoColors.bg.ignoresSafeArea())
        .navigationTitle("设置")
        .navigationBarTitleDisplayMode(.inline)
        .confirmationDialog("确定要重置全部学习进度吗？此操作无法撤销。", isPresented: $showResetConfirm, titleVisibility: .visible) {
            Button("重置进度", role: .destructive) {
                progressStore.resetProgress()
                HapticEngine.shared.success()
            }
            Button("取消", role: .cancel) {}
        }
    }

    // MARK: - Appearance

    private var appearanceSection: some View {
        section("外观") {
            HStack(spacing: 8) {
                ForEach(AppAppearance.allCases) { mode in
                    let selected = settings.appearance == mode
                    Button {
                        HapticEngine.shared.tap()
                        withAnimation(Motion.press) { settings.appearance = mode }
                    } label: {
                        Text(mode.label)
                            .duoFont(.caption)
                            .foregroundStyle(selected ? .white : DuoColors.inkMuted)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                            .background(selected ? DuoColors.primary : DuoColors.surfaceAlt, in: .rect(cornerRadius: Radius.control))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    // MARK: - Streak reminder

    /// The learner's chosen fire time as a Date (today's calendar day — only
    /// the hour/minute components matter to the DatePicker).
    private var reminderTimeBinding: Binding<Date> {
        Binding(
            get: {
                Calendar.current.date(
                    bySettingHour: settings.reminderHour,
                    minute: settings.reminderMinute,
                    second: 0,
                    of: Date()
                ) ?? Date()
            },
            set: { picked in
                let parts = Calendar.current.dateComponents([.hour, .minute], from: picked)
                settings.reminderHour = parts.hour ?? SettingsStore.defaultReminderHour
                settings.reminderMinute = parts.minute ?? SettingsStore.defaultReminderMinute
                // Re-schedule the pending window onto the new time right away.
                NotificationService.shared.rescheduleStreakReminder(
                    streak: progressStore.reminderStreak,
                    studiedToday: progressStore.studiedToday
                )
            }
        )
    }

    private var reminderSection: some View {
        section("提醒") {
            VStack(alignment: .leading, spacing: 8) {
                toggleRow("连胜提醒", icon: "bell.badge.fill", tint: DuoColors.fox, isOn: Binding(
                    get: { settings.streakReminderEnabled },
                    set: { wanted in
                        if wanted {
                            Task {
                                let granted = await NotificationService.shared.requestAuthorization()
                                settings.streakReminderEnabled = granted
                                if granted {
                                    NotificationService.shared.rescheduleStreakReminder(
                                        streak: progressStore.reminderStreak,
                                        studiedToday: progressStore.studiedToday
                                    )
                                    HapticEngine.shared.success()
                                } else {
                                    deniedHint = true
                                }
                            }
                        } else {
                            settings.streakReminderEnabled = false
                            NotificationService.shared.cancel()
                        }
                    }
                ))
                if settings.streakReminderEnabled {
                    divider
                    HStack(spacing: 12) {
                        Image(systemName: "clock.fill")
                            .font(.system(size: 18, weight: .heavy))
                            .foregroundStyle(DuoColors.secondary)
                            .frame(width: 26)
                        Text("提醒时间").duoFont(.body).foregroundStyle(DuoColors.ink)
                        Spacer()
                        DatePicker("提醒时间", selection: reminderTimeBinding, displayedComponents: .hourAndMinute)
                            .labelsHidden()
                            .tint(DuoColors.primary)
                            .accessibilityIdentifier("reminder-time-picker")
                    }
                    .padding(.vertical, 8)
                }
                Text(deniedHint
                     ? "系统未授权通知，请到「设置 › 通知 › 聪聪学堂」中开启。"
                     : "每天 \(settings.reminderTimeLabel) 提醒你保住连胜；当天已学习则自动跳过。")
                    .duoFont(.micro)
                    .foregroundStyle(deniedHint ? DuoColors.danger : DuoColors.inkMuted)
                    .padding(.horizontal, 2)
                    .padding(.bottom, 10)
            }
            .padding(.horizontal, 14)
            .padding(.top, 4)
            .background(DuoColors.surface, in: .rect(cornerRadius: Radius.card))
            .overlay { RoundedRectangle(cornerRadius: Radius.card).strokeBorder(DuoColors.border, lineWidth: 2) }
        }
    }

    // MARK: - Sound & haptics

    private var soundSection: some View {
        section("声音与触感") {
            VStack(spacing: 0) {
                toggleRow("音效", icon: "speaker.wave.2.fill", tint: DuoColors.secondary, isOn: Binding(
                    get: { !settings.isMuted },
                    set: { settings.isMuted = !$0 }
                ))
                divider
                toggleRow("触感反馈", icon: "hand.tap.fill", tint: DuoColors.beetle, isOn: $settings.hapticEnabled)
                divider
                toggleRow("自动朗读", icon: "text.bubble.fill", tint: DuoColors.fox, isOn: $settings.autoNarrate)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 4)
            .background(DuoColors.surface, in: .rect(cornerRadius: Radius.card))
            .overlay { RoundedRectangle(cornerRadius: Radius.card).strokeBorder(DuoColors.border, lineWidth: 2) }
        }
    }

    private func toggleRow(_ title: String, icon: String, tint: Color, isOn: Binding<Bool>) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon).font(.system(size: 18, weight: .heavy)).foregroundStyle(tint).frame(width: 26)
            Text(title).duoFont(.body).foregroundStyle(DuoColors.ink)
            Spacer()
            Toggle("", isOn: isOn).labelsHidden().tint(DuoColors.primary)
        }
        .padding(.vertical, 12)
    }

    private var divider: some View {
        Rectangle().fill(DuoColors.border).frame(height: 1)
    }

    // MARK: - Data

    /// 导出文件名：课本学习备份-YYYY-MM-DD.json
    private var backupFilename: String {
        "课本学习备份-\(SRS.todayString()).json"
    }

    private var dataSection: some View {
        section("数据") {
            VStack(spacing: 0) {
                // 导出存档：ShareLink 临时 JSON 文件（分享时才落盘）。
                ShareLink(
                    item: BackupTransferFile(
                        json: (try? progressStore.exportBackupData()) ?? Data(),
                        filename: backupFilename
                    ),
                    preview: SharePreview(backupFilename)
                ) {
                    dataRow(icon: "square.and.arrow.up.fill", tint: DuoColors.primary, title: "导出存档",
                            subtitle: "保存一份 JSON 备份，网页版也能导入")
                }
                .accessibilityIdentifier("backup-export")

                divider

                Button {
                    importError = nil
                    showImportPicker = true
                } label: {
                    dataRow(icon: "square.and.arrow.down.fill", tint: DuoColors.secondary, title: "导入存档",
                            subtitle: importedFlash ? "导入成功！进度已更新 🎉" : "从备份文件恢复进度（会覆盖当前进度）")
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("backup-import")

                if let importError {
                    Text(importError)
                        .duoFont(.micro)
                        .foregroundStyle(DuoColors.danger)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.bottom, 10)
                }

                divider

                // 从 iCloud 恢复（iosstore-6）：换机时恢复弹窗依赖 iCloud 同步时序，
                // 没弹出来 / 手滑点了「暂不」的用户必须还有一条自己动手的路。
                Button { lookUpCloudBackup() } label: {
                    dataRow(icon: "icloud.and.arrow.down.fill", tint: DuoColors.beetle,
                            title: "从 iCloud 恢复存档",
                            subtitle: cloudRestoreNote ?? "换了新手机？把 iCloud 里的进度找回来（会覆盖当前进度）")
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("cloud-restore")

                divider

                // 已报告的问题（Wave E2 小旗子）。
                Button { showReports = true } label: {
                    dataRow(icon: "flag.fill", tint: DuoColors.fox, title: "已报告的问题",
                            subtitle: progressStore.reports.isEmpty
                                ? "还没有报告过题目问题"
                                : "共 \(progressStore.reports.count) 条 · 只保存在本机")
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("reports-list")

                divider

                Button(role: .destructive) { showResetConfirm = true } label: {
                    dataRow(icon: "trash.fill", tint: DuoColors.danger, title: "重置学习进度",
                            subtitle: "建议先导出备份", titleColor: DuoColors.danger)
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 4)
            .background(DuoColors.surface, in: .rect(cornerRadius: Radius.card))
            .overlay { RoundedRectangle(cornerRadius: Radius.card).strokeBorder(DuoColors.border, lineWidth: 2) }
        }
        .fileImporter(
            isPresented: $showImportPicker,
            allowedContentTypes: [.json, .plainText],
            allowsMultipleSelection: false
        ) { result in
            handleImportPick(result)
        }
        .confirmationDialog(
            "导入将覆盖当前进度，建议先导出备份。确定要导入吗？",
            isPresented: Binding(
                get: { pendingImport != nil },
                set: { if !$0 { pendingImport = nil } }
            ),
            titleVisibility: .visible
        ) {
            Button("覆盖并导入", role: .destructive) { confirmImport() }
            Button("取消", role: .cancel) { pendingImport = nil }
        }
        .confirmationDialog(
            pendingCloudImport.map(cloudBackupSummary) ?? "",
            isPresented: Binding(
                get: { pendingCloudImport != nil },
                set: { if !$0 { pendingCloudImport = nil } }
            ),
            titleVisibility: .visible
        ) {
            Button("恢复并覆盖", role: .destructive) { confirmCloudRestore() }
            Button("取消", role: .cancel) { pendingCloudImport = nil }
        }
        .sheet(isPresented: $showReports) {
            ReportsListSheet(progressStore: progressStore)
        }
    }

    private func dataRow(
        icon: String,
        tint: Color,
        title: String,
        subtitle: String,
        titleColor: Color = DuoColors.ink
    ) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 17, weight: .heavy))
                .foregroundStyle(tint)
                .frame(width: 26)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).duoFont(.body).foregroundStyle(titleColor)
                Text(subtitle).duoFont(.micro).foregroundStyle(DuoColors.inkMuted)
            }
            Spacer()
            Image(systemName: "chevron.right")
                .font(.system(size: 13, weight: .heavy))
                .foregroundStyle(DuoColors.inkSofter)
        }
        .padding(.vertical, 12)
        .contentShape(Rectangle())
    }

    private func handleImportPick(_ result: Result<[URL], Error>) {
        guard case .success(let urls) = result, let url = urls.first else { return }
        let secured = url.startAccessingSecurityScopedResource()
        defer { if secured { url.stopAccessingSecurityScopedResource() } }
        guard let data = try? Data(contentsOf: url) else {
            importError = "读取文件失败，请重试"
            return
        }
        switch Backup.validate(data) {
        case .success(let envelope):
            importError = nil
            pendingImport = envelope
        case .failure(let error):
            importError = error.errorDescription ?? "备份文件无法识别"
        }
    }

    // MARK: - 从 iCloud 恢复（iosstore-6）

    /// 读一次 iCloud 备份：有就弹「覆盖确认」，没有 / 还没同步好就给一句人话。
    private func lookUpCloudBackup() {
        cloudRestoreNote = nil
        switch progressStore.cloudRead() {
        case .archive(let envelope):
            pendingCloudImport = envelope
        case .empty:
            cloudRestoreNote = "iCloud 里还没有备份，先在旧手机上打开一次应用试试"
        case .unknown:
            // 「读不到」不等于「没有」：KVS 首次下载是异步的。
            cloudRestoreNote = "iCloud 还在同步，过一会儿再点一次～"
        }
    }

    /// 覆盖确认里给孩子看的进度摘要。
    private func cloudBackupSummary(_ envelope: Backup.Envelope) -> String {
        let lessons = envelope.data.completedLessons.count
        let day = String(envelope.exportedAt.prefix(10))
        let when = day.isEmpty ? "" : " · 备份于 \(day)"
        return "找到 iCloud 存档：\(envelope.data.xp) 经验值 · \(lessons) 节课\(when)。恢复会覆盖这台设备上的进度，确定吗？"
    }

    private func confirmCloudRestore() {
        guard let envelope = pendingCloudImport else { return }
        progressStore.applyCloudRestore(envelope)   // 内部已做全量刷新
        pendingCloudImport = nil
        cloudRestoreNote = "恢复成功！进度已经回来啦 🎉"
        HapticEngine.shared.success()
        SFXEngine.shared.play(.unlock)
    }

    private func confirmImport() {
        guard let envelope = pendingImport else { return }
        progressStore.importBackup(envelope)
        progressStore.refreshForNow()   // 全量刷新（红心 / 日界 / 联赛 / 提醒）
        pendingImport = nil
        importedFlash = true
        HapticEngine.shared.success()
        SFXEngine.shared.play(.unlock)
        DispatchQueue.main.asyncAfter(deadline: .now() + 3) { importedFlash = false }
    }

    // MARK: - About

    private var aboutSection: some View {
        section("关于") {
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Text("版本").duoFont(.body).foregroundStyle(DuoColors.ink)
                    Spacer()
                    Text(appVersion).duoFont(.caption).foregroundStyle(DuoColors.inkMuted)
                }
                Text("教材内容版权归原出版方所有，客户端代码 MIT 开源。")
                    .duoFont(.micro)
                    .foregroundStyle(DuoColors.inkMuted)
            }
            .padding(16)
            .background(DuoColors.surface, in: .rect(cornerRadius: Radius.card))
            .overlay { RoundedRectangle(cornerRadius: Radius.card).strokeBorder(DuoColors.border, lineWidth: 2) }
        }
    }

    // MARK: - Section wrapper

    private func section<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title).duoFont(.caption).tracking(1).foregroundStyle(DuoColors.inkMuted)
            content()
        }
    }
}

// MARK: - 备份导出载荷（Wave E2）

/// ShareLink 载荷：分享那一刻才把 JSON 落到临时文件（带友好文件名）。
struct BackupTransferFile: Transferable {
    let json: Data
    let filename: String

    static var transferRepresentation: some TransferRepresentation {
        FileRepresentation(exportedContentType: .json) { file in
            let url = FileManager.default.temporaryDirectory
                .appendingPathComponent(file.filename)
            try file.json.write(to: url, options: .atomic)
            return SentTransferredFile(url)
        }
    }
}

// MARK: - 已报告的问题（Wave E2 小旗子）

/// 报错列表弹层：查看 + 一键导出 JSON（ShareLink）。纯本地数据。
struct ReportsListSheet: View {
    @ObservedObject var progressStore: ProgressStore
    @Environment(\.dismiss) private var dismiss

    private static let displayFormatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "zh_CN")
        f.dateFormat = "M月d日 HH:mm"
        return f
    }()

    private func dateLabel(_ iso: String) -> String {
        guard let date = ISO8601DateFormatter().date(from: iso) else { return iso }
        return Self.displayFormatter.string(from: date)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Text("已报告的问题")
                    .duoFont(.heading)
                    .foregroundStyle(DuoColors.ink)
                Spacer()
                if !progressStore.reports.isEmpty,
                   let data = try? progressStore.exportReportsData() {
                    ShareLink(
                        item: BackupTransferFile(
                            json: data,
                            filename: "题目报错-\(SRS.todayString()).json"
                        ),
                        preview: SharePreview("题目报错列表")
                    ) {
                        HStack(spacing: 5) {
                            Image(systemName: "square.and.arrow.up")
                                .font(.system(size: 13, weight: .heavy))
                            Text("导出")
                                .duoFont(.caption)
                        }
                        .foregroundStyle(DuoColors.primary)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 7)
                        .background(DuoColors.primary.opacity(0.12), in: .capsule)
                    }
                    .accessibilityIdentifier("reports-export")
                }
            }
            .padding(.top, 18)

            Text("这些反馈只保存在这台设备上，不会上传。")
                .duoFont(.micro)
                .foregroundStyle(DuoColors.inkMuted)

            if progressStore.reports.isEmpty {
                VStack(spacing: 10) {
                    MascotView(mood: .happy, size: 80)
                    Text("还没有报告过问题")
                        .duoFont(.caption)
                        .foregroundStyle(DuoColors.inkMuted)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 30)
            } else {
                ScrollView {
                    VStack(spacing: 10) {
                        ForEach(progressStore.reports.reversed()) { report in
                            HStack(alignment: .top, spacing: 10) {
                                Image(systemName: report.kind.symbol)
                                    .font(.system(size: 16, weight: .heavy))
                                    .foregroundStyle(DuoColors.fox)
                                    .frame(width: 24)
                                    .padding(.top, 2)
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(report.kind.label)
                                        .duoFont(.subhead)
                                        .foregroundStyle(DuoColors.ink)
                                    if let text = report.questionText, !text.isEmpty {
                                        Text(MathText.render(text))
                                            .duoFont(.caption)
                                            .foregroundStyle(DuoColors.inkMuted)
                                            .lineLimit(2)
                                    }
                                    Text("\(report.lessonId) · 第 \(report.questionId) 题 · \(dateLabel(report.createdAt))")
                                        .duoFont(.micro)
                                        .foregroundStyle(DuoColors.inkMuted)
                                }
                                Spacer(minLength: 0)
                            }
                            .padding(12)
                            .background(DuoColors.surface, in: .rect(cornerRadius: Radius.card))
                            .overlay {
                                RoundedRectangle(cornerRadius: Radius.card)
                                    .strokeBorder(DuoColors.border, lineWidth: 2)
                            }
                        }
                    }
                    .padding(.bottom, 12)
                }
            }

        }
        .padding(.horizontal, 20)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .safeAreaInset(edge: .bottom, spacing: 0) {
            LearningActionDock {
                Button("知道了") { dismiss() }.buttonStyle(ChunkyButtonStyle(.primary))
                    .accessibilityIdentifier("dock-dismiss")
            }
        }
        .background(DuoColors.bg)
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }
}
