package main

import (
	"bytes"
	"encoding/json"
	"strings"
	"unicode/utf8"
)

// ---------------------------------------------------------------------
// Líneas del ticket (las arma la web, ver src/lib/ticket.ts)
// ---------------------------------------------------------------------
type Linea struct {
	T      string `json:"t"` // text | line | feed | cut
	Text   string `json:"text"`
	Size   string `json:"size"` // normal | large | xl
	Bold   bool   `json:"bold"`
	Align  string `json:"align"` // left | center | right
	Invert bool   `json:"invert"`
	Char   string `json:"char"`
	N      int    `json:"n"`
}

const (
	esc = 0x1B
	gs  = 0x1D
)

// Páginas de códigos (parte alta 0x80-0xFF)
var cp850 = []rune("ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜø£Ø×ƒáíóúñÑªº¿®¬½¼¡«»░▒▓│┤ÁÂÀ©╣║╗╝¢¥┐└┴┬├─┼ãÃ╚╔╩╦╠═╬¤ðÐÊËÈıÍÎÏ┘┌█▄¦Ì▀ÓßÔÒõÕµþÞÚÛÙýÝ¯´­±‗¾¶§÷¸°¨·¹³²■ ")
var cp437 = []rune("ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ ")

func tablaCodepage(n int) map[rune]byte {
	m := map[rune]byte{}
	switch n {
	case 16: // WPC1252: 0xA0-0xFF = Latin-1
		for b := 0xA0; b <= 0xFF; b++ {
			m[rune(b)] = byte(b)
		}
		m['€'] = 0x80
	case 0:
		for i, r := range cp437 {
			m[r] = byte(0x80 + i)
		}
	default: // 2 = PC850, 19 = PC858 (igual pero con €)
		for i, r := range cp850 {
			m[r] = byte(0x80 + i)
		}
		if n == 19 {
			delete(m, 'ı')
			m['€'] = 0xD5
		}
	}
	return m
}

var sinTilde = map[rune]string{
	'á': "a", 'é': "e", 'í': "i", 'ó': "o", 'ú': "u", 'Á': "A", 'É': "E", 'Í': "I", 'Ó': "O", 'Ú': "U",
	'ñ': "n", 'Ñ': "N", 'ü': "u", 'Ü': "U", '€': "EUR", '¿': "?", '¡': "!", '°': "o", '–': "-", '—': "-",
	'“': "\"", '”': "\"", '‘': "'", '’': "'", '…': "...", '·': ".", '×': "x", '−': "-",
}

func codificar(s string, tabla map[rune]byte) []byte {
	var out []byte
	for _, r := range s {
		switch {
		case r == '\n' || r == '\r':
			continue
		case r < 0x80:
			out = append(out, byte(r))
		default:
			if b, ok := tabla[r]; ok {
				out = append(out, b)
			} else if t, ok := sinTilde[r]; ok {
				out = append(out, codificar(t, tabla)...)
			} else {
				out = append(out, '?')
			}
		}
	}
	return out
}

