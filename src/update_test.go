package main

import (
	"archive/zip"
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestCmpSemver(t *testing.T) {
	for _, c := range []struct {
		a, b string
		w    int
	}{{"1.6.0", "1.5.0", 1}, {"v1.5.0", "1.5.0", 0}, {"1.10.0", "1.9.9", 1}, {"1.6", "1.6.0", 0},
		{"1.6.0-beta", "1.6.0", -1}, {"2.0.0", "1.99.99", 1}, {"lixo", "1.0.0", -1}, {"1.5.1", "1.6.0", -1}} {
		if g := cmpSemver(c.a, c.b); g != c.w {
			t.Errorf("%s vs %s = %d, quer %d", c.a, c.b, g, c.w)
		}
	}
}

func zipBytes(files map[string]string) []byte {
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	for n, c := range files {
		w, _ := zw.Create(n)
		w.Write([]byte(c))
	}
	zw.Close()
	return buf.Bytes()
}

type fakeGH struct {
	srv     *httptest.Server
	status  int
	tag     string
	zip     []byte
	shaMode string // "asset" | "body" | "none" | "wrong"
	assetNm string
}

func newFakeGH(t *testing.T) *fakeGH {
	f := &fakeGH{status: 200, tag: "v9.9.9", shaMode: "asset", assetNm: "TreinoTalTech-v9.9.9.zip"}
	f.zip = zipBytes(map[string]string{
		"TreinoTalTech/TreinoTalTech.exe":   "EXE-NOVO",
		"TreinoTalTech/README-pt.txt":       "leia",
		"TreinoTalTech/stt/whisper-cli.exe": "CLI-NOVO",
		"TreinoTalTech/stt/LEIA-ME.txt":     "stt",
	})
	f.srv = httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		sum := sha256.Sum256(f.zip)
		sha := hex.EncodeToString(sum[:])
		if f.shaMode == "wrong" {
			sha = strings.Repeat("0", 64)
		}
		switch r.URL.Path {
		case "/latest":
			if r.Header.Get("User-Agent") == "" {
				w.WriteHeader(400)
				return
			}
			if f.status != 200 {
				w.WriteHeader(f.status)
				return
			}
			assets := []map[string]any{
				{"name": f.assetNm, "size": len(f.zip), "browser_download_url": f.srv.URL + "/dl/app.zip"},
				{"name": "content-pack.zip", "size": 1, "browser_download_url": f.srv.URL + "/dl/ets.zip"},
			}
			body := "Novidades\n"
			if f.shaMode == "asset" || f.shaMode == "wrong" {
				assets = append(assets, map[string]any{"name": f.assetNm + ".sha256", "size": 64, "browser_download_url": f.srv.URL + "/dl/sha"})
			}
			if f.shaMode == "body" {
				body += "SHA-256 " + f.assetNm + ": " + sha + "\n"
			}
			json.NewEncoder(w).Encode(map[string]any{"tag_name": f.tag, "name": "v" + f.tag, "body": body,
				"html_url": "https://github.com/x/y/releases/tag/" + f.tag, "assets": assets})
		case "/dl/app.zip":
			w.Write(f.zip)
		case "/dl/sha":
			fmt.Fprintf(w, "%s  %s\n", sha, f.assetNm)
		default:
			w.WriteHeader(404)
		}
	}))
	t.Cleanup(f.srv.Close)
	oldAPI, oldU, oldD, oldE := updateAPI, updClient, dlClient, exeDirFn
	t.Cleanup(func() { updateAPI, updClient, dlClient, exeDirFn = oldAPI, oldU, oldD, oldE; lastUpdCheck = nil })
	updateAPI = f.srv.URL + "/latest"
	updClient, dlClient = f.srv.Client(), f.srv.Client()
	return f
}

func installDir(t *testing.T) string {
	d := t.TempDir()
	os.WriteFile(filepath.Join(d, "TreinoTalTech.exe"), []byte("EXE-VELHO"), 0o644)
	os.MkdirAll(filepath.Join(d, "stt"), 0o755)
	os.WriteFile(filepath.Join(d, "stt", "whisper-cli.exe"), []byte("CLI-VELHO"), 0o644)
	os.WriteFile(filepath.Join(d, "stt", sttModelName), []byte("MODELO-V15"), 0o644)
	exeDirFn = func() (string, error) { return d, nil }
	return d
}

func readS(p string) string { b, _ := os.ReadFile(p); return string(b) }

func TestUpdateFlow(t *testing.T) {
	appdata := t.TempDir()
	t.Setenv("APPDATA", appdata)
	os.MkdirAll(filepath.Join(appdata, "TreinoTalTech"), 0o755)
	prog := filepath.Join(appdata, "TreinoTalTech", "progresso.json")
	os.WriteFile(prog, []byte(`{"schema":6}`), 0o644)
	for _, mode := range []string{"asset", "body"} {
		f := newFakeGH(t)
		f.shaMode = mode
		d := installDir(t)
		info, err := checkUpdate()
		if err != nil || !info.Newer || info.Latest != "9.9.9" || info.Asset == nil || info.Asset.Name != f.assetNm {
			t.Fatalf("%s: check %+v %v", mode, info, err)
		}
		res, err := installUpdate(nil)
		if err != nil {
			t.Fatalf("%s: install %v", mode, err)
		}
		if m := res.(map[string]any); m["verified"] != true {
			t.Fatalf("não verificou sha: %v", m)
		}
		if readS(filepath.Join(d, "TreinoTalTech.exe")) != "EXE-NOVO" || readS(filepath.Join(d, "stt", "whisper-cli.exe")) != "CLI-NOVO" {
			t.Fatal("não trocou")
		}
		if readS(filepath.Join(d, "stt", sttModelName)) != "MODELO-V15" {
			t.Fatal("apagou o modelo da v1.5")
		}
		if readS(filepath.Join(d, "TreinoTalTech.exe.old")) != "EXE-VELHO" {
			t.Fatal("sem .old")
		}
		cleanupAfterUpdate()
		if _, err := os.Stat(filepath.Join(d, "TreinoTalTech.exe.old")); err == nil {
			t.Fatal(".old ficou")
		}
	}
	if readS(prog) != `{"schema":6}` {
		t.Fatal("progresso mexido")
	}
}

