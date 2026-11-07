package main

import (
	"bytes"
	"encoding/json"
	"strings"
	"testing"
	"time"
)

func TestTablas(t *testing.T) {
	if len(cp850) != 128 || len(cp437) != 128 {
		t.Fatalf("tablas: cp850=%d cp437=%d", len(cp850), len(cp437))
	}
	tb := tablaCodepage(2)
	casos := map[rune]byte{'á': 0xA0, 'é': 0x82, 'í': 0xA1, 'ó': 0xA2, 'ú': 0xA3, 'ñ': 0xA4, 'Ñ': 0xA5, 'Á': 0xB5, 'É': 0x90, 'Í': 0xD6, 'Ó': 0xE0, 'Ú': 0xE9, '¿': 0xA8, '¡': 0xAD, '°': 0xF8, 'ü': 0x81}
	for r, b := range casos {
		if tb[r] != b {
			t.Errorf("PC850 %c = %X, esperaba %X", r, tb[r], b)
		}
	}
	if tablaCodepage(19)['€'] != 0xD5 {
		t.Error("PC858 €")
	}
	if tablaCodepage(16)['ñ'] != 0xF1 {
		t.Error("1252 ñ")
	}
	if got := codificar("Á", tablaCodepage(0)); string(got) != "A" {
		t.Errorf("PC437 sin Á: %q", got)
	}
}

func TestRenderYExtraer(t *testing.T) {
	l := []Linea{
		{T: "text", Text: "COMANDA #12", Size: "xl", Bold: true, Align: "center"},
		{T: "text", Text: " DELIVERY ", Size: "large", Invert: true, Align: "center"},
		{T: "line"},
		{T: "text", Text: "1 x Muzzarella con jamón y morrón   $12.500"},
		{T: "text", Text: "  -> Ñoquis ¿sin sal? ¡Ya!"},
		{T: "feed", N: 3},
		{T: "cut"},
	}
	j, _ := json.Marshal(l)
	b, err := Renderizar(j, 32, 2)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.HasPrefix(b, []byte{0x1B, '@', 0x1B, 't', 2}) {
		t.Error("falta inicialización")
	}
	if !bytes.Contains(b, []byte{0x1D, 'V', 66, 0}) {
		t.Error("falta corte")
	}
	if bytes.Count(b, []byte{0x1D, 'V'}) != 1 {
		t.Error("cortó dos veces")
	}
	if !bytes.Contains(b, []byte(strings.Repeat("-", 32))) {
		t.Error("línea al ancho")
	}
	// lo que imprime la web, capturado, se vuelve a leer
	txt, img, cortes := ExtraerTexto(b)
	if img || cortes != 1 {
		t.Errorf("img=%v cortes=%d", img, cortes)
	}
	for _, s := range []string{"COMANDA #12", "DELIVERY", "1 x Muzzarella con jamón y morrón   $12.500", "Ñoquis ¿sin sal? ¡Ya!"} {
		if !strings.Contains(txt, s) {
			t.Errorf("no aparece %q en:\n%s", s, txt)
		}
	}
}

func TestExtraerTextoPlanoWindows1252(t *testing.T) {
	// "Generic / Text Only" manda texto en la página de Windows con CRLF y form feed
	data := []byte("PEDIDOS YA\r\nPedido #9981\r\n2 x Empanada de carne cortada a cuchillo  $6.000\r\nPa\xf1o \xe1\r\n\x0c")
	txt, img, cortes := ExtraerTexto(data)
	if img || cortes != 1 || !strings.Contains(txt, "Paño á") || !strings.Contains(txt, "Pedido #9981") {
		t.Errorf("img=%v cortes=%d txt=%q", img, cortes, txt)
	}
}

func TestExtraerImagen(t *testing.T) {
	// GS v 0: raster de 48 bytes x 100 filas, sin texto
	data := []byte{0x1B, '@', 0x1D, 'v', '0', 0, 48, 0, 100, 0}
	data = append(data, bytes.Repeat([]byte{0xFF}, 48*100)...)
	data = append(data, 0x1D, 'V', 66, 0)
	txt, img, _ := ExtraerTexto(data)
	if !img || strings.TrimSpace(txt) != "" {
		t.Errorf("img=%v txt=%q", img, txt)
	}
}

