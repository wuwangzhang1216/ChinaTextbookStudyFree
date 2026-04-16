import SwiftUI

/// Cosmetic catalog — port of packages/core/src/cosmetics.ts.
/// All items are unlockable through in-game gems. No premium-only items.

enum CosmeticType: String, Codable, Hashable {
    case mascotSkin = "mascot_skin"
    case uiTheme = "ui_theme"
    case lessonBackdrop = "lesson_backdrop"
}

enum CosmeticRarity: String, Codable, Hashable {
    case common, rare, epic, legendary

    var label: String {
        switch self {
        case .common: return "普通"
        case .rare: return "稀有"
        case .epic: return "史诗"
        case .legendary: return "传说"
        }
    }

    var color: Color {
        switch self {
        case .common:    return Color(red: 0.612, green: 0.639, blue: 0.686) // #9CA3AF
        case .rare:      return Color(red: 0.110, green: 0.690, blue: 0.965) // #1CB0F6
        case .epic:      return Color(red: 0.659, green: 0.333, blue: 0.969) // #A855F7
        case .legendary: return Color(red: 1.000, green: 0.784, blue: 0.000) // #FFC800
        }
    }
}

struct CosmeticItem: Identifiable, Hashable {
    let id: String
    let type: CosmeticType
    let name: String
    let description: String
    let cost: Int
    let rarity: CosmeticRarity
    let starter: Bool
}

struct UiThemeData: Hashable {
    let primary: Color
    let primaryDark: Color
    let accent: Color
    let bg: Color
    let isDark: Bool
}

struct LessonBackdropData: Hashable {
    /// SwiftUI gradient stops. Empty → solid `bg`.
    let stops: [Color]
    let bg: Color
    let needsOverlay: Bool
}

enum Cosmetics {
    static let mascotSkins: [CosmeticItem] = [
        .init(id: "skin_default",    type: .mascotSkin, name: "原版聪聪",    description: "我们最熟悉的小猫头鹰",       cost: 0,   rarity: .common,    starter: true),
        .init(id: "skin_graduate",   type: .mascotSkin, name: "学士帽",      description: "戴上学士帽的聪聪，学者气质满分", cost: 80,  rarity: .common,    starter: false),
        .init(id: "skin_glasses",    type: .mascotSkin, name: "圆框眼镜",    description: "复古圆框眼镜，文艺青年聪聪",   cost: 100, rarity: .common,    starter: false),
        .init(id: "skin_party",      type: .mascotSkin, name: "派对锥帽",    description: "彩虹色派对帽，每天都是节日",   cost: 150, rarity: .rare,      starter: false),
        .init(id: "skin_crown",      type: .mascotSkin, name: "金色皇冠",    description: "学习路上的小国王/小女王",     cost: 250, rarity: .rare,      starter: false),
        .init(id: "skin_wizard",     type: .mascotSkin, name: "法师尖帽",    description: "知识就是魔法",                cost: 300, rarity: .epic,      starter: false),
        .init(id: "skin_astronaut",  type: .mascotSkin, name: "宇航员头盔",  description: "向知识的宇宙出发！",          cost: 500, rarity: .legendary, starter: false),
        .init(id: "skin_sunglasses", type: .mascotSkin, name: "酷炫墨镜",    description: "Cool 到没朋友的墨镜聪聪",      cost: 120, rarity: .common,    starter: false),
        .init(id: "skin_pirate",     type: .mascotSkin, name: "海盗船长",    description: "扬帆出海寻知识宝藏",          cost: 220, rarity: .rare,      starter: false),
        .init(id: "skin_headphones", type: .mascotSkin, name: "DJ 耳机",     description: "戴上耳机就能听见学习节奏",     cost: 180, rarity: .rare,      starter: false),
        .init(id: "skin_laurel",     type: .mascotSkin, name: "桂冠加身",    description: "胜利者才能戴的金色桂冠",       cost: 280, rarity: .epic,      starter: false),
        .init(id: "skin_bowtie",     type: .mascotSkin, name: "绅士领结",    description: "戴上领结就是优雅的小学者",     cost: 60,  rarity: .common,    starter: false),
    ]

