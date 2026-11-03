package main

// Avaliação automática do Speaking (offline). Plataforma-independente para ser testável no Linux.
// Listen and Repeat: alinhamento de palavras (Levenshtein) entre a transcrição e a frase oficial -> 0..5.
// Interview: métricas simples (palavras, ritmo, pausas, hesitações, variedade) -> faixa ESTIMADA 0..5.
// Os textos das razões ficam no JS (PT/EN); aqui só códigos e números.

import (
	"encoding/json"
	"math"
	"regexp"
	"strings"
	"unicode"
)

type sttWord struct {
	W    string `json:"w"`
	From int    `json:"from"` // ms
	To   int    `json:"to"`
}

// parseWhisperJSON lê a saída -ojf do whisper-cli e junta os tokens em palavras com tempo.
func parseWhisperJSON(b []byte) (string, []sttWord, error) {
	var d struct {
		Transcription []struct {
			Text   string `json:"text"`
			Tokens []struct {
				Text    string `json:"text"`
				Offsets struct {
					From int `json:"from"`
					To   int `json:"to"`
				} `json:"offsets"`
			} `json:"tokens"`
		} `json:"transcription"`
	}
	if err := json.Unmarshal(b, &d); err != nil {
		return "", nil, err
	}
	var text strings.Builder
	var out []sttWord
	for _, s := range d.Transcription {
		text.WriteString(s.Text)
		for _, t := range s.Tokens {
			if strings.HasPrefix(t.Text, "[_") || strings.HasPrefix(t.Text, "<|") {
				continue
			}
			tx := t.Text
			if tx == "" {
				continue
			}
			newWord := strings.HasPrefix(tx, " ") || len(out) == 0
			core := strings.TrimSpace(tx)
			if core == "" {
				continue
			}
			if !newWord || isPunct(core) && len(out) > 0 {
				w := &out[len(out)-1]
				w.W += core
				if !isPunct(core) && t.Offsets.To > w.To {
					w.To = t.Offsets.To
				}
				continue
			}
			out = append(out, sttWord{W: core, From: t.Offsets.From, To: t.Offsets.To})
		}
	}
	return strings.TrimSpace(cleanHallucination(text.String())), out, nil
}

func isPunct(s string) bool {
	for _, r := range s {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			return false
		}
	}
	return true
}

// marcações que o whisper produz para silêncio/ruído
var reNoise = regexp.MustCompile(`(?i)\[(blank_audio|silence|music|noise|inaudible|sound)[^\]]*\]|\((silence|music|noise|inaudible|blank audio)[^)]*\)`)

func cleanHallucination(s string) string { return strings.TrimSpace(reNoise.ReplaceAllString(s, "")) }

/* ---------- normalização ---------- */

var contractions = map[string]string{
	"i'm": "i am", "you're": "you are", "we're": "we are", "they're": "they are", "he's": "he is", "she's": "she is", "it's": "it is",
	"that's": "that is", "there's": "there is", "here's": "here is", "what's": "what is", "where's": "where is", "who's": "who is", "let's": "let us",
	"i've": "i have", "you've": "you have", "we've": "we have", "they've": "they have", "i'll": "i will", "you'll": "you will", "we'll": "we will",
	"they'll": "they will", "he'll": "he will", "she'll": "she will", "it'll": "it will", "i'd": "i would", "you'd": "you would", "we'd": "we would",
	"they'd": "they would", "he'd": "he would", "she'd": "she would", "can't": "can not", "cannot": "can not", "won't": "will not", "don't": "do not",
	"doesn't": "does not", "didn't": "did not", "isn't": "is not", "aren't": "are not", "wasn't": "was not", "weren't": "were not", "haven't": "have not",
	"hasn't": "has not", "hadn't": "had not", "wouldn't": "would not", "shouldn't": "should not", "couldn't": "could not", "mustn't": "must not",
	"gonna": "going to", "wanna": "want to",
}

