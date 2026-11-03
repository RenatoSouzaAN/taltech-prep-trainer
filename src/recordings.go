// Gravações do Speaking (webm/opus + wav 16 kHz para o whisper) e avaliação offline com whisper.cpp.
// Independente de plataforma para poder testar no Linux; o detalhe de esconder a janela do
// processo fica em proc_windows.go / proc_other.go.
package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"sync"
	"time"
)

const (
	recDirName  = "gravacoes"
	maxWebmSize = 12 << 20 // ~45 s de opus ocupa ~0,3 MB; folga para gravações longas do treino livre
	maxWavSize  = 12 << 20 // 16 kHz mono 16 bits: 45 s = 1,4 MB; 6 min = 11,5 MB
)

var recNameRe = regexp.MustCompile(`^[A-Za-z0-9_-]{1,48}$`)

func recRoot() (string, error) {
	dir, err := appDir()
	if err != nil {
		return "", err
	}
	root := filepath.Join(dir, recDirName)
	return root, os.MkdirAll(root, 0o755)
}

// SavedRecording: caminhos relativos à pasta gravacoes, sempre com "/".
type SavedRecording struct {
	Rel   string `json:"rel"`   // <teste>/<tentativa>/<item>.webm
	Wav   string `json:"wav"`   // idem .wav ("" se não veio)
	Bytes int    `json:"bytes"` // tamanho do webm
	Abs   string `json:"abs"`   // caminho completo do webm (para achar o arquivo fora do app)
}

func decodeB64(s string, limit int) ([]byte, error) {
	if i := strings.Index(s, ","); i >= 0 && strings.HasPrefix(s, "data:") {
		s = s[i+1:]
	}
	if base64.StdEncoding.DecodedLen(len(s)) > limit+3 {
		return nil, errors.New("gravação grande demais")
	}
	return base64.StdEncoding.DecodeString(s)
}

// saveRecording grava <raiz>/<test>/<attempt>/<item>.webm (+ .wav). Sobrescreve (regravar no modo prática).
func saveRecording(test, attempt, item, webmB64, wavB64 string) (SavedRecording, error) {
	var out SavedRecording
	for _, n := range []string{test, attempt, item} {
		if !recNameRe.MatchString(n) {
			return out, fmt.Errorf("nome inválido: %q", n)
		}
	}
	webm, err := decodeB64(webmB64, maxWebmSize)
	if err != nil {
		return out, err
	}
	if len(webm) == 0 {
		return out, errors.New("gravação vazia")
	}
	var wav []byte
	if wavB64 != "" {
		if wav, err = decodeB64(wavB64, maxWavSize); err != nil {
			return out, err
		}
	}
	root, err := recRoot()
	if err != nil {
		return out, err
	}
	dir := filepath.Join(root, test, attempt)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return out, err
	}
	if err := writeAtomic(filepath.Join(dir, item+".webm"), webm); err != nil {
		return out, err
	}
	out.Rel, out.Bytes = test+"/"+attempt+"/"+item+".webm", len(webm)
	out.Abs = filepath.Join(dir, item+".webm")
	_ = os.Remove(filepath.Join(dir, item+".json")) // avaliação de uma gravação anterior deste item
	wavPath := filepath.Join(dir, item+".wav")
	if len(wav) > 0 {
		if err := writeAtomic(wavPath, wav); err != nil {
			return out, err
		}
		out.Wav = test + "/" + attempt + "/" + item + ".wav"
	} else {
		_ = os.Remove(wavPath) // não deixar um wav antigo de outra gravação
	}
	return out, nil
}

