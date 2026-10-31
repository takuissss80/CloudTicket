package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
)

// Vinculo: una comandera de la web (token) impresa en una impresora de esta PC.
type Vinculo struct {
	Token      string `json:"token"`
	Impresora  string `json:"impresora"`        // nombre de la impresora de Windows
	CodePage   int    `json:"codepage"`         // ESC t n (2 = PC850, 19 = PC858, 16 = WPC1252)
	Nombre     string `json:"nombre,omitempty"` // lo completa el servidor
	Local      string `json:"local,omitempty"`  // idem
	Ancho      int    `json:"ancho,omitempty"`  // idem
	Desactivar bool   `json:"desactivado,omitempty"`
}

// Captura: impresora virtual en un puerto TCP. Lo que llega se reenvía a la
// comandera real y el texto se manda a la web para importar el pedido.
type Captura struct {
	Activa       bool   `json:"activa"`
	Puerto       int    `json:"puerto"`
	DesdeLaRed   bool   `json:"desdeLaRed"`   // aceptar conexiones de otras PCs/tablets
	Reenviar     string `json:"reenviar"`     // impresora de Windows donde se imprime igual
	Token        string `json:"token"`        // token de la comandera del local al que se manda
	Canal        string `json:"canal"`        // "pedidosya"
	AgregarCorte bool   `json:"agregarCorte"` // cortar el papel si el ticket no trae corte
}

type Config struct {
	Servidor    string    `json:"servidor"`    // https://cloudticket.com.ar
	SupabaseURL string    `json:"supabaseUrl"` // se baja de <servidor>/spool-config.json
	AnonKey     string    `json:"anonKey"`
	Vinculos    []Vinculo `json:"vinculos"`
	Captura     Captura   `json:"captura"`
	PrimeraVez  bool      `json:"-"`
}

var (
	cfgMu sync.Mutex
	cfg   = &Config{}
)

func dirDatos() string {
	d, err := os.UserConfigDir()
	if err != nil {
		d = "."
	}
	p := filepath.Join(d, "CloudTicket")
	_ = os.MkdirAll(p, 0o755)
	return p
}

func rutaConfig() string { return filepath.Join(dirDatos(), "config.json") }

func cargarConfig() {
	cfgMu.Lock()
	defer cfgMu.Unlock()
	b, err := os.ReadFile(rutaConfig())
	if err != nil {
		cfg = &Config{Servidor: servidorPorDefecto, PrimeraVez: true}
	} else {
		c := &Config{}
		if json.Unmarshal(b, c) != nil {
			c = &Config{Servidor: servidorPorDefecto}
		}
		cfg = c
	}
	if cfg.Servidor == "" {
		cfg.Servidor = servidorPorDefecto
	}
	if cfg.Captura.Puerto == 0 {
		cfg.Captura.Puerto = 9100
	}
	if cfg.Captura.Canal == "" {
		cfg.Captura.Canal = "pedidosya"
	}
	for i := range cfg.Vinculos {
		if cfg.Vinculos[i].CodePage == 0 {
			cfg.Vinculos[i].CodePage = 2
		}
	}
}

// guardarConfig: llamar con cfgMu tomado
func guardarConfig() error {
	b, _ := json.MarshalIndent(cfg, "", "  ")
	tmp := rutaConfig() + ".tmp"
	if err := os.WriteFile(tmp, b, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, rutaConfig())
}

func copiaConfig() Config {
	cfgMu.Lock()
	defer cfgMu.Unlock()
	c := *cfg
	c.Vinculos = append([]Vinculo(nil), cfg.Vinculos...)
	return c
}