var spellings = map[string]string{
	"centre": "center", "centres": "centers", "theatre": "theater", "theatres": "theaters", "colour": "color", "colours": "colors", "favourite": "favorite",
	"favourites": "favorites", "neighbour": "neighbor", "neighbours": "neighbors", "organise": "organize", "organised": "organized", "realise": "realize",
	"realised": "realized", "programme": "program", "programmes": "programs", "travelling": "traveling", "travelled": "traveled", "cancelled": "canceled",
	"licence": "license", "metre": "meter", "metres": "meters", "catalogue": "catalog", "behaviour": "behavior", "labour": "labor", "honour": "honor",
	"defence": "defense", "practise": "practice", "enrol": "enroll", "enrolment": "enrollment", "grey": "gray", "jewellery": "jewelry", "cheque": "check",
	"okay": "ok", "o.k.": "ok", "percent": "percent", "%": "percent", "&": "and", "e-mail": "email", "emails": "emails",
}

var numWords = []string{"zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen",
	"fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"}

// normWords: minúsculas, sem pontuação, contrações expandidas, hífen separa, grafia britânica -> americana.
func normWords(s string) []string {
	s = strings.ToLower(s)
	s = strings.NewReplacer("’", "'", "‘", "'", "`", "'", "´", "'", "—", " ", "–", " ", "-", " ", "/", " ").Replace(s)
	var out []string
	for _, f := range strings.Fields(s) {
		f = strings.TrimFunc(f, func(r rune) bool {
			return !(unicode.IsLetter(r) || unicode.IsDigit(r) || r == '\'' || r == '%' || r == '&')
		})
		f = strings.Trim(f, "'")
		if f == "" {
			continue
		}
		if v, ok := contractions[f]; ok {
			out = append(out, strings.Fields(v)...)
			continue
		}
		if v, ok := spellings[f]; ok {
			f = v
		}
		// apóstrofo restante (possessivo): visitor's -> visitors
		var b strings.Builder
		for _, r := range f {
			if unicode.IsLetter(r) || unicode.IsDigit(r) {
				b.WriteRune(r)
			}
		}
		f = b.String()
		if f == "" {
			continue
		}
		if n := atoiSmall(f); n >= 0 && n < len(numWords) {
			f = numWords[n]
		}
		out = append(out, f)
	}
	return out
}

func atoiSmall(s string) int {
	if len(s) == 0 || len(s) > 2 {
		return -1
	}
	n := 0
	for _, r := range s {
		if r < '0' || r > '9' {
			return -1
		}
		n = n*10 + int(r-'0')
	}
	return n
}

/* ---------- alinhamento ---------- */

type alignOp struct {
	Op  string `json:"op"` // ok, sub, del (faltou), ins (sobrou)
	Ref string `json:"ref,omitempty"`
	Hyp string `json:"hyp,omitempty"`
}

// alignWords: Levenshtein em palavras com reconstrução das operações.
func alignWords(ref, hyp []string) []alignOp {
	n, m := len(ref), len(hyp)
	d := make([][]int, n+1)
	for i := range d {
		d[i] = make([]int, m+1)
		d[i][0] = i
	}
	for j := 0; j <= m; j++ {
		d[0][j] = j
	}
	for i := 1; i <= n; i++ {
		for j := 1; j <= m; j++ {
			c := 1
			if ref[i-1] == hyp[j-1] {
				c = 0
			}
			d[i][j] = min3(d[i-1][j-1]+c, d[i-1][j]+1, d[i][j-1]+1)
		}
	}
	var ops []alignOp
	i, j := n, m
	for i > 0 || j > 0 {
		switch {
		case i > 0 && j > 0 && ref[i-1] == hyp[j-1] && d[i][j] == d[i-1][j-1]:
			ops = append(ops, alignOp{Op: "ok", Ref: ref[i-1], Hyp: hyp[j-1]})
			i, j = i-1, j-1
		case i > 0 && j > 0 && d[i][j] == d[i-1][j-1]+1:
			ops = append(ops, alignOp{Op: "sub", Ref: ref[i-1], Hyp: hyp[j-1]})
			i, j = i-1, j-1
		case i > 0 && d[i][j] == d[i-1][j]+1:
			ops = append(ops, alignOp{Op: "del", Ref: ref[i-1]})
			i--
		default:
			ops = append(ops, alignOp{Op: "ins", Hyp: hyp[j-1]})
			j--
		}
	}
	for a, b := 0, len(ops)-1; a < b; a, b = a+1, b-1 {
		ops[a], ops[b] = ops[b], ops[a]
	}
	return ops
}

