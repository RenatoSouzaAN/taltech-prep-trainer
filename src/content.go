package main

// Pacotes de conteúdo (v1.6.0): .zip com manifest.json importado para %APPDATA%\TreinoTalTech\conteudo\<id>\.
//   tipo "simulados" (ou "ets", id interno): simulados (ets_tests.json, audio/<teste>/*.ogg, rubrics.json)
//   tipo "arquivos": arquivos do usuário (PDFs, áudios, notas...) que o app lista e abre no programa padrão.
// Os pacotes ficam só no computador do usuário; nada disso vai para o repositório nem para a release.

import (
	"archive/zip"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"
)

const (
	packManifest = "manifest.json"
	packMaxBytes = int64(4) << 30 // 4 GB descompactado
	packMaxList  = 2000
)

type PackManifest struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Version     string `json:"version"`
	Type        string `json:"type"` // "ets" (aceita "simulados") | "arquivos"
	Description string `json:"description,omitempty"`
}

type PackFile struct {
	Path string `json:"path"` // relativo, com "/"
	Size int64  `json:"size"`
	Ext  string `json:"ext"`
	Open bool   `json:"open"` // tipo que o app aceita abrir
}

type PackInfo struct {
	PackManifest
	Dir       string     `json:"dir"`
	Files     int        `json:"files"`
	Bytes     int64      `json:"bytes"`
	Tests     []string   `json:"tests,omitempty"` // ets: ids dos simulados
	List      []PackFile `json:"list,omitempty"`  // arquivos: lista (até packMaxList)
	Truncated bool       `json:"truncated,omitempty"`
	Installed string     `json:"installed,omitempty"` // data da importação (RFC3339)
	Error     string     `json:"error,omitempty"`     // pacote instalado mas ilegível
}

// PackPreview: o que o JS mostra antes de confirmar a importação.
type PackPreview struct {
	PackInfo
	File     string `json:"file"`
	Existing string `json:"existing,omitempty"` // versão já instalada com o mesmo id
}

var (
	packIDRe  = regexp.MustCompile(`^[a-z0-9][a-z0-9_-]{1,47}$`)
	testIDRe  = regexp.MustCompile(`^[a-z0-9]+$`)
	packMu    sync.Mutex // importação/remoção, uma por vez
	openExts  = map[string]bool{}
	packTypes = map[string]bool{"ets": true, "arquivos": true}
)

func init() {
	// Abrir no programa padrão só tipos de documento/mídia (nunca executáveis ou scripts).
	for _, e := range strings.Fields(`pdf txt md markdown rtf csv json doc docx odt xls xlsx ods ppt pptx odp epub
		png jpg jpeg gif webp bmp svg mp3 wav ogg opus m4a aac flac wma webm mp4 m4v mkv avi mov wmv srt vtt html htm`) {
		openExts["."+e] = true
	}
}

func contentRoot() (string, error) {
	d, err := appDir()
	if err != nil {
		return "", err
	}
	root := filepath.Join(d, "conteudo")
	return root, os.MkdirAll(root, 0o755)
}

func packDir(id string) (string, error) {
	if !packIDRe.MatchString(id) {
		return "", errors.New("pac:id_invalido")
	}
	root, err := contentRoot()
	if err != nil {
		return "", err
	}
	return filepath.Join(root, id), nil
}

func packFS(id string) fs.FS {
	d, err := packDir(id)
	if err != nil {
		return os.DirFS(os.DevNull)
	}
	return os.DirFS(d)
}

func validManifest(m PackManifest) error {
	switch {
	case !packIDRe.MatchString(m.ID):
		return errors.New("pac:id_invalido")
	case strings.TrimSpace(m.Name) == "" || len(m.Name) > 100:
		return errors.New("pac:nome_invalido")
	case strings.TrimSpace(m.Version) == "" || len(m.Version) > 30:
		return errors.New("pac:versao_invalida")
	case !packTypes[m.Type]:
		return errors.New("pac:tipo_invalido")
	case len(m.Description) > 2000:
		return errors.New("pac:manifest_invalido")
	}
	return nil
}

func parseManifest(b []byte) (PackManifest, error) {
	var m PackManifest
	if err := json.Unmarshal(b, &m); err != nil {
		return m, errors.New("pac:manifest_invalido")
	}
	m.Name, m.Version, m.Description = strings.TrimSpace(m.Name), strings.TrimSpace(m.Version), strings.TrimSpace(m.Description)
	if m.Type == "simulados" { // nome público do tipo; "ets" continua aceito (id interno, pacotes antigos)
		m.Type = "ets"
	}
	return m, validManifest(m)
}

