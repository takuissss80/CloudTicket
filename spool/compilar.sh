#!/bin/sh
# Compila el programa de Windows y lo deja en la web para descargar.
# Requiere Go 1.22+ (sin librerías externas) y Node (solo para ponerle el ícono al .exe).
set -e
cd "$(dirname "$0")"
VERSION=$(sed -n 's/^\tversion *= "\(.*\)"/\1/p' main.go)
go test ./...
SALIDA=../public/descargas/CloudTicketImpresion.exe
GOOS=windows GOARCH=amd64 go build -trimpath -ldflags "-H=windowsgui -s -w" -o "$SALIDA" .
( cd icono && [ -d node_modules ] || npm install --silent )
node icono/poner-icono.mjs "$SALIDA" icono/cloudticket.ico "$VERSION"
echo "Listo: public/descargas/CloudTicketImpresion.exe (v$VERSION)"
