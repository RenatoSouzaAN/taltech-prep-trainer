# Changelog

All notable changes to TreinoTalTech will be documented in this file.

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
