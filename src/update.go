package main

// Atualizações (v1.6.0): consulta a última release pública no GitHub (API sem autenticação),
// baixa o zip TreinoTalTech-vX.Y.Z.zip, confere o SHA-256 quando a release publica um
// (arquivo <zip>.sha256, SHA256SUMS ou o hash no texto da release), e troca os arquivos ao lado do exe.
// Nunca mexe em %APPDATA%\TreinoTalTech (progresso, gravações, pacotes de conteúdo, modelo baixado).

import (
	"archive/zip"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

var (
	updateAPI  = "https://api.github.com/repos/RenatoSouzaAN/taltech-prep-trainer/releases/latest"
	updAssetRe = regexp.MustCompile(`(?i)^TreinoTalTech-v?[0-9][0-9.]*\.zip$`)
	sha64Re    = regexp.MustCompile(`(?i)\b[a-f0-9]{64}\b`)
	updMu      sync.Mutex
	updClient  = &http.Client{Timeout: 20 * time.Second}
	exeDirFn   = func() (string, error) {
		e, err := os.Executable()
		if err != nil {
			return "", err
		}
		e, _ = filepath.EvalSymlinks(e)
		return filepath.Dir(e), nil
	}
	updMaxZip    = int64(500) << 20
	updExeName   = "TreinoTalTech.exe"
	lastUpdCheck *UpdateInfo // guardado para o download não depender do JS mandar URLs
)

type UpdateAsset struct {
	Name string `json:"name"`
	Size int64  `json:"size"`
	URL  string `json:"url"`
}

type UpdateInfo struct {
	Current   string       `json:"current"`
	Latest    string       `json:"latest"`
	Tag       string       `json:"tag"`
	Newer     bool         `json:"newer"`
	Name      string       `json:"name"`
	Notes     string       `json:"notes"`
	Page      string       `json:"page"`
	Published string       `json:"published"`
	Asset     *UpdateAsset `json:"asset,omitempty"`
	SHA256    string       `json:"sha256,omitempty"`
	ShaFrom   string       `json:"shaFrom,omitempty"` // "arquivo" | "texto" | ""
	shaURL    string
}

type ghRelease struct {
	TagName     string `json:"tag_name"`
	Name        string `json:"name"`
	Body        string `json:"body"`
	HTMLURL     string `json:"html_url"`
	PublishedAt string `json:"published_at"`
	Draft       bool   `json:"draft"`
	Prerelease  bool   `json:"prerelease"`
	Assets      []struct {
		Name string `json:"name"`
		Size int64  `json:"size"`
		URL  string `json:"browser_download_url"`
	} `json:"assets"`
}

// semver simples: "v1.6.0" / "1.6" / "1.6.0-beta" → [1 6 0], pre = "beta".
func parseVer(v string) ([3]int, string, bool) {
	var out [3]int
	v = strings.TrimPrefix(strings.TrimSpace(strings.ToLower(v)), "v")
	pre := ""
	if i := strings.IndexAny(v, "-+"); i >= 0 {
		if v[i] == '-' {
			pre = v[i+1:]
			if j := strings.IndexByte(pre, '+'); j >= 0 {
				pre = pre[:j]
			}
		}
		v = v[:i]
	}
	parts := strings.Split(v, ".")
	if len(parts) == 0 || len(parts) > 3 {
		return out, "", false
	}
	for i, p := range parts {
		n, err := strconv.Atoi(p)
		if err != nil || n < 0 {
			return out, "", false
		}
		out[i] = n
	}
	return out, pre, true
}

// cmpSemver: -1 se a < b, 0 se iguais, 1 se a > b (versões inválidas contam como menores).
func cmpSemver(a, b string) int {
	va, pa, oka := parseVer(a)
	vb, pb, okb := parseVer(b)
	switch {
	case !oka && !okb:
		return 0
	case !oka:
		return -1
	case !okb:
		return 1
	}
	for i := 0; i < 3; i++ {
		if va[i] != vb[i] {
			if va[i] < vb[i] {
				return -1
			}
			return 1
		}
	}
	switch {
	case pa == pb:
		return 0
	case pa == "": // 1.6.0 > 1.6.0-beta
		return 1
	case pb == "":
		return -1
	case pa < pb:
		return -1
	}
	return 1
}

func updGet(ctx context.Context, url string, accept string, limit int64) ([]byte, int, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, 0, err
	}
	req.Header.Set("User-Agent", appName+"/"+appVersion)
	req.Header.Set("Accept", accept)
	if strings.Contains(url, "api.github.com") {
		req.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	}
	resp, err := updClient.Do(req)
	if err != nil {
		return nil, 0, fmt.Errorf("upd:offline: %v", err)
	}
	defer resp.Body.Close()
	b, err := io.ReadAll(io.LimitReader(resp.Body, limit))
	if err != nil {
		return nil, resp.StatusCode, fmt.Errorf("upd:offline: %v", err)
	}
	return b, resp.StatusCode, nil
}

