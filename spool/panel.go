package main

import (
	_ "embed"
	"encoding/json"
	"net"
	"net/http"
	"strconv"
	"strings"
)

//go:embed panel.html
var panelHTML []byte

const puertoPanel = 7317

func normalizarToken(t string) string {
	t = strings.ToUpper(strings.TrimSpace(t))
	var b strings.Builder
	for _, r := range t {
		if (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '-' {
			b.WriteRune(r)
		}
	}
	return b.String()
}

func responder(w http.ResponseWriter, v any, err error) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	if err != nil {
		w.WriteHeader(400)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}
	_ = json.NewEncoder(w).Encode(v)
}

type vinculoVista struct {
	Indice    int           `json:"indice"`
	Token     string        `json:"token"`
	Impresora string        `json:"impresora"`
	CodePage  int           `json:"codepage"`
	Nombre    string        `json:"nombre"`
	Local     string        `json:"local"`
	Ancho     int           `json:"ancho"`
	Pausado   bool          `json:"pausado"`
	Estado    EstadoVinculo `json:"estado"`
}

func estadoPanel() map[string]any {
	c := copiaConfig()
	imps, pred, err := ListarImpresoras()
	errImps := ""
	if err != nil {
		errImps = err.Error()
	}
	var vs []vinculoVista
	for i, v := range c.Vinculos {
		vs = append(vs, vinculoVista{i, tokenCorto(v.Token), v.Impresora, v.CodePage, v.Nombre, v.Local, v.Ancho, v.Desactivar, copiaEstado(v.Token)})
	}
	capMu.Lock()
	ce := capEstado
	ut := ultimoTexto
	capMu.Unlock()
	capCfg := c.Captura
	capCfg.Token = tokenCorto(capCfg.Token)
	return map[string]any{
		"version": version, "pc": nombrePC(), "servidor": c.Servidor, "servidorListo": c.SupabaseURL != "",
		"impresoras": imps, "predeterminada": pred, "errorImpresoras": errImps,
		"vinculos": vs, "captura": capCfg, "capturaEstado": ce, "ultimoTexto": ut,
		"capturaIndice": indiceDeToken(c, c.Captura.Token),
		"inicio":        inicioConWindows(), "eventos": ultimosEventos(),
	}
}

func indiceDeToken(c Config, t string) int {
	for i, v := range c.Vinculos {
		if v.Token == t {
			return i
		}
	}
	return -1
}

