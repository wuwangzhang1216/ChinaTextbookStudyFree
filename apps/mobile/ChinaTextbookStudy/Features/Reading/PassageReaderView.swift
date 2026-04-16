import SwiftUI

/// Per-book passage list. Tapping a passage pushes the reader.
/// Math books have no passages — graceful empty state covers that.
struct PassageListView: View {
    let bookId: String
    @Binding var path: [AppRoute]

    @State private var passages: [Passage] = []
    @State private var loadError: String?

    var body: some View {
        Group {
            if !passages.isEmpty {
                List(passages, id: \.id) { p in
                    Button {
                        path.append(.passageReader(bookId: bookId, passageId: p.id))
                    } label: {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(p.title).font(.headline)
                            HStack(spacing: 6) {
                                Text(p.kind.rawValue)
                                Text("·")
                                Text("\(p.sentences.count) 句")
                            }
                            .font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
                .listStyle(.insetGrouped)
            } else {
                emptyState
            }
        }
        .navigationTitle("课文听读")
        .navigationBarTitleDisplayMode(.inline)
        .task { load() }
    }

    private var emptyState: some View {
        VStack(spacing: 12) {
            Image(systemName: "text.book.closed").font(.largeTitle).foregroundStyle(.secondary)
            Text(loadError ?? "这本书还没有课文听读")
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding(40)
    }

    private func load() {
        do {
            passages = (try DataLoader.shared.loadPassages(bookId: bookId))?.passages ?? []
        } catch {
            loadError = (error as? LocalizedError)?.errorDescription ?? String(describing: error)
        }
    }
}

/// Sentence-by-sentence passage reader with per-sentence TTS.
struct PassageReaderView: View {
    let bookId: String
    let passageId: String
    @State private var passage: Passage?

    var body: some View {
        Group {
            if let passage {
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        if let author = passage.author, !author.isEmpty {
                            Text("—— \(author)")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }
                        ForEach(Array(passage.sentences.enumerated()), id: \.offset) { _, s in
                            HStack(alignment: .top, spacing: 10) {
                                Text(s.text)
                                    .font(.title3)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                TTSButton(path: s.audio, size: 16)
                            }
                            .padding(.vertical, 6)
                            Divider()
                        }
                    }
                    .padding()
                }
            } else {
                ProgressView()
            }
        }
        .navigationTitle(passage?.title ?? "")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .topBarTrailing) { MuteToggle() } }
        .task {
            passage = (try? DataLoader.shared.loadPassages(bookId: bookId))?
                .passages.first { $0.id == passageId }
        }
        .onDisappear { AudioPlayer.shared.stop() }
    }
}
