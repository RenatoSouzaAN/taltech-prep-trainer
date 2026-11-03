//go:build windows

// TreinoTalTech: app desktop (janela nativa WebView2) para treino GRE + TOEFL.
package main

import (
	_ "embed"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"time"
	"unsafe"

	webview2 "github.com/jchv/go-webview2"
	"github.com/jchv/go-webview2/pkg/edge"
	"golang.org/x/sys/windows"
)

//go:embed index.html
var indexHTML string

//go:embed data.json
var dataJSON string

var (
	user32           = windows.NewLazySystemDLL("user32.dll")
	kernel32         = windows.NewLazySystemDLL("kernel32.dll")
	pOpenClipboard   = user32.NewProc("OpenClipboard")
	pCloseClipboard  = user32.NewProc("CloseClipboard")
	pEmptyClipboard  = user32.NewProc("EmptyClipboard")
	pSetClipboardDat = user32.NewProc("SetClipboardData")
	pMessageBoxW     = user32.NewProc("MessageBoxW")
	pGlobalAlloc     = kernel32.NewProc("GlobalAlloc")
	pGlobalLock      = kernel32.NewProc("GlobalLock")
	pGlobalUnlock    = kernel32.NewProc("GlobalUnlock")
	pGlobalFree      = kernel32.NewProc("GlobalFree")
	pRtlMoveMemory   = kernel32.NewProc("RtlMoveMemory")
	pGetDpiForSystem = user32.NewProc("GetDpiForSystem")
	pGetSystemMetric = user32.NewProc("GetSystemMetrics")
)

// windowSize ajusta o tamanho da janela à escala do Windows (o app é DPI-aware) e à tela.
func windowSize(w, h int) (uint, uint) {
	dpi := 96
	if pGetDpiForSystem.Find() == nil {
		if d, _, _ := pGetDpiForSystem.Call(); d > 0 {
			dpi = int(d)
		}
	}
	w, h = w*dpi/96, h*dpi/96
	sw, _, _ := pGetSystemMetric.Call(0) // SM_CXSCREEN
	sh, _, _ := pGetSystemMetric.Call(1) // SM_CYSCREEN
	if sw > 0 && w > int(sw)*92/100 {
		w = int(sw) * 92 / 100
	}
	if sh > 0 && h > int(sh)*88/100 {
		h = int(sh) * 88 / 100
	}
	return uint(w), uint(h)
}

func copyToClipboard(text string) error {
	u, err := windows.UTF16FromString(strings.ReplaceAll(strings.ReplaceAll(text, "\r\n", "\n"), "\n", "\r\n"))
	if err != nil {
		return err
	}
	var ok uintptr
	for i := 0; i < 10; i++ { // outro app pode estar segurando o clipboard
		ok, _, _ = pOpenClipboard.Call(0)
		if ok != 0 {
			break
		}
		time.Sleep(30 * time.Millisecond)
	}
	if ok == 0 {
		return errors.New("não foi possível abrir a área de transferência")
	}
	defer pCloseClipboard.Call()
	pEmptyClipboard.Call()
	size := uintptr(len(u) * 2)
	h, _, _ := pGlobalAlloc.Call(0x0002 /*GMEM_MOVEABLE*/, size)
	if h == 0 {
		return errors.New("GlobalAlloc falhou")
	}
	ptr, _, _ := pGlobalLock.Call(h)
	if ptr == 0 {
		pGlobalFree.Call(h)
		return errors.New("GlobalLock falhou")
	}
	pRtlMoveMemory.Call(ptr, uintptr(unsafe.Pointer(&u[0])), size)
	pGlobalUnlock.Call(h)
	if r, _, _ := pSetClipboardDat.Call(13 /*CF_UNICODETEXT*/, h); r == 0 {
		pGlobalFree.Call(h)
		return errors.New("SetClipboardData falhou")
	}
	return nil
}

func openDataFolder() error {
	dir, err := appDir()
	if err != nil {
		return err
	}
	return openFolder(dir, true)
}

func dataFolder() string {
	d, _ := appDir()
	return d
}

func messageBox(title, text string) {
	t, _ := windows.UTF16PtrFromString(title)
	m, _ := windows.UTF16PtrFromString(text)
	pMessageBoxW.Call(0, uintptr(unsafe.Pointer(m)), uintptr(unsafe.Pointer(t)), 0x30 /*MB_ICONWARNING*/)
}

