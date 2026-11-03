//go:build !etsembed

package main

import "io/fs"

// Versão pública: nenhum conteúdo de simulado embutido no exe.
func embeddedEts() fs.FS { return nil }