func writeAtomic(path string, b []byte) error {
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, b, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

var recRelRe = regexp.MustCompile(`^[A-Za-z0-9_-]{1,48}/[A-Za-z0-9_-]{1,48}(/[A-Za-z0-9_-]{1,48}\.(webm|wav))?$`)

// recPath valida um caminho relativo vindo do JS e devolve o caminho absoluto (nunca sai da raiz).
func recPath(rel string) (string, error) {
	if !recRelRe.MatchString(rel) {
		return "", fmt.Errorf("caminho de gravação inválido: %q", rel)
	}
	root, err := recRoot()
	if err != nil {
		return "", err
	}
	return filepath.Join(root, filepath.FromSlash(rel)), nil
}

// deleteRecording apaga <item>.webm/.wav (rel de arquivo) ou a tentativa inteira (rel "<teste>/<tentativa>")
// e remove pastas que ficarem vazias.
func deleteRecording(rel string) error {
	p, err := recPath(rel)
	if err != nil {
		return err
	}
	root, _ := recRoot()
	var dir string
	if strings.Count(rel, "/") == 1 {
		if err := os.RemoveAll(p); err != nil {
			return err
		}
		dir = filepath.Dir(p)
	} else {
		base := strings.TrimSuffix(p, filepath.Ext(p))
		for _, ext := range []string{".webm", ".wav", ".json"} {
			if err := os.Remove(base + ext); err != nil && !errors.Is(err, os.ErrNotExist) {
				return err
			}
		}
		dir = filepath.Dir(p)
	}
	// remove pastas que ficaram vazias, subindo até a raiz (os.Remove falha se não estiver vazia)
	for dir != root && strings.HasPrefix(dir, root+string(filepath.Separator)) {
		if os.Remove(dir) != nil {
			break
		}
		dir = filepath.Dir(dir)
	}
	return nil
}

// recFolder: pasta para "Abrir pasta" (a tentativa, ou a raiz se rel == "").
func recFolder(rel string) (string, error) {
	if rel == "" {
		return recRoot()
	}
	p, err := recPath(rel)
	if err != nil {
		return "", err
	}
	if strings.HasSuffix(p, ".webm") || strings.HasSuffix(p, ".wav") {
		p = filepath.Dir(p)
	}
	if _, err := os.Stat(p); err != nil {
		return recRoot()
	}
	return p, nil
}

// recordingsSize: total em bytes e número de arquivos .webm (para a tela de dados).
func recordingsSize() (int64, int) {
	root, err := recRoot()
	if err != nil {
		return 0, 0
	}
	var total int64
	n := 0
	_ = filepath.Walk(root, func(_ string, fi os.FileInfo, err error) error {
		if err == nil && !fi.IsDir() {
			total += fi.Size()
			if strings.HasSuffix(fi.Name(), ".webm") {
				n++
			}
		}
		return nil
	})
	return total, n
}

/* ---------- whisper.cpp ---------- */

const sttModelName = "ggml-base.en-q5_1.bin"

// Prompt só para a entrevista: faz o whisper transcrever as hesitações (sem ele, "um/uh" somem).
// Não é usado no Listen and Repeat para não puxar a transcrição para alguma frase.
const interviewPrompt = "Umm, let me think, uh, like, you know... Okay, so, um, I think, uh, that's it."

func sttDir() string {
	if d := os.Getenv("TREINO_STT_DIR"); d != "" {
		return d
	}
	exe, err := os.Executable()
	if err != nil {
		return "stt"
	}
	return filepath.Join(filepath.Dir(exe), "stt")
}

func sttBinary(dir string) string {
	if runtime.GOOS == "windows" {
		return filepath.Join(dir, "whisper-cli.exe")
	}
	return filepath.Join(dir, "whisper-cli")
}

// SttStatus: o que o JS mostra quando a avaliação automática não está disponível.
type SttStatus struct {
	OK     bool   `json:"ok"`
	Motivo string `json:"motivo,omitempty"` // "sem_programa" | "sem_modelo"
	Dir    string `json:"dir"`
	Model  string `json:"model,omitempty"` // caminho do modelo em uso
	// v1.6.0: o modelo (~57 MB) não vem mais no zip; o app baixa na primeira vez.
	Baixavel   bool  `json:"baixavel,omitempty"`
	ModelBytes int64 `json:"modelBytes,omitempty"`
}

func sttStatus() SttStatus {
	d := sttDir()
	if _, err := os.Stat(sttBinary(d)); err != nil {
		return SttStatus{Motivo: "sem_programa", Dir: d, ModelBytes: modelSize}
	}
	m := sttModelPath()
	if m == "" {
		return SttStatus{Motivo: "sem_modelo", Dir: d, ModelBytes: modelSize, Baixavel: true}
	}
	return SttStatus{OK: true, Dir: d, Model: m}
}

var sttMu sync.Mutex // um whisper por vez (CPU)

var sttTimeout = 3 * time.Minute

// transcribe roda o whisper-cli no wav e devolve texto + palavras com tempos.
func transcribe(wavPath string, interview bool) (string, []sttWord, error) {
	st := sttStatus()
	if !st.OK {
		return "", nil, errors.New("stt:" + st.Motivo)
	}
	sttMu.Lock()
	defer sttMu.Unlock()
	tmp, err := os.MkdirTemp("", "treino-stt-")
	if err != nil {
		return "", nil, err
	}
	defer os.RemoveAll(tmp)
	threads := runtime.NumCPU()
	if threads > 4 {
		threads = 4
	}
	if threads < 1 {
		threads = 1
	}
	outBase := filepath.Join(tmp, "out")
	args := []string{"-m", st.Model, "-f", wavPath, "-l", "en", "-t", fmt.Sprint(threads), "-ojf", "-of", outBase, "-np", "-nt"}
	if interview {
		args = append(args, "--prompt", interviewPrompt)
	}
	ctx, cancel := context.WithTimeout(context.Background(), sttTimeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, sttBinary(st.Dir), args...)
	cmd.Dir = st.Dir
	if runtime.GOOS != "windows" {
		cmd.Env = append(os.Environ(), "LD_LIBRARY_PATH="+st.Dir)
	}
	hideWindow(cmd)
	out, err := cmd.CombinedOutput()
	if ctx.Err() == context.DeadlineExceeded {
		return "", nil, errors.New("stt:tempo")
	}
	if err != nil {
		var ee *exec.ExitError
		// 0xC0000135 STATUS_DLL_NOT_FOUND / 0xC000007B: falta o Visual C++ Runtime (ou DLL de outra arquitetura)
		if errors.As(err, &ee) && (uint32(ee.ExitCode()) == 0xC0000135 || uint32(ee.ExitCode()) == 0xC000007B) {
			return "", nil, errors.New("stt:sem_runtime")
		}
		msg := strings.TrimSpace(string(out))
		if len(msg) > 300 {
			msg = msg[len(msg)-300:]
		}
		return "", nil, fmt.Errorf("stt:falhou: %v %s", err, msg)
	}
	b, err := os.ReadFile(outBase + ".json")
	if err != nil {
		return "", nil, errors.New("stt:sem_saida")
	}
	return parseWhisperJSON(b)
}

// evaluateRecording: kind "repeat" (ref = frase modelo) ou "interview" (ref = pergunta).
func evaluateRecording(kind, rel, ref string) (any, error) {
	p, err := recPath(rel)
	if err != nil {
		return nil, err
	}
	wav := strings.TrimSuffix(p, filepath.Ext(p)) + ".wav"
	if _, err := os.Stat(wav); err != nil {
		return nil, errors.New("stt:sem_wav")
	}
	var res any
	switch kind {
	case "repeat":
		text, _, err := transcribe(wav, false)
		if err != nil {
			return nil, err
		}
		res = scoreRepeat(ref, text)
	case "interview":
		text, ws, err := transcribe(wav, true)
		if err != nil {
			return nil, err
		}
		res = scoreInterview(text, ws, ref)
	default:
		return nil, errors.New("tipo de avaliação inválido")
	}
	writeEvalSidecar(p, kind, ref, res)
	return res, nil
}

// writeEvalSidecar grava <item>.json ao lado do áudio: transcrição + métricas legíveis fora do app
// (o progresso.json também guarda tudo; isto é só para achar fácil na pasta).
func writeEvalSidecar(audioPath, kind, ref string, res any) {
	side := map[string]any{"app": "TreinoTalTech", "version": appVersion, "t": time.Now().Format(time.RFC3339),
		"kind": kind, "audio": filepath.Base(audioPath), "wav": strings.TrimSuffix(filepath.Base(audioPath), filepath.Ext(audioPath)) + ".wav", "referencia": ref, "avaliacao": res}
	if b, err := json.MarshalIndent(side, "", "  "); err == nil {
		_ = writeAtomic(strings.TrimSuffix(audioPath, filepath.Ext(audioPath))+".json", b)
	}
}

/* ---------- trabalhos assíncronos (bindings rodam na thread da interface) ---------- */

type jobState struct {
	Done   bool   `json:"done"`
	Result any    `json:"result,omitempty"`
	Error  string `json:"error,omitempty"`
	Bytes  int64  `json:"bytes,omitempty"` // progresso (downloads/extração), enquanto não termina
	Total  int64  `json:"total,omitempty"`
	t      time.Time
}

var (
	jobsMu sync.Mutex
	jobs   = map[string]*jobState{}
	jobSeq int
)

func startJob(fn func() (any, error)) string {
	return startJobP(func(func(int64, int64)) (any, error) { return fn() })
}

// startJobP: como startJob, mas a função recebe prog(feito, total) para o JS mostrar uma barra.
func startJobP(fn func(prog func(done, total int64)) (any, error)) string {
	jobsMu.Lock()
	jobSeq++
	id := fmt.Sprintf("j%d", jobSeq)
	js := &jobState{t: time.Now()}
	jobs[id] = js
	for k, v := range jobs { // limpa trabalhos antigos já lidos ou esquecidos
		if v.Done && time.Since(v.t) > 30*time.Minute {
			delete(jobs, k)
		}
	}
	jobsMu.Unlock()
	go func() {
		var res any
		var err error
		func() {
			defer func() {
				if r := recover(); r != nil {
					err = fmt.Errorf("erro interno: %v", r)
				}
			}()
			res, err = fn(func(done, total int64) {
				jobsMu.Lock()
				js.Bytes, js.Total = done, total
				jobsMu.Unlock()
			})
		}()
		jobsMu.Lock()
		js.Done, js.Result, js.t = true, res, time.Now()
		if err != nil {
			js.Error = err.Error()
		}
		jobsMu.Unlock()
	}()
	return id
}

// pollJob devolve o estado; um trabalho concluído é entregue uma vez e esquecido.
func pollJob(id string) jobState {
	jobsMu.Lock()
	defer jobsMu.Unlock()
	js, ok := jobs[id]
	if !ok {
		return jobState{Done: true, Error: "trabalho desconhecido"}
	}
	if js.Done {
		delete(jobs, id)
	}
	return *js
}
