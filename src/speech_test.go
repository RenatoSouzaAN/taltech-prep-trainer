package main

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"testing"
)

// Frases próprias (não ETS).
const ownRef = "The museum on Pine Street opens at nine o'clock on weekends."

func TestNormWords(t *testing.T) {
	got := strings.Join(normWords("You're right — the colour isn't 5, it's well-known!"), " ")
	want := "you are right the color is not five it is well known"
	if got != want {
		t.Fatalf("normWords: %q", got)
	}
	if strings.Join(normWords("The visitor’s centre"), " ") != "the visitors center" {
		t.Fatal("possessivo/ortografia")
	}
}

func TestScoreRepeatLevels(t *testing.T) {
	cases := []struct {
		hyp  string
		nota int
	}{
		{"The museum on Pine Street opens at nine o'clock on weekends.", 5},
		{"the museum on pine street opens at 9 o'clock on weekends", 5},
		{"The museum in Pine Street opens at nine o'clock on weekends.", 4},
		{"The museum on Pine Street opens at nine on weekends.", 4},
		{"The museum on Pine Street is open at nine on Sunday.", 3},
		{"The museum on Pine Street", 2},
		{"museum", 1},
		{"", 0},
		{"I like playing football with my friends.", 0},
	}
	for _, c := range cases {
		r := scoreRepeat(ownRef, c.hyp)
		if r.Nota != c.nota {
			t.Errorf("%q: nota %d (acc %d, motivos %v), esperado %d", c.hyp, r.Nota, r.Acc, r.Motivos, c.nota)
		}
	}
	r := scoreRepeat(ownRef, ownRef)
	if r.Acc != 100 || r.Erros != 0 {
		t.Fatalf("exata: %+v", r)
	}
	r = scoreRepeat("a b c d", "a x c d e")
	if r.Trocou != 1 || r.Sobrou != 1 || r.Faltou != 0 {
		t.Fatalf("diff: %+v", r.Ops)
	}
}

func TestAlignWords(t *testing.T) {
	ops := append(alignWords([]string{"a", "b", "c"}, []string{"a", "c"}), alignWords([]string{"a", "c"}, []string{"a", "b", "c"})...)
	var s []string
	for _, o := range ops {
		s = append(s, o.Op)
	}
	if strings.Join(s, ",") != "ok,del,ok,ok,ins,ok" {
		t.Fatalf("ops: %v", s)
	}
}

func mkWords(text string, wpm float64, pauseAfter map[int]int) []sttWord {
	var out []sttWord
	t := 500.0
	step := 60000 / wpm
	for i, w := range strings.Fields(text) {
		out = append(out, sttWord{W: w, From: int(t), To: int(t + step*0.8)})
		t += step
		if p, ok := pauseAfter[i]; ok {
			t += float64(p)
		}
	}
	return out
}

const ownAnswer = "I think team sports teach children how to cooperate. When I was younger, I played volleyball every weekend, and my coach always said that nobody wins alone. " +
	"We learned to listen to each other, to share responsibility, and to accept mistakes without blaming anyone. Those habits helped me later at university, " +
	"especially during group projects, because I already knew how to divide tasks and support classmates who were struggling."

func TestInterviewMetricsAndBand(t *testing.T) {
	q := "Do team sports help young people develop useful skills?"
	r := scoreInterview(ownAnswer, mkWords(ownAnswer, 130, nil), q)
	if r.Metricas.Palavras < 60 || !r.Metricas.TamanhoOK || r.Metricas.Pausas != 0 {
		t.Fatalf("métricas: %+v", r.Metricas)
	}
	if r.Nota != 5 {
		t.Fatalf("fluente e variada deveria estimar 5: %d %v", r.Nota, r.Motivos)
	}
	slow := "Um, I think, uh, sports are good. Um, they are good because, uh, you play with friends. Uh, it is good."
	rs := scoreInterview(slow, mkWords(slow, 50, map[int]int{3: 2500, 10: 2500, 15: 3000}), q)
	if rs.Metricas.Hesitacoes < 4 || rs.Metricas.Pausas != 3 {
		t.Fatalf("hesitações/pausas: %+v", rs.Metricas)
	}
	if rs.Nota > 2 {
		t.Fatalf("curta, lenta e hesitante deveria ficar baixa: %d %v", rs.Nota, rs.Motivos)
	}
	if e := scoreInterview("", nil, q); e.Nota != 0 {
		t.Fatal("vazia = 0")
	}
}

func TestParseWhisperJSON(t *testing.T) {
	js := `{"transcription":[{"text":" Hello there. [BLANK_AUDIO]","tokens":[
	{"text":"[_BEG_]","offsets":{"from":0,"to":0}},{"text":" Hello","offsets":{"from":0,"to":400}},
	{"text":" there","offsets":{"from":400,"to":800}},{"text":".","offsets":{"from":800,"to":810}},
	{"text":" w","offsets":{"from":1000,"to":1100}},{"text":"onderful","offsets":{"from":1100,"to":1500}}]}]}`
	text, ws, err := parseWhisperJSON([]byte(js))
	if err != nil || text != "Hello there." {
		t.Fatalf("%q %v", text, err)
	}
	if len(ws) != 3 || ws[1].W != "there." || ws[2].W != "wonderful" || ws[2].To != 1500 {
		t.Fatalf("palavras: %+v", ws)
	}
}

// Calibração com amostras ETS reais: só local (../local-ets fica fora do repositório).
func TestCalibrationLocal(t *testing.T) {
	b, err := os.ReadFile("../local-ets/speech_samples.json")
	if err != nil {
		t.Skip("sem amostras locais (normal fora da máquina de desenvolvimento)")
	}
	var d struct {
		Repeat struct {
			Ref   string `json:"ref"`
			Items []struct {
				Ets     int             `json:"ets"`
				Whisper json.RawMessage `json:"whisper"`
			} `json:"items"`
		} `json:"repeat"`
		Interview struct {
			Question string `json:"question"`
			Items    []struct {
				Ets     int             `json:"ets"`
				Whisper json.RawMessage `json:"whisper"`
			} `json:"items"`
		} `json:"interview"`
	}
	if err := json.Unmarshal(b, &d); err != nil {
		t.Fatal(err)
	}
	for _, it := range d.Repeat.Items {
		text, _, _ := parseWhisperJSON(it.Whisper)
		r := scoreRepeat(d.Repeat.Ref, text)
		if r.Nota != it.Ets {
			t.Errorf("L&R ETS %d: nota %d (acc %d)", it.Ets, r.Nota, r.Acc)
		}
	}
	for _, it := range d.Interview.Items {
		text, ws, _ := parseWhisperJSON(it.Whisper)
		r := scoreInterview(text, ws, d.Interview.Question)
		if diff := r.Nota - it.Ets; diff < -1 || diff > 1 {
			t.Errorf("Interview ETS %d: estimativa %d (%v)", it.Ets, r.Nota, r.Motivos)
		}
		fmt.Printf("calibração interview: ETS %d → estimativa %d\n", it.Ets, r.Nota)
	}
}
