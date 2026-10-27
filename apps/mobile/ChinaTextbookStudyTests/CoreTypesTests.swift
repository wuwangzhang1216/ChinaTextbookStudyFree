import XCTest
@testable import ChinaTextbookStudy

final class CoreTypesTests: XCTestCase {
    /// The bundled seed index must decode cleanly and contain at least one book.
    func testSeedIndexDecodes() throws {
        let index = try DataLoader.shared.loadSeedIndex()
        XCTAssertFalse(index.books.isEmpty, "seed-index.json should ship with at least one book")
        // Spot-check a known field to catch silent CodingKey regressions.
        let first = index.books[0]
        XCTAssertFalse(first.id.isEmpty)
        XCTAssertFalse(first.fullName.isEmpty)
        XCTAssertGreaterThan(first.unitsCount, 0)
        for legacyId in ["g3up", "chinese-g2up", "chinese-g3up", "english-g3up", "science-g3up", "chinese-g5up"] {
            let revised = try XCTUnwrap(index.books.first { $0.id == legacyId + "-2026" })
            let legacy = try XCTUnwrap(index.books.first { $0.id == legacyId })
            XCTAssertEqual(revised.supersedes, legacyId)
            XCTAssertEqual(revised.editionLabel, "2026秋版")
            XCTAssertEqual(legacy.supersededBy, revised.id)
            XCTAssertNil(revised.supersededBy)
        }
        for legacyId in ["g1up", "g1down", "g2down", "g3down", "g4up", "g5up", "g6up"] {
            let revised = try XCTUnwrap(index.books.first { $0.id == legacyId + "-2026" })
            let legacy = try XCTUnwrap(index.books.first { $0.id == legacyId })
            XCTAssertEqual(revised.supersedes, legacyId)
            XCTAssertEqual(revised.editionLabel, "2022课标修订版")
            XCTAssertEqual(legacy.supersededBy, revised.id)
            XCTAssertNil(revised.supersededBy)
            XCTAssertEqual(revised.semester, legacy.semester)
        }
        XCTAssertEqual(index.books.count, 84)
        let parallel = index.books.filter { $0.schoolSystem == "5-4" }
        XCTAssertEqual(parallel.count, 26)
        XCTAssertEqual(index.books.filter { ($0.schoolSystem ?? "6-3") == "6-3" }.count, 58)
        XCTAssertEqual(Set(index.books.map(\.id)).count, 84)
        XCTAssertEqual(parallel.filter { $0.subject == .math }.count, 10)
        XCTAssertEqual(parallel.filter { $0.subject == .science }.count, 10)
        XCTAssertEqual(parallel.filter { $0.subject == .english }.count, 6)
        for book in parallel {
            XCTAssertTrue((1...5).contains(book.grade))
            XCTAssertNil(book.supersedes)
            XCTAssertNil(book.supersededBy)
            XCTAssertFalse((book.publisherLabel ?? "").isEmpty)
            XCTAssertFalse((book.sourceEdition ?? "").isEmpty)
            XCTAssertFalse((book.sourcePrinting ?? "").isEmpty)
        }
    }

    /// QuestionType.rawValue must stay aligned with packages/core/src/types.ts.
    func testQuestionTypeRawValuesMatchTSEnum() {
        XCTAssertEqual(QuestionType.trueFalse.rawValue, "true_false")
        XCTAssertEqual(QuestionType.choice.rawValue, "choice")
        XCTAssertEqual(QuestionType.fillBlank.rawValue, "fill_blank")
        XCTAssertEqual(QuestionType.calculation.rawValue, "calculation")
        XCTAssertEqual(QuestionType.fillBlankText.rawValue, "fill_blank_text")
        XCTAssertEqual(QuestionType.wordOrder.rawValue, "word_order")
        XCTAssertEqual(QuestionType.matching.rawValue, "matching")
        XCTAssertEqual(QuestionType.wordProblem.rawValue, "word_problem")
    }

    /// Decode one real lesson JSON from apps/web/public/data/ to verify CodingKeys.
    func testCanDecodeRealLessonJSON() throws {
        // Sample JSON pulled from apps/web/public/data/books/g1up/lessons/g1up-u1-kp1.json
        // (kept small + inline to avoid bundling all data into the test target).
        let json = """
        {
          "id": "test-lesson",
          "title": "测试小课",
          "bookId": "g1up",
          "unitNumber": 1,
          "unitTitle": "数一数",
          "kpIndex": 0,
          "kpTotal": 3,
          "questions": [
            {
              "id": 1,
              "type": "choice",
              "score": 10,
              "difficulty": 1,
              "knowledge_point": "数数",
              "question": "下面哪个是 3？",
              "options": ["1", "2", "3", "4"],
              "answer": "3",
              "explanation": "因为 3 就是 3"
            }
          ],
          "knowledge": null
        }
        """.data(using: .utf8)!

        let lesson = try JSONDecoder().decode(Lesson.self, from: json)
        XCTAssertEqual(lesson.id, "test-lesson")
        XCTAssertEqual(lesson.questions.count, 1)
        XCTAssertEqual(lesson.questions[0].type, .choice)
        XCTAssertEqual(lesson.questions[0].knowledgePoint, "数数")
    }
    func testRevisedEditionAndLegacyMetadataDecode() throws {
        let legacy = """
        {"id":"chinese-g2up","grade":2,"semester":"up","subject":"chinese","gradeName":"二年级","semesterName":"上册","textbookName":"二年级上册","fullName":"语文","unitsCount":8,"lessonsCount":27}
        """.data(using: .utf8)!
        var fields = try XCTUnwrap(JSONSerialization.jsonObject(with: legacy) as? [String: Any])
        XCTAssertNil(try JSONDecoder().decode(Book.self, from: legacy).supersededBy)
        fields["id"] = "chinese-g2up-2026"
        fields["supersedes"] = "chinese-g2up"
        fields["editionLabel"] = "2026秋版"
        let revised = try JSONDecoder().decode(Book.self, from: JSONSerialization.data(withJSONObject: fields))
        XCTAssertEqual(revised.supersedes, "chinese-g2up")
        XCTAssertEqual(revised.editionLabel, "2026秋版")
    }

