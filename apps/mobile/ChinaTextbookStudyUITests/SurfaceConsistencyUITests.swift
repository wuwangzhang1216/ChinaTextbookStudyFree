import XCTest

/// Real native surfaces, including sheets, keyboard and result stages. Checks
/// the complete action rectangle, rather than merely finding its label.
final class SurfaceConsistencyUITests: XCTestCase {
    override func setUpWithError() throws { continueAfterFailure = false }

    @MainActor
    private func launch(route: String? = nil, earned: Bool = false, book: String = "g1up", large: Bool = false) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-uitest", "-uitest-book", book, "-cstf.muted", "YES", "-cstf.autoNarrate", "NO"]
        if let route { app.launchArguments += ["-uitest-route", route] }
        if earned { app.launchArguments += ["-uitest-earned"] }
        if large || ProcessInfo.processInfo.environment["CONGCONG_LARGE_TYPE"] == "1" {
            app.launchArguments += ["-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityM"]
        }
        app.launch()
        return app
    }

    @MainActor
    private func capture(_ name: String) {
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = "audit-" + name
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    @MainActor
    private func assertAction(_ button: XCUIElement, in app: XCUIApplication, aboveTabs: Bool = false,
                              file: StaticString = #filePath, line: UInt = #line) {
        XCTAssertTrue(button.waitForExistence(timeout: 8), file: file, line: line)
        XCTAssertTrue(button.isHittable, "Primary action must be visible without scrolling", file: file, line: line)
        XCTAssertGreaterThanOrEqual(button.frame.height, 44, file: file, line: line)
        XCTAssertGreaterThanOrEqual(button.frame.minX, app.frame.minX + 8, file: file, line: line)
        XCTAssertLessThanOrEqual(button.frame.maxX, app.frame.maxX - 8, file: file, line: line)
        XCTAssertLessThanOrEqual(button.frame.maxY, app.frame.maxY - 8, file: file, line: line)
        if aboveTabs {
            XCTAssertLessThanOrEqual(button.frame.maxY, app.buttons["tab-learn"].frame.minY, file: file, line: line)
        }
        if app.keyboards.firstMatch.exists {
            XCTAssertLessThanOrEqual(button.frame.maxY, app.keyboards.firstMatch.frame.minY, file: file, line: line)
        }
    }

    @MainActor
    private func reveal(_ element: XCUIElement, in app: XCUIApplication) {
        for _ in 0..<8 {
            if element.isHittable { return }
            app.swipeUp()
        }
        XCTAssertTrue(element.isHittable)
    }

    @MainActor
    private func answerAny(_ app: XCUIApplication) {
        if app.buttons["tf-对"].firstMatch.exists {
            reveal(app.buttons["tf-对"].firstMatch, in: app)
            app.buttons["tf-对"].firstMatch.tap()
        } else if app.buttons["answer-option-A"].exists {
            reveal(app.buttons["answer-option-A"], in: app)
            app.buttons["answer-option-A"].tap()
        } else {
            let field = app.textFields.firstMatch
            XCTAssertTrue(field.waitForExistence(timeout: 3))
            reveal(field, in: app)
            field.tap(); field.typeText("1")
        }
    }

    @MainActor
    func testHomeStatisticSheetsAndDailyGoalUseReachableDocks() throws {
        try skipIfIPad()
        let app = launch()
        XCTAssertTrue(app.buttons["home-stat-streak"].waitForExistence(timeout: 15))
        for stat in ["streak", "gems", "hearts"] {
            app.buttons["home-stat-\(stat)"].tap()
            let done = app.buttons["dock-dismiss"]
            assertAction(done, in: app)
            capture("sheet-\(stat)")
            done.tap()
        }
        app.buttons["daily-goal"].firstMatch.tap()
        assertAction(app.buttons["dock-dismiss"], in: app)
        XCTAssertTrue(app.buttons["daily-goal-option-50"].exists)
        capture("sheet-goal")
        app.buttons["dock-dismiss"].tap()
        XCTAssertTrue(app.buttons["tab-learn"].isSelected)
    }

    @MainActor
    func testGuideHasVisiblePreviousAndNextActions() throws {
        let app = launch(route: "guide")
        let next = app.buttons["guide-next"]
        assertAction(next, in: app)
        XCTAssertFalse(app.buttons["guide-previous"].isEnabled)
        capture("guide-first")
        next.tap()
        XCTAssertTrue(app.buttons["guide-previous"].isEnabled)
        assertAction(next, in: app)
        capture("guide-next")
        app.buttons["guide-previous"].tap()
    }

    @MainActor
    func testJumpBriefingFeedbackAndQuitUseTheSameControls() throws {
        try skipIfIPad()
        let app = launch(route: "jump")
        assertAction(app.buttons["jump-start"], in: app)
        capture("jump-briefing")
        app.buttons["jump-start"].tap()
        XCTAssertTrue(app.buttons["检查答案"].waitForExistence(timeout: 5))
        answerAny(app)
        assertAction(app.buttons["检查答案"], in: app)
        app.buttons["检查答案"].tap()
        assertAction(app.buttons["activity-continue"], in: app)
        capture("jump-feedback")
        app.buttons["关闭"].firstMatch.tap()
        assertAction(app.buttons["jump-quit"], in: app)
        capture("jump-quit")
        app.buttons["jump-quit"].tap()
        XCTAssertTrue(app.buttons["tab-learn"].waitForExistence(timeout: 4))
    }

    @MainActor
    func testReviewFeedbackAndCompletionHavePinnedActions() throws {
        try skipIfIPad()
        let app = launch(route: "review-direct")
        XCTAssertTrue(app.buttons["检查答案"].waitForExistence(timeout: 15))
        XCTAssertFalse(app.buttons["tab-learn"].exists)
        XCTAssertTrue(app.buttons["检查答案"].waitForExistence(timeout: 5))
        answerAny(app)
        app.buttons["检查答案"].tap()
        assertAction(app.buttons["activity-continue"], in: app)
        capture("review-feedback")
        app.buttons["activity-continue"].tap()
        assertAction(app.buttons["review-result-done"], in: app)
        capture("review-result")
        app.buttons["review-result-done"].tap()
        XCTAssertTrue(app.buttons["tab-review"].isSelected)
    }

    @MainActor
    func testReadingLibrariesKeepNavigationAndStoriesUseSharedFeedback() throws {
        try skipIfIPad()
        let app = launch(book: "chinese-g1up")
        guard app.buttons["home-continue"].waitForExistence(timeout: 12) else {
            throw XCTSkip("Requires the installed official chinese-g1up iOS resource bundles")
        }
        app.buttons["课文听读"].tap()
        XCTAssertTrue(app.buttons["tab-learn"].exists, "The two reading libraries must share navigation policy")
        capture("reading-navigation")
        app.navigationBars.buttons.firstMatch.tap()
        app.buttons["课外故事"].tap()
        XCTAssertTrue(app.buttons["tab-learn"].exists)
        capture("stories-navigation")
        let story = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'story-'")).firstMatch
        XCTAssertTrue(story.waitForExistence(timeout: 5)); story.tap()
        XCTAssertFalse(app.buttons["tab-learn"].exists)
        assertAction(app.buttons["story-quiz-start"], in: app)
        app.buttons["story-quiz-start"].tap()
        for index in 0..<8 {
            if app.buttons["story-result-done"].exists { break }
            XCTAssertTrue(app.buttons["检查答案"].waitForExistence(timeout: 4))
            answerAny(app); app.buttons["检查答案"].tap()
            assertAction(app.buttons["activity-continue"], in: app)
            if index == 0 { capture("story-feedback") }
            app.buttons["activity-continue"].tap()
        }
        assertAction(app.buttons["story-result-done"], in: app)
        capture("story-result")
        app.buttons["story-result-done"].tap()
        XCTAssertTrue(app.buttons["tab-learn"].exists)
    }

    @MainActor
    func testRenameActionsStayAboveTheKeyboardAndPreviewUsesTheSameDock() throws {
        try skipIfIPad()
        let app = launch()
        XCTAssertTrue(app.buttons["tab-profile"].waitForExistence(timeout: 15)); app.buttons["tab-profile"].tap()
        app.buttons["修改昵称"].tap()
        let field = app.textFields["rename-field"]
        XCTAssertTrue(field.waitForExistence(timeout: 4))
        field.tap(); field.typeText("A")
        assertAction(app.buttons["rename-save"], in: app)
        capture("rename-keyboard")
        app.buttons["rename-save"].tap()
        app.buttons["tab-shop"].tap()
        app.buttons["cosmetic-skin_graduate"].tap()
        assertAction(app.buttons["cosmetic-confirm-buy"], in: app)
        assertAction(app.buttons["cosmetic-cancel-buy"], in: app)
        capture("cosmetic-preview")
        app.buttons["cosmetic-cancel-buy"].tap()
    }

    @MainActor
    func testSettingsReportsAndAchievementSharingRemainConsistent() throws {
        try skipIfIPad()
        let app = launch(earned: true)
        XCTAssertTrue(app.buttons["tab-profile"].waitForExistence(timeout: 15)); app.buttons["tab-profile"].tap()
        app.buttons["profile-settings"].tap()
        XCTAssertTrue(app.navigationBars["设置"].waitForExistence(timeout: 4))
        capture("settings")
        let reports = app.buttons["reports-list"]
        reveal(reports, in: app); reports.tap()
        assertAction(app.buttons["dock-dismiss"], in: app)
        capture("reports")
        app.buttons["dock-dismiss"].tap()
        app.navigationBars.buttons.firstMatch.tap()
        let achievements = app.buttons.containing(NSPredicate(format: "label CONTAINS '成就墙'")).firstMatch
        reveal(achievements, in: app); achievements.tap()
        XCTAssertTrue(app.navigationBars["成就墙"].waitForExistence(timeout: 4))
        capture("achievements")
        let claim = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'ach-claim-'")).firstMatch
        reveal(claim, in: app); claim.tap()
        assertAction(app.buttons["achievement-share-dismiss"], in: app)
        capture("achievement-share")
        app.buttons["achievement-share-dismiss"].tap()
    }

    @MainActor
    func testEveryLessonResultStageKeepsActionsVisibleAndClaimTargetsTheProfileTab() throws {
        try skipIfIPad()
        let app = launch(route: "result")
        for index in 0..<8 {
            let next = app.buttons["result-continue"]
            XCTAssertTrue(next.waitForExistence(timeout: 10))
            assertAction(next, in: app)
            capture("lesson-result-\(index)")
            if app.buttons["quests-claim-jump"].exists {
                app.buttons["quests-claim-jump"].tap()
                XCTAssertTrue(app.buttons["tab-profile"].waitForExistence(timeout: 4))
                XCTAssertTrue(app.buttons["tab-profile"].isSelected)
                capture("result-profile-navigation")
                return
            }
            if next.label == "继续学习" {
                next.tap(); XCTAssertTrue(app.buttons["tab-learn"].waitForExistence(timeout: 4)); return
            }
            next.tap()
        }
        XCTFail("Result stages did not reach a final action")
    }

    @MainActor
    func testUnlockedLeagueHasTheSameNavigationAndReadingWidth() throws {
        let app = launch(route: "league", earned: true)
        XCTAssertTrue(app.scrollViews["league-board"].waitForExistence(timeout: 15))
        capture("league-unlocked")
        if UIDevice.current.userInterfaceIdiom != .pad {
            XCTAssertTrue(app.buttons["tab-league"].isSelected)
            for name in ["learn", "league", "review", "shop", "profile"] {
                let tab = app.buttons["tab-\(name)"]
                XCTAssertTrue(tab.isHittable)
                XCTAssertGreaterThanOrEqual(tab.frame.height, 44)
                XCTAssertGreaterThanOrEqual(tab.frame.minX, app.frame.minX)
                XCTAssertLessThanOrEqual(tab.frame.maxX, app.frame.maxX)
            }
        }
    }

    @MainActor
    func testLargeTypeGuideAndResultKeepTheirBottomActionsVisible() throws {
        try skipIfIPad()
        var app = launch(route: "guide", large: true)
        assertAction(app.buttons["guide-next"], in: app)
        capture("large-guide")
        app.terminate()
        app = launch(route: "result", large: true)
        for index in 0..<6 {
            let next = app.buttons["result-continue"]
            assertAction(next, in: app)
            capture("large-result-\(index)")
            let calendar = app.descendants(matching: .any)["streak-calendar"].firstMatch
            if calendar.exists {
                XCTAssertGreaterThanOrEqual(calendar.frame.minX, app.frame.minX)
                XCTAssertLessThanOrEqual(calendar.frame.maxX, app.frame.maxX)
            }
            if next.label == "继续学习" { return }
            next.tap()
        }
    }

    @MainActor
    func testBookPickerAndChestKeepTheirControlsInsideTheSheet() throws {
        try skipIfIPad()
        let app = launch(earned: true)
        XCTAssertTrue(app.buttons["home-book-picker"].waitForExistence(timeout: 15))
        app.buttons["home-book-picker"].tap()
        XCTAssertTrue(app.buttons["book-picker-close"].waitForExistence(timeout: 4))
        XCTAssertTrue(app.buttons["book-picker-close"].isHittable)
        XCTAssertGreaterThanOrEqual(app.buttons["book-picker-close"].frame.height, 44)
        capture("book-picker")
        app.buttons["book-picker-close"].tap()
        let chest = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'chest-node-' AND label CONTAINS '可领取'")).firstMatch
        let scroll = app.scrollViews.firstMatch
        for _ in 0..<20 {
            if chest.isHittable { break }
            let above = chest.frame.midY < app.frame.midY
            let from = scroll.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: above ? 0.35 : 0.65))
            let to = scroll.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: above ? 0.65 : 0.35))
            from.press(forDuration: 0.1, thenDragTo: to)
        }
        XCTAssertTrue(chest.isHittable)
        chest.tap()
        assertAction(app.buttons["chest-open"], in: app)
        capture("chest-closed")
        app.buttons["chest-open"].tap()
        assertAction(app.buttons["chest-claim"], in: app)
        capture("chest-opened")
        app.buttons["chest-claim"].tap()
        XCTAssertTrue(app.buttons["tab-learn"].waitForExistence(timeout: 4))
    }

    @MainActor
    func testZeroHeartsGateKeepsRefillAndDismissVisible() throws {
        try skipIfIPad()
        let app = XCUIApplication()
        app.launchArguments = ["-uitest", "-uitest-zero-hearts"]
        app.launch()
        XCTAssertTrue(app.buttons["home-continue"].waitForExistence(timeout: 15))
        app.buttons["home-continue"].tap()
        assertAction(app.buttons["heart-refill"], in: app)
        assertAction(app.buttons["dock-dismiss"], in: app)
        capture("zero-hearts")
        app.buttons["heart-refill"].tap()
        XCTAssertTrue(app.staticTexts["你的红心已满！"].waitForExistence(timeout: 4))
        app.buttons["dock-dismiss"].tap()
        XCTAssertTrue(app.buttons["tab-learn"].isSelected)
    }

    @MainActor
    func testLessonSettingsAndQuestionReportHaveTheSamePinnedDismissAction() throws {
        try skipIfIPad()
        let app = launch(large: true)
        XCTAssertTrue(app.buttons["home-continue"].waitForExistence(timeout: 15))
        reveal(app.buttons["home-continue"], in: app)
        app.buttons["home-continue"].tap()
        skipLessonIntroIfPresent(app)
        XCTAssertTrue(app.buttons["lesson-settings"].waitForExistence(timeout: 5))
        app.buttons["lesson-settings"].tap()
        assertAction(app.buttons["lesson-settings-done"], in: app)
        capture("lesson-settings-large")
        app.buttons["lesson-settings-done"].tap()
        answerAny(app)
        app.buttons["检查答案"].tap()
        XCTAssertTrue(app.buttons["question-report-flag"].waitForExistence(timeout: 4))
        app.buttons["question-report-flag"].tap()
        assertAction(app.buttons["report-dismiss"], in: app)
        capture("question-report-large")
        app.buttons["report-dismiss"].tap()
        XCTAssertTrue(app.buttons["继续"].firstMatch.isHittable)
    }

    @MainActor
    func testBookCatalogueAndBookPathUseTheSameNavigationPolicy() throws {
        try skipIfIPad()
        var app = launch(route: "books")
        XCTAssertTrue(app.navigationBars["1 年级"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.buttons["tab-learn"].isSelected)
        capture("book-catalogue")
        app.terminate()
        app = launch(route: "book")
        XCTAssertTrue(app.buttons["lesson-row-g1up-u1-kp1"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.buttons["tab-learn"].isSelected)
        capture("book-path")
    }
}
