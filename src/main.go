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
	"golang.org/x/sys/windows"
)

//go:embed index.html
var indexHTML string

//go:embed data.json
var dataJSON string

const appVersion = "1.3.2"

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
	cmd := exec.Command("explorer.exe", dir)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	return cmd.Start()
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

	// </script> nunca aparece no data.json, mas por segurança:
	safe := strings.ReplaceAll(dataJSON, "</", "<\\/")
	html := strings.Replace(indexHTML, "/*__DATA__*/null", safe, 1)
	html = strings.Replace(html, `/*__VER__*/"dev"`, `"`+appVersion+`"`, 1)
	w.SetHtml(html)
	w.Run()
}
