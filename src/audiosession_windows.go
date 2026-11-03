//go:build windows

// Nome e ícone do app no Mixer de volume do Windows.
//
// O áudio do WebView2 toca no processo msedgewebview2.exe (serviço de áudio do Chromium), por isso o
// mixer mostrava "Microsoft Edge WebView2" com ícone genérico. Não existe opção do WebView2 para isso
// (WebView2Feedback #2236/#3743). O Core Audio permite que outro processo renomeie a sessão:
// enumeramos as sessões de áudio de saída, pegamos as que pertencem a processos filhos DESTE app
// e chamamos IAudioSessionControl::SetDisplayName/SetIconPath/SetGroupingParam. O nome não persiste
// quando o Chromium recria a sessão, então isto roda de tempos em tempos (barato) enquanto o app vive.
package main

import (
	"os"
	"runtime"
	"syscall"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
)

var (
	ole32             = windows.NewLazySystemDLL("ole32.dll")
	pCoInitializeEx   = ole32.NewProc("CoInitializeEx")
	pCoCreateInstance = ole32.NewProc("CoCreateInstance")
	pCoTaskMemFree    = ole32.NewProc("CoTaskMemFree")

	clsidMMDeviceEnumerator = windows.GUID{Data1: 0xBCDE0395, Data2: 0xE52F, Data3: 0x467C, Data4: [8]byte{0x8E, 0x3D, 0xC4, 0x57, 0x92, 0x91, 0x69, 0x2E}}
	iidIMMDeviceEnumerator  = windows.GUID{Data1: 0xA95664D2, Data2: 0x9614, Data3: 0x4F35, Data4: [8]byte{0xA7, 0x46, 0xDE, 0x8D, 0xB6, 0x36, 0x17, 0xE6}}
	iidIAudioSessionMgr2    = windows.GUID{Data1: 0x77AA99A0, Data2: 0x1BD6, Data3: 0x484F, Data4: [8]byte{0x8B, 0xC7, 0x2C, 0x65, 0x4C, 0x9A, 0x9B, 0x6F}}
	iidIAudioSessionCtl2    = windows.GUID{Data1: 0xBFB7FF88, Data2: 0x7239, Data3: 0x4FC9, Data4: [8]byte{0x8F, 0xA2, 0x07, 0xC9, 0x50, 0xBE, 0x9C, 0x6D}}
	// Agrupa as sessões do WebView2 numa linha só do mixer (valor fixo do app).
	audioGroupGUID = windows.GUID{Data1: 0x7E3A51C2, Data2: 0x5B1D, Data3: 0x4C8E, Data4: [8]byte{0x9A, 0x0B, 0x54, 0x72, 0x65, 0x69, 0x6E, 0x6F}}
)

type comObj struct{ vtbl *[64]uintptr }

func (o *comObj) call(idx int, args ...uintptr) uintptr {
	r, _, _ := syscall.SyscallN(o.vtbl[idx], append([]uintptr{uintptr(unsafe.Pointer(o))}, args...)...)
	return r
}
func (o *comObj) release() { o.call(2) }

// Índices das vtables (IUnknown = 0..2).
const (
	mmEnumAudioEndpoints = 3
	collGetCount         = 3
	collItem             = 4
	devActivate          = 3
	mgr2GetSessionEnum   = 5
	senumGetCount        = 3
	senumGetSession      = 4
	ctlGetState          = 3
	ctlGetDisplayName    = 4
	ctlSetDisplayName    = 5
	ctlSetIconPath       = 7
	ctlSetGroupingParam  = 9
	ctl2GetInstanceID    = 13
	ctl2GetProcessID     = 14

	eRender             = 0
	deviceStateActive   = 1
	clsctxAll           = 0x17
	sessionStateExpired = 2
)

// descendants: PIDs de processos filhos (em qualquer nível) do processo atual.
func descendants() map[uint32]bool {
	snap, err := windows.CreateToolhelp32Snapshot(windows.TH32CS_SNAPPROCESS, 0)
	if err != nil {
		return nil
	}
	defer windows.CloseHandle(snap)
	parent := map[uint32]uint32{}
	var e windows.ProcessEntry32
	e.Size = uint32(unsafe.Sizeof(e))
	for err = windows.Process32First(snap, &e); err == nil; err = windows.Process32Next(snap, &e) {
		parent[e.ProcessID] = e.ParentProcessID
	}
	me := uint32(os.Getpid())
	out := map[uint32]bool{}
	for pid := range parent {
		for p, n := parent[pid], 0; p != 0 && n < 8; p, n = parent[p], n+1 {
			if p == me {
				out[pid] = true
				break
			}
		}
	}
	return out
}

func coString(p *uint16) string {
	if p == nil {
		return ""
	}
	s := windows.UTF16PtrToString(p)
	pCoTaskMemFree.Call(uintptr(unsafe.Pointer(p)))
	return s
}

