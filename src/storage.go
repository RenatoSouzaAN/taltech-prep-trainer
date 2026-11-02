// Armazenamento do progresso em %APPDATA%\TreinoTalTech (independente de plataforma para poder testar).
package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const appName = "TreinoTalTech"

func appDir() (string, error) {
	base := os.Getenv("APPDATA")
	if base == "" {
		d, err := os.UserConfigDir()
		if err != nil {
			return "", err
		}
		base = d
	}
	dir := filepath.Join(base, appName)
	return dir, os.MkdirAll(dir, 0o755)
}

func progressPath() (string, error) {
	dir, err := appDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "progresso.json"), nil
}

// loadProgress devolve o JSON salvo ("" se ainda não existe).
func loadProgress() (string, error) {
	p, err := progressPath()
	if err != nil {
		return "", err
	}
	b, err := os.ReadFile(p)
	if errors.Is(err, os.ErrNotExist) {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	if !json.Valid(b) {
		// arquivo corrompido: preserva cópia e tenta o backup
		_ = os.WriteFile(p+".corrompido-"+time.Now().Format("20060102-150405"), b, 0o644)
		if bb, e2 := os.ReadFile(p + ".bak"); e2 == nil && json.Valid(bb) {
			return string(bb), nil
		}
		return "", nil
	}
	return string(b), nil
}

// saveProgress grava de forma atômica (tmp + rename) e mantém um .bak.
func saveProgress(data string) error {
	if !json.Valid([]byte(data)) {
		return errors.New("JSON inválido")
	}
	p, err := progressPath()
	if err != nil {
		return err
	}
	if old, e := os.ReadFile(p); e == nil && json.Valid(old) {
		_ = os.WriteFile(p+".bak", old, 0o644)
	}
	tmp := p + ".tmp"
	if err := os.WriteFile(tmp, []byte(data), 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, p)
}

// backupProgress copia o progresso.json atual para progresso-v{old}.bak antes de uma migração.
// Nunca sobrescreve um backup existente (acrescenta data/hora). Devolve o nome do arquivo.
func backupProgress(oldSchema int) (string, error) {
	p, err := progressPath()
	if err != nil {
		return "", err
	}
	b, err := os.ReadFile(p)
	if err != nil {
		return "", err
	}
	dir := filepath.Dir(p)
	name := fmt.Sprintf("progresso-v%d.bak", oldSchema)
	if _, e := os.Stat(filepath.Join(dir, name)); e == nil {
		name = fmt.Sprintf("progresso-v%d-%s.bak", oldSchema, time.Now().Format("20060102-150405"))
	}
	if err := os.WriteFile(filepath.Join(dir, name), b, 0o644); err != nil {
		return "", err
	}
	return name, nil
}

// DataInfo descreve o arquivo de progresso para a tela de Configurações.
type DataInfo struct {
	Folder   string `json:"folder"`
	File     string `json:"file"`
	Size     int64  `json:"size"`
	Modified string `json:"modified"` // RFC 3339 (hora local), "" se não existe
	Exists   bool   `json:"exists"`
}

func dataInfo() (DataInfo, error) {
	p, err := progressPath()
	if err != nil {
		return DataInfo{}, err
	}
	in := DataInfo{Folder: filepath.Dir(p), File: filepath.Base(p)}
	if st, e := os.Stat(p); e == nil {
		in.Size, in.Exists, in.Modified = st.Size(), true, st.ModTime().Format(time.RFC3339)
	}
	return in, nil
}

// backupNamed copia o progresso.json atual para progresso-{tag}-AAAAMMDD-HHMMSS.bak
// (usado antes de importar ou zerar). Devolve "" se ainda não há arquivo salvo.
func backupNamed(tag string) (string, error) {
	tag = sanitizeTag(tag)
	p, err := progressPath()
	if err != nil {
		return "", err
	}
	b, err := os.ReadFile(p)
	if errors.Is(err, os.ErrNotExist) {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	dir := filepath.Dir(p)
	base := fmt.Sprintf("progresso-%s-%s", tag, time.Now().Format("20060102-150405"))
	name := base + ".bak"
	for i := 2; ; i++ {
		if _, e := os.Stat(filepath.Join(dir, name)); errors.Is(e, os.ErrNotExist) {
			break
		}
		name = fmt.Sprintf("%s-%d.bak", base, i)
	}
	if err := os.WriteFile(filepath.Join(dir, name), b, 0o644); err != nil {
		return "", err
	}
	return name, nil
}

func sanitizeTag(t string) string {
	out := make([]rune, 0, len(t))
	for _, r := range t {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '-' || r == '_' {
			out = append(out, r)
		}
	}
	if len(out) == 0 {
		return "backup"
	}
	if len(out) > 40 {
		out = out[:40]
	}
	return string(out)
}

// writeExport grava o backup exportado em path (JSON validado, gravação atômica).
func writeExport(path, content string) error {
	if !json.Valid([]byte(content)) {
		return errors.New("JSON inválido")
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, []byte(content), 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

// exportFallback: se o diálogo "Salvar como" não estiver disponível, grava uma cópia datada na pasta de dados.
func exportFallback(content string) (string, error) {
	dir, err := appDir()
	if err != nil {
		return "", err
	}
	p := filepath.Join(dir, "TreinoTalTech-backup-"+time.Now().Format("20060102-150405")+".json")
	return p, writeExport(p, content)
}

const maxImportSize = 50 << 20

// ImportedFile é devolvido ao JS pelo "Importar backup".
type ImportedFile struct {
	Name    string `json:"name"`
	Content string `json:"content"`
}

// readImportFile lê o arquivo escolhido (limite de 50 MB, remove BOM, exige JSON válido).
// A validação do conteúdo (é progresso do app?) é feita no JS antes da confirmação.
func readImportFile(path string) (*ImportedFile, error) {
	st, err := os.Stat(path)
	if err != nil {
		return nil, err
	}
	if st.Size() > maxImportSize {
		return nil, errors.New("arquivo grande demais (máx. 50 MB)")
	}
	b, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	b = []byte(strings.TrimPrefix(string(b), "\ufeff"))
	if !json.Valid(b) {
		return nil, errors.New("o arquivo não é um JSON válido")
	}
	return &ImportedFile{Name: filepath.Base(path), Content: string(b)}, nil
}
