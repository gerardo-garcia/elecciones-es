import { defineConfig } from 'astro/config';

// En GitHub Actions deducimos sitio y base de la propia repo (https://<owner>.github.io/<repo>/).
// Al asociar un dominio propio basta con definir SITE_URL=https://midominio.es y BASE_PATH=/.
const propietario = process.env.GITHUB_REPOSITORY_OWNER;
const repo = process.env.GITHUB_REPOSITORY?.split('/')[1];

export default defineConfig({
  // `||` y no `??`: en Actions una variable de repositorio sin definir llega como cadena vacía.
  site: process.env.SITE_URL || (propietario ? `https://${propietario}.github.io` : 'http://localhost:4321'),
  base: process.env.BASE_PATH || (repo ? `/${repo}` : '/'),
  trailingSlash: 'always',
  build: { format: 'directory' },
});