// audioNamer mantém referência às sessões já renomeadas (soltar a referência pode devolver o nome padrão).
type audioNamer struct {
	name, icon *uint16
	nameStr    string
	held       map[string]*comObj
}

func (a *audioNamer) pass() {
	kids := descendants()
	if len(kids) == 0 {
		return
	}
	var en *comObj
	if r, _, _ := pCoCreateInstance.Call(uintptr(unsafe.Pointer(&clsidMMDeviceEnumerator)), 0, clsctxAll,
		uintptr(unsafe.Pointer(&iidIMMDeviceEnumerator)), uintptr(unsafe.Pointer(&en))); r != 0 || en == nil {
		return
	}
	defer en.release()
	var coll *comObj
	if en.call(mmEnumAudioEndpoints, eRender, deviceStateActive, uintptr(unsafe.Pointer(&coll))) != 0 || coll == nil {
		return
	}
	defer coll.release()
	var nDev uint32
	coll.call(collGetCount, uintptr(unsafe.Pointer(&nDev)))
	seen := map[string]bool{}
	for i := uint32(0); i < nDev; i++ {
		var dev *comObj
		if coll.call(collItem, uintptr(i), uintptr(unsafe.Pointer(&dev))) != 0 || dev == nil {
			continue
		}
		var mgr *comObj
		if dev.call(devActivate, uintptr(unsafe.Pointer(&iidIAudioSessionMgr2)), clsctxAll, 0, uintptr(unsafe.Pointer(&mgr))) == 0 && mgr != nil {
			var se *comObj
			if mgr.call(mgr2GetSessionEnum, uintptr(unsafe.Pointer(&se))) == 0 && se != nil {
				var n int32
				se.call(senumGetCount, uintptr(unsafe.Pointer(&n)))
				for j := int32(0); j < n; j++ {
					var ctl *comObj
					if se.call(senumGetSession, uintptr(j), uintptr(unsafe.Pointer(&ctl))) != 0 || ctl == nil {
						continue
					}
					a.handle(ctl, kids, seen)
					ctl.release()
				}
				se.release()
			}
			mgr.release()
		}
		dev.release()
	}
	for id, c := range a.held { // sessões que sumiram
		if !seen[id] {
			c.release()
			delete(a.held, id)
		}
	}
}

func (a *audioNamer) handle(ctl *comObj, kids map[uint32]bool, seen map[string]bool) {
	var c2 *comObj
	if ctl.call(0, uintptr(unsafe.Pointer(&iidIAudioSessionCtl2)), uintptr(unsafe.Pointer(&c2))) != 0 || c2 == nil {
		return
	}
	var pid uint32
	c2.call(ctl2GetProcessID, uintptr(unsafe.Pointer(&pid)))
	if !kids[pid] {
		c2.release()
		return
	}
	var st int32
	c2.call(ctlGetState, uintptr(unsafe.Pointer(&st)))
	var idp *uint16
	c2.call(ctl2GetInstanceID, uintptr(unsafe.Pointer(&idp)))
	id := coString(idp)
	if st == sessionStateExpired || id == "" {
		c2.release()
		return
	}
	seen[id] = true
	var np *uint16
	c2.call(ctlGetDisplayName, uintptr(unsafe.Pointer(&np)))
	if coString(np) != a.nameStr {
		c2.call(ctlSetDisplayName, uintptr(unsafe.Pointer(a.name)), 0)
		c2.call(ctlSetIconPath, uintptr(unsafe.Pointer(a.icon)), 0)
		c2.call(ctlSetGroupingParam, uintptr(unsafe.Pointer(&audioGroupGUID)), 0)
	}
	if _, ok := a.held[id]; ok {
		c2.release()
	} else {
		a.held[id] = c2
	}
}

// startAudioSessionNamer roda numa thread própria com COM (MTA). Falhas são silenciosas: no pior caso o
// mixer continua mostrando "Microsoft Edge WebView2", como antes.
func startAudioSessionNamer(display string) {
	if os.Getenv("TREINO_NO_MIXER_NAME") == "1" {
		return
	}
	exe, err := os.Executable()
	if err != nil {
		return
	}
	go func() {
		runtime.LockOSThread()
		if r, _, _ := pCoInitializeEx.Call(0, 0 /*COINIT_MULTITHREADED*/); int32(r) < 0 {
			return
		}
		a := &audioNamer{nameStr: display, held: map[string]*comObj{}}
		a.name, _ = windows.UTF16PtrFromString(display)
		a.icon, _ = windows.UTF16PtrFromString(exe + ",0")
		for {
			func() {
				defer func() { _ = recover() }()
				a.pass()
			}()
			time.Sleep(1500 * time.Millisecond)
		}
	}()
}