    static let uiThemes: [(item: CosmeticItem, data: UiThemeData)] = [
        (.init(id: "theme_default",   type: .uiTheme, name: "Duolingo 绿", description: "经典清爽的草地绿",               cost: 0,   rarity: .common,    starter: true),
         UiThemeData(primary: hex(0x58CC02), primaryDark: hex(0x58A700), accent: hex(0x1CB0F6), bg: hex(0xF7F7F7), isDark: false)),
        (.init(id: "theme_ocean",     type: .uiTheme, name: "海洋蓝",       description: "像在大海里学习",                cost: 200, rarity: .common,    starter: false),
         UiThemeData(primary: hex(0x1CB0F6), primaryDark: hex(0x1899D6), accent: hex(0x58CC02), bg: hex(0xEFF8FE), isDark: false)),
        (.init(id: "theme_sakura",    type: .uiTheme, name: "樱花粉",       description: "粉嫩可爱的春天",                cost: 200, rarity: .common,    starter: false),
         UiThemeData(primary: hex(0xFF7AB6), primaryDark: hex(0xE5588E), accent: hex(0xFFC800), bg: hex(0xFDF3F8), isDark: false)),
        (.init(id: "theme_sunshine",  type: .uiTheme, name: "阳光黄",       description: "充满活力的金色",                cost: 250, rarity: .rare,      starter: false),
         UiThemeData(primary: hex(0xFFB200), primaryDark: hex(0xE59800), accent: hex(0xFF6B6B), bg: hex(0xFFF9E8), isDark: false)),
        (.init(id: "theme_galaxy",    type: .uiTheme, name: "星空紫",       description: "深邃神秘的宇宙紫",              cost: 400, rarity: .epic,      starter: false),
         UiThemeData(primary: hex(0xA855F7), primaryDark: hex(0x7C3AED), accent: hex(0xFFC800), bg: hex(0xF5EEFF), isDark: false)),
        (.init(id: "theme_mint",      type: .uiTheme, name: "薄荷青",       description: "清新提神的薄荷青绿",            cost: 220, rarity: .common,    starter: false),
         UiThemeData(primary: hex(0x10B981), primaryDark: hex(0x059669), accent: hex(0xFBBF24), bg: hex(0xECFDF5), isDark: false)),
        (.init(id: "theme_coral",     type: .uiTheme, name: "珊瑚红",       description: "温暖热情的活力珊瑚",            cost: 300, rarity: .rare,      starter: false),
         UiThemeData(primary: hex(0xFF6B6B), primaryDark: hex(0xE5484D), accent: hex(0x1CB0F6), bg: hex(0xFFF4F4), isDark: false)),
        (.init(id: "theme_aurora",    type: .uiTheme, name: "极光",         description: "梦幻的北极极光蓝绿",            cost: 500, rarity: .legendary, starter: false),
         UiThemeData(primary: hex(0x22D3EE), primaryDark: hex(0x0891B2), accent: hex(0xA855F7), bg: hex(0xECFEFF), isDark: false)),
        (.init(id: "theme_midnight",  type: .uiTheme, name: "暗夜模式",     description: "护眼的深色界面，傍晚学习不刺眼", cost: 350, rarity: .epic,      starter: false),
         UiThemeData(primary: hex(0x58CC02), primaryDark: hex(0x3B9A00), accent: hex(0x1CB0F6), bg: hex(0x0F1419), isDark: true)),
        (.init(id: "theme_obsidian",  type: .uiTheme, name: "曜石黑",       description: "极简纯黑配霓虹蓝，潮酷十足",    cost: 480, rarity: .legendary, starter: false),
         UiThemeData(primary: hex(0x1CB0F6), primaryDark: hex(0x0E7FB8), accent: hex(0xA855F7), bg: hex(0x08090C), isDark: true)),
    ]

