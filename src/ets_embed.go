//go:build etsembed

package main

import (
	"embed"
	"io/fs"
)

// Build local de desenvolvimento (go build -tags etsembed): embute src/ets no exe, como até a v1.5.
// A versão pública NUNCA usa esta tag: o conteúdo dos simulados chega por pacote importado (conteudo\<pacote>\).
//
//go:embed ets
var etsEmbedded embed.FS

func embeddedEts() fs.FS {
	sub, err := fs.Sub(etsEmbedded, "ets")
	if err != nil {
		return nil
	}
	if _, err := fs.Stat(sub, "ets_tests.json"); err != nil {
		return nil
	}
	return sub
}
