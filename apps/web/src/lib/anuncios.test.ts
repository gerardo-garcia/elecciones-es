import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ANCHO_MINIMO_LATERALES,
  configuracionAnuncios,
  exigirTitular,
  lineaAdsTxt,
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

  it('con cliente y los dos huecos, activa pie y laterales', () => {
    expect(configuracionAnuncios({ ADSENSE_CLIENT: CLIENTE, ADSENSE_SLOT_PIE: '1111111111', ADSENSE_SLOT_LATERAL: '2222222222' })).toEqual({
      cliente: CLIENTE,
      huecoPie: '1111111111',
      huecoLateral: '2222222222',
    });
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
    expect(() => configuracionAnuncios({ ADSENSE_CLIENT: CLIENTE })).toThrow(/ADSENSE_SLOT_PIE/);
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
});

describe('laterales', () => {
  it('el ancho mínimo del CSS coincide con el del script y deja sitio a cada lado de la columna de contenido', () => {
    const css = readFileSync(new URL('../styles/global.css', import.meta.url), 'utf8');
    expect(css).toContain(`@media (min-width: ${ANCHO_MINIMO_LATERALES}px)`);
    // Columna de 60rem (960 px) + dos laterales de 160 px + márgenes de 1,5 rem (24 px) a cada lado.
    expect(ANCHO_MINIMO_LATERALES).toBeGreaterThanOrEqual(960 + 2 * (160 + 24));
  });
});
