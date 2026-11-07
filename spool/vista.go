package main

import (
	"strings"
	"sync"
	"time"
	"unicode/utf8"
)

// Impresora virtual: en vez de imprimir, guarda el ticket para verlo en el panel.
const nombreVistaPrevia = "★ Vista previa en pantalla (sin imprimir)"

type SegmentoVista struct {
	Texto    string `json:"t"`
	Negrita  bool   `json:"b,omitempty"`
	Invertir bool   `json:"i,omitempty"`
	Ancho    int    `json:"w,omitempty"` // multiplicador horizontal (1 = normal)
	Alto     int    `json:"h,omitempty"` // multiplicador vertical
}

type LineaVista struct {
	Alinear   string          `json:"a,omitempty"` // left | center | right
	Segmentos []SegmentoVista `json:"s,omitempty"`
	Corte     bool            `json:"corte,omitempty"`
}

type TicketVista struct {
	Hora      string       `json:"hora"`
	Documento string       `json:"documento"`
	Impresora string       `json:"impresora"`
	Error     string       `json:"error,omitempty"`
	Bytes     int          `json:"bytes"`
	Lineas    []LineaVista `json:"lineas"`
	Imagen    bool         `json:"imagen,omitempty"`
}

var (
	vistaMu sync.Mutex
	vistas  []TicketVista
)

func guardarVista(impresora, documento string, datos []byte, errImpresion error) {
	lineas, img := RenderizarVista(datos)
	t := TicketVista{Hora: time.Now().Format("15:04:05"), Documento: documento, Impresora: impresora, Bytes: len(datos), Lineas: lineas, Imagen: img}
	if errImpresion != nil {
		t.Error = errImpresion.Error()
	}
	vistaMu.Lock()
	vistas = append([]TicketVista{t}, vistas...)
	if len(vistas) > 30 {
		vistas = vistas[:30]
	}
	vistaMu.Unlock()
}

func ultimasVistas() []TicketVista {
	vistaMu.Lock()
	defer vistaMu.Unlock()
	return append([]TicketVista(nil), vistas...)
}

func limpiarVistas() { vistaMu.Lock(); vistas = nil; vistaMu.Unlock() }

// ListarImpresoras: las de Windows + la impresora virtual
func ListarImpresoras() ([]string, string, error) {
	l, pred, err := listarImpresorasSO()
	return append([]string{nombreVistaPrevia}, l...), pred, err
}

// EsImpresoraDeArchivos: impresoras de Windows que generan archivos (PDF, XPS…).
// No entienden ESC/POS: si se les manda, sale un archivo roto.
func EsImpresoraDeArchivos(nombre string) bool {
	n := strings.ToLower(nombre)
	for _, p := range []string{"pdf", "xps", "onenote", "fax", "send to", "enviar a", "document writer"} {
		if strings.Contains(n, p) {
			return true
		}
	}
	return false
}

// ImprimirRAW: a la impresora de Windows (o solo a la pantalla si es la vista previa o
// una impresora de archivos). Siempre queda una copia para ver en el panel.
// La impresora virtual manda todo al puerto de captura: imprimir ahí arma un círculo
// (el ticket vuelve a entrar como pedido, se reenvía, vuelve a entrar...)
const nombreImpresoraVirtual = "PedidosYa (CloudTicket)"

func EsImpresoraVirtual(nombre string) bool {
	return strings.Contains(strings.ToLower(nombre), "(cloudticket)")
}

var errImpresoraVirtual = errorServidor{"Esa es la impresora virtual para GoWin (PedidosYa). Elegí la impresora real (por ejemplo la TP85K)."}

func ImprimirRAW(impresora, documento string, datos []byte) error {
	if EsImpresoraVirtual(impresora) {
		return errImpresoraVirtual
	}
	if impresora == nombreVistaPrevia || EsImpresoraDeArchivos(impresora) {
		guardarVista(impresora, documento, datos, nil)
		return nil
	}
	err := imprimirRAWSO(impresora, documento, datos)
	guardarVista(impresora, documento, datos, err)
	return err
}

