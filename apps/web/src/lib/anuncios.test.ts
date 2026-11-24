import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ANCHO_MINIMO_LATERALES,
  configuracionAnuncios,
  exigirTitular,
  lineaAdsTxt,
  muestraAnuncios,
  titularDeEntorno,
  urlScriptAnuncios,
} from './anuncios';

const CLIENTE = 'ca-pub-1234567890123456';

describe('configuracionAnuncios', () => {
  it('sin ADSENSE_CLIENT no hay anuncios (ni vacío ni solo espacios)', () => {
    expect(configuracionAnuncios({})).toBeNull();
    expect(configuracionAnuncios({ ADSENSE_CLIENT: '' })).toBeNull();
    expect(configuracionAnuncios({ ADSENSE_CLIENT: '  ' })).toBeNull();
    // Variables de repositorio sin definir llegan como cadena vacía; los huecos sueltos no activan nada.
    expect(configuracionAnuncios({ ADSENSE_SLOT_PIE: '1234567890' })).toBeNull();
  });

  it('con solo el cliente es modo verificación: sin bloques, por tanto sin anuncios', () => {
    const verificacion = configuracionAnuncios({ ADSENSE_CLIENT: CLIENTE });
    expect(verificacion).toEqual({ cliente: CLIENTE, huecoPie: null, huecoLateral: null });
    expect(muestraAnuncios(verificacion)).toBe(false);
    expect(muestraAnuncios(null)).toBe(false);
  });

  it('con cliente y los dos huecos, activa pie y laterales', () => {
    const config = configuracionAnuncios({ ADSENSE_CLIENT: CLIENTE, ADSENSE_SLOT_PIE: '1111111111', ADSENSE_SLOT_LATERAL: '2222222222' });
    expect(config).toEqual({ cliente: CLIENTE, huecoPie: '1111111111', huecoLateral: '2222222222' });
    expect(muestraAnuncios(config)).toBe(true);
  });

  it('ADSENSE_LATERALES=false quita los laterales y entonces no hace falta su hueco', () => {
    for (const valor of ['false', 'FALSE', ' false ']) {
      expect(configuracionAnuncios({ ADSENSE_CLIENT: CLIENTE, ADSENSE_SLOT_PIE: '1111111111', ADSENSE_LATERALES: valor })).toEqual({
        cliente: CLIENTE,
        huecoPie: '1111111111',
        huecoLateral: null,
      });
    }
  });

  it('falla con un mensaje claro si la configuración está a medias o mal escrita', () => {
    expect(() => configuracionAnuncios({ ADSENSE_CLIENT: 'pub-123' })).toThrow(/ADSENSE_CLIENT/);
    expect(() => configuracionAnuncios({ ADSENSE_CLIENT: CLIENTE, ADSENSE_SLOT_LATERAL: '2222222222' })).toThrow(/ADSENSE_SLOT_PIE/);
    expect(() => configuracionAnuncios({ ADSENSE_CLIENT: CLIENTE, ADSENSE_SLOT_PIE: 'abc' })).toThrow(/ADSENSE_SLOT_PIE/);
    expect(() => configuracionAnuncios({ ADSENSE_CLIENT: CLIENTE, ADSENSE_SLOT_PIE: '1111111111' })).toThrow(/ADSENSE_SLOT_LATERAL/);
  });
});

describe('ads.txt y script', () => {
  it('declara a Google como vendedor directo con el ID de editor sin el prefijo «ca-»', () => {
    expect(lineaAdsTxt(CLIENTE)).toBe('google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0');
  });

  it('el script de AdSense lleva el cliente', () => {
    expect(urlScriptAnuncios(CLIENTE)).toBe(`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${CLIENTE}`);
  });
});

describe('exigirTitular', () => {
  it('con anuncios hay que identificar al titular: faltan nombre, domicilio o contacto', () => {
    expect(() => exigirTitular({ nombre: '', domicilio: '', contacto: '' })).toThrow(/nombre, domicilio, contacto/);
    expect(() => exigirTitular({ nombre: 'A', domicilio: ' ', contacto: 'a@b.c' })).toThrow(/domicilio/);
    expect(exigirTitular({ nombre: 'A', domicilio: 'B', contacto: 'C' })).toEqual({ nombre: 'A', domicilio: 'B', contacto: 'C' });
  });

  it('el error dice qué secretos definir, no dónde editar un fichero del repositorio', () => {
    const mensaje = (() => {
      try {
        exigirTitular({});
      } catch (e) {
        return (e as Error).message;
      }
      return '';
    })();
    expect(mensaje).toMatch(/TITULAR_NOMBRE.*TITULAR_DOMICILIO.*TITULAR_CONTACTO/);
    expect(mensaje).not.toContain('.json');
  });
});

describe('titularDeEntorno', () => {
  it('lee los datos de las variables TITULAR_*, sin espacios sobrantes', () => {
    expect(
      titularDeEntorno({ TITULAR_NOMBRE: ' Ana ', TITULAR_DOMICILIO: 'Calle 1', TITULAR_CONTACTO: 'a@b.c', TITULAR_NIF: ' 12345678Z ' }),
    ).toEqual({ nombre: 'Ana', domicilio: 'Calle 1', contacto: 'a@b.c', nif: '12345678Z' });
  });

  it('lo que falta (o llega vacío desde un secreto sin definir) queda como cadena vacía y el NIF es opcional', () => {
    expect(titularDeEntorno({})).toEqual({ nombre: '', domicilio: '', contacto: '', nif: '' });
    const sinNif = titularDeEntorno({ TITULAR_NOMBRE: 'A', TITULAR_DOMICILIO: 'B', TITULAR_CONTACTO: 'C', TITULAR_NIF: '' });
    expect(exigirTitular(sinNif)).toMatchObject({ nombre: 'A', domicilio: 'B', contacto: 'C' });
  });

  it('los datos personales no se guardan en el repositorio: no hay un titular.json', () => {
    expect(existsSync(new URL('../data/titular.json', import.meta.url))).toBe(false);
  });
});

describe('laterales', () => {
  it('el ancho mínimo del CSS coincide con el del script y deja sitio a cada lado de la columna de contenido', () => {
    const css = readFileSync(new URL('../styles/global.css', import.meta.url), 'utf8');
    expect(css).toContain(`@media (min-width: ${ANCHO_MINIMO_LATERALES}px)`);
    // Columna de 60rem (960 px) + dos laterales de 160 px + márgenes de 1,5 rem (24 px) a cada lado.
    expect(ANCHO_MINIMO_LATERALES).toBeGreaterThanOrEqual(960 + 2 * (160 + 24));
  });
});