func min3(a, b, c int) int {
	if b < a {
		a = b
	}
	if c < a {
		a = c
	}
	return a
}

var functionWords = map[string]bool{}

func init() {
	for _, w := range strings.Fields(`a an the and or but nor so yet if of to in on at by for from with about as into onto over under than then that this these those
		there here it its is am are was were be been being do does did have has had will would can could shall should may might must not no
		i me my mine you your yours he him his she her hers we us our ours they them their theirs who whom whose which what when where why how
		all any some each every both either neither one up down out off very just also too only please let`) {
		functionWords[w] = true
	}
}

type lrResult struct {
	Kind       string    `json:"kind"`
	Texto      string    `json:"texto"`
	Acc        int       `json:"acc"` // % = 100 * (1 - distância / palavras da frase), mínimo 0
	Nota       int       `json:"nota"`
	Ops        []alignOp `json:"ops"`
	Erros      int       `json:"erros"`
	Faltou     int       `json:"faltou"`
	Trocou     int       `json:"trocou"`
	Sobrou     int       `json:"sobrou"`
	Conteudo   int       `json:"conteudo"`   // palavras de conteúdo na frase oficial
	ConteudoOk int       `json:"conteudoOk"` // ... que apareceram na resposta
	Motivos    []string  `json:"motivos"`
}

// scoreRepeat: nota 0–5 de Listen and Repeat a partir do alinhamento.
// Níveis (resumo próprio da rubrica): 5 exata; 4 sentido mantido, pequenas mudanças (1–2 palavras funcionais ou
// 1 palavra de conteúdo); 3 essencialmente completa mas com o sentido alterado; 2 parte importante faltando;
// 1 muito pouco da frase; 0 sem resposta/sem relação.
func scoreRepeat(ref, transcript string) lrResult {
	r, h := normWords(ref), normWords(transcript)
	res := lrResult{Kind: "repeat", Texto: transcript, Ops: alignWords(r, h)}
	for _, w := range r {
		if !functionWords[w] {
			res.Conteudo++
		}
	}
	contentErr, funcErr := 0, 0
	for _, o := range res.Ops {
		switch o.Op {
		case "ok":
			continue
		case "del":
			res.Faltou++
		case "sub":
			res.Trocou++
		case "ins":
			res.Sobrou++
		}
		res.Erros++
		w := o.Ref // troca/falta conta pela palavra da frase; sobra, pela palavra dita
		if w == "" {
			w = o.Hyp
		}
		if functionWords[w] {
			funcErr++
		} else {
			contentErr++
		}
	}
	inHyp := map[string]int{}
	for _, w := range h {
		inHyp[w]++
	}
	for _, w := range r {
		if !functionWords[w] && inHyp[w] > 0 {
			res.ConteudoOk++
			inHyp[w]--
		}
	}
	if len(r) > 0 {
		res.Acc = int(math.Round(100 * math.Max(0, 1-float64(res.Erros)/float64(len(r)))))
	}
	matched := len(r) - res.Faltou - res.Trocou
	contentRatio := 1.0
	if res.Conteudo > 0 {
		contentRatio = float64(res.ConteudoOk) / float64(res.Conteudo)
	}
	switch {
	case len(h) == 0:
		res.Nota, res.Motivos = 0, []string{"lr_empty"}
	case res.ConteudoOk == 0 && matched*4 < len(r):
		res.Nota, res.Motivos = 0, []string{"lr_unrelated"}
	case res.Erros == 0:
		res.Nota, res.Motivos = 5, []string{"lr_exact"}
	case contentErr <= 1 && funcErr <= 2:
		res.Nota, res.Motivos = 4, []string{"lr_minor"}
	case contentRatio >= 0.5 && len(h)*10 >= len(r)*7:
		res.Nota, res.Motivos = 3, []string{"lr_meaning"}
	case contentRatio >= 0.3 || matched*2 >= len(r):
		res.Nota, res.Motivos = 2, []string{"lr_missing"}
	default:
		res.Nota, res.Motivos = 1, []string{"lr_little"}
	}
	return res
}

