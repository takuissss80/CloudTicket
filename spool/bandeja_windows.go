//go:build windows

package main

// Ícono en la bandeja del sistema (al lado del reloj):
// clic → abre el panel; clic derecho → menú con "Abrir panel" y "Cerrar programa".

import (
	_ "embed"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"syscall"
	"unsafe"
)

//go:embed icono/cloudticket.ico
var iconoICO []byte

var (
	user32                  = syscall.NewLazyDLL("user32.dll")
	shell32                 = syscall.NewLazyDLL("shell32.dll")
	kernel32                = syscall.NewLazyDLL("kernel32.dll")
	procRegisterClassExW    = user32.NewProc("RegisterClassExW")
	procCreateWindowExW     = user32.NewProc("CreateWindowExW")
	procDefWindowProcW      = user32.NewProc("DefWindowProcW")
	procGetMessageW         = user32.NewProc("GetMessageW")
	procTranslateMessage    = user32.NewProc("TranslateMessage")
	procDispatchMessageW    = user32.NewProc("DispatchMessageW")
	procLoadImageW          = user32.NewProc("LoadImageW")
	procCreatePopupMenu     = user32.NewProc("CreatePopupMenu")
	procAppendMenuW         = user32.NewProc("AppendMenuW")
	procTrackPopupMenu      = user32.NewProc("TrackPopupMenu")
	procDestroyMenu         = user32.NewProc("DestroyMenu")
	procSetForegroundWindow = user32.NewProc("SetForegroundWindow")
	procGetCursorPos        = user32.NewProc("GetCursorPos")
	procPostMessageW        = user32.NewProc("PostMessageW")
	procRegisterWindowMsgW  = user32.NewProc("RegisterWindowMessageW")
	procGetSystemMetrics    = user32.NewProc("GetSystemMetrics")
	procSetTimer            = user32.NewProc("SetTimer")
	procMessageBoxW         = user32.NewProc("MessageBoxW")
	procShellNotifyIconW    = shell32.NewProc("Shell_NotifyIconW")
	procGetModuleHandleW    = kernel32.NewProc("GetModuleHandleW")
)

const (
	wmApp          = 0x8000
	wmIconoBandeja = wmApp + 1
	wmTimer        = 0x0113
	wmLButtonUp    = 0x0202
	wmLButtonDbl   = 0x0203
	wmRButtonUp    = 0x0205
	wmContextMenu  = 0x007B
	nimAdd         = 0
	nimModify      = 1
	nimDelete      = 2
	nifMessage     = 0x1
	nifIcon        = 0x2
	nifTip         = 0x4
	menuAbrir      = 1
	menuCerrar     = 2
)

type wndClassEx struct {
	Size       uint32
	Style      uint32
	WndProc    uintptr
	ClsExtra   int32
	WndExtra   int32
	Instance   syscall.Handle
	Icon       syscall.Handle
	Cursor     syscall.Handle
	Background syscall.Handle
	MenuName   *uint16
	ClassName  *uint16
	IconSm     syscall.Handle
}

// NOTIFYICONDATAW (versión Vista en adelante)
type notifyIconData struct {
	Size            uint32
	Wnd             syscall.Handle
	ID              uint32
	Flags           uint32
	CallbackMessage uint32
	Icon            syscall.Handle
	Tip             [128]uint16
	State           uint32
	StateMask       uint32
	Info            [256]uint16
	Version         uint32
	InfoTitle       [64]uint16
	InfoFlags       uint32
	GUID            [16]byte
	BalloonIcon     syscall.Handle
}

type mensajeWin struct {
	Hwnd    syscall.Handle
	Message uint32
	WParam  uintptr
	LParam  uintptr
	Time    uint32
	X, Y    int32
	Private uint32
}

type punto struct{ X, Y int32 }

var (
	bandejaHwnd    syscall.Handle
	bandejaIcono   syscall.Handle
	taskbarCreated uint32
	urlPanel       string
)

func textoUTF16(dst []uint16, s string) {
	u, _ := syscall.UTF16FromString(s)
	if len(u) > len(dst) {
		u = append(u[:len(dst)-1], 0)
	}
	copy(dst, u)
}

func datosIcono(tip string) *notifyIconData {
	d := &notifyIconData{Wnd: bandejaHwnd, ID: 1, Flags: nifMessage | nifIcon | nifTip, CallbackMessage: wmIconoBandeja, Icon: bandejaIcono}
	d.Size = uint32(unsafe.Sizeof(*d))
	textoUTF16(d.Tip[:], tip)
	return d
}

func tipActual() string {
	c := copiaConfig()
	total, conectadas := 0, 0
	for _, v := range c.Vinculos {
		if v.Desactivar {
			continue
		}
		total++
		if copiaEstado(v.Token).Conectado {
			conectadas++
		}
	}
	switch {
	case total == 0:
		return "CloudTicket Impresión · sin comanderas vinculadas"
	case conectadas == total:
		return fmt.Sprintf("CloudTicket Impresión · %d de %d conectadas", conectadas, total)
	default:
		return fmt.Sprintf("CloudTicket Impresión · ¡%d de %d conectadas!", conectadas, total)
	}
}

