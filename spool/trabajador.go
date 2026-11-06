package main

import (
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"
)

// Estado de cada vínculo, para mostrar en el panel
type EstadoVinculo struct {
	Conectado bool   `json:"conectado"`
	Error     string `json:"error,omitempty"`
	UltimoOK  string `json:"ultimoOk,omitempty"`
	Impresos  int    `json:"impresos"`
	Fallidos  int    `json:"fallidos"`
}

var (
	estMu   sync.Mutex
	estados = map[string]*EstadoVinculo{}
	paradas = map[string]chan struct{}{}
	trabMu  sync.Mutex
)

func estadoDe(token string) *EstadoVinculo {
	estMu.Lock()
	defer estMu.Unlock()
	e, ok := estados[token]
	if !ok {
		e = &EstadoVinculo{}
		estados[token] = e
	}
	return e
}

func copiaEstado(token string) EstadoVinculo {
	estMu.Lock()
	defer estMu.Unlock()
	if e, ok := estados[token]; ok {
		return *e
	}
	return EstadoVinculo{}
}

// reiniciarTrabajadores: uno por vínculo activo
func reiniciarTrabajadores() {
	trabMu.Lock()
	defer trabMu.Unlock()
	for t, ch := range paradas {
		close(ch)
		delete(paradas, t)
	}
	for _, v := range copiaConfig().Vinculos {
		if v.Desactivar || v.Token == "" {
			continue
		}
		ch := make(chan struct{})
		paradas[v.Token] = ch
		go trabajar(v.Token, ch)
	}
}

func vinculoActual(token string) (Vinculo, bool) {
	for _, v := range copiaConfig().Vinculos {
		if v.Token == token {
			return v, true
		}
	}
	return Vinculo{}, false
}

const intervaloCola = 2 * time.Second

// esperaTokenInvalido: con un token que ya no sirve no tiene sentido insistir cada 10 s
// (llena de errores la base). Se espera cada vez más: 30 s, 1, 2, 5 y después cada 10 minutos.
func esperaTokenInvalido(fallos int) time.Duration {
	pasos := []time.Duration{30 * time.Second, time.Minute, 2 * time.Minute, 5 * time.Minute, 10 * time.Minute}
	if fallos-1 < len(pasos) {
		return pasos[max(0, fallos-1)]
	}
	return pasos[len(pasos)-1]
}

func esTokenInvalido(err error) bool {
	var es errorServidor
	return errors.As(err, &es) && strings.Contains(es.msg, "Token")
}

func trabajar(token string, parar chan struct{}) {
	ultimoPing := time.Time{}
	espera := intervaloCola
	fallosToken := 0
	// Según el error, cuánto esperar antes de reintentar
	esperaPorError := func(err error) time.Duration {
		if esTokenInvalido(err) {
			fallosToken++
			return esperaTokenInvalido(fallosToken)
		}
		return 10 * time.Second
	}
	for {
		select {
		case <-parar:
			return
		case <-time.After(espera):
		}
		v, ok := vinculoActual(token)
		if !ok {
			return
		}
		est := estadoDe(token)

		if time.Since(ultimoPing) > 30*time.Second {
			info, err := apiPing(token, v.Impresora)
			if err != nil {
				marcarError(est, token, v, err)
				espera = esperaPorError(err)
				continue
			}
			fallosToken = 0
			ultimoPing = time.Now()
			cfgMu.Lock()
			for i := range cfg.Vinculos {
				if cfg.Vinculos[i].Token == token {
					cfg.Vinculos[i].Nombre, cfg.Vinculos[i].Local, cfg.Vinculos[i].Ancho = info.Nombre, info.Local, info.Ancho
				}
			}
			_ = guardarConfig()
			cfgMu.Unlock()
		}

		trabajos, err := apiTomar(token)
		if err != nil {
			marcarError(est, token, v, err)
			espera = esperaPorError(err)
			continue
		}
		estMu.Lock()
		if !est.Conectado {
			est.Conectado = true
			est.Error = ""
			estMu.Unlock()
			registrar("ok", "%s conectada", nombreVinculo(v))
		} else {
			estMu.Unlock()
		}
		espera = intervaloCola

		for _, t := range trabajos {
			imprimirTrabajo(token, v, t)
		}
	}
}

func marcarError(est *EstadoVinculo, token string, v Vinculo, err error) {
	estMu.Lock()
	cambio := est.Conectado || est.Error != err.Error()
	est.Conectado = false
	est.Error = err.Error()
	estMu.Unlock()
	if cambio {
		if esTokenInvalido(err) {
			registrar("error", "%s: el token ya no es válido (se generó uno nuevo o se borró la comandera). Quitala de esta PC o volvé a vincularla. Se reintenta cada vez más espaciado.", nombreVinculo(v))
		} else {
			registrar("error", "%s: %v", nombreVinculo(v), err)
		}
	}
}

func nombreVinculo(v Vinculo) string {
	if v.Nombre != "" {
		return fmt.Sprintf("%s (%s)", v.Nombre, v.Local)
	}
	return "Comandera " + tokenCorto(v.Token)
}

func tokenCorto(t string) string {
	if len(t) > 9 {
		return t[:7] + "…"
	}
	return t
}

func imprimirTrabajo(token string, v Vinculo, t Trabajo) {
	est := estadoDe(token)
	datos, err := Renderizar(t.Contenido, v.Ancho, v.CodePage)
	if err == nil {
		copias := t.Copias
		if copias < 1 {
			copias = 1
		}
		if copias > 5 {
			copias = 5
		}
		for i := 0; i < copias && err == nil; i++ {
			err = ImprimirRAW(v.Impresora, "CloudTicket "+t.Tipo, datos)
		}
	}
	if err != nil {
		estMu.Lock()
		est.Fallidos++
		estMu.Unlock()
		registrar("error", "%s: no se pudo imprimir (%s): %v", nombreVinculo(v), t.Tipo, err)
		_ = apiConfirmar(token, t.ID, false, err.Error())
		return
	}
	if e := apiConfirmar(token, t.ID, true, ""); e != nil {
		registrar("error", "Se imprimió pero no se pudo avisar al servidor: %v", e)
	}
	estMu.Lock()
	est.Impresos++
	est.UltimoOK = time.Now().Format("15:04:05")
	estMu.Unlock()
	registrar("ok", "%s: impreso %s", nombreVinculo(v), t.Tipo)
}