func iniciarPanel() (net.Listener, error) {
	l, err := net.Listen("tcp", "127.0.0.1:"+strconv.Itoa(puertoPanel))
	if err != nil {
		return nil, err
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		_, _ = w.Write(panelHTML)
	})
	api := func(ruta string, f func(r *http.Request) (any, error)) {
		mux.HandleFunc(ruta, func(w http.ResponseWriter, r *http.Request) {
			// Solo desde el propio panel: evita que una página web cualquiera le hable al programa
			host := strings.Split(r.Host, ":")[0]
			if (host != "127.0.0.1" && host != "localhost") || (r.Method == "POST" && r.Header.Get("X-CloudTicket") != "1") {
				http.Error(w, "no permitido", http.StatusForbidden)
				return
			}
			v, err := f(r)
			responder(w, v, err)
		})
	}
	leer := func(r *http.Request, v any) error {
		return json.NewDecoder(http.MaxBytesReader(nil, r.Body, 1<<20)).Decode(v)
	}

	api("/api/estado", func(r *http.Request) (any, error) { return estadoPanel(), nil })

	api("/api/vincular", func(r *http.Request) (any, error) {
		var p struct {
			Token     string `json:"token"`
			Impresora string `json:"impresora"`
			CodePage  int    `json:"codepage"`
		}
		if err := leer(r, &p); err != nil {
			return nil, err
		}
		tok := normalizarToken(p.Token)
		if len(strings.ReplaceAll(tok, "-", "")) < 10 {
			return nil, errorServidor{"Pegá el token completo (empieza con CT-)."}
		}
		if p.Impresora == "" {
			return nil, errorServidor{"Elegí la impresora de esta PC."}
		}
		if p.CodePage == 0 {
			p.CodePage = 2
		}
		info, err := apiPing(tok, p.Impresora)
		if err != nil {
			return nil, err
		}
		cfgMu.Lock()
		nuevo := Vinculo{Token: tok, Impresora: p.Impresora, CodePage: p.CodePage, Nombre: info.Nombre, Local: info.Local, Ancho: info.Ancho}
		reemplazado := false
		for i := range cfg.Vinculos {
			if cfg.Vinculos[i].Token == tok {
				cfg.Vinculos[i] = nuevo
				reemplazado = true
			}
		}
		if !reemplazado {
			cfg.Vinculos = append(cfg.Vinculos, nuevo)
		}
		if cfg.Captura.Token == "" {
			cfg.Captura.Token = tok
		}
		err = guardarConfig()
		cfgMu.Unlock()
		reiniciarTrabajadores()
		registrar("ok", "Vinculada %s (%s) a la impresora %s", info.Nombre, info.Local, p.Impresora)
		return info, err
	})

	api("/api/vinculo", func(r *http.Request) (any, error) {
		var p struct {
			Indice    int    `json:"indice"`
			Accion    string `json:"accion"` // guardar | eliminar | prueba | pausar | reanudar
			Impresora string `json:"impresora"`
			CodePage  int    `json:"codepage"`
		}
		if err := leer(r, &p); err != nil {
			return nil, err
		}
		cfgMu.Lock()
		if p.Indice < 0 || p.Indice >= len(cfg.Vinculos) {
			cfgMu.Unlock()
			return nil, errorServidor{"No existe esa comandera"}
		}
		v := cfg.Vinculos[p.Indice]
		switch p.Accion {
		case "eliminar":
			cfg.Vinculos = append(cfg.Vinculos[:p.Indice], cfg.Vinculos[p.Indice+1:]...)
			if cfg.Captura.Token == v.Token {
				cfg.Captura.Token = ""
				if len(cfg.Vinculos) > 0 {
					cfg.Captura.Token = cfg.Vinculos[0].Token
				}
			}
		case "guardar":
			if p.Impresora != "" {
				cfg.Vinculos[p.Indice].Impresora = p.Impresora
			}
			cfg.Vinculos[p.Indice].CodePage = p.CodePage
		case "pausar":
			cfg.Vinculos[p.Indice].Desactivar = true
		case "reanudar":
			cfg.Vinculos[p.Indice].Desactivar = false
		case "prueba":
			cfgMu.Unlock()
			err := ImprimirRAW(v.Impresora, "CloudTicket prueba", TicketPrueba(v.Nombre, v.Local, v.Impresora, v.CodePage))
			if err != nil {
				registrar("error", "Prueba en %s: %v", v.Impresora, err)
				return nil, err
			}
			registrar("ok", "Prueba enviada a %s", v.Impresora)
			return map[string]bool{"ok": true}, nil
		}
		err := guardarConfig()
		cfgMu.Unlock()
		reiniciarTrabajadores()
		return map[string]bool{"ok": true}, err
	})

	api("/api/captura", func(r *http.Request) (any, error) {
		var p struct {
			Activa       bool   `json:"activa"`
			Puerto       int    `json:"puerto"`
			DesdeLaRed   bool   `json:"desdeLaRed"`
			Reenviar     string `json:"reenviar"`
			Indice       int    `json:"indice"`
			AgregarCorte bool   `json:"agregarCorte"`
		}
		if err := leer(r, &p); err != nil {
			return nil, err
		}
		if p.Puerto <= 0 || p.Puerto > 65535 || p.Puerto == puertoPanel {
			return nil, errorServidor{"Puerto inválido"}
		}
		cfgMu.Lock()
		cfg.Captura.Activa, cfg.Captura.Puerto, cfg.Captura.DesdeLaRed = p.Activa, p.Puerto, p.DesdeLaRed
		cfg.Captura.Reenviar, cfg.Captura.AgregarCorte = p.Reenviar, p.AgregarCorte
		if p.Indice >= 0 && p.Indice < len(cfg.Vinculos) {
			cfg.Captura.Token = cfg.Vinculos[p.Indice].Token
		}
		err := guardarConfig()
		cfgMu.Unlock()
		reiniciarCaptura()
		return map[string]bool{"ok": true}, err
	})

	api("/api/inicio", func(r *http.Request) (any, error) {
		var p struct {
			Activo bool `json:"activo"`
		}
		if err := leer(r, &p); err != nil {
			return nil, err
		}
		return map[string]bool{"ok": true}, setInicioConWindows(p.Activo)
	})

	api("/api/servidor", func(r *http.Request) (any, error) {
		var p struct {
			Servidor string `json:"servidor"`
		}
		if err := leer(r, &p); err != nil {
			return nil, err
		}
		s := strings.TrimRight(strings.TrimSpace(p.Servidor), "/")
		if !strings.HasPrefix(s, "http") {
			s = "https://" + s
		}
		url, key, err := bajarConfigServidor(s)
		if err != nil {
			return nil, err
		}
		cfgMu.Lock()
		cfg.Servidor, cfg.SupabaseURL, cfg.AnonKey = s, url, key
		err = guardarConfig()
		cfgMu.Unlock()
		reiniciarTrabajadores()
		return map[string]bool{"ok": true}, err
	})

	api("/api/impresora-virtual", func(r *http.Request) (any, error) {
		c := copiaConfig().Captura
		if err := crearImpresoraVirtual(c.Puerto); err != nil {
			return nil, err
		}
		registrar("ok", "Impresora virtual \"PedidosYa (CloudTicket)\" creada")
		return map[string]bool{"ok": true}, nil
	})

	go func() { _ = http.Serve(l, mux) }()
	return l, nil
}