// checkUpdate consulta a release mais recente.
func checkUpdate() (*UpdateInfo, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 25*time.Second)
	defer cancel()
	b, code, err := updGet(ctx, updateAPI, "application/vnd.github+json", 2<<20)
	if err != nil {
		return nil, err
	}
	switch {
	case code == 404:
		return nil, errors.New("upd:sem_release")
	case code == 403 || code == 429:
		return nil, errors.New("upd:limite")
	case code != 200:
		return nil, fmt.Errorf("upd:http: %d", code)
	}
	var r ghRelease
	if json.Unmarshal(b, &r) != nil || r.TagName == "" {
		return nil, errors.New("upd:resposta")
	}
	info := &UpdateInfo{Current: appVersion, Tag: r.TagName, Latest: strings.TrimPrefix(r.TagName, "v"),
		Name: r.Name, Notes: r.Body, Page: r.HTMLURL, Published: r.PublishedAt}
	if len(info.Notes) > 20000 {
		info.Notes = info.Notes[:20000]
	}
	if _, _, ok := parseVer(info.Latest); !ok {
		return nil, errors.New("upd:resposta")
	}
	info.Newer = !r.Draft && !r.Prerelease && cmpSemver(info.Latest, appVersion) > 0
	for _, a := range r.Assets {
		if updAssetRe.MatchString(a.Name) && strings.HasPrefix(a.URL, "https://") {
			info.Asset = &UpdateAsset{Name: a.Name, Size: a.Size, URL: a.URL}
			break
		}
	}
	if info.Asset != nil {
		for _, a := range r.Assets {
			n := strings.ToLower(a.Name)
			if n == strings.ToLower(info.Asset.Name)+".sha256" || (info.shaURL == "" && (n == "sha256sums" || n == "sha256sums.txt")) {
				info.shaURL = a.URL
			}
		}
		if info.shaURL == "" {
			info.SHA256, info.ShaFrom = shaFromText(r.Body, info.Asset.Name), "texto"
			if info.SHA256 == "" {
				info.ShaFrom = ""
			}
		} else {
			info.ShaFrom = "arquivo"
		}
	}
	updMu.Lock()
	lastUpdCheck = info
	updMu.Unlock()
	return info, nil
}

// shaFromText: uma linha que tenha o nome do asset e um hash; senão, um único hash no texto todo.
func shaFromText(body, asset string) string {
	for _, ln := range strings.Split(body, "\n") {
		if strings.Contains(strings.ToLower(ln), strings.ToLower(asset)) {
			if m := sha64Re.FindString(ln); m != "" {
				return strings.ToLower(m)
			}
		}
	}
	if all := sha64Re.FindAllString(body, -1); len(all) == 1 {
		return strings.ToLower(all[0])
	}
	return ""
}

func updTempDir() string { return filepath.Join(os.TempDir(), "TreinoTalTech-update") }

// installUpdate: baixa, confere, extrai e troca os arquivos. Depois o JS chama goRestartAfterUpdate.
func installUpdate(prog func(done, total int64)) (any, error) {
	if !updInstalling.CompareAndSwap(false, true) {
		return nil, errors.New("upd:em_andamento")
	}
	defer updInstalling.Store(false)
	updMu.Lock()
	info := lastUpdCheck
	updMu.Unlock()
	if info == nil || info.Asset == nil {
		return nil, errors.New("upd:sem_arquivo")
	}
	if !info.Newer {
		return nil, errors.New("upd:atualizado")
	}
	exeDir, err := exeDirFn()
	if err != nil {
		return nil, err
	}
	if err := safeInstallDir(exeDir); err != nil {
		return nil, err
	}
	tmp := updTempDir()
	os.RemoveAll(tmp)
	if err := os.MkdirAll(tmp, 0o755); err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Minute)
	defer cancel()
	sha := info.SHA256
	if info.shaURL != "" {
		b, code, err := updGet(ctx, info.shaURL, "application/octet-stream", 64<<10)
		if err != nil || code != 200 {
			return nil, errors.New("upd:sha_indisponivel")
		}
		sha = shaFromText(string(b), info.Asset.Name)
		if sha == "" {
			return nil, errors.New("upd:sha_indisponivel")
		}
	}
	zp := filepath.Join(tmp, info.Asset.Name)
	if err := downloadVerified(ctx, info.Asset.URL, zp, info.Asset.Size, sha, updMaxZip, prog); err != nil {
		return nil, err
	}
	n, err := applyUpdateZip(zp, exeDir)
	if err != nil {
		return nil, err
	}
	os.RemoveAll(tmp)
	return map[string]any{"version": info.Latest, "files": n, "verified": sha != ""}, nil
}

