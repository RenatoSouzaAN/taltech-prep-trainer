package main

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestExpandWinEnv(t *testing.T) {
	t.Setenv("TT_BASE", "/tmp/base")
	if g := expandWinEnv(`%TT_BASE%/TreinoTalTech`); g != "/tmp/base/TreinoTalTech" {
		t.Fatalf("got %q", g)
	}
	if g := expandWinEnv(`%TT_NAO_EXISTE_X%/a`); g != `%TT_NAO_EXISTE_X%/a` {
		t.Fatalf("got %q", g)
	}
	if g := expandWinEnv(`/a/100%/b`); g != `/a/100%/b` {
		t.Fatalf("got %q", g)
	}
}

func TestPrepareFolder(t *testing.T) {
	base := t.TempDir()
	t.Setenv("TT_BASE", base)
	// raiz dos pacotes ainda não existe: com create, é criada
	p, err := prepareFolder(`%TT_BASE%/TreinoTalTech/conteudo`, true)
	if err != nil || p != filepath.Join(base, "TreinoTalTech", "conteudo") {
		t.Fatalf("p=%q err=%v", p, err)
	}
	if st, err := os.Stat(p); err != nil || !st.IsDir() {
		t.Fatalf("não criou a pasta: %v", err)
	}
	// sem create, pasta que não existe é erro claro
	if _, err := prepareFolder(filepath.Join(base, "nada"), false); err == nil || err.Error() != "pasta:nao_existe" {
		t.Fatalf("err=%v", err)
	}
	// variável não expandida, vazio e arquivo no lugar de pasta
	for _, d := range []string{`%TT_NAO_EXISTE_X%\conteudo`, "  "} {
		if _, err := prepareFolder(d, true); err == nil || err.Error() != "pasta:invalida" {
			t.Fatalf("%q: err=%v", d, err)
		}
	}
	f := filepath.Join(base, "arq.txt")
	os.WriteFile(f, []byte("x"), 0o644)
	if _, err := prepareFolder(f, false); err == nil || err.Error() != "pasta:nao_e_pasta" {
		t.Fatalf("err=%v", err)
	}
	// caminho com .. é limpo
	p, err = prepareFolder(filepath.Join(base, "TreinoTalTech", "conteudo", "..", "conteudo"), false)
	if err != nil || strings.Contains(p, "..") {
		t.Fatalf("p=%q err=%v", p, err)
	}
}

func TestOpenFolderWith(t *testing.T) {
	base := t.TempDir()
	var calls []string
	ok := func(verb, p string) error { calls = append(calls, verb+" "+p); return nil }
	fail := func(verb, p string) error { calls = append(calls, verb); return errors.New("2") }
	expOK := func(p string) error { calls = append(calls, "explorer.exe"); return nil }
	expFail := func(p string) error { calls = append(calls, "explorer.exe"); return errors.New("nao achou") }

	if err := openFolderWith(base, false, ok, expFail); err != nil || len(calls) != 1 || calls[0] != "explore "+base {
		t.Fatalf("err=%v calls=%v", err, calls)
	}
	calls = nil
	if err := openFolderWith(base, false, fail, expOK); err != nil || strings.Join(calls, ",") != "explore,open,explorer.exe" {
		t.Fatalf("fallback: err=%v calls=%v", err, calls)
	}
	calls = nil
	err := openFolderWith(base, false, fail, expFail)
	if err == nil || !strings.HasPrefix(err.Error(), "pasta:abrir: ") || !strings.Contains(err.Error(), "explorer.exe: nao achou") {
		t.Fatalf("erro real deve subir: %v", err)
	}
	// pasta inexistente: nem tenta abrir
	calls = nil
	if err := openFolderWith(filepath.Join(base, "x"), false, ok, expOK); err == nil || len(calls) != 0 {
		t.Fatalf("err=%v calls=%v", err, calls)
	}
}
