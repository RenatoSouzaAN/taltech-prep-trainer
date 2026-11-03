# src/ets/: local practice-test content (not in git)

Since v1.6.0 the app ships without any practice-test content. The public build
(`go build` without tags) embeds nothing from this folder; practice tests are
imported at runtime as a content pack (Settings > Content (packs) >
"Import pack (.zip)") and live in `%APPDATA%\TreinoTalTech\conteudo\<id>\`.
The pack format is documented in the main README ("Content packs").

Only this README is tracked in git. Anything else placed here is local
developer data and must never be committed or attached to a release; these
paths are listed in `.gitignore`:

- `ets_tests.json`
- `audio/<test>/*.ogg`
- `rubrics.json`

Some local tests (`src/ui_test.js`, and `content_test.go` when
`TREINO_ETS_PACK` is set) read these files if they exist.

## Local developer build with the content embedded

    go build -tags etsembed ...

For personal use only; never publish an `etsembed` build.
