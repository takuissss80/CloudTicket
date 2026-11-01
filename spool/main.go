// CloudTicket Impresión: recibe las comandas de la web y las imprime en la
// comandera de esta PC. También puede capturar los tickets que imprime otro
// programa (p. ej. PedidosYa) para importarlos como pedidos.
package main

import (
	"flag"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"time"
)

var (
	version            = "1.1.1"
	servidorPorDefecto = "https://cloudticket.com.ar"
)

func main() {
	segundoPlano := flag.Bool("segundo-plano", false, "no abrir el panel al iniciar (inicio con Windows)")
	flag.Parse()

	url := "http://127.0.0.1:" + strconv.Itoa(puertoPanel) + "/"
	if _, err := iniciarPanel(); err != nil {
		// Ya está abierto: solo mostramos el panel
		if r, e := http.Get(url + "api/estado"); e == nil {
			r.Body.Close()
			abrirNavegador(url)
			return
		}
		fmt.Fprintln(os.Stderr, "No se pudo abrir el panel:", err)
		os.Exit(1)
	}

	cargarConfig()
	registrar("info", "CloudTicket Impresión v%s iniciado en %s", version, nombrePC())
	go func() {
		if err := asegurarServidor(); err != nil {
			registrar("error", "Servidor: %v", err)
		}
	}()
	reiniciarTrabajadores()
	reiniciarCaptura()

	if !*segundoPlano {
		time.Sleep(300 * time.Millisecond)
		abrirNavegador(url)
	}
	select {}
}
