import { ANUNCIOS, lineaAdsTxt } from '../lib/anuncios';

/** Declara a Google como vendedor autorizado de los anuncios de este sitio (vacío si no hay anuncios). */
export function GET() {
  const config = ANUNCIOS();
  const texto = config ? `${lineaAdsTxt(config.cliente)}\n` : '# Este sitio no muestra anuncios.\n';
  return new Response(texto, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
