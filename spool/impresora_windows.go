//go:build windows

package main

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"sort"
	"syscall"
	"unsafe"
)

var (
	winspool              = syscall.NewLazyDLL("winspool.drv")
	procEnumPrintersW     = winspool.NewProc("EnumPrintersW")
	procGetDefaultPrinter = winspool.NewProc("GetDefaultPrinterW")
	procOpenPrinterW      = winspool.NewProc("OpenPrinterW")
	procClosePrinter      = winspool.NewProc("ClosePrinter")
	procStartDocPrinterW  = winspool.NewProc("StartDocPrinterW")
	procEndDocPrinter     = winspool.NewProc("EndDocPrinter")
	procStartPagePrinter  = winspool.NewProc("StartPagePrinter")
	procEndPagePrinter    = winspool.NewProc("EndPagePrinter")
	procWritePrinter      = winspool.NewProc("WritePrinter")
)

const (
	printerEnumLocal       = 0x2
	printerEnumConnections = 0x4
)

type printerInfo4 struct {
	PrinterName *uint16
	ServerName  *uint16
	Attributes  uint32
}

type docInfo1 struct {
	DocName    *uint16
	OutputFile *uint16
	Datatype   *uint16
}

func utf16PtrAString(p *uint16) string {
	if p == nil {
		return ""
	}
	var s []uint16
	for ptr := unsafe.Pointer(p); ; ptr = unsafe.Add(ptr, 2) {
		c := *(*uint16)(ptr)
		if c == 0 {
			break
		}
		s = append(s, c)
		if len(s) > 4096 {
			break
		}
	}
	return syscall.UTF16ToString(s)
}

// ListarImpresoras devuelve las impresoras instaladas en Windows
func ListarImpresoras() ([]string, string, error) {
	var necesario, cantidad uint32
	flags := uintptr(printerEnumLocal | printerEnumConnections)
	procEnumPrintersW.Call(flags, 0, 4, 0, 0, uintptr(unsafe.Pointer(&necesario)), uintptr(unsafe.Pointer(&cantidad)))
	if necesario == 0 {
		return nil, impresoraPredeterminada(), nil
	}
	buf := make([]byte, necesario)
	r, _, err := procEnumPrintersW.Call(flags, 0, 4, uintptr(unsafe.Pointer(&buf[0])), uintptr(necesario),
		uintptr(unsafe.Pointer(&necesario)), uintptr(unsafe.Pointer(&cantidad)))
	if r == 0 {
		return nil, "", fmt.Errorf("no se pudieron listar las impresoras: %v", err)
	}
	tam := unsafe.Sizeof(printerInfo4{})
	var nombres []string
	for i := uint32(0); i < cantidad; i++ {
		info := (*printerInfo4)(unsafe.Pointer(&buf[uintptr(i)*tam]))
		if n := utf16PtrAString(info.PrinterName); n != "" {
			nombres = append(nombres, n)
		}
	}
	sort.Strings(nombres)
	return nombres, impresoraPredeterminada(), nil
}

func impresoraPredeterminada() string {
	var n uint32 = 512
	buf := make([]uint16, n)
	r, _, _ := procGetDefaultPrinter.Call(uintptr(unsafe.Pointer(&buf[0])), uintptr(unsafe.Pointer(&n)))
	if r == 0 {
		return ""
	}
	return syscall.UTF16ToString(buf)
}

