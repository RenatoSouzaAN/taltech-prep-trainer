package main

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// mkZip grava um zip com os arquivos dados (nome → conteúdo).
func mkZip(t *testing.T, files map[string]string) string {
	t.Helper()
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	for n, c := range files {
		w, err := zw.Create(n)
		if err != nil {
			t.Fatal(err)
		}
		w.Write([]byte(c))
	}
	zw.Close()
	p := filepath.Join(t.TempDir(), "p.zip")
	os.WriteFile(p, buf.Bytes(), 0o644)
	return p
}

func manifest(id, typ, ver string) string {
	b, _ := json.Marshal(PackManifest{ID: id, Name: "Pacote " + id, Version: ver, Type: typ})
	return string(b)
}

const etsJSON = `{"version":"x","note":"n","tests":[{"id":"zz1","title":"Teste ZZ","kind":"toefl"}]}`

func TestPackImportEts(t *testing.T) {
	t.Setenv("APPDATA", t.TempDir())
	if etsData() != "" && embeddedEts() == nil {
		t.Fatal("sem pacote e sem embed, mas etsData não está vazio")
	}
	zp := mkZip(t, map[string]string{
		"ETS/manifest.json":       manifest("ets-toefl", "ets", "1"),
		"ETS/ets_tests.json":      etsJSON,
		"ETS/audio/zz1/L1_q1.ogg": "OggS-fake",
		"ETS/rubrics.json":        `{"toeflEmail":"R"}`,
	})
	pv, err := previewPack(zp)
	if err != nil || pv.ID != "ets-toefl" || pv.Existing != "" || len(pv.Tests) != 1 || pv.Files != 3 {
		t.Fatalf("preview %+v %v", pv, err)
	}
	var last int64
	p, err := importPack(zp, func(d, tot int64) { last = d })
	if err != nil || p.Error != "" || last == 0 {
		t.Fatalf("import %+v %v", p, err)
	}
	d := etsData()
	if !strings.Contains(d, `"zz1"`) {
		t.Fatalf("etsData %q", d)
	}
	if a, err := etsAudio("zz1/L1_q1"); err != nil || a == "" {
		t.Fatal(err)
	}
	if string(etsRubrics()) != `{"toeflEmail":"R"}` {
		t.Fatal("rubrics")
	}
	// reimportar com versão nova: preview mostra a instalada, substitui
	zp2 := mkZip(t, map[string]string{
		"manifest.json":  manifest("ets-toefl", "ets", "2"),
		"ets_tests.json": `{"tests":[{"id":"zz2"}]}`,
	})
	if pv, _ := previewPack(zp2); pv.Existing != "1" {
		t.Fatalf("existing %q", pv.Existing)
	}
	if _, err := importPack(zp2, nil); err != nil {
		t.Fatal(err)
	}
	if d := etsData(); strings.Contains(d, "zz1") || !strings.Contains(d, "zz2") {
		t.Fatalf("depois de substituir: %q", d)
	}
	if _, err := etsAudio("zz1/L1_q1"); err == nil {
		t.Fatal("áudio antigo ficou")
	}
	ps := installedPacks()
	if len(ps) != 1 || ps[0].Version != "2" {
		t.Fatalf("list %+v", ps)
	}
	if err := removePack("ets-toefl"); err != nil {
		t.Fatal(err)
	}
	if len(installedPacks()) != 0 || etsData() != "" && embeddedEts() == nil {
		t.Fatal("remoção")
	}
	if removePack("ets-toefl") == nil {
		t.Fatal("remover inexistente")
	}
}

func TestPackArquivos(t *testing.T) {
	t.Setenv("APPDATA", t.TempDir())
	zp := mkZip(t, map[string]string{
		"manifest.json":     manifest("meus-pdfs", "arquivos", "2026.11"),
		"Gramática/a.pdf":   "%PDF",
		"notas.txt":         "oi",
		"scripts/virus.exe": "MZ",
	})
	p, err := importPack(zp, nil)
	if err != nil || p.Files != 3 || len(p.List) != 3 {
		t.Fatalf("%+v %v", p, err)
	}
	open := map[string]bool{}
	for _, f := range p.List {
		open[f.Path] = f.Open
	}
	if !open["Gramática/a.pdf"] || !open["notas.txt"] || open["scripts/virus.exe"] {
		t.Fatalf("allowlist %+v", open)
	}
	if fp, err := packFilePath("meus-pdfs", "Gramática/a.pdf"); err != nil || !strings.HasSuffix(fp, "a.pdf") {
		t.Fatal(err)
	}
	for _, bad := range []string{"scripts/virus.exe", "../progresso.json", "/etc/passwd", "manifest.json", "nao.pdf", "..\\..\\x.pdf"} {
		if _, err := packFilePath("meus-pdfs", bad); err == nil {
			t.Fatalf("aceitou %q", bad)
		}
	}
	if _, err := packFilePath("../x", "a.pdf"); err == nil {
		t.Fatal("id inválido aceito")
	}
	if etsData() != "" && embeddedEts() == nil {
		t.Fatal("pacote de arquivos virou ETS")
	}
}

