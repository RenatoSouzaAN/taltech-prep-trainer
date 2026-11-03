package main

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"io/fs"
	"net/url"
	"path"
	"regexp"
)

// Conteúdo dos Simulados: desde a v1.6.0 vem de pacotes importados (%APPDATA%\TreinoTalTech\conteudo\<id>\,
// tipo "simulados", id interno "ets"), somados ao que estiver embutido (só em builds locais com -tags etsembed).
// Cada fonte tem ets_tests.json, audio/<teste>/<chave>.ogg e (opcional) rubrics.json.
// Ordem de prioridade: pacotes (por id) e depois o embutido; um teste com o mesmo id fica com a primeira fonte.

// etsSources devolve as fontes na ordem de prioridade.
func etsSources() []fs.FS {
	var out []fs.FS
	for _, p := range installedPacks() {
		if p.Type == "ets" && p.Error == "" {
			out = append(out, packFS(p.ID))
		}
	}
	if e := embeddedEts(); e != nil {
		out = append(out, e)
	}
	return out
}

// etsData junta os testes de todas as fontes num JSON {version, note, tests:[...]}. "" se não há nenhum.
func etsData() string {
	var base map[string]json.RawMessage
	var tests []json.RawMessage
	seen := map[string]bool{}
	for _, src := range etsSources() {
		b, err := fs.ReadFile(src, "ets_tests.json")
		if err != nil {
			continue
		}
		var o map[string]json.RawMessage
		if json.Unmarshal(b, &o) != nil {
			continue
		}
		var ts []json.RawMessage
		if json.Unmarshal(o["tests"], &ts) != nil {
			continue
		}
		if base == nil {
			base = o
		}
		for _, t := range ts {
			var id struct {
				ID string `json:"id"`
			}
			if json.Unmarshal(t, &id) != nil || id.ID == "" || seen[id.ID] {
				continue
			}
			seen[id.ID] = true
			tests = append(tests, t)
		}
	}
	if len(tests) == 0 {
		return ""
	}
	tb, _ := json.Marshal(tests)
	base["tests"] = tb
	out, err := json.Marshal(base)
	if err != nil {
		return ""
	}
	return string(out)
}

var etsKeyRe = regexp.MustCompile(`^[a-z0-9]+/[A-Za-z0-9_]+$`)

// etsAudio devolve o áudio (ogg/opus) em base64; key = "<teste>/<chave>", ex. "flpt1/L1_q1".
func etsAudio(key string) (string, error) {
	if !etsKeyRe.MatchString(key) {
		return "", errors.New("chave de áudio inválida")
	}
	for _, src := range etsSources() {
		if b, err := fs.ReadFile(src, path.Join("audio", key+".ogg")); err == nil {
			return base64.StdEncoding.EncodeToString(b), nil
		}
	}
	return "", errors.New("áudio não incluído: " + key)
}

// etsRubrics: o primeiro rubrics.json encontrado nas fontes.
func etsRubrics() []byte {
	for _, src := range etsSources() {
		if b, err := fs.ReadFile(src, "rubrics.json"); err == nil {
			return b
		}
	}
	return nil
}

// safeURL aceita só https:// com host (links de origem dos testes etc.).
func safeURL(raw string) (string, error) {
	u, err := url.Parse(raw)
	if err != nil || u.Scheme != "https" || u.Host == "" {
		return "", errors.New("link inválido")
	}
	return u.String(), nil
}
