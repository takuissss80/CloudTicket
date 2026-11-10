/** Estado de la suscripción de un local según su fecha de vencimiento (YYYY-MM-DD) */
export type TonoVence = 'vencido' | 'pronto' | 'ok' | 'sin'
/** Días antes del vencimiento en que se empieza a avisar */
export const DIAS_AVISO = 7

const hoy = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()) }
const dia = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }
export const fechaCorta = (s: string) => { const [y, m, d] = s.split('-'); return `${d}/${m}/${y}` }

export function estadoVence(vence?: string): { tono: TonoVence; dias: number; texto: string } {
  if (!vence) return { tono: 'sin', dias: Infinity, texto: 'Sin fecha' }
  const dias = Math.round((dia(vence).getTime() - hoy().getTime()) / 86_400_000)
  const f = fechaCorta(vence)
  if (dias < 0) return { tono: 'vencido', dias, texto: `Venció el ${f}` }
  if (dias === 0) return { tono: 'pronto', dias, texto: `Vence hoy (${f})` }
  if (dias <= DIAS_AVISO) return { tono: 'pronto', dias, texto: `Vence en ${dias} día${dias === 1 ? '' : 's'} (${f})` }
  return { tono: 'ok', dias, texto: `Vence el ${f}` }
}

export const CLASE_VENCE: Record<TonoVence, string> = {
  vencido: 'bg-tomate-claro text-tomate ring-tomate',
  pronto: 'bg-muzza-claro text-tinta ring-muzza',
  ok: 'bg-superficie text-gris ring-linea',
  sin: 'bg-superficie text-gris ring-linea',
}