// Renderizar convierte las líneas de la web en bytes ESC/POS
func Renderizar(contenido json.RawMessage, ancho, codepage int) ([]byte, error) {
	var lineas []Linea
	if err := json.Unmarshal(contenido, &lineas); err != nil {
		return nil, err
	}
	if ancho <= 0 {
		ancho = 48
	}
	tabla := tablaCodepage(codepage)
	var b bytes.Buffer
	b.Write([]byte{esc, '@'})                 // inicializar
	b.Write([]byte{esc, 't', byte(codepage)}) // página de códigos
	cortado := false
	for _, l := range lineas {
		switch l.T {
		case "text":
			al := byte(0)
			switch l.Align {
			case "center":
				al = 1
			case "right":
				al = 2
			}
			tam := byte(0x00)
			switch l.Size {
			case "large":
				tam = 0x11
			case "xl":
				tam = 0x22
			}
			b.Write([]byte{esc, 'a', al, gs, '!', tam})
			if l.Bold {
				b.Write([]byte{esc, 'E', 1})
			}
			if l.Invert {
				b.Write([]byte{gs, 'B', 1})
			}
			b.Write(codificar(l.Text, tabla))
			if l.Invert {
				b.Write([]byte{gs, 'B', 0})
			}
			if l.Bold {
				b.Write([]byte{esc, 'E', 0})
			}
			b.Write([]byte{gs, '!', 0, esc, 'a', 0, '\n'})
		case "line":
			c := l.Char
			if c == "" {
				c = "-"
			}
			b.Write(codificar(strings.Repeat(c, ancho)[:ancho], tabla))
			b.WriteByte('\n')
		case "feed":
			n := l.N
			if n <= 0 {
				n = 1
			}
			if n > 10 {
				n = 10
			}
			b.Write([]byte{esc, 'd', byte(n)})
		case "cut":
			b.Write([]byte{gs, 'V', 66, 0})
			cortado = true
		}
	}
	if !cortado {
		b.Write([]byte{esc, 'd', 4, gs, 'V', 66, 0})
	}
	return b.Bytes(), nil
}

// TicketPrueba: lo que imprime el botón "Imprimir prueba" del programa
func TicketPrueba(nombre, local, impresora string, codepage int) []byte {
	l := []Linea{
		{T: "text", Text: "CloudTicket", Size: "xl", Bold: true, Align: "center"},
		{T: "text", Text: " PRUEBA DE IMPRESION ", Size: "large", Bold: true, Align: "center", Invert: true},
		{T: "line"},
		{T: "text", Text: "Comandera: " + nombre},
		{T: "text", Text: "Local: " + local},
		{T: "text", Text: "Impresora: " + impresora},
		{T: "text", Text: "Programa: v" + version},
		{T: "line"},
		{T: "text", Text: "Acentos: áéíóú ÁÉÍÓÚ ñÑ ü ¿? ¡! 2°", Bold: true},
		{T: "text", Text: "Si los acentos salen mal, cambiá la", Align: "left"},
		{T: "text", Text: "página de códigos en el programa.", Align: "left"},
		{T: "feed", N: 3},
		{T: "cut"},
	}
	j, _ := json.Marshal(l)
	b, _ := Renderizar(j, 48, codepage)
	return b
}

// ---------------------------------------------------------------------
// Captura: bytes ESC/POS (o texto plano) -> texto legible
// ---------------------------------------------------------------------

