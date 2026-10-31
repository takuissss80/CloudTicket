//go:build !windows

package main

// Fuera de Windows (pruebas): impresoras simuladas que guardan los bytes en archivos.

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

func ListarImpresoras() ([]string, string, error) {
	l := strings.Split(os.Getenv("CT_IMPRESORAS"), ",")
	if os.Getenv("CT_IMPRESORAS") == "" {
		l = []string{"POS-80 (simulada)", "Microsoft Print to PDF"}
	}
	return l, l[0], nil
}

func ImprimirRAW(impresora, documento string, datos []byte) error {
	if impresora == "" {
		return errors.New("no hay impresora elegida")
	}
	if strings.Contains(impresora, "rota") {
		return errors.New("la impresora no responde (simulado)")
	}
	dir := filepath.Join(dirDatos(), "impreso")
	_ = os.MkdirAll(dir, 0o755)
	nombre := fmt.Sprintf("%d-%s.bin", time.Now().UnixNano(), strings.NewReplacer(" ", "_", "/", "_", "(", "", ")", "").Replace(impresora))
	return os.WriteFile(filepath.Join(dir, nombre), datos, 0o644)
}

func nombrePC() string { n, _ := os.Hostname(); return n }

func comandoOculto(nombre string, args ...string) *exec.Cmd { return exec.Command(nombre, args...) }

func abrirNavegador(url string) { fmt.Println("Abrí", url) }

var inicioSimulado bool

func setInicioConWindows(activo bool) error { inicioSimulado = activo; return nil }
func inicioConWindows() bool                { return inicioSimulado }

func crearImpresoraVirtual(puerto int) error {
	return errors.New("solo funciona en Windows")
}