    static let lessonBackdrops: [(item: CosmeticItem, data: LessonBackdropData)] = [
        (.init(id: "backdrop_default",   type: .lessonBackdrop, name: "干净简洁",   description: "默认的纯净背景",     cost: 0,   rarity: .common,    starter: true),
         LessonBackdropData(stops: [], bg: hex(0xF7F7F7), needsOverlay: false)),
        (.init(id: "backdrop_clouds",    type: .lessonBackdrop, name: "蓝天白云",   description: "在云朵里学习",       cost: 120, rarity: .common,    starter: false),
         LessonBackdropData(stops: [hex(0xBFE3F7), hex(0xE6F3FB), .white], bg: hex(0xE6F3FB), needsOverlay: false)),
        (.init(id: "backdrop_forest",    type: .lessonBackdrop, name: "森林晨光",   description: "清晨的森林透着阳光", cost: 150, rarity: .common,    starter: false),
         LessonBackdropData(stops: [hex(0xD7F0CF), hex(0xEDF8E5), .white], bg: hex(0xEDF8E5), needsOverlay: false)),
        (.init(id: "backdrop_sunset",    type: .lessonBackdrop, name: "黄昏彩霞",   description: "傍晚的天空是橘粉色", cost: 200, rarity: .rare,      starter: false),
         LessonBackdropData(stops: [hex(0xFFD7B3), hex(0xFFE9D6), .white], bg: hex(0xFFE9D6), needsOverlay: false)),
        (.init(id: "backdrop_starfield", type: .lessonBackdrop, name: "星空夜",     description: "深邃的紫色星空",     cost: 350, rarity: .epic,      starter: false),
         LessonBackdropData(stops: [hex(0x2A1B5C), hex(0x1A0F3D), hex(0x0F0822)], bg: hex(0x1A0F3D), needsOverlay: true)),
        (.init(id: "backdrop_sakura",    type: .lessonBackdrop, name: "樱花飘落",   description: "粉色花瓣的春日",     cost: 220, rarity: .rare,      starter: false),
         LessonBackdropData(stops: [hex(0xFFE0EC), hex(0xFFF0F6), .white], bg: hex(0xFFF0F6), needsOverlay: false)),
        (.init(id: "backdrop_ocean",     type: .lessonBackdrop, name: "深海漫游",   description: "在海底世界学习",     cost: 280, rarity: .rare,      starter: false),
         LessonBackdropData(stops: [hex(0x93C5FD), hex(0xBFDBFE), hex(0xDBEAFE)], bg: hex(0xBFDBFE), needsOverlay: false)),
        (.init(id: "backdrop_aurora",    type: .lessonBackdrop, name: "极光夜",     description: "极地夜空的彩色光带", cost: 480, rarity: .legendary, starter: false),
         LessonBackdropData(stops: [hex(0x064E3B), hex(0x047857), hex(0x0E7490), hex(0x312E81)], bg: hex(0x0E7490), needsOverlay: true)),
    ]

    static var all: [CosmeticItem] {
        mascotSkins + uiThemes.map(\.item) + lessonBackdrops.map(\.item)
    }

    static func item(id: String) -> CosmeticItem? {
        all.first { $0.id == id }
    }

    static func items(of type: CosmeticType) -> [CosmeticItem] {
        all.filter { $0.type == type }
    }

    static var starters: [CosmeticItem] {
        all.filter { $0.starter }
    }

    static let defaultEquipped: (mascotSkin: String, uiTheme: String, lessonBackdrop: String) = (
        mascotSkin: "skin_default",
        uiTheme: "theme_default",
        lessonBackdrop: "backdrop_default"
    )

    private static func hex(_ hex: UInt32) -> Color {
        let r = Double((hex >> 16) & 0xFF) / 255.0
        let g = Double((hex >> 8) & 0xFF) / 255.0
        let b = Double(hex & 0xFF) / 255.0
        return Color(red: r, green: g, blue: b)
    }
}
