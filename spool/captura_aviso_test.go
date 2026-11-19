package main

import "testing"

func TestAvisoSinConfirmar(t *testing.T) {
	si := []string{
		"ATENCION\nTenes el pedido 1 de PedidosYa\nsin confirmar",
		"¡Atención! Tenés el pedido 2377199722 de PedidosYa SIN   CONFIRMAR",
	}
	no := []string{
		"PedidosYa\nNapoles - Los Polvorines\nNro. Orden:\n2377199722\n#8748\nNota: sin confirmar el timbre",
		"PedidosYa\nNro. Orden: 123\n1 x Muzzarella",
		"",
	}
	for _, x := range si {
		if !esAvisoSinConfirmar(x) {
			t.Errorf("debería ser aviso: %q", x)
		}
	}
	for _, x := range no {
		if esAvisoSinConfirmar(x) {
			t.Errorf("no debería ser aviso: %q", x)
		}
	}
}
