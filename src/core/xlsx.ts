// Excel (.xlsx) mínimo: varias hojas con texto, números y fechas. Sin estilos salvo el formato de fecha y de importe.

import { escribirZip } from './zipEscritura'

/** Celda: texto, número, fecha ({ fecha: 'AAAA-MM-DD' }) o importe en euros con 2 decimales ({ importe }). null = vacía. */
export type Celda = string | number | { fecha: string } | { importe: number } | null

export interface Hoja { nombre: string; filas: Celda[][] }

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  // Caracteres de control no válidos en XML.
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')

function columna(n: number): string {
  let s = ''
  for (n++; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s
  return s
}

/** Número de serie de Excel para una fecha (días desde 1899-12-30). */
export function serieExcel(fecha: string): number {
  return Math.round((Date.parse(fecha + 'T00:00:00Z') - Date.UTC(1899, 11, 30)) / 86_400_000)
}

function hojaXml(h: Hoja): string {
  const filas = h.filas.map((f, i) => {
    const celdas = f.map((c, j) => {
      if (c === null || c === '') return ''
      const ref = `${columna(j)}${i + 1}`
      if (typeof c === 'number') return `<c r="${ref}"><v>${c}</v></c>`
      if (typeof c === 'object' && 'fecha' in c) return `<c r="${ref}" s="1"><v>${serieExcel(c.fecha)}</v></c>`
      if (typeof c === 'object') return `<c r="${ref}" s="2"><v>${c.importe}</v></c>`
      return `<c r="${ref}" t="inlineStr"${i === 0 ? ' s="3"' : ''}><is><t xml:space="preserve">${esc(c)}</t></is></c>`
    }).join('')
    return `<row r="${i + 1}">${celdas}</row>`
  }).join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetData>${filas}</sheetData></worksheet>`
}

export function escribirXlsx(hojas: Hoja[]): Uint8Array {
  const enc = new TextEncoder()
  const x = (ruta: string, texto: string) => ({ ruta, datos: enc.encode(texto) })
  const cab = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
  return escribirZip([
    x('[Content_Types].xml', `${cab}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${hojas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`),
    x('_rels/.rels', `${cab}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    x('xl/workbook.xml', `${cab}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${hojas.map((h, i) => `<sheet name="${esc(h.nombre.slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`),
    x('xl/_rels/workbook.xml.rels', `${cab}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${hojas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${hojas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    x('xl/styles.xml', `${cab}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="4"><xf/><xf numFmtId="164" applyNumberFormat="1"/><xf numFmtId="4" applyNumberFormat="1"/><xf fontId="1" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`),
    ...hojas.map((h, i) => x(`xl/worksheets/sheet${i + 1}.xml`, hojaXml(h)))
  ])
}
