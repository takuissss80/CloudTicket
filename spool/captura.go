package main

import (
	"bytes"
	"crypto/sha256"
	"fmt"
	"io"
	"net"
	"strings"
	"sync"
	"time"
)

// Impresora virtual: escucha en un puerto (RAW / 9100). Lo que llega
// 1) se imprime igual en la comandera real y 2) se manda a la web como pedido.

var (
	capMu       sync.Mutex
	capListener net.Listener
	capEstado   = struct {
		Escuchando bool   `json:"escuchando"`
		Error      string `json:"error,omitempty"`
		Recibidos  int    `json:"recibidos"`
		Enviados   int    `json:"enviados"`
		Duplicados int    `json:"duplicados"`
		Ignorados  int    `json:"ignorados"`
		Imagenes   int    `json:"imagenes"`
		Ultimo     string `json:"ultimo,omitempty"`
	}{}
	ultimoTexto string
)

func reiniciarCaptura() {
	capMu.Lock()
	defer capMu.Unlock()
	if capListener != nil {
		_ = capListener.Close()
		capListener = nil
	}
	capEstado.Escuchando = false
	capEstado.Error = ""
	c := copiaConfig().Captura
	if !c.Activa {
		return
	}
	host := "127.0.0.1"
	if c.DesdeLaRed {
		host = "0.0.0.0"
	}
	l, err := net.Listen("tcp", fmt.Sprintf("%s:%d", host, c.Puerto))
	if err != nil {
		capEstado.Error = fmt.Sprintf("No se pudo abrir el puerto %d: %v", c.Puerto, err)
		registrar("error", "Captura: %s", capEstado.Error)
		return
	}
	capListener = l
	capEstado.Escuchando = true
	registrar("info", "Captura escuchando en el puerto %d", c.Puerto)
	go func() {
		for {
			conn, err := l.Accept()
			if err != nil {
				return
			}
			go atenderCaptura(conn)
		}
	}()
}

func atenderCaptura(conn net.Conn) {
	defer conn.Close()
	var buf bytes.Buffer
	tmp := make([]byte, 32*1024)
	for buf.Len() < 4<<20 {
		_ = conn.SetReadDeadline(time.Now().Add(3 * time.Second))
		n, err := conn.Read(tmp)
		buf.Write(tmp[:n])
		if err != nil {
			if err != io.EOF && buf.Len() == 0 {
				return
			}
			break
		}
	}
	if buf.Len() == 0 {
		return
	}
	procesarCaptura(buf.Bytes())
}

// Windows reintenta un trabajo si cree que falló: el mismo ticket puede llegar
// varias veces seguidas. Lo idéntico dentro de 20 s se ignora.
var (
	vistosMu sync.Mutex
	vistos   = map[[32]byte]time.Time{}
)

func repetidoReciente(datos []byte) bool {
	h := sha256.Sum256(datos)
	vistosMu.Lock()
	defer vistosMu.Unlock()
	ahora := time.Now()
	for k, t := range vistos {
		if ahora.Sub(t) > 20*time.Second {
			delete(vistos, k)
		}
	}
	if t, ok := vistos[h]; ok && ahora.Sub(t) <= 20*time.Second {
		vistos[h] = ahora
		return true
	}
	vistos[h] = ahora
	return false
}

func procesarCaptura(datos []byte) {
	c := copiaConfig().Captura
	if repetidoReciente(datos) {
		capMu.Lock()
		capEstado.Ignorados++
		capMu.Unlock()
		return
	}
	capMu.Lock()
	capEstado.Recibidos++
	capEstado.Ultimo = time.Now().Format("15:04:05")
	capMu.Unlock()

	texto, imagen, cortes := ExtraerTexto(datos)

	// 1) Que se imprima igual (lo primero: la cocina no puede quedarse sin el ticket)
	if c.Reenviar != "" && !EsImpresoraVirtual(c.Reenviar) {
		salida := datos
		if c.AgregarCorte && cortes == 0 {
			salida = append(append([]byte{}, datos...), 0x1B, 'd', 4, 0x1D, 'V', 66, 0)
		}
		if err := ImprimirRAW(c.Reenviar, "Pedido capturado", salida); err != nil {
			registrar("error", "Captura: no se pudo reenviar a %s: %v", c.Reenviar, err)
		}
	}

	// 2) Mandarlo a la web
	formato := "texto"
	if imagen {
		formato = "imagen"
		texto = "(El ticket llegó como imagen: no se puede leer el texto. Configurá la impresora virtual con el driver \"Generic / Text Only\".)"
		capMu.Lock()
		capEstado.Imagenes++
		capMu.Unlock()
	}
	capMu.Lock()
	ultimoTexto = texto
	capMu.Unlock()
	if c.Token == "" {
		registrar("error", "Captura: elegí a qué comandera/local se mandan los pedidos")
		return
	}
	var res string
	var err error
	for intento := 0; intento < 5; intento++ {
		res, err = apiCapturar(c.Token, texto, formato, c.Canal)
		if err == nil {
			break
		}
		time.Sleep(time.Duration(intento+1) * 2 * time.Second)
	}
	if err != nil {
		registrar("error", "Captura: no se pudo mandar el pedido a la web: %v", err)
		return
	}
	primera := strings.SplitN(strings.TrimSpace(texto), "\n", 2)[0]
	capMu.Lock()
	switch res {
	case "duplicado":
		capEstado.Duplicados++
	case "nuevo":
		capEstado.Enviados++
	}
	capMu.Unlock()
	registrar("ok", "Captura: pedido %s (%s)", res, recortar(primera, 40))
}

func recortar(s string, n int) string {
	r := []rune(s)
	if len(r) > n {
		return string(r[:n]) + "…"
	}
	return s
}