func main() {
	if waitOldProcess(os.Args[1:]) {
		cleanupAfterUpdate()
	} else {
		go cleanupAfterUpdate()
	}
	dir, err := appDir()
	if err != nil {
		messageBox(appName, "Não foi possível criar a pasta de dados em %APPDATA%\\TreinoTalTech:\n"+err.Error())
		return
	}
	ww, wh := windowSize(1180, 820)
	w := webview2.NewWithOptions(webview2.WebViewOptions{
		Debug:     os.Getenv("TREINO_DEBUG") == "1",
		AutoFocus: true,
		DataPath:  filepath.Join(dir, "WebView2"),
		WindowOptions: webview2.WindowOptions{
			Title:  windowTitle(savedLanguage(), appVersion),
			Width:  ww,
			Height: wh,
			IconId: 1, // RT_GROUP_ICON #1 (rsrc_windows_amd64.syso, gerado pelo go-winres)
			Center: true,
		},
	})
	if w == nil {
		messageBox(appName, "Não foi possível abrir a janela: o Microsoft Edge WebView2 Runtime não foi encontrado.\n\n"+
			"Ele já vem no Windows 10/11 atualizados. Se faltar, instale o \"Evergreen Bootstrapper\" em:\n"+
			"https://developer.microsoft.com/microsoft-edge/webview2/")
		return
	}
	defer w.Destroy()
	mw, mh := windowSize(900, 600)
	w.SetSize(int(mw), int(mh), webview2.HintMin)
	must := func(err error) {
		if err != nil {
			messageBox(appName, err.Error())
		}
	}
	must(w.Bind("goLoadProgress", loadProgress))
	must(w.Bind("goSaveProgress", saveProgress))
	must(w.Bind("goCopyText", copyToClipboard))
	must(w.Bind("goOpenDataFolder", openDataFolder))
	must(w.Bind("goDataFolder", dataFolder))
	must(w.Bind("goBackupProgress", backupProgress))
	must(w.Bind("goBackupNamed", backupNamed))
	must(w.Bind("goDataInfo", dataInfo))
	must(w.Bind("goEtsData", etsData))
	must(w.Bind("goEtsAudio", etsAudio))
	must(w.Bind("goOpenURL", func(raw string) error {
		u, err := safeURL(raw)
		if err != nil {
			return err
		}
		cmd := exec.Command("rundll32.exe", "url.dll,FileProtocolHandler", u)
		cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
		return cmd.Start()
	}))
	hwnd := uintptr(w.Window())
	// Bindings rodam na thread da interface, então os diálogos podem ser abertos aqui (modais à janela).
	must(w.Bind("goExportBackup", func(content, name string) (string, error) {
		path, ok, err := fileDialog(hwnd, true, "Exportar backup do progresso", name)
		if err != nil { // diálogo indisponível: cópia datada na pasta de dados
			return exportFallback(content)
		}
		if !ok {
			return "", nil
		}
		return path, writeExport(path, content)
	}))
	must(w.Bind("goImportBackup", func() (*ImportedFile, error) {
		path, ok, err := fileDialog(hwnd, false, "Importar backup do progresso", "")
		if err != nil || !ok {
			return nil, err
		}
		return readImportFile(path)
	}))
	// O título da janela acompanha o idioma (o JS chama ao abrir e ao trocar o idioma).
	must(w.Bind("goSetTitle", func(title string) { w.SetTitle(title) }))
	must(w.Bind("goSetDarkTitle", func(dark bool) { setDarkTitle(hwnd, dark) }))

	// Gravações (v1.5.0)
	must(w.Bind("goSaveRecording", saveRecording))
	must(w.Bind("goDeleteRecording", deleteRecording))
	must(w.Bind("goOpenRecFolder", func(rel string) error {
		d, err := recFolder(rel)
		if err != nil {
			return err
		}
		return openFolder(d, true)
	}))
	must(w.Bind("goRecInfo", func() map[string]any {
		total, n := recordingsSize()
		return map[string]any{"bytes": total, "files": n}
	}))
	// Avaliação offline (whisper) e por IA: rodam em segundo plano (start + poll), pois os bindings
	// rodam na thread da interface e travariam a janela.
	must(w.Bind("goSttStatus", sttStatus))
	must(w.Bind("goEvalStart", func(kind, rel, ref string) string {
		return startJob(func() (any, error) { return evaluateRecording(kind, rel, ref) })
	}))
	must(w.Bind("goJobPoll", pollJob))
	must(w.Bind("goAiStatus", aiStatus))
	must(w.Bind("goAiSetKey", aiSetKey))
	must(w.Bind("goAiRemoveKey", aiRemoveKey))
	must(w.Bind("goAiTestStart", func(provider, model string) string {
		return startJob(func() (any, error) { return aiTestKey(provider, model) })
	}))
	must(w.Bind("goAiGradeStart", func(req string) string {
		return startJob(func() (any, error) { return aiGradeJSON(req) })
	}))

	// Pacotes de conteúdo (v1.6.0)
	var pickedPack string // o JS importa só o arquivo escolhido no diálogo nativo
	must(w.Bind("goPackPick", func() (*PackPreview, error) {
		path, ok, err := fileDialogF(hwnd, false, "Importar pacote de conteúdo", "", "Pacote de conteúdo (*.zip)", "zip")
		if err != nil || !ok {
			return nil, err
		}
		pickedPack = path
		return previewPack(path)
	}))
	must(w.Bind("goPackImportStart", func() (string, error) {
		if pickedPack == "" {
			return "", errors.New("pac:nada_escolhido")
		}
		p := pickedPack
		pickedPack = ""
		return startJobP(func(prog func(int64, int64)) (any, error) { return importPack(p, prog) }), nil
	}))
	must(w.Bind("goPackList", func() []PackInfo { return installedPacks() }))
	must(w.Bind("goPackRemove", removePack))
	must(w.Bind("goPackOpenFile", func(id, rel string) error {
		p, err := packFilePath(id, rel)
		if err != nil {
			return err
		}
		return shellOpen(p)
	}))
	must(w.Bind("goPackOpenFolder", func(id string) error {
		var d string
		var err error
		if id == "" {
			d, err = contentRoot()
		} else {
			d, err = packDir(id)
		}
		if err != nil {
			return err
		}
		if id != "" {
			if _, err := os.Stat(d); err != nil {
				return errors.New("pac:nao_instalado")
			}
		}
		return openFolder(d, id == "")
	}))
	// Atualizações (v1.6.0)
	must(w.Bind("goUpdateCheckStart", func() string {
		return startJob(func() (any, error) { return checkUpdate() })
	}))
	must(w.Bind("goUpdateInstallStart", func() string { return startJobP(installUpdate) }))
	must(w.Bind("goUpdateRestart", func() error {
		if err := relaunchAfterUpdate(); err != nil {
			return err
		}
		go func() { // PostQuitMessage vale para a thread da janela, então passa pelo Dispatch
			time.Sleep(150 * time.Millisecond)
			w.Dispatch(w.Terminate)
		}()
		return nil
	}))
	// Modelo de fala (v1.6.0): baixado na primeira vez
	must(w.Bind("goModelDownloadStart", func() string { return startJobP(downloadModel) }))

	// </script> nunca aparece no data.json, mas por segurança:
	safe := strings.ReplaceAll(dataJSON, "</", "<\\/")
	html := strings.Replace(indexHTML, "/*__DATA__*/null", safe, 1)
	html = strings.Replace(html, `/*__VER__*/"dev"`, `"`+appVersion+`"`, 1)
	startAudioSessionNamer(appName)
	// v1.5.0: a página é servida de https://app.treinotaltech.example (host virtual mapeado para uma pasta
	// local) em vez de NavigateToString. Motivo: NavigateToString dá origem nula, sem contexto seguro, e aí
	// navigator.mediaDevices (microfone) não existe. As gravações saem de https://rec.treinotaltech.example.
	if !navigateVirtual(w, dir, html) {
		w.SetHtml(html) // sem host virtual: o app funciona, só sem gravação
	}
	w.Run()
}

