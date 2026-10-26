import SwiftUI

struct AppPrivacyPolicy: Decodable {
    struct Section: Decodable {
        let title: String
        let text: String
    }
    let title: String
    let updated: String
    let owner: String
    let website: URL
    let support: URL
    let sections: [Section]

    static func bundled() throws -> AppPrivacyPolicy {
        guard let url = Bundle.main.url(forResource: "privacy-policy", withExtension: "json") else {
            throw CocoaError(.fileNoSuchFile)
        }
        return try JSONDecoder().decode(Self.self, from: Data(contentsOf: url))
    }
}

struct PrivacyPolicyView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    @State private var showOnlineApproval = false
    private let policy = try? AppPrivacyPolicy.bundled()

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                if let policy {
                    Text(policy.title).duoFont(.heading).foregroundStyle(DuoColors.ink)
                    Text("更新：\(policy.updated) · \(policy.owner)").duoFont(.caption).foregroundStyle(DuoColors.inkMuted)
                    ForEach(policy.sections, id: \.title) { section in
                        VStack(alignment: .leading, spacing: 10) {
                            Text(section.title).duoFont(.subhead).foregroundStyle(DuoColors.ink)
                            Text(section.text).duoFont(.body).foregroundStyle(DuoColors.inkMuted)
                                .fixedSize(horizontal: false, vertical: true)
                        }.learningCard()
                    }
                } else {
                    Text("隐私说明暂时无法打开，请稍后重试。").duoFont(.body)
                }
            }.learningContent()
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            LearningActionDock {
                VStack(spacing: 10) {
                    Button("关闭") { dismiss() }.buttonStyle(ChunkyButtonStyle(.primary))
                        .accessibilityIdentifier("privacy-close")
                    if policy != nil {
                        Button("在线政策与家长支持") { showOnlineApproval = true }
                            .buttonStyle(ChunkyButtonStyle(.ghost)).accessibilityIdentifier("privacy-online")
                    }
                }
            }
        }
        .navigationTitle("隐私政策").navigationBarTitleDisplayMode(.inline)
        .background(DuoColors.bg.ignoresSafeArea())
        .parentalApproval(isPresented: $showOnlineApproval, reason: "即将打开浏览器查看隐私政策与支持页面，请家长继续操作。") {
            if let policy { openURL(policy.website) }
        }
    }
}
