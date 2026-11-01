package main

import (
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"
)

type Evento struct {
	Hora  string `json:"hora"`
	Tipo  string `json:"tipo"` // ok | error | info
	Texto string `json:"texto"`
}

var (
	regMu   sync.Mutex
	eventos []Evento
)

func registrar(tipo, formato string, args ...any) {
	e := Evento{Hora: time.Now().Format("15:04:05"), Tipo: tipo, Texto: fmt.Sprintf(formato, args...)}
	regMu.Lock()
	eventos = append(eventos, e)
	if len(eventos) > 300 {
		eventos = eventos[len(eventos)-300:]
	}
	regMu.Unlock()
	ruta := filepath.Join(dirDatos(), "registro.txt")
	if st, err := os.Stat(ruta); err == nil && st.Size() > 2<<20 {
		_ = os.Rename(ruta, ruta+".anterior")
	}
	if f, err := os.OpenFile(ruta, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644); err == nil {
		fmt.Fprintf(f, "%s [%s] %s\n", time.Now().Format("2006-01-02 15:04:05"), e.Tipo, e.Texto)
		f.Close()
	}
}

func ultimosEventos() []Evento {
	regMu.Lock()
	defer regMu.Unlock()
	out := make([]Evento, len(eventos))
	for i := range eventos {
		out[i] = eventos[len(eventos)-1-i]
	}
	return out
}

// registrarDetalle: solo al archivo (para soporte), no al panel
func registrarDetalle(formato string, args ...any) {
	ruta := filepath.Join(dirDatos(), "registro.txt")
	if f, err := os.OpenFile(ruta, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644); err == nil {
		fmt.Fprintf(f, "%s [detalle] %s\n", time.Now().Format("2006-01-02 15:04:05"), fmt.Sprintf(formato, args...))
		f.Close()
	}
}