// etsTestIDs valida um ets_tests.json e devolve os ids dos testes.
func etsTestIDs(b []byte) ([]string, error) {
	var o struct {
		Tests []struct {
			ID string `json:"id"`
		} `json:"tests"`
	}
	if json.Unmarshal(b, &o) != nil || len(o.Tests) == 0 {
		return nil, errors.New("pac:ets_invalido")
	}
	var ids []string
	for _, t := range o.Tests {
		if !testIDRe.MatchString(t.ID) {
			return nil, errors.New("pac:ets_invalido")
		}
		ids = append(ids, t.ID)
	}
	return ids, nil
}

func fileEntry(rel string, size int64) PackFile {
	ext := strings.ToLower(filepath.Ext(rel))
	return PackFile{Path: rel, Size: size, Ext: strings.TrimPrefix(ext, "."), Open: openExts[ext]}
}

// inspectZip valida o .zip sem extrair nada.
func inspectZip(zr *zip.Reader) (PackInfo, []zipEntry, error) {
	var info PackInfo
	prefix := zipPrefix(zr.File, packManifest)
	var mf *zip.File
	for _, f := range zr.File {
		if zipName(f.Name) == prefix+packManifest {
			mf = f
		}
	}
	if mf == nil {
		return info, nil, errors.New("pac:sem_manifest")
	}
	mb, err := readZipFile(mf, 64<<10)
	if err != nil {
		return info, nil, errors.New("pac:manifest_invalido")
	}
	m, err := parseManifest(mb)
	if err != nil {
		return info, nil, err
	}
	ents, total, err := zipEntries(zr.File, prefix, packMaxBytes)
	if err != nil {
		return info, nil, err
	}
	info.PackManifest, info.Bytes = m, total
	for _, e := range ents {
		if e.Rel == packManifest {
			continue
		}
		info.Files++
		if m.Type == "arquivos" {
			if len(info.List) < packMaxList {
				info.List = append(info.List, fileEntry(e.Rel, int64(e.F.UncompressedSize64)))
			} else {
				info.Truncated = true
			}
		}
	}
	if m.Type == "ets" {
		var tj *zip.File
		for _, e := range ents {
			if e.Rel == "ets_tests.json" {
				tj = e.F
			}
		}
		if tj == nil {
			return info, nil, errors.New("pac:ets_invalido")
		}
		b, err := readZipFile(tj, 64<<20)
		if err != nil {
			return info, nil, errors.New("pac:ets_invalido")
		}
		if info.Tests, err = etsTestIDs(b); err != nil {
			return info, nil, err
		}
	}
	if info.Files == 0 {
		return info, nil, errors.New("pac:vazio")
	}
	return info, ents, nil
}

func installedVersion(id string) string {
	d, err := packDir(id)
	if err != nil {
		return ""
	}
	b, err := os.ReadFile(filepath.Join(d, packManifest))
	if err != nil {
		return ""
	}
	var m PackManifest
	if json.Unmarshal(b, &m) != nil {
		return "?"
	}
	return m.Version
}

// previewPack: chamado depois do diálogo de abrir; só lê.
func previewPack(zipPath string) (*PackPreview, error) {
	zr, err := zip.OpenReader(zipPath)
	if err != nil {
		return nil, errors.New("pac:zip_invalido")
	}
	defer zr.Close()
	info, _, err := inspectZip(&zr.Reader)
	if err != nil {
		return nil, err
	}
	return &PackPreview{PackInfo: info, File: filepath.Base(zipPath), Existing: installedVersion(info.ID)}, nil
}

// importPack extrai para conteudo\.tmp-*, e só no fim troca pela pasta definitiva (o pacote antigo
// com o mesmo id é substituído; se algo falhar no caminho, o antigo continua intacto).
func importPack(zipPath string, prog func(done, total int64)) (*PackInfo, error) {
	packMu.Lock()
	defer packMu.Unlock()
	zr, err := zip.OpenReader(zipPath)
	if err != nil {
		return nil, errors.New("pac:zip_invalido")
	}
	defer zr.Close()
	info, ents, err := inspectZip(&zr.Reader)
	if err != nil {
		return nil, err
	}
	root, err := contentRoot()
	if err != nil {
		return nil, err
	}
	stamp := fmt.Sprint(time.Now().UnixNano())
	tmp := filepath.Join(root, ".tmp-"+info.ID+"-"+stamp)
	if err := os.MkdirAll(tmp, 0o755); err != nil {
		return nil, err
	}
	ok := false
	defer func() {
		if !ok {
			os.RemoveAll(tmp)
		}
	}()
	var done int64
	for _, e := range ents {
		if err := extractEntry(tmp, e); err != nil {
			return nil, fmt.Errorf("pac:extrair: %v", err)
		}
		done += int64(e.F.UncompressedSize64)
		if prog != nil {
			prog(done, info.Bytes)
		}
	}
	// grava a data de importação
	_ = os.WriteFile(filepath.Join(tmp, ".importado"), []byte(time.Now().Format(time.RFC3339)), 0o644)
	dst := filepath.Join(root, info.ID)
	old := ""
	if _, err := os.Stat(dst); err == nil {
		old = filepath.Join(root, ".old-"+info.ID+"-"+stamp)
		if err := os.Rename(dst, old); err != nil {
			return nil, errors.New("pac:em_uso")
		}
	}
	if err := os.Rename(tmp, dst); err != nil {
		if old != "" {
			_ = os.Rename(old, dst)
		}
		return nil, fmt.Errorf("pac:extrair: %v", err)
	}
	ok = true
	if old != "" {
		_ = os.RemoveAll(old)
	}
	p := readPack(dst, info.ID)
	return &p, nil
}

