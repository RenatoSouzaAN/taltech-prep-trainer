package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestStorageAndBackup(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("APPDATA", tmp)
	if s, err := loadProgress(); err != nil || s != "" {
		t.Fatalf("vazio: %q %v", s, err)
	}
	v1 := `{"app":"TreinoTalTech","versao":1,"historico":[{"ok":true}],"futuro":{"x":1}}`
	if err := saveProgress(v1); err != nil {
		t.Fatal(err)
	}
	if err := saveProgress("{quebrado"); err == nil {
		t.Fatal("deveria recusar JSON inválido")
	}
	name, err := backupProgress(1)
	if err != nil || name != "progresso-v1.bak" {
		t.Fatalf("backup: %q %v", name, err)
	}
	b, _ := os.ReadFile(filepath.Join(tmp, "TreinoTalTech", name))
	if string(b) != v1 {
		t.Fatal("backup diferente do original")
	}
	name2, _ := backupProgress(1)
	if name2 == name || !strings.HasPrefix(name2, "progresso-v1-") {
		t.Fatalf("segundo backup não deveria sobrescrever: %q", name2)
	}
	v2 := strings.Replace(v1, `"versao":1`, `"versao":1,"schemaVersion":2`, 1)
	if err := saveProgress(v2); err != nil {
		t.Fatal(err)
	}
	if s, _ := loadProgress(); s != v2 {
		t.Fatal("load != save")
	}
	if bak, _ := os.ReadFile(filepath.Join(tmp, "TreinoTalTech", "progresso.json.bak")); string(bak) != v1 {
		t.Fatal(".bak deveria ter a versão anterior")
	}
	// arquivo corrompido -> usa .bak
	os.WriteFile(filepath.Join(tmp, "TreinoTalTech", "progresso.json"), []byte("{xx"), 0o644)
	if s, _ := loadProgress(); s != v1 {
		t.Fatalf("deveria recuperar do .bak, veio %q", s)
	}
}

func TestV12Storage(t *testing.T) {
	t.Setenv("APPDATA", t.TempDir())
	// sem arquivo: info vazio, backupNamed devolve ""
	in, err := dataInfo()
	if err != nil || in.Exists || in.File != "progresso.json" || in.Folder == "" {
		t.Fatalf("dataInfo vazio: %+v %v", in, err)
	}
	if n, err := backupNamed("antes-de-zerar"); err != nil || n != "" {
		t.Fatalf("backupNamed sem arquivo: %q %v", n, err)
	}
	data := `{"app":"TreinoTalTech","schema":2,"historico":[1,2],"campoDesconhecido":"x"}`
	if err := saveProgress(data); err != nil {
		t.Fatal(err)
	}
	in, _ = dataInfo()
	if !in.Exists || in.Size != int64(len(data)) || in.Modified == "" {
		t.Fatalf("dataInfo: %+v", in)
	}
	if _, err := time.Parse(time.RFC3339, in.Modified); err != nil {
		t.Fatalf("modified não é RFC3339: %v", err)
	}
	n1, err := backupNamed("antes-de-importar")
	if err != nil || !strings.HasPrefix(n1, "progresso-antes-de-importar-") || !strings.HasSuffix(n1, ".bak") {
		t.Fatalf("backupNamed: %q %v", n1, err)
	}
	n2, _ := backupNamed("antes-de-importar")
	if n2 == n1 {
		t.Fatal("backupNamed sobrescreveu backup existente")
	}
	if b, _ := os.ReadFile(filepath.Join(in.Folder, n1)); string(b) != data {
		t.Fatal("conteúdo do backup difere")
	}
	if n, _ := backupNamed(`..\..\x/y`); strings.ContainsAny(n, `\/`) || strings.Contains(n, "..") {
		t.Fatalf("tag não sanitizada: %q", n)
	}
	// export + import (round-trip)
	dst := filepath.Join(t.TempDir(), "meu-backup.json")
	if err := writeExport(dst, data); err != nil {
		t.Fatal(err)
	}
	if err := writeExport(dst+"2", "{quebrado"); err == nil {
		t.Fatal("writeExport aceitou JSON inválido")
	}
	f, err := readImportFile(dst)
	if err != nil || f.Name != "meu-backup.json" || f.Content != data {
		t.Fatalf("readImportFile: %+v %v", f, err)
	}
	bom := filepath.Join(t.TempDir(), "bom.json")
	os.WriteFile(bom, []byte("\ufeff"+data), 0o644)
	if f, err := readImportFile(bom); err != nil || f.Content != data {
		t.Fatalf("BOM: %v", err)
	}
	bad := filepath.Join(t.TempDir(), "bad.json")
	os.WriteFile(bad, []byte("não é json"), 0o644)
	if _, err := readImportFile(bad); err == nil {
		t.Fatal("aceitou arquivo inválido")
	}
	big := filepath.Join(t.TempDir(), "big.json")
	os.WriteFile(big, make([]byte, maxImportSize+1), 0o644)
	if _, err := readImportFile(big); err == nil {
		t.Fatal("aceitou arquivo > 50 MB")
	}
	// fallback de exportação na pasta de dados
	p, err := exportFallback(data)
	if err != nil || filepath.Dir(p) != in.Folder || !strings.HasPrefix(filepath.Base(p), "TreinoTalTech-backup-") {
		t.Fatalf("exportFallback: %q %v", p, err)
	}
}

func TestDisplayNameAndTitle(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("APPDATA", tmp)
	if savedLanguage() != "pt" {
		t.Fatal("sem progresso: pt")
	}
	if err := saveProgress(`{"app":"TreinoTalTech","settings":{"language":"en"}}`); err != nil {
		t.Fatal(err)
	}
	if savedLanguage() != "en" {
		t.Fatal("deveria ler en do progresso")
	}
	if got := windowTitle("en", "1.3.2"); got != "TalTech Prep Trainer v1.3.2 | GRE + TOEFL" {
		t.Fatalf("título en: %q", got)
	}
	if got := windowTitle("pt", "1.3.2"); got != "Treino TalTech v1.3.2 | GRE + TOEFL" {
		t.Fatalf("título pt: %q", got)
	}
	if _, err := os.Stat(filepath.Join(tmp, "TreinoTalTech", "progresso.json")); err != nil {
		t.Fatal("pasta de dados deve continuar TreinoTalTech")
	}
}