/* ---------- Interview ---------- */

type ivMetrics struct {
	Palavras   int     `json:"palavras"`
	Segundos   float64 `json:"segundos"` // da primeira à última palavra
	Inicio     float64 `json:"inicio"`   // silêncio antes da primeira palavra
	WPM        int     `json:"wpm"`
	Pausas     int     `json:"pausas"` // > 1,5 s entre palavras
	MaiorPausa float64 `json:"maiorPausa"`
	Hesitacoes int     `json:"hesitacoes"` // um, uh, like (marcador), you know...
	TTR        float64 `json:"ttr"`        // palavras diferentes / palavras (sem hesitações), nas primeiras 60
	Frases     int     `json:"frases"`
	Repetidas  int     `json:"repetidas"` // palavras de conteúdo copiadas da pergunta
	TamanhoOK  bool    `json:"tamanhoOk"`
}

type ivResult struct {
	Kind     string    `json:"kind"`
	Texto    string    `json:"texto"`
	Metricas ivMetrics `json:"metricas"`
	Nota     int       `json:"nota"` // ESTIMATIVA
	Motivos  []string  `json:"motivos"`
}

var fillers = map[string]bool{"um": true, "uh": true, "umm": true, "uhm": true, "uhh": true, "er": true, "erm": true, "hmm": true, "hm": true, "ah": true, "eh": true, "mm": true, "mmm": true}

var reSentence = regexp.MustCompile(`[.!?]+(\s|$)`)

func interviewMetrics(text string, ws []sttWord, question string) ivMetrics {
	var m ivMetrics
	// hesitações e palavras na ordem
	var content []string
	raw := make([]string, len(ws))
	for i, w := range ws {
		raw[i] = strings.ToLower(w.W)
	}
	for i, w := range raw {
		core := strings.Trim(w, ".,!?;:\"'()")
		if core == "" {
			continue
		}
		switch {
		case fillers[core]:
			m.Hesitacoes++
			continue
		case core == "like" && (strings.HasSuffix(w, ",") || i > 0 && strings.HasSuffix(raw[i-1], ",")):
			m.Hesitacoes++
			continue
		case core == "know" && i > 0 && strings.Trim(raw[i-1], ".,!?") == "you" && (strings.HasSuffix(w, ",") || i+1 == len(raw) || strings.HasSuffix(raw[i-1], ",")):
			m.Hesitacoes++
		}
		content = append(content, normWords(core)...)
	}
	m.Palavras = len(content)
	if len(ws) > 0 {
		m.Inicio = float64(ws[0].From) / 1000
		m.Segundos = float64(ws[len(ws)-1].To-ws[0].From) / 1000
		for i := 1; i < len(ws); i++ {
			g := float64(ws[i].From-ws[i-1].To) / 1000
			if g > 1.5 {
				m.Pausas++
			}
			if g > m.MaiorPausa {
				m.MaiorPausa = math.Round(g*10) / 10
			}
		}
	}
	if m.Segundos >= 3 {
		m.WPM = int(math.Round(float64(m.Palavras) / m.Segundos * 60))
	}
	lim := content
	if len(lim) > 60 {
		lim = lim[:60]
	}
	seen := map[string]bool{}
	for _, w := range lim {
		seen[w] = true
	}
	if len(lim) > 0 {
		m.TTR = math.Round(float64(len(seen))/float64(len(lim))*100) / 100
	}
	for _, s := range reSentence.Split(strings.TrimSpace(text), -1) {
		if len(normWords(s)) >= 3 {
			m.Frases++
		}
	}
	// pergunta copiada: sequências de 4+ palavras iguais às da pergunta
	if q := normWords(question); len(q) >= 4 && len(content) >= 4 {
		grams := map[string]bool{}
		for i := 0; i+4 <= len(q); i++ {
			grams[strings.Join(q[i:i+4], " ")] = true
		}
		for i := 0; i+4 <= len(content); i++ {
			if grams[strings.Join(content[i:i+4], " ")] {
				m.Repetidas++
			}
		}
	}
	m.TamanhoOK = m.Palavras >= 50
	return m
}

