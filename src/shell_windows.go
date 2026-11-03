//go:build windows

// Abrir arquivos no programa padrão, reiniciar depois de atualizar e esperar o processo antigo sair.
package main

import (
	"errors"
	"os"
	"os/exec"
	"runtime"
	"strconv"
	"syscall"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
)

var (
	shell32        = windows.NewLazySystemDLL("shell32.dll")
	pShellExecuteW = shell32.NewProc("ShellExecuteW")
)

// shellExecute chama ShellExecuteW numa thread própria (travada) com COM em STA, como a
// documentação pede; não depende do estado COM da thread da janela (WebView2).
func shellExecute(verb, path string) error {
	v, err := windows.UTF16PtrFromString(verb)
	if err != nil {
		return err
	}
	f, err := windows.UTF16PtrFromString(path)
	if err != nil {
		return err
	}
	ch := make(chan uintptr, 1)
	go func() {
		runtime.LockOSThread()
		defer runtime.UnlockOSThread()
		e := windows.CoInitializeEx(0, windows.COINIT_APARTMENTTHREADED|windows.COINIT_DISABLE_OLE1DDE)
		if e == nil || e == syscall.Errno(1) /*S_FALSE*/ {
			defer windows.CoUninitialize()
		}
		r, _, _ := pShellExecuteW.Call(0, uintptr(unsafe.Pointer(v)), uintptr(unsafe.Pointer(f)), 0, 0, 1 /*SW_SHOWNORMAL*/)
		ch <- r
	}()
	select {
	case r := <-ch:
		if r <= 32 {
			if r == 31 { // SE_ERR_NOASSOC
				return errors.New("sem_programa")
			}
			return errors.New("ShellExecute " + strconv.Itoa(int(r)))
		}
		return nil
	case <-time.After(15 * time.Second):
		return nil // ainda abrindo (Explorer lento); não trava a interface
	}
}

// shellOpen abre um arquivo (já validado por packFilePath) no programa padrão do Windows.
func shellOpen(path string) error {
	err := shellExecute("open", path)
	if err == nil {
		return nil
	}
	if err.Error() == "sem_programa" {
		return errors.New("pac:sem_programa")
	}
	return errors.New("pac:abrir: " + err.Error())
}

// startExplorer: último recurso. Sem HideWindow (com ele o explorer.exe abre a janela escondida)
// e sem esperar o código de saída (o explorer.exe sai com 1 mesmo quando dá certo).
func startExplorer(dir string) error {
	cmd := exec.Command("explorer.exe", dir)
	if err := cmd.Start(); err != nil {
		return err
	}
	go cmd.Wait()
	return nil
}

// openFolder abre uma pasta no Explorer (create: cria antes, para pastas raiz do app).
func openFolder(dir string, create bool) error {
	return openFolderWith(dir, create, shellExecute, startExplorer)
}

// relaunchAfterUpdate abre o exe novo (o caminho continua o mesmo; o antigo virou .old) passando o pid atual.
func relaunchAfterUpdate() error {
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	cmd := exec.Command(exe, "--apos-atualizacao", strconv.Itoa(os.Getpid()))
	return cmd.Start()
}

// waitOldProcess: o processo novo espera o antigo fechar (no máx. ~20 s) antes de abrir a janela,
// para não disputar a pasta do WebView2 nem o progresso.json.
func waitOldProcess(args []string) bool {
	for i := 0; i+1 < len(args); i++ {
		if args[i] != "--apos-atualizacao" {
			continue
		}
		pid, err := strconv.Atoi(args[i+1])
		if err != nil || pid <= 0 || pid == os.Getpid() {
			return false
		}
		h, err := windows.OpenProcess(windows.SYNCHRONIZE, false, uint32(pid))
		if err != nil {
			return true // já saiu
		}
		windows.WaitForSingleObject(h, 20000)
		windows.CloseHandle(h)
		time.Sleep(300 * time.Millisecond)
		return true
	}
	return false
}
