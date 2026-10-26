import SwiftUI
import UIKit

/// A local parental gate for leaving the learning flow or requesting a system
/// permission. It does not collect age, identity, or the entered answer.
struct ParentalChallenge {
    let first: Int
    let second: Int
    let extra: Int

    init(
        first: Int = Int.random(in: 31...79), second: Int = Int.random(in: 12...29),
        extra: Int = Int.random(in: 11...59)
    ) {
        self.first = first
        self.second = second
        self.extra = extra
    }

    var prompt: String { "请计算：\(first) × \(second) + \(extra)" }
    func accepts(_ input: String) -> Bool {
        Int(input.trimmingCharacters(in: .whitespacesAndNewlines)) == first * second + extra
    }
}

struct ParentalApprovalView: View {
    let reason: String
    let onApprove: () -> Void
    let onCancel: () -> Void
    @State private var challenge = ParentalChallenge()
    @State private var answer = ""
    @State private var showError = false
    @FocusState private var focused: Bool

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                Image(systemName: "lock.shield.fill")
                    .font(.system(size: 48)).foregroundStyle(DuoColors.secondary)
                    .accessibilityHidden(true)
                Text("请家长帮忙确认").duoFont(.title).foregroundStyle(DuoColors.ink)
                Text(reason).duoFont(.body).foregroundStyle(DuoColors.inkMuted)
                Text(challenge.prompt).duoFont(.heading).foregroundStyle(DuoColors.ink)
                    .accessibilityIdentifier("parental-challenge")
                TextField("输入计算结果", text: $answer)
                    .keyboardType(.numberPad).focused($focused)
                    .duoNumeral(.heading).multilineTextAlignment(.center)
                    .padding(16).background(DuoColors.surfaceAlt, in: .rect(cornerRadius: Radius.control))
                    .overlay {
                        RoundedRectangle(cornerRadius: Radius.control).strokeBorder(DuoColors.border, lineWidth: 2)
                    }
                    .accessibilityIdentifier("parental-answer")
                if showError {
                    Text("结果不对，请家长重新算一算。").duoFont(.caption).foregroundStyle(DuoColors.errorInk)
                        .accessibilityIdentifier("parental-error")
                }
                Text("验证仅在这台设备上进行，不保存输入内容。").duoFont(.caption).foregroundStyle(DuoColors.inkMuted)
            }.multilineTextAlignment(.center).learningContent()
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            LearningActionDock {
                VStack(spacing: 10) {
                    Button("确认并继续") {
                        if challenge.accepts(answer) {
                            focused = false
                            onApprove()
                        } else {
                            showError = true
                            answer = ""
                            challenge = ParentalChallenge()
                        }
                    }
                    .buttonStyle(ChunkyButtonStyle(answer.isEmpty ? .disabled : .primary))
                    .disabled(answer.isEmpty).accessibilityIdentifier("parental-confirm")
                    Button("取消", action: onCancel).buttonStyle(ChunkyButtonStyle(.ghost))
                        .accessibilityIdentifier("parental-cancel")
                }
            }
        }
        .background(DuoColors.bg.ignoresSafeArea())
        .presentationDetents([.large]).presentationDragIndicator(.visible)
    }
}

private struct ParentalApprovalModifier: ViewModifier {
    @Binding var isPresented: Bool
    let reason: String
    let onApprove: () -> Void
    @State private var approved = false

    func body(content: Content) -> some View {
        content.sheet(
            isPresented: $isPresented,
            onDismiss: {
                let proceed = approved
                approved = false
                if proceed { onApprove() }
            }
        ) {
            ParentalApprovalView(
                reason: reason,
                onApprove: {
                    approved = true
                    isPresented = false
                }, onCancel: { isPresented = false })
        }
    }
}

extension View {
    func parentalApproval(isPresented: Binding<Bool>, reason: String, onApprove: @escaping () -> Void) -> some View {
        modifier(ParentalApprovalModifier(isPresented: isPresented, reason: reason, onApprove: onApprove))
    }
}

enum ParentalShareFile {
    static func write(_ data: Data, filename: String) throws -> URL {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(
            "congcong-share-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let url = directory.appendingPathComponent((filename as NSString).lastPathComponent)
        try data.write(to: url, options: .atomic)
        return url
    }
}

/// Creates outbound files only after the parent has approved this action.
struct ParentalShareButton<Label: View>: View {
    let identifier: String
    let makeFile: () throws -> URL
    @ViewBuilder let label: () -> Label
    @State private var showApproval = false
    @State private var preparedShare: PreparedShare?
    @State private var file: URL?
    @State private var failed = false

    var body: some View {
        Button {
            showApproval = true
        } label: {
            label()
        }
        .accessibilityIdentifier(identifier)
        .parentalApproval(isPresented: $showApproval, reason: "分享会打开系统分享菜单，请家长确认文件内容与接收方。") {
            do {
                let url = try makeFile()
                file = url
                preparedShare = PreparedShare(url: url)
            } catch { failed = true }
        }
        .sheet(item: $preparedShare, onDismiss: cleanup) { share in
            ParentalActivitySheet(file: share.url) { preparedShare = nil }
        }
        .alert("暂时无法准备分享", isPresented: $failed) { Button("知道了", role: .cancel) {} }
    }

    private func cleanup() {
        if let file {
            let directory = file.deletingLastPathComponent().standardizedFileURL
            if directory.lastPathComponent.hasPrefix("congcong-share-"),
                directory.deletingLastPathComponent() == FileManager.default.temporaryDirectory.standardizedFileURL
            {
                try? FileManager.default.removeItem(at: directory)
            }
        }
        file = nil
    }
}

private struct PreparedShare: Identifiable {
    let id = UUID()
    let url: URL
}

private struct ParentalActivitySheet: UIViewControllerRepresentable {
    let file: URL
    let onComplete: () -> Void
    func makeUIViewController(context: Context) -> UIActivityViewController {
        let controller = UIActivityViewController(activityItems: [file], applicationActivities: nil)
        controller.completionWithItemsHandler = { _, _, _, _ in onComplete() }
        return controller
    }
    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}
