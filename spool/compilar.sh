#!/bin/sh
# Compila el programa de Windows y lo deja en la web para descargar.
# Requiere Go 1.22+. No usa librerías externas.
set -e
cd "$(dirname "$0")"
go test ./...
GOOS=windows GOARCH=amd64 go build -trimpath -ldflags "-H=windowsgui -s -w" -o ../public/descargas/CloudTicketImpresion.exe .
echo "Listo: public/descargas/CloudTicketImpresion.exe"