// ImprimirRAW manda bytes tal cual (ESC/POS) a la cola de Windows de esa impresora
func ImprimirRAW(impresora, documento string, datos []byte) error {
	if impresora == "" {
		return errors.New("no hay impresora elegida")
	}
	if len(datos) == 0 {
		return nil
	}
	nombre, err := syscall.UTF16PtrFromString(impresora)
	if err != nil {
		return err
	}
	var h syscall.Handle
	r, _, e := procOpenPrinterW.Call(uintptr(unsafe.Pointer(nombre)), uintptr(unsafe.Pointer(&h)), 0)
	if r == 0 {
		return fmt.Errorf("no se pudo abrir la impresora \"%s\": %v", impresora, e)
	}
	defer procClosePrinter.Call(uintptr(h))

	doc, _ := syscall.UTF16PtrFromString(documento)
	tipo, _ := syscall.UTF16PtrFromString("RAW")
	di := docInfo1{DocName: doc, Datatype: tipo}
	r, _, e = procStartDocPrinterW.Call(uintptr(h), 1, uintptr(unsafe.Pointer(&di)))
	if r == 0 {
		return fmt.Errorf("la impresora no aceptó el trabajo: %v", e)
	}
	defer procEndDocPrinter.Call(uintptr(h))
	r, _, e = procStartPagePrinter.Call(uintptr(h))
	if r == 0 {
		return fmt.Errorf("no se pudo empezar la página: %v", e)
	}
	defer procEndPagePrinter.Call(uintptr(h))

	for len(datos) > 0 {
		var escritos uint32
		r, _, e = procWritePrinter.Call(uintptr(h), uintptr(unsafe.Pointer(&datos[0])), uintptr(len(datos)), uintptr(unsafe.Pointer(&escritos)))
		if r == 0 || escritos == 0 {
			return fmt.Errorf("error al mandar a la impresora: %v", e)
		}
		datos = datos[escritos:]
	}
	return nil
}

func nombrePC() string {
	if n := os.Getenv("COMPUTERNAME"); n != "" {
		return n
	}
	n, _ := os.Hostname()
	return n
}

func comandoOculto(nombre string, args ...string) *exec.Cmd {
	c := exec.Command(nombre, args...)
	c.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: 0x08000000} // CREATE_NO_WINDOW
	return c
}

func abrirNavegador(url string) {
	_ = comandoOculto("rundll32", "url.dll,FileProtocolHandler", url).Start()
}

const claveInicio = `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`

func setInicioConWindows(activo bool) error {
	if !activo {
		_ = comandoOculto("reg", "delete", claveInicio, "/v", "CloudTicketImpresion", "/f").Run()
		return nil
	}
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	return comandoOculto("reg", "add", claveInicio, "/v", "CloudTicketImpresion", "/t", "REG_SZ", "/d", `"`+exe+`" --segundo-plano`, "/f").Run()
}

func inicioConWindows() bool {
	return comandoOculto("reg", "query", claveInicio, "/v", "CloudTicketImpresion").Run() == nil
}

// Crea la impresora virtual "PedidosYa (CloudTicket)" que manda al puerto de captura.
// Pide permiso de administrador (aparece el cartel de Windows).
func crearImpresoraVirtual(puerto int) error {
	script := fmt.Sprintf(`$ErrorActionPreference='Stop';
$puerto='CloudTicket_%[1]d';
if (-not (Get-PrinterPort -Name $puerto -ErrorAction SilentlyContinue)) { Add-PrinterPort -Name $puerto -PrinterHostAddress '127.0.0.1' -PortNumber %[1]d }
$driver='Generic / Text Only';
if (-not (Get-PrinterDriver -Name $driver -ErrorAction SilentlyContinue)) { Add-PrinterDriver -Name $driver }
if (-not (Get-Printer -Name 'PedidosYa (CloudTicket)' -ErrorAction SilentlyContinue)) { Add-Printer -Name 'PedidosYa (CloudTicket)' -DriverName $driver -PortName $puerto }`, puerto)
	arg := fmt.Sprintf(`Start-Process powershell -Verb RunAs -Wait -WindowStyle Hidden -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-Command',"%s"`,
		escaparPS(script))
	out, err := comandoOculto("powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", arg).CombinedOutput()
	if err != nil {
		return fmt.Errorf("no se pudo crear la impresora virtual: %v %s", err, string(out))
	}
	return nil
}

func escaparPS(s string) string {
	r := []rune{}
	for _, c := range s {
		if c == '"' {
			r = append(r, '`', '"')
		} else if c == '$' {
			r = append(r, '`', '$')
		} else if c == '\n' || c == '\r' {
			r = append(r, ' ')
		} else {
			r = append(r, c)
		}
	}
	return string(r)
}