// safeInstallDir recusa instalar dentro da pasta de dados (nunca deve acontecer, mas protege o progresso).
func safeInstallDir(exeDir string) error {
	d, err := appDir()
	if err != nil {
		return nil
	}
	if r, err := filepath.Rel(d, exeDir); err == nil && (r == "." || filepath.IsLocal(r)) {
		return errors.New("upd:pasta_dados")
	}
	return nil
}

// applyUpdateZip copia os arquivos do zip (raiz ou pasta TreinoTalTech/) para exeDir.
// Cada arquivo existente é renomeado para .old antes (o Windows permite renomear o exe em execução);
// se algo falhar, tudo volta como estava. Arquivos que não estão no zip (ex.: o modelo da v1.5) ficam.
func applyUpdateZip(zp, exeDir string) (int, error) {
	zr, err := zip.OpenReader(zp)
	if err != nil {
		return 0, errors.New("upd:zip_invalido")
	}
	defer zr.Close()
	prefix := zipPrefix(zr.File, updExeName)
	ents, _, err := zipEntries(zr.File, prefix, 2<<30)
	if err != nil {
		return 0, err
	}
	hasExe := false
	for _, e := range ents {
		if strings.EqualFold(e.Rel, updExeName) {
			hasExe = true
		}
	}
	if !hasExe {
		return 0, errors.New("upd:zip_invalido")
	}
	// 1) extrai tudo como .new (se falhar aqui, nada foi trocado)
	var news []string
	cleanNew := func() {
		for _, p := range news {
			os.Remove(p)
		}
	}
	for _, e := range ents {
		ne := e
		ne.Rel = e.Rel + ".new"
		if err := extractEntry(exeDir, ne); err != nil {
			cleanNew()
			return 0, fmt.Errorf("upd:gravar: %v", err)
		}
		news = append(news, filepath.Join(exeDir, filepath.FromSlash(ne.Rel)))
	}
	// 2) troca: alvo → .old, .new → alvo
	type swap struct{ dst, old string }
	var done []swap
	rollback := func() {
		for i := len(done) - 1; i >= 0; i-- {
			s := done[i]
			os.Remove(s.dst)
			if s.old != "" {
				os.Rename(s.old, s.dst)
			}
		}
		cleanNew()
	}
	for _, e := range ents {
		dst := filepath.Join(exeDir, filepath.FromSlash(e.Rel))
		old := ""
		if _, err := os.Stat(dst); err == nil {
			old = dst + ".old"
			os.Remove(old)
			if err := os.Rename(dst, old); err != nil {
				rollback()
				return 0, fmt.Errorf("upd:em_uso: %s", e.Rel)
			}
		}
		if err := os.Rename(dst+".new", dst); err != nil {
			if old != "" {
				os.Rename(old, dst)
			}
			rollback()
			return 0, fmt.Errorf("upd:gravar: %v", err)
		}
		done = append(done, swap{dst, old})
	}
	return len(ents), nil
}

// cleanupAfterUpdate: no início do app, apaga os .old deixados pela troca e a pasta temporária.
func cleanupAfterUpdate() {
	os.RemoveAll(updTempDir())
	exeDir, err := exeDirFn()
	if err != nil {
		return
	}
	for _, d := range []string{exeDir, filepath.Join(exeDir, "stt")} {
		des, err := os.ReadDir(d)
		if err != nil {
			continue
		}
		for _, de := range des {
			if !de.IsDir() && (strings.HasSuffix(de.Name(), ".old") || strings.HasSuffix(de.Name(), ".new")) {
				os.Remove(filepath.Join(d, de.Name()))
			}
		}
	}
}

var updInstalling atomic.Bool