// RenderizarVista interpreta ESC/POS como lo haría una comandera de 80 mm
func RenderizarVista(data []byte) ([]LineaVista, bool) {
	var lineas []LineaVista
	alinear, negrita, invertir, ancho, alto, codepage := "left", false, false, 1, 1, 2
	var actual LineaVista
	var texto []byte
	empezada := false
	cortar := func() {
		if len(texto) > 0 {
			actual.Segmentos = append(actual.Segmentos, SegmentoVista{Texto: decodificarCP(texto, codepage), Negrita: negrita, Invertir: invertir, Ancho: ancho, Alto: alto})
			texto = texto[:0]
		}
	}
	nueva := func() {
		cortar()
		if !empezada {
			actual.Alinear = alinear
		}
		lineas = append(lineas, actual)
		actual = LineaVista{}
		empezada = false
	}
	marcar := func() {
		if !empezada {
			actual.Alinear = alinear
			empezada = true
		}
	}
	bytesImagen := 0
	n := len(data)
	for i := 0; i < n; i++ {
		c := data[i]
		switch {
		case c == esc && i+1 < n:
			cmd := data[i+1]
			i++
			arg := func() byte {
				if i+1 < n {
					i++
					return data[i]
				}
				return 0
			}
			switch cmd {
			case '@':
				cortar()
				alinear, negrita, invertir, ancho, alto = "left", false, false, 1, 1
			case 'a':
				v := arg()
				cortar()
				switch v % 48 {
				case 1:
					alinear = "center"
				case 2:
					alinear = "right"
				default:
					alinear = "left"
				}
				if !empezada {
					actual.Alinear = alinear
				}
			case 'E', 'G':
				v := arg()
				cortar()
				negrita = v&1 == 1
			case '!':
				v := arg()
				cortar()
				negrita = v&0x08 != 0
				ancho, alto = 1, 1
				if v&0x20 != 0 {
					ancho = 2
				}
				if v&0x10 != 0 {
					alto = 2
				}
			case 't':
				codepage = int(arg())
			case 'd':
				k := int(arg())
				if empezada || len(texto) > 0 {
					nueva()
				}
				for j := 0; j < k && j < 10; j++ {
					lineas = append(lineas, LineaVista{})
				}
			case 'J':
				arg()
			case 'p':
				i += 3
			case '$', '\\':
				i += 2
			case '*':
				if i+3 < n {
					m, k := data[i+1], int(data[i+2])+int(data[i+3])*256
					if m == 32 || m == 33 {
						k *= 3
					}
					i += 3 + k
					bytesImagen += k
				}
			case '2', '<', '=', 'i', 'm':
			default:
				arg()
			}
		case c == gs && i+1 < n:
			cmd := data[i+1]
			i++
			switch cmd {
			case '!':
				if i+1 < n {
					i++
					v := data[i]
					cortar()
					ancho, alto = int(v>>4)+1, int(v&0x0F)+1
				}
			case 'B':
				if i+1 < n {
					i++
					cortar()
					invertir = data[i]&1 == 1
				}
			case 'V':
				if empezada || len(texto) > 0 {
					nueva()
				}
				lineas = append(lineas, LineaVista{Corte: true})
				if i+1 < n && (data[i+1] == 65 || data[i+1] == 66 || data[i+1] == 97 || data[i+1] == 98) {
					i += 2
				} else {
					i++
				}
			case 'v':
				if i+6 < n {
					x := int(data[i+3]) + int(data[i+4])*256
					y := int(data[i+5]) + int(data[i+6])*256
					i += 6 + x*y
					bytesImagen += x * y
				}
			case '(':
				if i+3 < n {
					k := int(data[i+2]) + int(data[i+3])*256
					if data[i+1] == 'L' {
						bytesImagen += k
					}
					i += 3 + k
				}
			case 'k':
				if i+1 < n {
					m := data[i+1]
					if m <= 6 {
						i++
						for i+1 < n && data[i+1] != 0 {
							i++
						}
						i++
					} else if i+2 < n {
						i += 2 + int(data[i+2])
					}
				}
			default:
				i++
			}
		case c == 0x1C && i+1 < n: // FS: igual que ExtraerTexto (FS . y FS & no llevan parámetro)
			cmd := data[i+1]
			i++
			switch cmd {
			case 'p':
				i += 2
			case '!', 'C', '-', 'W':
				i++
			}
		case c == 0x10 && i+1 < n:
			i += 2
		case c == '\n':
			nueva()
		case c == 0x0C:
			nueva()
			lineas = append(lineas, LineaVista{Corte: true})
		case c == '\r':
		case c == '\t':
			marcar()
			texto = append(texto, ' ', ' ')
		case c >= 0x20:
			marcar()
			texto = append(texto, c)
		}
	}
	if empezada || len(texto) > 0 {
		nueva()
	}
	// sin líneas vacías de más al final
	for len(lineas) > 0 && !lineas[len(lineas)-1].Corte && len(lineas[len(lineas)-1].Segmentos) == 0 {
		lineas = lineas[:len(lineas)-1]
	}
	visibles := 0
	for _, l := range lineas {
		for _, s := range l.Segmentos {
			visibles += len(strings.TrimSpace(s.Texto))
		}
	}
	return lineas, bytesImagen > 200 && visibles < 40
}

func decodificarCP(b []byte, codepage int) string {
	if utf8.Valid(b) {
		return string(b)
	}
	var sb strings.Builder
	for _, c := range b {
		switch {
		case c < 0x80:
			sb.WriteByte(c)
		case codepage == 16:
			if c >= 0xA0 {
				sb.WriteRune(rune(c))
			} else if c == 0x80 {
				sb.WriteRune('€')
			} else {
				sb.WriteByte('?')
			}
		case codepage == 0:
			sb.WriteRune(cp437[c-0x80])
		case codepage == 19 && c == 0xD5:
			sb.WriteRune('€')
		default:
			sb.WriteRune(cp850[c-0x80])
		}
	}
	return sb.String()
}
