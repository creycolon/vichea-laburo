# XScraper+

Edición personal del radar de oportunidades. **No es la app de producto** (esa es `apps/web`) ni
el panel de analista (`apps/radar`). Es una copia congelada de la instancia que corre en
`http://127.0.0.1:8642/`, guardada acá para no perderla.

## Qué muestra

Un radar de **señales de oportunidad** (posts de X/Twitter y otras redes), no de ofertas de
empleo: autor, red, métricas (me gusta, vistas), puntuación, afinidad y calificación. Se filtra
por ventana temporal, idioma, red, tipo de negocio y umbrales de señal, y trae un perfil de
habilidades que **vive sólo en el navegador** (`localStorage`).

Dos páginas:

| Archivo | Qué es |
|---|---|
| `index.html` | Radar de oportunidades (señales) |
| `empleo.html` | Vista de empleo, con su propio dataset |

## Correr

Necesita un servidor estático (los `datos.js` se cargan por `<script src>`):

```bash
cd apps/xscraper-plus
python3 -m http.server 8642 --bind 127.0.0.1
# http://127.0.0.1:8642/
```

## Origen de los datos

`datos.js` y `empleo_datos.js` son **generados** por un pipeline propio (`web/construir.py`,
según el encabezado de los archivos) que no forma parte de este repo. Por eso:

- esta carpeta es una **foto** del estado al 2026-10-29, no un build reproducible;
- para actualizarla hay que reemplazar los `*_datos.js` por los nuevos que produzca ese pipeline;
- el corpus embebido pesa ~1,4 MB y no tiene relación con el `xscraper/` de este repo (que scrapea
  portales de empleo, no redes sociales).

## Marca

Se renombró el título y el encabezado a **XScraper+** para distinguirla de un vistazo de las otras
dos aplicaciones. El resto es el código original, sin tocar.