// bandInterview: faixa ESTIMADA. Só forma (quantidade, fluidez, variedade); não avalia conteúdo nem gramática.
// Calibrado nas respostas de exemplo da ETS (notas 3, 4 e 5; ~60 s, 65–85 palavras, 65–90 palavras/min):
// forma boa leva a 4; 5 só com ritmo, variedade e poucas hesitações ao mesmo tempo.
func bandInterview(m ivMetrics) (int, []string) {
	if m.Palavras == 0 {
		return 0, []string{"iv_empty"}
	}
	var why []string
	score := 5.0
	switch {
	case m.Palavras < 12:
		score, why = 1, append(why, "iv_veryshort")
	case m.Palavras < 25:
		score, why = 2, append(why, "iv_short")
	case m.Palavras < 40:
		score, why = 3, append(why, "iv_shortish")
	case m.Palavras < 50:
		score, why = 4, append(why, "iv_almost")
	default:
		why = append(why, "iv_length_ok")
	}
	pen := func(v float64, code string) { score -= v; why = append(why, code) }
	if m.WPM > 0 && m.WPM < 45 {
		pen(1, "iv_slow")
	} else if m.WPM > 0 && m.WPM < 60 {
		pen(0.5, "iv_slowish")
	}
	if m.Pausas >= 3 {
		pen(1, "iv_pauses")
	} else if m.Pausas == 2 {
		pen(0.5, "iv_pause")
	}
	fr := 0.0
	if t := m.Palavras + m.Hesitacoes; t > 0 {
		fr = float64(m.Hesitacoes) / float64(t)
	}
	if fr > 0.15 {
		pen(1, "iv_fillers")
	}
	if m.Palavras >= 30 && m.TTR > 0 && m.TTR < 0.55 {
		pen(0.5, "iv_repetitive")
	}
	if m.Frases < 2 && m.Palavras >= 25 {
		pen(0.5, "iv_onesentence")
	}
	if m.Repetidas >= 3 {
		pen(0.5, "iv_copied")
	}
	if m.Inicio > 5 {
		pen(0.5, "iv_latestart")
	}
	n := int(math.Floor(score)) // meio ponto arredonda para baixo
	if n >= 5 && !(m.WPM >= 80 && m.TTR >= 0.70 && fr <= 0.10 && m.Pausas <= 1) {
		n = 4
		why = append(why, "iv_not_top")
	} else if n >= 5 {
		why = append(why, "iv_top")
	}
	if n < 1 {
		n = 1
	}
	return n, why
}

func scoreInterview(text string, ws []sttWord, question string) ivResult {
	m := interviewMetrics(text, ws, question)
	n, why := bandInterview(m)
	return ivResult{Kind: "interview", Texto: text, Metricas: m, Nota: n, Motivos: why}
}