func TestPackRejeita(t *testing.T) {
	t.Setenv("APPDATA", t.TempDir())
	cases := map[string]map[string]string{
		"pac:sem_manifest":      {"a.txt": "x"},
		"pac:manifest_invalido": {"manifest.json": "{"},
		"pac:id_invalido":       {"manifest.json": manifest("../x", "ets", "1"), "a.txt": "x"},
		"pac:tipo_invalido":     {"manifest.json": manifest("abc", "exe", "1"), "a.txt": "x"},
		"pac:ets_invalido":      {"manifest.json": manifest("abc", "ets", "1"), "a.txt": "x"},
		"pac:vazio":             {"manifest.json": manifest("abc", "arquivos", "1")},
		"zip:caminho_invalido":  {"manifest.json": manifest("abc", "arquivos", "1"), "../../fora.txt": "x"},
	}
	for want, files := range cases {
		_, err := importPack(mkZip(t, files), nil)
		if err == nil || !strings.HasPrefix(err.Error(), want) {
			t.Errorf("%s: got %v", want, err)
		}
	}
	bad := filepath.Join(t.TempDir(), "x.zip")
	os.WriteFile(bad, []byte("não é zip"), 0o644)
	if _, err := previewPack(bad); err == nil || err.Error() != "pac:zip_invalido" {
		t.Fatal(err)
	}
	// nada sobrou na pasta (nem .tmp-)
	root, _ := contentRoot()
	if des, _ := os.ReadDir(root); len(des) != 0 {
		t.Fatalf("sobras: %v", des)
	}
	// o progresso nunca é tocado
	d, _ := appDir()
	if _, err := os.Stat(filepath.Join(d, "progresso.json")); err == nil {
		t.Fatal("criou progresso?")
	}
}

func TestZipName(t *testing.T) {
	for in, want := range map[string]string{"a/b.txt": "a/b.txt", "a\\b": "a/b", "../a": "", "/a": "", "c:/x": "", "a/../../b": "", "./a": "a"} {
		if got := zipName(in); got != want {
			t.Errorf("%q → %q, quer %q", in, got, want)
		}
	}
}

// TREINO_ETS_PACK=/caminho/do/pacote-de-simulados.zip go test -run TestRealEtsPack
func TestRealEtsPack(t *testing.T) {
	zp := os.Getenv("TREINO_ETS_PACK")
	if zp == "" {
		t.Skip("TREINO_ETS_PACK não definido")
	}
	t.Setenv("APPDATA", t.TempDir())
	p, err := importPack(zp, nil)
	if err != nil || p.Error != "" || len(p.Tests) < 7 {
		t.Fatalf("%+v %v", p, err)
	}
	var o struct{ Tests []map[string]any }
	if json.Unmarshal([]byte(etsData()), &o) != nil || len(o.Tests) != len(p.Tests) {
		t.Fatal("etsData")
	}
	if _, err := etsAudio("flpt1/L1_q1"); err != nil {
		t.Fatal(err)
	}
	if officialRubric("toeflEmail") == "" {
		t.Fatal("rubric")
	}
	t.Logf("pacote ok: %d testes, %d arquivos, %d bytes", len(p.Tests), p.Files, p.Bytes)
}

// v1.6.0: "simulados" é o nome público do tipo; vira o id interno "ets" (pacotes antigos com "ets" continuam valendo).
func TestPackTipoSimulados(t *testing.T) {
	t.Setenv("APPDATA", t.TempDir())
	zp := mkZip(t, map[string]string{
		"manifest.json":       manifest("meus-simulados", "simulados", "1"),
		"ets_tests.json":      etsJSON,
		"audio/zz1/L1_q1.ogg": "OggS-fake",
	})
	pv, err := previewPack(zp)
	if err != nil || pv.Type != "ets" || len(pv.Tests) != 1 {
		t.Fatalf("preview %+v %v", pv, err)
	}
	if _, err := importPack(zp, func(int64, int64) {}); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(etsData(), `"zz1"`) {
		t.Fatal("pacote do tipo simulados não carregou")
	}
	ps := installedPacks()
	if len(ps) != 1 || ps[0].Type != "ets" || ps[0].Error != "" {
		t.Fatalf("lista %+v", ps)
	}
}
