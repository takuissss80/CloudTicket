package main

// Aviso instantáneo: el programa queda conectado al tiempo real de Supabase
// (Realtime Broadcast) en el canal secreto de su comandera. Cuando la web crea
// un trabajo, la base manda un aviso (sin datos) y el programa va a buscar la
// cola enseguida. Si esta conexión se corta, no se pierde nada: el trabajador
// vuelve a revisar la cola cada 2 segundos como antes.

import (
	"bufio"
	"crypto/rand"
	"crypto/sha1"
	"crypto/tls"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	latidoAviso     = 25 * time.Second // Phoenix espera un latido cada <60 s
	silencioMaximo  = 55 * time.Second // sin ningún mensaje en este tiempo, la conexión se da por muerta
	maxMensajeAviso = 1 << 20
)

// ---------------------------------------------------------------------
// WebSocket mínimo (RFC 6455, lado cliente) sin librerías externas
// ---------------------------------------------------------------------

type wsConn struct {
	c   net.Conn
	br  *bufio.Reader
	wmu sync.Mutex
}

func wsConectar(dir string, espera time.Duration) (*wsConn, error) {
	u, err := url.Parse(dir)
	if err != nil {
		return nil, err
	}
	host := u.Hostname()
	puerto := u.Port()
	seguro := u.Scheme == "wss" || u.Scheme == "https"
	if puerto == "" {
		puerto = "80"
		if seguro {
			puerto = "443"
		}
	}
	d := &net.Dialer{Timeout: espera}
	var c net.Conn
	if seguro {
		c, err = tls.DialWithDialer(d, "tcp", net.JoinHostPort(host, puerto), &tls.Config{ServerName: host})
	} else {
		c, err = d.Dial("tcp", net.JoinHostPort(host, puerto))
	}
	if err != nil {
		return nil, err
	}
	_ = c.SetDeadline(time.Now().Add(espera))

	clave := make([]byte, 16)
	_, _ = rand.Read(clave)
	k := base64.StdEncoding.EncodeToString(clave)
	ruta := u.EscapedPath()
	if ruta == "" {
		ruta = "/"
	}
	if u.RawQuery != "" {
		ruta += "?" + u.RawQuery
	}
	pedido := "GET " + ruta + " HTTP/1.1\r\n" +
		"Host: " + u.Host + "\r\n" +
		"Upgrade: websocket\r\nConnection: Upgrade\r\n" +
		"Sec-WebSocket-Key: " + k + "\r\nSec-WebSocket-Version: 13\r\n" +
		"User-Agent: CloudTicketImpresion/" + version + "\r\n\r\n"
	if _, err := io.WriteString(c, pedido); err != nil {
		c.Close()
		return nil, err
	}
	br := bufio.NewReader(c)
	r, err := http.ReadResponse(br, nil)
	if err != nil {
		c.Close()
		return nil, err
	}
	r.Body.Close()
	if r.StatusCode != http.StatusSwitchingProtocols {
		c.Close()
		return nil, fmt.Errorf("el servidor de tiempo real respondió %d", r.StatusCode)
	}
	h := sha1.Sum([]byte(k + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"))
	if r.Header.Get("Sec-WebSocket-Accept") != base64.StdEncoding.EncodeToString(h[:]) {
		c.Close()
		return nil, errors.New("respuesta inválida del servidor de tiempo real")
	}
	_ = c.SetDeadline(time.Time{})
	return &wsConn{c: c, br: br}, nil
}

func (w *wsConn) escribir(op byte, datos []byte) error {
	w.wmu.Lock()
	defer w.wmu.Unlock()
	cab := []byte{0x80 | op}
	n := len(datos)
	switch {
	case n < 126:
		cab = append(cab, 0x80|byte(n))
	case n < 65536:
		cab = append(cab, 0x80|126, byte(n>>8), byte(n))
	default:
		cab = append(cab, 0x80|127)
		cab = binary.BigEndian.AppendUint64(cab, uint64(n))
	}
	mascara := make([]byte, 4)
	_, _ = rand.Read(mascara)
	cab = append(cab, mascara...)
	enmascarado := make([]byte, n)
	for i := range datos {
		enmascarado[i] = datos[i] ^ mascara[i%4]
	}
	_ = w.c.SetWriteDeadline(time.Now().Add(15 * time.Second))
	if _, err := w.c.Write(append(cab, enmascarado...)); err != nil {
		return err
	}
	return nil
}

func (w *wsConn) enviarTexto(v any) error {
	b, _ := json.Marshal(v)
	return w.escribir(0x1, b)
}

// leer devuelve el próximo mensaje de texto. Contesta los ping y arma los mensajes en partes.
func (w *wsConn) leer() ([]byte, error) {
	var mensaje []byte
	for {
		var cab [2]byte
		if _, err := io.ReadFull(w.br, cab[:]); err != nil {
			return nil, err
		}
		fin := cab[0]&0x80 != 0
		op := cab[0] & 0x0f
		n := uint64(cab[1] & 0x7f)
		enmascarado := cab[1]&0x80 != 0
		switch n {
		case 126:
			var b [2]byte
			if _, err := io.ReadFull(w.br, b[:]); err != nil {
				return nil, err
			}
			n = uint64(binary.BigEndian.Uint16(b[:]))
		case 127:
			var b [8]byte
			if _, err := io.ReadFull(w.br, b[:]); err != nil {
				return nil, err
			}
			n = binary.BigEndian.Uint64(b[:])
		}
		if n > maxMensajeAviso {
			return nil, errors.New("mensaje demasiado grande")
		}
		var mascara [4]byte
		if enmascarado {
			if _, err := io.ReadFull(w.br, mascara[:]); err != nil {
				return nil, err
			}
		}
		datos := make([]byte, n)
		if _, err := io.ReadFull(w.br, datos); err != nil {
			return nil, err
		}
		if enmascarado {
			for i := range datos {
				datos[i] ^= mascara[i%4]
			}
		}
		switch op {
		case 0x8: // cierre
			_ = w.escribir(0x8, nil)
			return nil, errors.New("el servidor cerró la conexión")
		case 0x9: // ping
			if err := w.escribir(0xA, datos); err != nil {
				return nil, err
			}
			continue
		case 0xA: // pong
			continue
		case 0x0, 0x1, 0x2:
			mensaje = append(mensaje, datos...)
			if len(mensaje) > maxMensajeAviso {
				return nil, errors.New("mensaje demasiado grande")
			}
			if fin {
				return mensaje, nil
			}
		}
	}
}

func (w *wsConn) cerrar() { _ = w.c.Close() }

// ---------------------------------------------------------------------
// Canal de avisos de una comandera
// ---------------------------------------------------------------------

type mensajePhoenix struct {
	Topic   string          `json:"topic"`
	Event   string          `json:"event"`
	Payload json.RawMessage `json:"payload"`
	Ref     *string         `json:"ref"`
}

// urlTiempoReal arma la dirección del tiempo real a partir de la URL de Supabase
func urlTiempoReal(supabaseURL, clave string) string {
	base := strings.TrimRight(supabaseURL, "/")
	base = strings.Replace(base, "https://", "wss://", 1)
	base = strings.Replace(base, "http://", "ws://", 1)
	return base + "/realtime/v1/websocket?apikey=" + url.QueryEscape(clave) + "&vsn=1.0.0"
}

// escucharAvisos mantiene la conexión abierta mientras no se pida parar. Cada aviso
// (y cada vez que se conecta, para no perder lo que llegó mientras estaba cortado)
// despierta al trabajador por el canal avisar.
func escucharAvisos(token, canal string, avisar chan<- struct{}, parar <-chan struct{}) {
	espera := 2 * time.Second
	for {
		inicio := time.Now()
		err := sesionAvisos(token, canal, avisar, parar)
		marcarInstantaneo(token, false)
		// El trabajador quizás esperaba 30 s confiando en el aviso: que revise ya y pase a cada 2 s
		despertar(avisar)
		select {
		case <-parar:
			return
		default:
		}
		if time.Since(inicio) > time.Minute {
			espera = 2 * time.Second
		}
		if err != nil {
			registrarDetalle("Aviso instantáneo (%s): %v. Mientras tanto se revisa la cola cada 2 s.", tokenCorto(token), err)
		}
		select {
		case <-parar:
			return
		case <-time.After(espera):
		}
		if espera < time.Minute {
			espera *= 2
		}
	}
}

func despertar(avisar chan<- struct{}) {
	select {
	case avisar <- struct{}{}:
	default: // ya había un aviso pendiente
	}
}

func sesionAvisos(token, canal string, avisar chan<- struct{}, parar <-chan struct{}) error {
	if err := asegurarServidor(); err != nil {
		return err
	}
	c := copiaConfig()
	ws, err := wsConectar(urlTiempoReal(c.SupabaseURL, c.AnonKey), 15*time.Second)
	if err != nil {
		return err
	}
	defer ws.cerrar()

	// Si piden parar, se corta la conexión y la lectura termina
	listo := make(chan struct{})
	defer close(listo)
	go func() {
		select {
		case <-parar:
			ws.cerrar()
		case <-listo:
		}
	}()

	tema := "realtime:" + canal
	carga := map[string]any{
		"config": map[string]any{
			"broadcast":        map[string]any{"self": false, "ack": false},
			"presence":         map[string]any{"key": ""},
			"postgres_changes": []any{},
			"private":          false,
		},
	}
	// Las claves viejas (JWT) van también como access_token
	if strings.HasPrefix(c.AnonKey, "eyJ") {
		carga["access_token"] = c.AnonKey
	}
	if err := ws.enviarTexto(map[string]any{"topic": tema, "event": "phx_join", "payload": carga, "ref": "1", "join_ref": "1"}); err != nil {
		return err
	}

	// Latidos
	var ref int64 = 1
	var refMu sync.Mutex
	go func() {
		t := time.NewTicker(latidoAviso)
		defer t.Stop()
		for {
			select {
			case <-listo:
				return
			case <-t.C:
				refMu.Lock()
				ref++
				r := strconv.FormatInt(ref, 10)
				refMu.Unlock()
				if ws.enviarTexto(map[string]any{"topic": "phoenix", "event": "heartbeat", "payload": map[string]any{}, "ref": r}) != nil {
					ws.cerrar()
					return
				}
			}
		}
	}()

	for {
		_ = ws.c.SetReadDeadline(time.Now().Add(silencioMaximo))
		b, err := ws.leer()
		if err != nil {
			return err
		}
		var m mensajePhoenix
		if json.Unmarshal(b, &m) != nil {
			continue
		}
		switch {
		case m.Event == "phx_reply" && m.Topic == tema && m.Ref != nil && *m.Ref == "1":
			var r struct {
				Status   string          `json:"status"`
				Response json.RawMessage `json:"response"`
			}
			_ = json.Unmarshal(m.Payload, &r)
			if r.Status != "ok" {
				return fmt.Errorf("no se pudo escuchar el canal: %s", recortar(string(r.Response), 200))
			}
			marcarInstantaneo(token, true)
			despertar(avisar) // por si llegó algo mientras estaba desconectado
		case m.Event == "broadcast" && m.Topic == tema:
			despertar(avisar)
		case (m.Event == "phx_error" || m.Event == "phx_close") && m.Topic == tema:
			return errors.New("el servidor cerró el canal")
		}
	}
}

func marcarInstantaneo(token string, si bool) {
	est := estadoDe(token)
	estMu.Lock()
	cambio := est.Instantaneo != si
	est.Instantaneo = si
	estMu.Unlock()
	if cambio && si {
		registrarDetalle("Aviso instantáneo conectado (%s)", tokenCorto(token))
	}
}
