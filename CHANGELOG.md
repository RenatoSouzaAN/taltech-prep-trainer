# Changelog

All notable changes to TalTech Prep Trainer (TreinoTalTech) will be documented in this file.

## [1.6.0] - 2026-11-03

### Added
- Content packs: Settings > Content (packs) > "Import pack (.zip)". A pack is a `.zip` with a `manifest.json` (`id`, `name`, `version`, `type`, optional `description`). Type `simulados` holds practice tests in the app format (`ets_tests.json`, `audio/<test id>/*.ogg`, optional `rubrics.json`); type `arquivos` holds your own files (PDF, audio, video, images, text), which open in their default Windows program. Packs live in `%APPDATA%\TreinoTalTech\conteudo\<id>\` and can be listed, opened and removed. See "Content packs" in the README.
- In-app updates: Settings > Updates checks the public releases, downloads, verifies the SHA-256 when published, replaces the program files and restarts. Optional daily check.
- The speech recognition model is downloaded on first use (Settings > Speaking recordings) instead of shipping in the zip.
- Review of finished practice tests: a "Review" button next to each section's best result and in the new attempts list opens an item-by-item, read-only review (your option vs the correct one in red/green, Complete the Words blanks, Build a Sentence sentences, essays with their score, Speaking recordings), with an "All items / Wrong only" filter, an attempt selector and, in Listening, the audio replay and transcript.

### Changed
- The app no longer ships with practice-test content. The Practice tests tab uses only imported packs and shows "No practice-test content installed. Import a content pack in Settings." when there are none.
- Settings > AI grading: saved key, model and API key are aligned in one label/value grid; the API key field matches the other inputs and sits on the same row as Save/Test/Remove.

### Fixed
- Speaking with no score now shows "done, not scored" instead of "- / -" in the best result and attempt lines.
- "Open packs folder", a pack's "Open folder", "Open recordings folder" and the data folder button now really open Explorer (the folder window was being started hidden); a failure to open now shows an in-app message.

### Unchanged
- Progress stays in `%APPDATA%\TreinoTalTech\progresso.json` (schema 6, no migration).

## [1.5.0]

### Added
- Speaking recording: practice tests (Listen and Repeat, Interview) record while the response timer runs; free Speaking practice records too, with re-record. Microphone check before Speaking.
- Offline transcription (whisper.cpp) with an automatic score: word-by-word comparison for Listen and Repeat, a fluency-based estimate with reasons for Interview. Every score can be changed.
- Optional AI grading (OpenAI or Gemini, with your own API key, encrypted by Windows) for essays and Speaking transcripts, using the official rubric.
- Recordings live in `%APPDATA%\TreinoTalTech\gravacoes`; Settings > Recordings shows the space used and turns recording on or off.

### Unchanged
- Progress schema 6 (automatic migration with a `.bak` backup).

## [1.4.0] to [1.4.3]

### Added
- Practice tests tab: full TOEFL iBT practice tests in the 2026 format with audio, official per-section timers and save-and-resume. Reading, Listening and Build a Sentence are scored automatically; results show raw scores per section with an answer review.
- Progress plan milestones linked to a practice test get a Start button and tick themselves when the test is complete.
- Listening sound check before each module with a saved app volume; in-app confirmation dialogs (end module, discard test) in PT and EN.

### Fixed
- Practice test item counter and time formats.

## [1.3.2] - 2026-11-02

### Changed
- With the interface in English, the app is now called TalTech Prep Trainer: in the top bar, the window title and Settings > About. In Portuguese it is still Treino TalTech.
- Switching the language updates the name and the native window title right away. The window opens with the title in the saved language.
- Window title now reads "TalTech Prep Trainer v1.3.2 | GRE + TOEFL" (no em dash). Em dashes were also removed from other interface text.
- Windows version resource updated: FileDescription and ProductName are TalTech Prep Trainer, FileVersion and ProductVersion are 1.3.2.0.
- Added a `make winres` target to regenerate the Windows resources.

### Unchanged
- The executable is still `TreinoTalTech.exe` and progress stays in `%APPDATA%\TreinoTalTech\progresso.json` (schema 4, no migration).

## [1.3.1] - 2026-10-30

Initial public release.

### Features

#### GRE Preparation
- Vocabulary practice with 60 words across 4 sets
- Definition quizzes with IPA pronunciation and audio support
- Text completion and sentence equivalence exercises
- Review mistakes mode with per-set performance tracking
- Quantitative reasoning practice (QC, MC, NE questions)
- Issue essay writing with official ETS prompts (30-minute timer)

#### TOEFL Preparation
- Writing tasks: Email responses (7 minutes), academic discussion (10 minutes), sentence building
- Speaking practice: Listen and repeat, interview questions
- Scoring rubrics for self-evaluation

#### General
- Bilingual UI (Portuguese and English)
- Light, dark, and system theme support
- Progress tracking and performance analytics
- Session persistence across tabs and app restarts
- Export, import, and reset progress functionality
- Automatic schema migrations with backup creation
- DPI-aware window sizing for high-resolution displays

### Technical
- Built with Go 1.27.3 and go-webview2
- Single executable with embedded HTML/CSS/JS UI
- Progress stored locally in `%APPDATA%\TreinoTalTech\progresso.json`
- Pure Go implementation, no cgo required
- Cross-compiled from Linux for Windows (GOOS=windows GOARCH=amd64)

### Content
- 60 curated GRE vocabulary words with definitions and example sentences
- Original text completion and sentence equivalence practice items
- GRE quantitative reasoning questions
- Official ETS Issue essay prompts from the published pool
- Original TOEFL writing and speaking practice tasks
