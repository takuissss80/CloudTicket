// Uso: node poner-icono.mjs <exe> <ico> <version>
import fs from 'node:fs'
import * as PE from 'pe-library'
import * as ResEdit from 'resedit'

const [exe, ico, version = '1.0.0'] = process.argv.slice(2)
const ejecutable = PE.NtExecutable.from(fs.readFileSync(exe))
const recursos = PE.NtExecutableResource.from(ejecutable)

const icono = ResEdit.Data.IconFile.from(fs.readFileSync(ico))
ResEdit.Resource.IconGroupEntry.replaceIconsForResource(recursos.entries, 1, 1033, icono.icons.map(i => i.data))

const v = ResEdit.Resource.VersionInfo.createEmpty()
v.lang = 1033
const [a, b, c] = version.split('.').map(Number)
v.setFileVersion(a, b, c, 0, 1033)
v.setProductVersion(a, b, c, 0, 1033)
v.setStringValues({ lang: 1033, codepage: 1200 }, {
  ProductName: 'CloudTicket Impresión',
  FileDescription: 'CloudTicket Impresión',
  CompanyName: 'CloudTicket',
  LegalCopyright: 'CloudTicket',
  OriginalFilename: 'CloudTicketImpresion.exe',
  FileVersion: version,
  ProductVersion: version,
})
v.outputToResourceEntries(recursos.entries)

recursos.outputResource(ejecutable)
fs.writeFileSync(exe, Buffer.from(ejecutable.generate()))
console.log('Ícono y versión', version, 'en', exe)
