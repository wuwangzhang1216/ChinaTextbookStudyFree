import SwiftUI
import UniformTypeIdentifiers

/// 分享卡（Wave E2）—— 纯本地渲染，ImageRenderer 出图 + ShareLink 分享。
///
/// 两款版式：
///   1. 连胜卡：白底亮色 + 聪聪 + 大火焰数字 + 本周 7 格日历 + slogan；
///   2. 成就 / 三星卡：徽章 + 课程名 / 成就名。
///
/// 挂点：连胜里程碑庆祝层、结算三星幕、成就领取时刻。
enum ShareCard {

    static let slogan = "每天进步一点点 · 聪聪学堂"
    /// 出图逻辑尺寸（@3x 渲染）。
    static let size = CGSize(width: 360, height: 480)

    /// 连胜卡数据。
    struct StreakData {
        let streak: Int
        /// 本周 7 天（**周一 → 周日**，parity-6 的日历周），是否学习过。
        let week: [(dateKey: String, studied: Bool)]
        /// 今天在这 7 格里的下标（周一=0 … 周日=6），传 `ProgressStore.todayIndexInWeek()`；
        /// 越界则不标「今」。绝不能假设「最后一格 = 今天」。
        let todayIndex: Int
    }

    /// 成就 / 三星卡数据。
    struct BadgeData {
        let icon: String        // SF Symbol
        let tint: Color
        let headline: String    // e.g. "三星通关！" / "成就解锁！"
        let title: String       // 课程名 / 成就名
        let subtitle: String    // e.g. "正确率 100%" / 成就描述
    }

    /// 渲染一张卡为 UIImage（@3x）。必须在主线程调用（ImageRenderer 要求）。
    @MainActor
    static func render<V: View>(_ view: V) -> UIImage? {
        let renderer = ImageRenderer(content: view.frame(width: size.width, height: size.height))
        renderer.scale = 3
        renderer.isOpaque = true
        return renderer.uiImage
    }

    @MainActor
    static func renderStreak(_ data: StreakData) -> UIImage? {
        render(StreakShareCardView(data: data))
    }

    @MainActor
    static func renderBadge(_ data: BadgeData) -> UIImage? {
        render(BadgeShareCardView(data: data))
    }
}

/// ShareLink 载荷：PNG 数据 + 文件名。
struct ShareCardImage: Transferable {
    let image: UIImage
    let filename: String

    static var transferRepresentation: some TransferRepresentation {
        FileRepresentation(exportedContentType: .png) { card in
            let url = FileManager.default.temporaryDirectory
                .appendingPathComponent(card.filename)
            try (card.image.pngData() ?? Data()).write(to: url, options: .atomic)
            return SentTransferredFile(url)
        }
    }
}

/// 分享按钮：拿到已渲染好的卡即插即用（挂点共用）。
struct ShareCardLink: View {
    let image: UIImage
    let filename: String
    let previewTitle: String
    var label: String = "分享"

    var body: some View {
        ShareLink(
            item: ShareCardImage(image: image, filename: filename),
            preview: SharePreview(previewTitle, image: Image(uiImage: image))
        ) {
            HStack(spacing: 6) {
                Image(systemName: "square.and.arrow.up")
                    .font(.system(size: 14, weight: .heavy))
                Text(label)
                    .duoFont(.caption)
            }
        }
        .buttonStyle(ChunkyButtonStyle(.ghost))
        .accessibilityIdentifier("share-card-link")
    }
}

// ============================================================
// 版式 1：连胜卡（白底亮色）
// ============================================================

struct StreakShareCardView: View {
    let data: ShareCard.StreakData

    private static let weekdaySymbols = ["日", "一", "二", "三", "四", "五", "六"]

    private func weekdayLabel(_ dateKey: String) -> String {
        guard let date = SRS.dateFormatter.date(from: dateKey) else { return "·" }
        let weekday = Calendar.current.component(.weekday, from: date)
        return Self.weekdaySymbols[(weekday - 1) % 7]
    }

    var body: some View {
        ZStack {
            DuoColors.snow

            VStack(spacing: 14) {
                MascotView(mood: .cheer, size: 96)
                    .padding(.top, 26)

                HStack(alignment: .center, spacing: 8) {
                    Image(systemName: "flame.fill")
                        .font(.system(size: 52, weight: .heavy))
                        .foregroundStyle(DuoColors.bee)
                    Text("\(data.streak)")
                        .font(.system(size: 88, weight: .bold, design: .rounded))
                        .foregroundStyle(DuoColors.eel)
                        .monospacedDigit()
                }

                Text("天连胜！")
                    .font(.system(size: 26, weight: .bold, design: .rounded))
                    .foregroundStyle(DuoColors.eel)

                // 本周 7 格日历
                HStack(spacing: 8) {
                    ForEach(Array(data.week.enumerated()), id: \.offset) { i, day in
                        let isToday = i == data.todayIndex
                        VStack(spacing: 5) {
                            Text(isToday ? "今" : weekdayLabel(day.dateKey))
                                .font(.system(size: 11, weight: .bold, design: .rounded))
                                .foregroundStyle(DuoColors.wolf)
                            ZStack {
                                Circle()
                                    .fill(day.studied ? DuoColors.fox : DuoColors.swan)
                                    .frame(width: 30, height: 30)
                                if day.studied {
                                    Image(systemName: "flame.fill")
                                        .font(.system(size: 13, weight: .heavy))
                                        .foregroundStyle(.white)
                                }
                            }
                        }
                    }
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 12)
                .background(DuoColors.polar, in: .rect(cornerRadius: 16))

                Spacer()

                Text(ShareCard.slogan)
                    .font(.system(size: 14, weight: .bold, design: .rounded))
                    .foregroundStyle(DuoColors.wolf)
                    .padding(.bottom, 22)
            }
            .padding(.horizontal, 24)
        }
        .frame(width: ShareCard.size.width, height: ShareCard.size.height)
    }
}

// ============================================================
// 版式 2：成就 / 三星卡
// ============================================================

struct BadgeShareCardView: View {
    let data: ShareCard.BadgeData

    var body: some View {
        ZStack {
            DuoColors.snow

            VStack(spacing: 16) {
                MascotView(mood: .proud, size: 84)
                    .padding(.top, 26)

                ZStack {
                    Circle()
                        .fill(data.tint.opacity(0.14))
                        .frame(width: 116, height: 116)
                    Circle()
                        .strokeBorder(data.tint, lineWidth: 2)
                        .frame(width: 116, height: 116)
                    Image(systemName: data.icon)
                        .font(.system(size: 52, weight: .heavy))
                        .foregroundStyle(data.tint)
                }

                Text(data.headline)
                    .font(.system(size: 26, weight: .bold, design: .rounded))
                    .foregroundStyle(DuoColors.eel)

                Text(data.title)
                    .font(.system(size: 18, weight: .bold, design: .rounded))
                    .foregroundStyle(data.tint)
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
                    .padding(.horizontal, 28)

                Text(data.subtitle)
                    .font(.system(size: 14, weight: .bold, design: .rounded))
                    .foregroundStyle(DuoColors.wolf)
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
                    .padding(.horizontal, 28)

                Spacer()

                Text(ShareCard.slogan)
                    .font(.system(size: 14, weight: .bold, design: .rounded))
                    .foregroundStyle(DuoColors.wolf)
                    .padding(.bottom, 22)
            }
            .padding(.horizontal, 24)
        }
        .frame(width: ShareCard.size.width, height: ShareCard.size.height)
    }
}