func cargarIcono() syscall.Handle {
	ruta := filepath.Join(dirDatos(), "cloudticket.ico")
	_ = os.WriteFile(ruta, iconoICO, 0o644)
	p, _ := syscall.UTF16PtrFromString(ruta)
	tam, _, _ := procGetSystemMetrics.Call(49) // SM_CXSMICON
	h, _, _ := procLoadImageW.Call(0, uintptr(unsafe.Pointer(p)), 1 /*IMAGE_ICON*/, tam, tam, 0x10 /*LR_LOADFROMFILE*/)
	return syscall.Handle(h)
}

func mostrarMenu(hwnd syscall.Handle) {
	m, _, _ := procCreatePopupMenu.Call()
	abrir, _ := syscall.UTF16PtrFromString("Abrir panel")
	cerrar, _ := syscall.UTF16PtrFromString("Cerrar programa")
	procAppendMenuW.Call(m, 0, menuAbrir, uintptr(unsafe.Pointer(abrir)))
	procAppendMenuW.Call(m, 0x800 /*MF_SEPARATOR*/, 0, 0)
	procAppendMenuW.Call(m, 0, menuCerrar, uintptr(unsafe.Pointer(cerrar)))
	var pt punto
	procGetCursorPos.Call(uintptr(unsafe.Pointer(&pt)))
	procSetForegroundWindow.Call(uintptr(hwnd))
	cmd, _, _ := procTrackPopupMenu.Call(m, 0x0100|0x0002 /*TPM_RETURNCMD|TPM_RIGHTBUTTON*/, uintptr(pt.X), uintptr(pt.Y), 0, uintptr(hwnd), 0)
	procPostMessageW.Call(uintptr(hwnd), 0, 0, 0)
	procDestroyMenu.Call(m)
	switch cmd {
	case menuAbrir:
		abrirNavegador(urlPanel)
	case menuCerrar:
		titulo, _ := syscall.UTF16PtrFromString("CloudTicket Impresión")
		texto, _ := syscall.UTF16PtrFromString("¿Cerrar el programa?\n\nMientras esté cerrado no se imprimen las comandas.")
		r, _, _ := procMessageBoxW.Call(uintptr(hwnd), uintptr(unsafe.Pointer(texto)), uintptr(unsafe.Pointer(titulo)), 0x4|0x20|0x40000 /*YESNO|ICONQUESTION|TOPMOST*/)
		if r == 6 /*IDYES*/ {
			registrar("info", "Programa cerrado desde la bandeja")
			salir()
		}
	}
}

func procVentana(hwnd syscall.Handle, msg uint32, wparam, lparam uintptr) uintptr {
	switch {
	case msg == wmIconoBandeja:
		switch lparam & 0xFFFF {
		case wmLButtonUp, wmLButtonDbl:
			abrirNavegador(urlPanel)
		case wmRButtonUp, wmContextMenu:
			mostrarMenu(hwnd)
		}
		return 0
	case msg == wmTimer:
		procShellNotifyIconW.Call(nimModify, uintptr(unsafe.Pointer(datosIcono(tipActual()))))
		return 0
	case taskbarCreated != 0 && msg == taskbarCreated:
		// el Explorador se reinició: volver a poner el ícono
		procShellNotifyIconW.Call(nimAdd, uintptr(unsafe.Pointer(datosIcono(tipActual()))))
		return 0
	}
	r, _, _ := procDefWindowProcW.Call(uintptr(hwnd), uintptr(msg), wparam, lparam)
	return r
}

// iniciarBandeja pone el ícono y atiende sus mensajes (corre en su propio hilo)
func iniciarBandeja(url string) {
	urlPanel = url
	go func() {
		runtime.LockOSThread()
		inst, _, _ := procGetModuleHandleW.Call(0)
		clase, _ := syscall.UTF16PtrFromString("CloudTicketImpresionBandeja")
		bandejaIcono = cargarIcono()
		wc := wndClassEx{WndProc: syscall.NewCallback(procVentana), Instance: syscall.Handle(inst), ClassName: clase, Icon: bandejaIcono, IconSm: bandejaIcono}
		wc.Size = uint32(unsafe.Sizeof(wc))
		procRegisterClassExW.Call(uintptr(unsafe.Pointer(&wc)))
		titulo, _ := syscall.UTF16PtrFromString("CloudTicket Impresión")
		h, _, _ := procCreateWindowExW.Call(0, uintptr(unsafe.Pointer(clase)), uintptr(unsafe.Pointer(titulo)), 0, 0, 0, 0, 0, 0, 0, inst, 0)
		if h == 0 {
			registrar("error", "No se pudo crear el ícono de la bandeja")
			return
		}
		bandejaHwnd = syscall.Handle(h)
		tb, _ := syscall.UTF16PtrFromString("TaskbarCreated")
		r, _, _ := procRegisterWindowMsgW.Call(uintptr(unsafe.Pointer(tb)))
		taskbarCreated = uint32(r)
		procShellNotifyIconW.Call(nimAdd, uintptr(unsafe.Pointer(datosIcono(tipActual()))))
		procSetTimer.Call(h, 1, 5000, 0)
		var m mensajeWin
		for {
			r, _, _ := procGetMessageW.Call(uintptr(unsafe.Pointer(&m)), 0, 0, 0)
			if int32(r) <= 0 {
				return
			}
			procTranslateMessage.Call(uintptr(unsafe.Pointer(&m)))
			procDispatchMessageW.Call(uintptr(unsafe.Pointer(&m)))
		}
	}()
}

func quitarBandeja() {
	if bandejaHwnd != 0 {
		procShellNotifyIconW.Call(nimDelete, uintptr(unsafe.Pointer(datosIcono(""))))
	}
}
