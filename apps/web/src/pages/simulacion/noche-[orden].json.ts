import type { APIRoute, GetStaticPaths } from 'astro';
import { nocheSimulada, ORDENES } from '../../lib/simulacion';
import type { OrdenEscrutinio } from '@elecciones/engine';

export const getStaticPaths = (() => ORDENES.map((orden) => ({ params: { orden } }))) satisfies GetStaticPaths;

export const GET: APIRoute = ({ params }) => {
  const noche = nocheSimulada(params.orden as OrdenEscrutinio);
  return new Response(JSON.stringify(noche), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
};
