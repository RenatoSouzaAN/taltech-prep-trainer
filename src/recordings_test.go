package main

import (
	"encoding/base64"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestRecordingsSaveDelete(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("APPDATA", tmp)
	webm := base64.StdEncoding.EncodeToString([]byte("webm-bytes"))
	wav := "data:audio/wav;base64," + base64.StdEncoding.EncodeToString([]byte("RIFF....WAVE"))
	s, err := saveRecording("flpt1", "a123", "SR_1", webm, wav)
	if err != nil || s.Rel != "flpt1/a123/SR_1.webm" || s.Wav != "flpt1/a123/SR_1.wav" || s.Bytes != 10 {
		t.Fatalf("save: %+v %v", s, err)
	}
	root := filepath.Join(tmp, "TreinoTalTech", "gravacoes")
	if b, _ := os.ReadFile(filepath.Join(root, "flpt1", "a123", "SR_1.webm")); string(b) != "webm-bytes" {
		t.Fatal("conteúdo do webm")
	}
	// regravar sem wav remove o wav antigo
	if s, err = saveRecording("flpt1", "a123", "SR_1", webm, ""); err != nil || s.Wav != "" {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(root, "flpt1", "a123", "SR_1.wav")); !os.IsNotExist(err) {
		t.Fatal("wav antigo ficou")
	}
	_, _ = saveRecording("flpt1", "a123", "SR_2", webm, wav)
	for _, bad := range [][3]string{{"../x", "a", "b"}, {"t", "a/b", "c"}, {"t", "a", ""}, {"t", "a", strings.Repeat("x", 49)}, {"t", "a", "c.webm"}} {
		if _, err := saveRecording(bad[0], bad[1], bad[2], webm, ""); err == nil {
			t.Fatalf("aceitou nome inválido %v", bad)
		}
	}
	if _, err := saveRecording("t", "a", "b", "", ""); err == nil {
		t.Fatal("aceitou vazio")
	}
	big := base64.StdEncoding.EncodeToString(make([]byte, maxWebmSize+10))
	if _, err := saveRecording("t", "a", "b", big, ""); err == nil {
		t.Fatal("aceitou gravação gigante")
	}
	for _, bad := range []string{"../progresso.json", "flpt1/a123/../../x.webm", "flpt1", "/etc/passwd", `flpt1\a123`, "flpt1/a123/SR_1.exe"} {
		if err := deleteRecording(bad); err == nil {
			t.Fatalf("apagou caminho inválido %q", bad)
		}
	}
	if total, n := recordingsSize(); n != 2 || total == 0 {
		t.Fatalf("tamanho: %d %d", total, n)
	}
	if d, _ := recFolder("flpt1/a123/SR_1.webm"); d != filepath.Join(root, "flpt1", "a123") {
		t.Fatalf("pasta: %s", d)
	}
	if err := deleteRecording("flpt1/a123/SR_1.webm"); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(root, "flpt1", "a123", "SR_2.webm")); err != nil {
		t.Fatal("apagou o item errado")
	}
	if err := deleteRecording("flpt1/a123/SR_2.webm"); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(root, "flpt1")); !os.IsNotExist(err) {
		t.Fatal("pastas vazias deveriam sair")
	}
	if _, err := os.Stat(root); err != nil {
		t.Fatal("a raiz deve ficar")
	}
	_, _ = saveRecording("pratica", "s1", "x", webm, wav)
	if err := deleteRecording("pratica/s1"); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(root, "pratica")); !os.IsNotExist(err) {
		t.Fatal("tentativa inteira")
	}
	if d, _ := recFolder("nao/existe"); d != root {
		t.Fatal("pasta inexistente cai na raiz")
	}
}

func TestJobs(t *testing.T) {
	id := startJob(func() (any, error) { time.Sleep(30 * time.Millisecond); return 42, nil })
	if st := pollJob(id); st.Done {
		t.Fatal("cedo demais")
	}
	time.Sleep(80 * time.Millisecond)
	st := pollJob(id)
	if !st.Done || st.Result != 42 || st.Error != "" {
		t.Fatalf("%+v", st)
	}
	if st := pollJob(id); st.Error == "" {
		t.Fatal("entregue duas vezes")
	}
	id = startJob(func() (any, error) { panic("x") })
	time.Sleep(30 * time.Millisecond)
	if st := pollJob(id); !st.Done || !strings.Contains(st.Error, "interno") {
		t.Fatalf("panic: %+v", st)
	}
}

func TestSttMissing(t *testing.T) {
	t.Setenv("TREINO_STT_DIR", t.TempDir())
	if st := sttStatus(); st.OK || st.Motivo != "sem_programa" {
		t.Fatalf("%+v", st)
	}
	t.Setenv("APPDATA", t.TempDir())
	if _, err := evaluateRecording("repeat", "t/a/b.webm", "x"); err == nil || !strings.HasPrefix(err.Error(), "stt:") {
		t.Fatalf("sem wav: %v", err)
	}
}

// E2E opcional com o whisper real (Linux): TREINO_STT_DIR=<pasta com whisper-cli e o modelo>
// TREINO_E2E_WAV=<wav 16 kHz> TREINO_E2E_REF=<frase>.
func TestWhisperE2E(t *testing.T) {
	wav, ref := os.Getenv("TREINO_E2E_WAV"), os.Getenv("TREINO_E2E_REF")
	if wav == "" || !sttStatus().OK {
		t.Skip("whisper/wav não configurados")
	}
	t.Setenv("APPDATA", t.TempDir())
	b, err := os.ReadFile(wav)
	if err != nil {
		t.Fatal(err)
	}
	s, err := saveRecording("e2e", "a1", "SR_1", base64.StdEncoding.EncodeToString([]byte("x")), base64.StdEncoding.EncodeToString(b))
	if err != nil {
		t.Fatal(err)
	}
	t0 := time.Now()
	res, err := evaluateRecording("repeat", s.Rel, ref)
	if err != nil {
		t.Fatal(err)
	}
	r := res.(lrResult)
	t.Logf("whisper %.1fs: %q → acc %d%%, nota %d %v", time.Since(t0).Seconds(), r.Texto, r.Acc, r.Nota, r.Motivos)
	if r.Acc < 80 {
		t.Fatalf("precisão baixa: %d", r.Acc)
	}
}

// Interview de ponta a ponta (só roda com TREINO_E2E_IV=<wav> e o whisper instalado)
func TestWhisperE2EInterview(t *testing.T) {
	wav := os.Getenv("TREINO_E2E_IV")
	if wav == "" || !sttStatus().OK {
		t.Skip("whisper/wav não configurados")
	}
	t.Setenv("APPDATA", t.TempDir())
	b, err := os.ReadFile(wav)
	if err != nil {
		t.Fatal(err)
	}
	s, err := saveRecording("e2e", "a1", "SI_1", base64.StdEncoding.EncodeToString([]byte("x")), base64.StdEncoding.EncodeToString(b))
	if err != nil {
		t.Fatal(err)
	}
	t0 := time.Now()
	res, err := evaluateRecording("interview", s.Rel, "What do you think about studying abroad?")
	if err != nil {
		t.Fatal(err)
	}
	r := res.(ivResult)
	t.Logf("whisper %.1fs: %q → %+v nota %d %v", time.Since(t0).Seconds(), r.Texto, r.Metricas, r.Nota, r.Motivos)
	if r.Metricas.Palavras < 10 {
		t.Fatalf("poucas palavras: %d", r.Metricas.Palavras)
	}
}
