package main

import (
	"archive/zip"
	"errors"
	"fmt"
	"io"
	"os"
	"path"
	"path/filepath"
	"strings"
)

// Extração segura de .zip (pacotes de conteúdo e atualizações): sem "..", sem caminho absoluto,
// sem links, com limite de tamanho por arquivo e total (o tamanho declarado no zip não é confiado).

const (
	zipMaxEntries = 50000
)

// zipName normaliza o nome de uma entrada e diz se é seguro ("" = rejeitar).
func zipName(n string) string {
	n = strings.ReplaceAll(n, "\\", "/")
	if n == "" || strings.HasPrefix(n, "/") || strings.Contains(n, ":") || strings.ContainsRune(n, 0) {
		return ""
	}
	c := path.Clean(n)
	if c == "." || c == ".." || strings.HasPrefix(c, "../") || !filepath.IsLocal(filepath.FromSlash(c)) {
		return ""
	}
	return c
}

// zipPrefix: se todas as entradas estão dentro de uma única pasta de topo que contém `marker`, devolve "pasta/".
func zipPrefix(files []*zip.File, marker string) string {
	for _, f := range files {
		if n := zipName(f.Name); n == marker {
			return ""
		}
	}
	top := ""
	for _, f := range files {
		n := zipName(f.Name)
		if n == "" {
			continue
		}
		i := strings.IndexByte(n, '/')
		if i < 0 {
			if f.FileInfo().IsDir() {
				continue
			}
			return "" // arquivo solto na raiz
		}
		t := n[:i]
		if top == "" {
			top = t
		} else if t != top {
			return ""
		}
	}
	if top == "" {
		return ""
	}
	for _, f := range files {
		if zipName(f.Name) == top+"/"+marker {
			return top + "/"
		}
	}
	return ""
}

// zipEntries: arquivos (não pastas) com o nome relativo já sem o prefixo; erro se algo for inseguro.
type zipEntry struct {
	Rel string
	F   *zip.File
}

func zipEntries(files []*zip.File, prefix string, maxTotal int64) ([]zipEntry, int64, error) {
	if len(files) > zipMaxEntries {
		return nil, 0, errors.New("zip:muitos_arquivos")
	}
	var out []zipEntry
	var total int64
	seen := map[string]bool{}
	for _, f := range files {
		n := zipName(f.Name)
		if n == "" {
			return nil, 0, fmt.Errorf("zip:caminho_invalido: %q", f.Name)
		}
		mode := f.Mode()
		if mode&os.ModeSymlink != 0 || mode&(os.ModeDevice|os.ModeNamedPipe|os.ModeSocket) != 0 {
			return nil, 0, fmt.Errorf("zip:caminho_invalido: %q", f.Name)
		}
		if f.FileInfo().IsDir() || strings.HasSuffix(f.Name, "/") {
			continue
		}
		if prefix != "" {
			if !strings.HasPrefix(n, prefix) {
				continue
			}
			n = strings.TrimPrefix(n, prefix)
		}
		key := strings.ToLower(n)
		if seen[key] {
			return nil, 0, fmt.Errorf("zip:duplicado: %q", n)
		}
		seen[key] = true
		total += int64(f.UncompressedSize64)
		if f.UncompressedSize64 > uint64(maxTotal) || total > maxTotal {
			return nil, 0, errors.New("zip:grande_demais")
		}
		out = append(out, zipEntry{Rel: n, F: f})
	}
	return out, total, nil
}

// extractEntry grava uma entrada em dir/rel, sem passar do tamanho declarado.
func extractEntry(dir string, e zipEntry) error {
	dst := filepath.Join(dir, filepath.FromSlash(e.Rel))
	if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
		return err
	}
	rc, err := e.F.Open()
	if err != nil {
		return err
	}
	defer rc.Close()
	out, err := os.OpenFile(dst, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o644)
	if err != nil {
		return err
	}
	lim := int64(e.F.UncompressedSize64)
	n, err := io.Copy(out, io.LimitReader(rc, lim+1))
	if cerr := out.Close(); err == nil {
		err = cerr
	}
	if err != nil {
		return err
	}
	if n != lim {
		return errors.New("zip:tamanho_errado")
	}
	return nil
}

// readZipFile lê uma entrada pequena (manifest, json) com limite.
func readZipFile(f *zip.File, limit int64) ([]byte, error) {
	if f.UncompressedSize64 > uint64(limit) {
		return nil, errors.New("zip:grande_demais")
	}
	rc, err := f.Open()
	if err != nil {
		return nil, err
	}
	defer rc.Close()
	b, err := io.ReadAll(io.LimitReader(rc, limit+1))
	if err != nil {
		return nil, err
	}
	if int64(len(b)) > limit {
		return nil, errors.New("zip:grande_demais")
	}
	return b, nil
}