// ExtraerTexto saca el texto de lo que mandó otro programa a la impresora.
// imagen = true si el ticket vino como imagen (no se puede leer el texto).
func ExtraerTexto(data []byte) (texto string, imagen bool, cortes int) {
	var crudo []byte
	bytesImagen := 0
	n := len(data)
	for i := 0; i < n; i++ {
		c := data[i]
		switch {
		case c == esc && i+1 < n:
			cmd := data[i+1]
			i++
			switch cmd {
			case '@', '2', '<', '=':
			case '!', 'E', '-', 'a', 'd', 'e', 't', 'M', 'G', 'J', 'K', '3', 'R', 'V', ' ', '{', 'r', 'c', 'U', 'S', 'L', 'T', 'F', 'q':
				i++
			case 'p':
				i += 3
			case '$', '\\':
				i += 2
			case '*': // imagen por columnas: ESC * m nL nH d1..dk
				if i+3 < n {
					m, nl, nh := data[i+1], int(data[i+2]), int(data[i+3])
					k := nl + nh*256
					if m == 32 || m == 33 {
						k *= 3
					}
					i += 3 + k
					bytesImagen += k
				}
			case 'i', 'm':
			case 'B':
				i += 2
			default:
				i++
			}
		case c == gs && i+1 < n:
			cmd := data[i+1]
			i++
			switch cmd {
			case 'V': // corte
				cortes++
				if i+1 < n && (data[i+1] == 65 || data[i+1] == 66 || data[i+1] == 97 || data[i+1] == 98 || data[i+1] == 103 || data[i+1] == 104) {
					i += 2
				} else {
					i++
				}
				crudo = append(crudo, '\n')
			case '!', 'B', 'h', 'w', 'H', 'f', 'a', 'b', 'L', 'W', 'I', 'r', 'P', 'E':
				i++
				if cmd == 'L' || cmd == 'W' || cmd == 'P' {
					i++
				}
			case 'v': // GS v 0 m xL xH yL yH datos: imagen raster
				if i+6 < n {
					x := int(data[i+3]) + int(data[i+4])*256
					y := int(data[i+5]) + int(data[i+6])*256
					i += 6 + x*y
					bytesImagen += x * y
				}
			case '(', '8': // GS ( x pL pH ... / GS 8 L p1..p4 ...
				if cmd == '8' && i+5 < n {
					k := int(data[i+2]) | int(data[i+3])<<8 | int(data[i+4])<<16 | int(data[i+5])<<24
					if data[i+1] == 'L' {
						bytesImagen += k
					}
					i += 5 + k
				} else if i+3 < n {
					k := int(data[i+2]) + int(data[i+3])*256
					if data[i+1] == 'L' {
						bytesImagen += k
					}
					i += 3 + k
				}
			case 'k': // código de barras
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
			case '*':
				if i+2 < n {
					k := int(data[i+1]) * int(data[i+2]) * 8
					i += 2 + k
					bytesImagen += k
				}
			case '/':
				i++
			default:
				i++
			}
		case c == 0x1C && i+1 < n: // FS
			cmd := data[i+1]
			i++
			switch cmd {
			case 'p':
				i += 2
			case '!', 'C', '-', 'W':
				i++
			case 'q':
				bytesImagen += n - i
				i = n
			}
		case c == 0x10 && i+1 < n: // DLE
			i += 2
		case c == '\n':
			crudo = append(crudo, '\n')
		case c == '\r':
		case c == '\t':
			crudo = append(crudo, ' ', ' ')
		case c == 0x0C: // form feed (driver de texto)
			crudo = append(crudo, '\n')
			cortes++
		case c >= 0x20:
			crudo = append(crudo, c)
		}
	}
	texto = decodificar(crudo)
	// limpiar: espacios al final de cada línea y líneas vacías repetidas
	var lineas []string
	vacias := 0
	for _, l := range strings.Split(texto, "\n") {
		l = strings.TrimRight(l, " ")
		if l == "" {
			vacias++
			if vacias > 1 {
				continue
			}
		} else {
			vacias = 0
		}
		lineas = append(lineas, l)
	}
	texto = strings.Trim(strings.Join(lineas, "\n"), "\n")
	visibles := len(strings.TrimSpace(texto))
	imagen = bytesImagen > 200 && visibles < 40
	return
}

// decodificar: UTF-8 si es válido; si no, elige entre Windows-1252 y PC850
func decodificar(b []byte) string {
	if utf8.Valid(b) {
		return string(b)
	}
	win, dos := 0, 0
	for _, c := range b {
		switch c {
		case 0xE1, 0xED, 0xF3, 0xFA, 0xF1, 0xD1, 0xC1, 0xC9, 0xCD, 0xD3, 0xDA, 0xBF, 0xA1:
			win++
		case 0xA0, 0x82, 0xA2, 0xA3, 0xA4, 0xA5, 0xB5, 0x90, 0xD6, 0xE0, 0xA8, 0xAD:
			dos++
		}
	}
	var sb strings.Builder
	for _, c := range b {
		switch {
		case c < 0x80:
			sb.WriteByte(c)
		case win > dos:
			if c >= 0xA0 {
				sb.WriteRune(rune(c))
			} else if c == 0x80 {
				sb.WriteRune('€')
			} else {
				sb.WriteByte('?')
			}
		default:
			sb.WriteRune(cp850[c-0x80])
		}
	}
	return sb.String()
}
