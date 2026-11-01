package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

var cliente = &http.Client{Timeout: 20 * time.Second}

// Baja la URL de Supabase y la anon key (públicas) que publica la web.
func bajarConfigServidor(servidor string) (string, string, error) {
	u := strings.TrimRight(servidor, "/") + "/spool-config.json"
	r, err := cliente.Get(u)
	if err != nil {
		return "", "", fmt.Errorf("no se pudo conectar a %s: %w", servidor, err)
	}
	defer r.Body.Close()
	if r.StatusCode != 200 {
		return "", "", fmt.Errorf("%s respondió %d", u, r.StatusCode)
	}
	var j struct {
		SupabaseURL string `json:"supabaseUrl"`
		AnonKey     string `json:"anonKey"`
	}
	if err := json.NewDecoder(r.Body).Decode(&j); err != nil || j.SupabaseURL == "" || j.AnonKey == "" {
		return "", "", errors.New("la web no publicó la configuración (spool-config.json)")
	}
	return j.SupabaseURL, j.AnonKey, nil
}

// asegurarServidor: completa SupabaseURL/AnonKey si faltan
func asegurarServidor() error {
	c := copiaConfig()
	if c.SupabaseURL != "" && c.AnonKey != "" {
		return nil
	}
	url, key, err := bajarConfigServidor(c.Servidor)
	if err != nil {
		return err
	}
	cfgMu.Lock()
	cfg.SupabaseURL, cfg.AnonKey = url, key
	_ = guardarConfig()
	cfgMu.Unlock()
	return nil
}

type errorServidor struct{ msg string }

func (e errorServidor) Error() string { return e.msg }

// rpc llama a una función de Postgres (security definer) con la anon key.
func rpc(nombre string, args any, out any) error {
	if err := asegurarServidor(); err != nil {
		return err
	}
	c := copiaConfig()
	cuerpo, _ := json.Marshal(args)
	req, _ := http.NewRequest("POST", strings.TrimRight(c.SupabaseURL, "/")+"/rest/v1/rpc/"+nombre, bytes.NewReader(cuerpo))
	req.Header.Set("apikey", c.AnonKey)
	// Claves viejas (JWT "eyJ…") van también en Authorization. Las nuevas (sb_publishable_…)
	// van solo en apikey: Supabase usa el rol anon.
	if strings.HasPrefix(c.AnonKey, "eyJ") {
		req.Header.Set("Authorization", "Bearer "+c.AnonKey)
	}
	req.Header.Set("Content-Type", "application/json")
	r, err := cliente.Do(req)
	if err != nil {
		return fmt.Errorf("sin conexión con el servidor: %w", err)
	}
	defer r.Body.Close()
	b, _ := io.ReadAll(r.Body)
	if r.StatusCode >= 300 {
		var e struct {
			Message string `json:"message"`
		}
		_ = json.Unmarshal(b, &e)
		if e.Message == "" {
			e.Message = fmt.Sprintf("error %d del servidor", r.StatusCode)
		}
		return errorServidor{e.Message}
	}
	if out != nil && len(b) > 0 {
		return json.Unmarshal(b, out)
	}
	return nil
}

type InfoComandera struct {
	ImpresoraID string `json:"impresora_id"`
	Nombre      string `json:"nombre"`
	Ancho       int    `json:"ancho"`
	Copias      int    `json:"copias"`
	Local       string `json:"local"`
	Cuenta      string `json:"cuenta"`
}

func apiPing(token, impresora string) (InfoComandera, error) {
	var info InfoComandera
	err := rpc("spool_ping", map[string]any{
		"p_token": token, "p_pc": nombrePC(), "p_impresora_windows": impresora, "p_version": version,
	}, &info)
	return info, err
}

type Trabajo struct {
	ID        string          `json:"id"`
	Tipo      string          `json:"tipo"`
	Contenido json.RawMessage `json:"contenido"`
	Copias    int             `json:"copias"`
}

func apiTomar(token string) ([]Trabajo, error) {
	var t []Trabajo
	err := rpc("spool_tomar", map[string]any{"p_token": token, "p_max": 10}, &t)
	return t, err
}

func apiConfirmar(token, job string, ok bool, msg string) error {
	return rpc("spool_confirmar", map[string]any{"p_token": token, "p_job": job, "p_ok": ok, "p_error": msg}, nil)
}

func apiCapturar(token, texto, formato, canal string) (string, error) {
	var res string
	err := rpc("spool_capturar", map[string]any{"p_token": token, "p_texto": texto, "p_formato": formato, "p_canal": canal}, &res)
	return res, err
}
