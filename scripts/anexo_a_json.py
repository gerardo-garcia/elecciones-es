import sys, json, unicodedata, xml.etree.ElementTree as ET

xml_path, out_path = sys.argv[1], sys.argv[2]

UNI = {'uno':1,'dos':2,'tres':3,'cuatro':4,'cinco':5,'seis':6,'siete':7,'ocho':8,'nueve':9,'diez':10,
       'once':11,'doce':12,'trece':13,'catorce':14,'quince':15,'dieciseis':16,'diecisiete':17,'dieciocho':18,
       'diecinueve':19,'veinte':20,'veintiuno':21,'veintidos':22,'veintitres':23,'veinticuatro':24,
       'veinticinco':25,'veintiseis':26,'veintisiete':27,'veintiocho':28,'veintinueve':29}
DEC = {'treinta':30,'cuarenta':40}

def norm(s):
    s = unicodedata.normalize('NFD', s.lower())
    return ''.join(c for c in s if unicodedata.category(c) != 'Mn').strip(' .')

def num(palabras):
    p = norm(palabras)
    if p in UNI: return UNI[p]
    partes = p.split(' y ')
    if len(partes) == 2 and partes[0] in DEC and partes[1] in UNI:
        return DEC[partes[0]] + UNI[partes[1]]
    if p in DEC: return DEC[p]
    raise ValueError(f'No sé convertir: {palabras!r}')

# Códigos INE de provincia, por nombre tal y como aparece en el anexo del BOE.
INE = {
 'Araba/Álava':'01','Albacete':'02','Alicante/Alacant':'03','Almería':'04','Ávila':'05','Badajoz':'06',
 'Balears (Illes)':'07','Barcelona':'08','Burgos':'09','Cáceres':'10','Cádiz':'11','Castellón/Castelló':'12',
 'Ciudad Real':'13','Córdoba':'14','Coruña (A)':'15','Cuenca':'16','Girona':'17','Granada':'18',
 'Guadalajara':'19','Gipuzkoa':'20','Huelva':'21','Huesca':'22','Jaén':'23','León':'24','Lleida':'25',
 'Rioja (La)':'26','Lugo':'27','Madrid':'28','Málaga':'29','Murcia':'30','Navarra':'31','Ourense':'32',
 'Asturias':'33','Palencia':'34','Palmas (Las)':'35','Pontevedra':'36','Salamanca':'37',
 'Santa Cruz de Tenerife':'38','Cantabria':'39','Segovia':'40','Sevilla':'41','Soria':'42','Tarragona':'43',
 'Teruel':'44','Toledo':'45','Valencia/València':'46','Valladolid':'47','Bizkaia':'48','Zamora':'49',
 'Zaragoza':'50','Ceuta':'51','Melilla':'52',
}

root = ET.parse(xml_path).getroot()
filas = []
for tr in root.find('texto').iter('tr'):
    celdas = [''.join(td.itertext()).strip() for td in tr.findall('td')]
    if len(celdas) == 2:
        filas.append(celdas)

res = []
for nombre, diputados in filas:
    nombre = nombre.strip().rstrip('.')
    if nombre not in INE:
        raise SystemExit(f'Circunscripción desconocida en el anexo: {nombre!r}')
    res.append({'codigo': INE[nombre], 'nombre': nombre, 'escanos': num(diputados)})

res.sort(key=lambda r: r['codigo'])
for r in res:
    r['tipo'] = 'mayoritaria' if r['codigo'] in ('51','52') else 'proporcional'

total = sum(r['escanos'] for r in res)
assert len(res) == 52, f'Se esperaban 52 circunscripciones y hay {len(res)}'
assert len({r['codigo'] for r in res}) == 52
assert total == 350, f'Se esperaban 350 escaños y suman {total}'

with open(out_path, 'w', encoding='utf-8') as f:
    json.dump({
        '_fuente': 'Anexo del Real Decreto 806/2026, de 5 de octubre (BOE-A-2026-20742)',
        'circunscripciones': res,
    }, f, ensure_ascii=False, indent=2)
    f.write('\n')
print(f'OK: {len(res)} circunscripciones, {total} escaños')
for r in res: print(r['codigo'], r['nombre'], r['escanos'], r['tipo'])
