/** تاريخ محلي بصيغة YYYY-MM-DD (مناسب لحقول DATE في Postgres و input type="date") */
export function dateToLocalISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function parseLocalISODate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** اليوم الحالي إن وقع داخل [start,end]، وإلا بداية الفترة */
export function defaultDateInPeriod(start: Date, end: Date): string {
  const today = new Date()
  today.setHours(12, 0, 0, 0)
  const s = new Date(start.getFullYear(), start.getMonth(), start.getDate())
  const e = new Date(end.getFullYear(), end.getMonth(), end.getDate())
  if (today >= s && today <= e) return dateToLocalISODate(today)
  return dateToLocalISODate(start)
}
