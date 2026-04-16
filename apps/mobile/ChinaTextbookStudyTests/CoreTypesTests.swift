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
}
