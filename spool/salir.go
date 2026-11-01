package main

import "os"

// salir: saca el ícono de la bandeja y cierra
func salir() {
	quitarBandeja()
	os.Exit(0)
}
