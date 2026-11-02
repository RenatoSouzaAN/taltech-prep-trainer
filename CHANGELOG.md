# Changelog

All notable changes to TalTech Prep Trainer (TreinoTalTech) will be documented in this file.

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