func TestUpdateErros(t *testing.T) {
	t.Setenv("APPDATA", t.TempDir())
	f := newFakeGH(t)
	d := installDir(t)
	f.shaMode = "wrong"
	if _, err := checkUpdate(); err != nil {
		t.Fatal(err)
	}
	if _, err := installUpdate(nil); err == nil || err.Error() != "dl:sha" {
		t.Fatalf("sha errado: %v", err)
	}
	if readS(filepath.Join(d, "TreinoTalTech.exe")) != "EXE-VELHO" {
		t.Fatal("trocou mesmo com sha errado")
	}
	// zip sem o exe → recusado, nada muda
	f.shaMode = "none"
	f.zip = zipBytes(map[string]string{"outra/coisa.txt": "x"})
	checkUpdate()
	if _, err := installUpdate(nil); err == nil || err.Error() != "upd:zip_invalido" {
		t.Fatalf("zip sem exe: %v", err)
	}
	// mesma versão → Newer=false
	f.tag = "v" + appVersion
	if info, _ := checkUpdate(); info.Newer {
		t.Fatal("mesma versão marcada como nova")
	}
	if _, err := installUpdate(nil); err == nil {
		t.Fatal("instalou sem ser mais nova")
	}
	for code, want := range map[int]string{404: "upd:sem_release", 403: "upd:limite", 429: "upd:limite"} {
		f.status = code
		if _, err := checkUpdate(); err == nil || err.Error() != want {
			t.Errorf("%d: %v", code, err)
		}
	}
	f.srv.Close()
	if _, err := checkUpdate(); err == nil || !strings.HasPrefix(err.Error(), "upd:offline") {
		t.Fatalf("offline: %v", err)
	}
}

func TestUpdateRecusaPastaDados(t *testing.T) {
	appdata := t.TempDir()
	t.Setenv("APPDATA", appdata)
	newFakeGH(t)
	inside := filepath.Join(appdata, "TreinoTalTech", "app")
	os.MkdirAll(inside, 0o755)
	exeDirFn = func() (string, error) { return inside, nil }
	checkUpdate()
	if _, err := installUpdate(nil); err == nil || err.Error() != "upd:pasta_dados" {
		t.Fatal(err)
	}
}

func TestShaFromText(t *testing.T) {
	h := strings.Repeat("ab", 32)
	if shaFromText("x\n"+h+"  TreinoTalTech-v1.zip\n"+strings.Repeat("cd", 32)+" outro.zip", "TreinoTalTech-v1.zip") != h {
		t.Fatal("linha")
	}
	if shaFromText("só um: "+h, "a.zip") != h {
		t.Fatal("único")
	}
	if shaFromText(h+" "+strings.Repeat("cd", 32), "a.zip") != "" {
		t.Fatal("ambíguo")
	}
}

func TestModelDownload(t *testing.T) {
	t.Setenv("APPDATA", t.TempDir())
	t.Setenv("TREINO_STT_DIR", t.TempDir())
	data := bytes.Repeat([]byte("m"), 2<<20)
	sum := sha256.Sum256(data)
	srv := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.Write(data) }))
	defer srv.Close()
	oU, oS, oN, oC := modelURL, modelSHA256, modelSize, dlClient
	defer func() { modelURL, modelSHA256, modelSize, dlClient = oU, oS, oN, oC }()
	modelURL, modelSize, dlClient = srv.URL+"/m.bin", int64(len(data)), srv.Client()
	modelSHA256 = strings.Repeat("0", 64)
	if _, err := downloadModel(nil); err == nil || err.Error() != "dl:sha" {
		t.Fatalf("sha errado aceito: %v", err)
	}
	if sttModelPath() != "" {
		t.Fatal("ficou modelo com sha errado")
	}
	md, _ := modelDir()
	if _, err := os.Stat(filepath.Join(md, sttModelName+".part")); err == nil {
		t.Fatal(".part ficou")
	}
	modelSHA256 = hex.EncodeToString(sum[:])
	var got int64
	res, err := downloadModel(func(d, tot int64) { got = d })
	if err != nil || got != int64(len(data)) {
		t.Fatalf("%v %v", res, err)
	}
	if p := sttModelPath(); !strings.HasPrefix(p, md) {
		t.Fatalf("modelo em %q", p)
	}
	st := sttStatus() // sem whisper-cli: ainda sem_programa
	if st.Motivo != "sem_programa" {
		t.Fatalf("%+v", st)
	}
}
