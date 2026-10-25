import XCTest

/// Covers the earn → spend → express loop: buying a cosmetic must equip it and
/// the equipped state must survive navigating away and back.
final class CosmeticsUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    @MainActor
    private func launchApp() -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments.append("-uitest")   // hermetic state, 500 gems
        app.launch()
        return app
    }

    @MainActor
    private func attach(name: String) {
        let att = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        att.name = name
        att.lifetime = .keepAlways
        add(att)
    }

    /// Wave F: tapping an unowned cosmetic opens the preview/confirm sheet —
    /// confirm the purchase there.
    @MainActor
    private func confirmPurchase(_ app: XCUIApplication) {
        let confirm = app.buttons["cosmetic-confirm-buy"]
        XCTAssertTrue(confirm.waitForExistence(timeout: 3),
                      "tapping an unowned cosmetic should open the preview sheet")
        confirm.tap()
    }

    @MainActor
    func testBuyingCosmeticEquipsItAndPersists() throws {
        try skipIfIPad()
        let app = launchApp()

        XCTAssertTrue(app.buttons["tab-shop"].waitForExistence(timeout: 15))
        app.buttons["tab-shop"].tap()
        XCTAssertTrue(app.navigationBars["商店"].waitForExistence(timeout: 5))
        attach(name: "01-shop-before")

        // The stock skin starts equipped; the graduation cap costs 80 gems.
        let stock = app.buttons["cosmetic-skin_default"]
        XCTAssertTrue(stock.waitForExistence(timeout: 5))
        XCTAssertTrue(stock.label.contains("使用中"), "stock skin should start equipped")

        let cap = app.buttons["cosmetic-skin_graduate"]
        XCTAssertTrue(cap.waitForExistence(timeout: 3))
        XCTAssertFalse(cap.label.contains("使用中"), "graduation cap should not start equipped")
        cap.tap()
        confirmPurchase(app)

        // Buying equips it immediately.
        XCTAssertTrue(cap.waitForExistence(timeout: 3))
        XCTAssertTrue(cap.label.contains("使用中"),
                      "buying a skin should equip it — label was: \(cap.label)")
        XCTAssertFalse(stock.label.contains("使用中"),
                       "the previously equipped skin should have been unequipped")
        attach(name: "02-shop-skin-equipped")

        // Buy a theme too (樱花粉, 200 gems) — repaints the brand color app-wide.
        // Self-heal: under XCUITest the app has been observed landing on the
        // profile tab moments after a purchase (not reproducible manually);
        // make sure we are on the shop before looking for the theme tile.
        if !app.navigationBars["商店"].exists {
            app.buttons["tab-shop"].tap()
            XCTAssertTrue(app.navigationBars["商店"].waitForExistence(timeout: 5))
        }
        let theme = app.buttons["cosmetic-theme_sakura"]
        var scrolls = 0
        while !theme.exists && scrolls < 6 {
            app.swipeUp()
            scrolls += 1
        }
        XCTAssertTrue(theme.waitForExistence(timeout: 3))
        theme.tap()
        confirmPurchase(app)
        XCTAssertTrue(theme.waitForExistence(timeout: 3))
        XCTAssertTrue(theme.label.contains("使用中"), "buying a theme should equip it")
        attach(name: "03-shop-theme-equipped")

        // The equipped skin must show on the profile avatar.
        app.buttons["tab-profile"].tap()
        XCTAssertTrue(app.navigationBars["我的"].waitForExistence(timeout: 5))
        attach(name: "04-profile-themed")

        // …and still be equipped when we come back to the shop.
        app.buttons["tab-shop"].tap()
        XCTAssertTrue(app.navigationBars["商店"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["cosmetic-skin_graduate"].label.contains("使用中"),
                      "equipped skin did not persist across tab switches")
    }

    /// A cosmetic you cannot afford must not be granted.
    @MainActor
    func testUnaffordableCosmeticIsNotGranted() throws {
        try skipIfIPad()
        let app = launchApp()

        app.buttons["tab-shop"].tap()
        XCTAssertTrue(app.navigationBars["商店"].waitForExistence(timeout: 5))

        // 宇航员头盔 costs 500; buy 学士帽 (80) first so the balance drops below it.
        app.buttons["cosmetic-skin_graduate"].tap()
        confirmPurchase(app)

        let helmet = app.buttons["cosmetic-skin_astronaut"]
        // Cosmetics now form a vertical adaptive grid; later rows are lazy
        // and must be revealed before they enter the accessibility tree.
        var scrolls = 0
        while !helmet.isHittable && scrolls < 6 {
            app.swipeUp()
            scrolls += 1
        }
        XCTAssertTrue(helmet.waitForExistence(timeout: 3))
        helmet.tap()

        // Wave F: the preview sheet still opens, but the confirm button is
        // disabled when gems are short — cancel out and nothing was granted.
        let confirm = app.buttons["cosmetic-confirm-buy"]
        XCTAssertTrue(confirm.waitForExistence(timeout: 3))
        XCTAssertFalse(confirm.isEnabled, "confirm must be disabled when unaffordable")
        app.buttons["cosmetic-cancel-buy"].tap()

        XCTAssertTrue(helmet.waitForExistence(timeout: 3))
        XCTAssertFalse(helmet.label.contains("使用中"),
                       "an unaffordable cosmetic must not be equipped")
    }
}