// readPack lê um pacote instalado.
func readPack(dir, id string) PackInfo {
	p := PackInfo{Dir: dir}
	p.ID = id
	b, err := os.ReadFile(filepath.Join(dir, packManifest))
	if err != nil {
		p.Name, p.Error = id, "pac:sem_manifest"
		return p
	}
	m, err := parseManifest(b)
	if err != nil || m.ID != id {
		p.Name, p.Error = id, "pac:manifest_invalido"
		return p
	}
	p.PackManifest = m
	if t, err := os.ReadFile(filepath.Join(dir, ".importado")); err == nil {
		p.Installed = strings.TrimSpace(string(t))
	}
	_ = filepath.WalkDir(dir, func(fp string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return nil
		}
		rel, _ := filepath.Rel(dir, fp)
		rel = filepath.ToSlash(rel)
		if rel == packManifest || rel == ".importado" {
			return nil
		}
		fi, err := d.Info()
		if err != nil || !fi.Mode().IsRegular() {
			return nil
		}
		p.Files++
		p.Bytes += fi.Size()
		if m.Type == "arquivos" {
			if len(p.List) < packMaxList {
				p.List = append(p.List, fileEntry(rel, fi.Size()))
			} else {
				p.Truncated = true
			}
		}
		return nil
	})
	if m.Type == "ets" {
		tb, err := os.ReadFile(filepath.Join(dir, "ets_tests.json"))
		if err == nil {
			p.Tests, err = etsTestIDs(tb)
		}
		if err != nil {
			p.Error = "pac:ets_invalido"
		}
	}
	sort.Slice(p.List, func(i, j int) bool { return strings.ToLower(p.List[i].Path) < strings.ToLower(p.List[j].Path) })
	return p
}

// installedPacks lista conteudo\*\ (ignora restos .tmp-/.old- de uma importação interrompida, e os apaga).
func installedPacks() []PackInfo {
	root, err := contentRoot()
	if err != nil {
		return nil
	}
	des, err := os.ReadDir(root)
	if err != nil {
		return nil
	}
	var out []PackInfo
	for _, d := range des {
		n := d.Name()
		if !d.IsDir() {
			continue
		}
		if strings.HasPrefix(n, ".tmp-") || strings.HasPrefix(n, ".old-") {
			if packMu.TryLock() {
				_ = os.RemoveAll(filepath.Join(root, n))
				packMu.Unlock()
			}
			continue
		}
		if !packIDRe.MatchString(n) {
			continue
		}
		out = append(out, readPack(filepath.Join(root, n), n))
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	return out
}

func removePack(id string) error {
	packMu.Lock()
	defer packMu.Unlock()
	d, err := packDir(id)
	if err != nil {
		return err
	}
	if _, err := os.Stat(d); err != nil {
		return errors.New("pac:nao_instalado")
	}
	root := filepath.Dir(d)
	tmp := filepath.Join(root, ".old-"+id+"-"+fmt.Sprint(time.Now().UnixNano()))
	if err := os.Rename(d, tmp); err != nil { // algum arquivo aberto em outro programa
		return errors.New("pac:em_uso")
	}
	return os.RemoveAll(tmp)
}

// packFilePath valida id + caminho relativo e devolve o caminho absoluto de um arquivo que pode ser aberto.
func packFilePath(id, rel string) (string, error) {
	d, err := packDir(id)
	if err != nil {
		return "", err
	}
	n := zipName(rel)
	if n == "" || n == packManifest {
		return "", errors.New("pac:arquivo_invalido")
	}
	if !openExts[strings.ToLower(filepath.Ext(n))] {
		return "", errors.New("pac:tipo_bloqueado")
	}
	p := filepath.Join(d, filepath.FromSlash(n))
	if r, err := filepath.Rel(d, p); err != nil || !filepath.IsLocal(r) {
		return "", errors.New("pac:arquivo_invalido")
	}
	fi, err := os.Lstat(p)
	if err != nil || !fi.Mode().IsRegular() {
		return "", errors.New("pac:arquivo_invalido")
	}
	return p, nil
}