func TestQRyCodigoDeBarras(t *testing.T) {
	// QR (GS ( k) y código de barras no deben ensuciar el texto
	qr := []byte{0x1D, '(', 'k', 7, 0, 49, 80, 48, 'h', 't', 't', 'p'}
	bar := []byte{0x1D, 'k', 73, 5, '1', '2', '3', '4', '5'}
	data := append(append(append([]byte("Total $1.000\n"), qr...), bar...), []byte("Gracias\n")...)
	txt, _, _ := ExtraerTexto(data)
	if txt != "Total $1.000\nGracias" {
		t.Errorf("txt=%q", txt)
	}
}

func TestVistaPrevia(t *testing.T) {
	l := []Linea{
		{T: "text", Text: "COMANDA #12", Size: "xl", Bold: true, Align: "center"},
		{T: "text", Text: " DELIVERY ", Size: "large", Invert: true, Align: "center"},
		{T: "line"},
		{T: "text", Text: "1 x Ñoquis con salsa", Bold: true},
		{T: "text", Text: "TOTAL $9.000", Align: "right"},
		{T: "feed", N: 2},
		{T: "cut"},
	}
	j, _ := json.Marshal(l)
	b, _ := Renderizar(j, 48, 2)
	v, img := RenderizarVista(b)
	if img {
		t.Fatal("no es imagen")
	}
	if v[0].Alinear != "center" || v[0].Segmentos[0].Texto != "COMANDA #12" || v[0].Segmentos[0].Ancho != 3 || !v[0].Segmentos[0].Negrita {
		t.Errorf("línea 1: %+v", v[0])
	}
	if !v[1].Segmentos[0].Invertir || v[1].Segmentos[0].Ancho != 2 {
		t.Errorf("línea 2: %+v", v[1])
	}
	if len([]rune(v[2].Segmentos[0].Texto)) != 48 {
		t.Errorf("línea separadora de 48: %q", v[2].Segmentos[0].Texto)
	}
	if v[3].Segmentos[0].Texto != "1 x Ñoquis con salsa" || v[4].Alinear != "right" {
		t.Errorf("acentos o alineación: %+v %+v", v[3], v[4])
	}
	if !v[len(v)-1].Corte {
		t.Error("falta el corte al final")
	}
	if ImprimirRAW(nombreVistaPrevia, "prueba", b) != nil || len(ultimasVistas()) != 1 {
		t.Error("la impresora virtual no guardó el ticket")
	}
}

func TestLetraChica(t *testing.T) {
	out, err := Renderizar(json.RawMessage(`[{"t":"text","text":"1x Muzza","size":"small"},{"t":"text","text":"Total"}]`), 48, 2)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Contains(out, []byte{0x1B, 'M', 1}) || !bytes.Contains(out, []byte{0x1B, 'M', 0}) {
		t.Fatal("la letra chica tiene que activar y desactivar la fuente B")
	}
	txt, _, _ := ExtraerTexto(out)
	if !strings.Contains(txt, "1x Muzza") || !strings.Contains(txt, "Total") {
		t.Fatalf("texto mal extraído: %q", txt)
	}
}

func TestLetraAlta(t *testing.T) {
	out, err := Renderizar(json.RawMessage(`[{"t":"text","text":"Dir: Calle 123","size":"tall"}]`), 48, 2)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Contains(out, []byte{0x1D, '!', 0x01}) {
		t.Fatal("la letra alta tiene que mandar GS ! 0x01")
	}
}

func TestEsperaTokenInvalido(t *testing.T) {
	if esperaTokenInvalido(1) != 30*time.Second || esperaTokenInvalido(5) != 10*time.Minute || esperaTokenInvalido(50) != 10*time.Minute {
		t.Fatal("la espera con token inválido tiene que crecer hasta 10 minutos")
	}
	if !esTokenInvalido(errorServidor{"Token inválido o comandera desactivada"}) || esTokenInvalido(errorServidor{"otra cosa"}) {
		t.Fatal("detección de token inválido")
	}
}

func TestCapturaRepetidaYVirtual(t *testing.T) {
	d := []byte("ticket de prueba 123")
	if repetidoReciente(d) {
		t.Fatal("la primera vez no es repetido")
	}
	if !repetidoReciente(d) {
		t.Fatal("el mismo ticket enseguida tiene que ignorarse")
	}
	if !EsImpresoraVirtual("PedidosYa (CloudTicket)") || EsImpresoraVirtual("TP85K") {
		t.Fatal("detección de impresora virtual")
	}
	if ImprimirRAW("PedidosYa (CloudTicket)", "x", d) == nil {
		t.Fatal("no se tiene que poder imprimir en la impresora virtual")
	}
}