const (
	appHost = "app.treinotaltech.example"
	recHost = "rec.treinotaltech.example"
)

func navigateVirtual(w webview2.WebView, dir, html string) bool {
	ch := webview2.ChromiumOf(w)
	if ch == nil {
		return false
	}
	// Microfone liberado sem pergunta: só a nossa página roda nesta janela (links externos abrem no navegador).
	ch.SetPermission(edge.CoreWebView2PermissionKindMicrophone, edge.CoreWebView2PermissionStateAllow)
	core3 := ch.GetICoreWebView2_3()
	if core3 == nil {
		return false
	}
	appDirPath := filepath.Join(dir, "app")
	if err := os.MkdirAll(appDirPath, 0o755); err != nil {
		return false
	}
	if err := os.WriteFile(filepath.Join(appDirPath, "index.html"), []byte(html), 0o644); err != nil {
		return false
	}
	recDir, err := recRoot()
	if err != nil {
		return false
	}
	if core3.SetVirtualHostNameToFolderMapping(appHost, appDirPath, edge.COREWEBVIEW2_HOST_RESOURCE_ACCESS_KIND_DENY_CORS) != nil {
		return false
	}
	if core3.SetVirtualHostNameToFolderMapping(recHost, recDir, edge.COREWEBVIEW2_HOST_RESOURCE_ACCESS_KIND_ALLOW) != nil {
		return false
	}
	w.Navigate("https://" + appHost + "/index.html")
	return true
}