    func testParallelSchoolSystemMetadataRoundTripAndLegacyCompatibility() throws {
        let json = """
        {"id":"g1up","grade":1,"semester":"up","subject":"math","gradeName":"一年级","semesterName":"上册","textbookName":"一年级上册","fullName":"数学","unitsCount":8,"lessonsCount":30}
        """.data(using: .utf8)!
        let legacy = try JSONDecoder().decode(Book.self, from: json)
        XCTAssertNil(legacy.schoolSystem)
        XCTAssertNil(legacy.publisherLabel)
        var fields = try XCTUnwrap(JSONSerialization.jsonObject(with: json) as? [String: Any])
        fields["id"] = "g1up-54-qingdao"
        fields["schoolSystem"] = "5-4"
        fields["publisherLabel"] = "青岛版"
        fields["sourceEdition"] = "2017年6月第7版"
        fields["sourcePrinting"] = "2021年6月第68次印刷"
        let parallel = try JSONDecoder().decode(Book.self, from: JSONSerialization.data(withJSONObject: fields))
        XCTAssertEqual(parallel.schoolSystem, "5-4")
        XCTAssertEqual(parallel.publisherLabel, "青岛版")
        XCTAssertEqual(parallel.sourceEdition, "2017年6月第7版")
        XCTAssertEqual(parallel.sourcePrinting, "2021年6月第68次印刷")
        XCTAssertNil(parallel.supersedes)
        XCTAssertNil(parallel.supersededBy)
        XCTAssertNotEqual(parallel.id, legacy.id)
        let reloaded = try JSONDecoder().decode(Book.self, from: JSONEncoder().encode(parallel))
        XCTAssertEqual(reloaded, parallel)
    }

    func testActivityPrerequisitesFollowCatalogOrder() throws {
        let json = """
        {"textbook":"数学","units":[
          {"unit_number":1,"title":"第一课","knowledge_points":[{"name":"甲","description":"甲","difficulty":1,"question_types":[]}]},
          {"unit_number":101,"title":"曹冲称象的故事","label":"综合与实践","knowledge_points":[{"name":"称重","description":"称重","difficulty":1,"question_types":[]}]},
          {"unit_number":4,"title":"乘法","knowledge_points":[{"name":"乘法","description":"乘法","difficulty":1,"question_types":[]}]},
          {"unit_number":102,"title":"数字编码","label":"综合与实践","knowledge_points":[{"name":"编码","description":"编码","difficulty":1,"question_types":[]}]}
        ]}
        """.data(using: .utf8)!
        let outline = try JSONDecoder().decode(Outline.self, from: json)
        let rows = outline.priorLessonMetas(bookId: "g3up-2026", beforeUnit: 4)
        XCTAssertEqual(rows.map(\.unitNumber), [1, 101])
        XCTAssertEqual(rows.last?.unitLabel, "综合与实践")
        XCTAssertEqual(outline.units[1].displayLabel, "综合与实践")
        XCTAssertEqual(outline.units[2].displayLabel, "第 4 单元")
        XCTAssertTrue(outline.priorLessonMetas(bookId: "g3up-2026", beforeUnit: 999).isEmpty)
        XCTAssertFalse(rows.contains { $0.id == "g3up-u101-kp1" })
    }

    @MainActor
    func testVersionedWebAudioResolvesToInstalledIOSAudio() throws {
        let root = DataLoader.shared.sandboxAudioRoot.appendingPathComponent("ff", isDirectory: true)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        let file = root.appendingPathComponent("edition-audio-fixture.m4a")
        let versioned = root.appendingPathComponent("edition-audio-fixture.edge-abc.m4a")
        defer {
            try? FileManager.default.removeItem(at: file)
            try? FileManager.default.removeItem(at: versioned)
        }
        try Data([0, 1, 2]).write(to: file)
        try Data([3, 4, 5]).write(to: versioned)
        XCTAssertEqual(AudioPlayer.shared.resolve("/audio/ff/edition-audio-fixture.mp3?v=abc"), file)
        XCTAssertEqual(AudioPlayer.shared.resolve("/audio/ff/edition-audio-fixture.opus?v=def"), file)
        XCTAssertEqual(AudioPlayer.shared.resolve("audio/ff/edition-audio-fixture.m4a"), file)
        XCTAssertEqual(AudioPlayer.shared.resolve("/audio/ff/edition-audio-fixture.edge-abc.mp3?v=123"), versioned)
    }

}
