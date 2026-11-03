//go:build windows

// Diálogos nativos (Salvar/Abrir) e barra de título escura.
package main

import (
	"unsafe"

	"golang.org/x/sys/windows"
)

var (
	comdlg32          = windows.NewLazySystemDLL("comdlg32.dll")
	dwmapi            = windows.NewLazySystemDLL("dwmapi.dll")
	pGetSaveFileNameW = comdlg32.NewProc("GetSaveFileNameW")
	pGetOpenFileNameW = comdlg32.NewProc("GetOpenFileNameW")
	pCommDlgExtError  = comdlg32.NewProc("CommDlgExtendedError")
	pDwmSetWindowAttr = dwmapi.NewProc("DwmSetWindowAttribute")
	pSetWindowPos     = user32.NewProc("SetWindowPos")
)

// openFileNameW = OPENFILENAMEW (152 bytes em amd64).
type openFileNameW struct {
	lStructSize       uint32
	hwndOwner         uintptr
	hInstance         uintptr
	lpstrFilter       *uint16
	lpstrCustomFilter *uint16
	nMaxCustFilter    uint32
	nFilterIndex      uint32
	lpstrFile         *uint16
	nMaxFile          uint32
	lpstrFileTitle    *uint16
	nMaxFileTitle     uint32
	lpstrInitialDir   *uint16
	lpstrTitle        *uint16
	flags             uint32
	nFileOffset       uint16
	nFileExtension    uint16
	lpstrDefExt       *uint16
	lCustData         uintptr
	lpfnHook          uintptr
	lpTemplateName    *uint16
	pvReserved        uintptr
	dwReserved        uint32
	flagsEx           uint32
}

const (
	ofnOverwritePrompt = 0x2
	ofnHideReadOnly    = 0x4
	ofnNoChangeDir     = 0x8
	ofnPathMustExist   = 0x800
	ofnFileMustExist   = 0x1000
	ofnExplorer        = 0x80000
)

// utf16Multi monta "a\0b\0...\0\0" (formato do lpstrFilter).
func utf16Multi(parts ...string) *uint16 {
	var u []uint16
	for _, p := range parts {
		s, _ := windows.UTF16FromString(p)
		u = append(u, s...)
	}
	u = append(u, 0)
	return &u[0]
}

// fileDialog abre o diálogo nativo para backups (.json). ok=false e err=nil => usuário cancelou.
func fileDialog(owner uintptr, save bool, title, defName string) (path string, ok bool, err error) {
	return fileDialogF(owner, save, title, defName, "Backup JSON (*.json)", "json")
}

// fileDialogF: igual, com filtro próprio (ex.: "Pacote de conteúdo (*.zip)", "zip").
func fileDialogF(owner uintptr, save bool, title, defName, filterName, extName string) (path string, ok bool, err error) {
	buf := make([]uint16, 4096)
	if defName != "" {
		d, _ := windows.UTF16FromString(defName)
		copy(buf, d)
	}
	t, _ := windows.UTF16PtrFromString(title)
	ext, _ := windows.UTF16PtrFromString(extName)
	ofn := openFileNameW{
		hwndOwner:    owner,
		lpstrFilter:  utf16Multi(filterName, "*."+extName, "Todos os arquivos (*.*)", "*.*"),
		nFilterIndex: 1,
		lpstrFile:    &buf[0],
		nMaxFile:     uint32(len(buf)),
		lpstrTitle:   t,
		lpstrDefExt:  ext,
		flags:        ofnExplorer | ofnNoChangeDir | ofnPathMustExist | ofnHideReadOnly,
	}
	ofn.lStructSize = uint32(unsafe.Sizeof(ofn))
	proc := pGetOpenFileNameW
	if save {
		ofn.flags |= ofnOverwritePrompt
		proc = pGetSaveFileNameW
	} else {
		ofn.flags |= ofnFileMustExist
	}
	if e := proc.Find(); e != nil {
		return "", false, e
	}
	r, _, _ := proc.Call(uintptr(unsafe.Pointer(&ofn)))
	if r == 0 {
		code, _, _ := pCommDlgExtError.Call()
		if code == 0 {
			return "", false, nil // cancelado
		}
		return "", false, windows.Errno(code)
	}
	return windows.UTF16ToString(buf), true, nil
}

// setDarkTitle pinta a barra de título do Windows no tema escuro/claro (Windows 10 1809+ / 11).
func setDarkTitle(hwnd uintptr, dark bool) {
	if hwnd == 0 || pDwmSetWindowAttr.Find() != nil {
		return
	}
	var v int32
	if dark {
		v = 1
	}
	// 20 = DWMWA_USE_IMMERSIVE_DARK_MODE (Win10 20H1+/Win11); 19 nas builds 1809–1909.
	if r, _, _ := pDwmSetWindowAttr.Call(hwnd, 20, uintptr(unsafe.Pointer(&v)), 4); r != 0 {
		pDwmSetWindowAttr.Call(hwnd, 19, uintptr(unsafe.Pointer(&v)), 4)
	}
	// força o redesenho da moldura
	pSetWindowPos.Call(hwnd, 0, 0, 0, 0, 0, 0x0020|0x0002|0x0001|0x0004|0x0010)
}

// verificação em tempo de compilação: OPENFILENAMEW tem 152 bytes em amd64
var _ [152 - unsafe.Sizeof(openFileNameW{})]byte
var _ [unsafe.Sizeof(openFileNameW{}) - 152]byte
