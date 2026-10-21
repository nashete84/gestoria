"""Convierte los diseños de registro oficiales de la AEAT (Excel) en JSON para la app.

Uso: python3 scripts/extraer-disenos.py <carpeta con los Excel> src/core/modelos/disenos
Cada página queda como una lista de campos {n, pos, lon, tipo, casilla, constante, desc}.
"""
import json, re, sys
from pathlib import Path
import pandas as pd

ORIGEN, DESTINO = Path(sys.argv[1]), Path(sys.argv[2])
FICHEROS = {
    '303': ('DR303e26v101.xlsx', {'DP30300': 'cabecera', 'DP30301': '01', 'DP30303': '03', 'DP303DID': 'DID'}),
    '130': ('DR130e15v12.xls', {'DR 13000': 'cabecera', 'DR 13001': '01'}),
    '111': ('dr111e16v18.xls', {'M11100': 'cabecera', 'dr M11101': '01'}),
    '115': ('DR115e15v13.xls', {'DR 11500': 'cabecera', 'DR 11501': '01'}),
    '390': ('dr390e2025.xlsx', {'Pág. 0': 'cabecera', 'Pág. 1': '01', 'Pág. 2': '02', 'Pág. 2 bis': '02B', 'Pág. 3': '03',
                                'Pág. 4': '04', 'Pág. 5': '05', 'Pág. 6': '06', 'Pág. 8': '08'}),
}
TIPOS = {'An', 'A', 'Num', 'N'}

def campos(df):
    salida = []
    for _, fila in df.iterrows():
        v = [str(x).strip() for x in fila if str(x) != 'nan']
        if len(v) < 5 or not v[0].isdigit() or not v[1].isdigit():
            continue
        n, pos, lon = int(v[0]), int(v[1]), v[2]
        tipo = v[3]
        if tipo not in TIPOS:
            continue
        if len(v) > 5 and len(v[4]) <= 2:
            v = v[:4] + v[5:]  # columna de validación (p. ej. "C") en algunas hojas del 390
        resto = ' | '.join(v[4:])
        texto = resto.split(' | ')[0]
        casillas = re.findall(r'\[\s*(\d+)\s*\]', texto)
        # La casilla va al final ("Cuota [27]") o, en los diseños antiguos, delante del texto ("... - [03] Rendimiento neto ([01] - [02])").
        delante = re.search(r'(?:^|- )\[\s*(\d+)\s*\]\s*[A-Za-zÁÉÍÓÚáéíóú]', texto)
        # Solo los valores marcados como "Constante" en el diseño (no los ejemplos de validación).
        constante = re.search(r'Constante\s*"([^"]*)"', resto)
        salida.append({
            'n': n, 'pos': pos, 'lon': int(lon) if lon.isdigit() else None, 'tipo': tipo,
            'casilla': delante.group(1) if delante else (casillas[-1] if casillas else None),
            'constante': constante.group(1) if constante else None,
            'desc': re.sub(r'\s+', ' ', v[4])[:160],
        })
    return salida

# Casillas que el diseño no numera (111) o que el texto no deja leer bien (130: "[04] 20 por 100 de [03]";
# 115: el campo 16 "[03] - [04]" es la casilla 05). En los tres, el campo n es la casilla n - 11.
CORRECCIONES = {
    '130': {('01', n): f'{n - 11:02d}' for n in range(12, 31)},
    '111': {('01', n): f'{n - 11:02d}' for n in range(12, 42)},
    '115': {('01', 16): '05'},
}

for modelo, (fichero, hojas) in FICHEROS.items():
    libro = pd.read_excel(ORIGEN / fichero, sheet_name=None, header=None, dtype=str)
    paginas = {}
    for hoja, nombre in hojas.items():
        paginas[nombre] = campos(libro[hoja])
        for c in paginas[nombre]:
            c['casilla'] = CORRECCIONES.get(modelo, {}).get((nombre, c['n']), c['casilla'])
    (DESTINO / f'{modelo}.json').write_text(json.dumps({'modelo': modelo, 'fuente': fichero, 'paginas': paginas}, ensure_ascii=False, indent=1))
    print(modelo, {k: len(v) for k, v in paginas.items()})
