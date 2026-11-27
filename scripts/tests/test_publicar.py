"""Pruebas del publicador contra un remoto local (un repositorio vacío), sin red."""
import importlib.util
import json
import subprocess
import tempfile
import unittest
from pathlib import Path

RUTA = Path(__file__).resolve().parents[1] / 'infoelectoral' / 'publicar.py'
spec = importlib.util.spec_from_file_location('publicar', RUTA)
pub = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pub)


def git(cwd, *a):
    return subprocess.run(['git', *a], cwd=cwd, capture_output=True, text=True, check=True).stdout.strip()


def escrutinio(t='2026-11-29T20:30:00Z'):
    return {'version': 1, 'completa': True, 'capturadoEn': t, 'convocatoria': {'tipo': 2, 'id': '202611'}, 'circunscripciones': [{'codigo': f'{i:02d}'} for i in range(1, 53)]}


class PublicarTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        base = Path(self.tmp.name)
        self.remoto = base / 'remoto.git'
        git(base, 'init', '-q', '--bare', str(self.remoto))
        # El remoto ya tiene una «main»: debe quedar intacta.
        sem = base / 'semilla'
        sem.mkdir()
        git(sem, 'init', '-q', '-b', 'main')
        git(sem, 'config', 'user.name', 'x'); git(sem, 'config', 'user.email', 'x@x')
        (sem / 'a.txt').write_text('hola')
        git(sem, 'add', '.'); git(sem, 'commit', '-q', '-m', 'inicial')
        git(sem, 'push', '-q', str(self.remoto), 'main')
        self.main0 = git(self.remoto, 'rev-parse', 'main')
        self.datos = base / 'datos'
        self.datos.mkdir()
        self.clon = self.datos / 'publicacion'

    def tearDown(self):
        self.tmp.cleanup()

    def escribir(self, e, serie='{"t":1}\n'):
        (self.datos / 'escrutinio.json').write_text(json.dumps(e))
        (self.datos / 'serie.jsonl').write_text(serie)

    def publicar(self):
        return pub.publicar(self.datos, self.clon, str(self.remoto))

    def test_publica_en_datos_vivo_y_no_toca_main(self):
        self.escribir(escrutinio())
        self.assertTrue(self.publicar())
        self.assertEqual(git(self.remoto, 'rev-parse', 'main'), self.main0)
        self.assertEqual(sorted(git(self.remoto, 'ls-tree', '--name-only', 'datos-vivo').split()), ['escrutinio.json', 'serie.jsonl'])

    def test_sin_cambios_no_publica_otra_vez(self):
        self.escribir(escrutinio())
        self.assertTrue(self.publicar())
        h = git(self.remoto, 'rev-parse', 'datos-vivo')
        self.assertFalse(self.publicar())
        self.assertEqual(git(self.remoto, 'rev-parse', 'datos-vivo'), h)

    def test_un_unico_commit_que_se_reescribe(self):
        self.escribir(escrutinio('2026-11-29T20:30:00Z'))
        self.publicar()
        self.escribir(escrutinio('2026-11-29T20:35:00Z'), '{"t":1}\n{"t":2}\n')
        self.assertTrue(self.publicar())
        self.assertEqual(git(self.remoto, 'rev-list', '--count', 'datos-vivo'), '1')
        self.assertIn('20:35:00', git(self.remoto, 'log', '-1', '--format=%s', 'datos-vivo'))
        self.assertEqual(git(self.remoto, 'show', 'datos-vivo:serie.jsonl').count('\n'), 1)  # 2 líneas, sin salto final
        self.assertEqual(git(self.remoto, 'rev-parse', 'main'), self.main0)

    def test_no_publica_un_escrutinio_incompleto_ni_ilegible(self):
        e = escrutinio(); e['circunscripciones'] = e['circunscripciones'][:10]
        self.escribir(e)
        with self.assertRaises(pub.ErrorPublicacion):
            self.publicar()
        (self.datos / 'escrutinio.json').write_text('{roto')
        with self.assertRaises(pub.ErrorPublicacion):
            self.publicar()
        self.assertNotEqual(git(self.remoto, 'branch', '--list', 'datos-vivo'), 'datos-vivo')

    def test_no_publica_otra_convocatoria_salvo_en_ensayo(self):
        e = escrutinio(); e['convocatoria'] = {'tipo': 2, 'id': '202307'}
        self.escribir(e)
        with self.assertRaisesRegex(pub.ErrorPublicacion, '2026'):
            self.publicar()
        self.assertTrue(pub.publicar(self.datos, self.clon, str(self.remoto), ensayo=True))

    def test_no_publica_si_la_serie_tiene_una_linea_rota(self):
        self.escribir(escrutinio(), '{"t":1}\nnada\n')
        with self.assertRaises(pub.ErrorPublicacion):
            self.publicar()

    def test_el_unico_empuje_del_codigo_va_a_la_rama_de_datos(self):
        empujes = [l for l in RUTA.read_text().splitlines() if "'push'" in l]
        self.assertEqual(len(empujes), 1)
        self.assertIn('refs/heads/{RAMA}', empujes[0])
        self.assertEqual(pub.RAMA, 'datos-vivo')


if __name__ == '__main__':
    unittest.main()
