# Prospección de DMs en X

Herramienta local para descubrir cuentas de RRHH por rubro y contactar reclutadores sin parecer
envío masivo. **No scrapea X directamente**: el descubrimiento corre por Apify (un tercero), y el
script se ocupa de lo repetitivo. El envío de DMs sigue siendo manual y con cupo diario.

## Descubrimiento automático (Apify)

X no tiene búsqueda pública de personas y Nitter quedó dado de baja por reclamos legales. La vía
que funciona es **Apify**, que ya usás para Computrabajo. Hay dos actors, y hacen cosas distintas:

| Vía | Actor | Qué encuentra | Datos que trae |
|---|---|---|---|
| **Perfil** (`--via perfiles`) | `apidojo/twitter-user-scraper` | cuentas que se definen como RRHH/reclutamiento en su bio | bio, ubicación, web, seguidores, `canDm`, tipo de cuenta |
| **Actividad** (`--via tuits`) | `apidojo/tweet-scraper` | cuentas que están publicando búsquedas ahora | autor, seguidores y verificación (sin bio) |

La vía de perfil es la principal: encuentra **personas, empresas y grupos** y los clasifica con una
heurística sobre la bio (más el `professional_type` de X cuando existe). La de tuits aporta la señal
de que la cuenta está publicando búsquedas ahora.

**Costo actual** (2026): US$0,008 por búsqueda de usuarios + US$0,0004 por usuario extra (los
primeros ~20 de cada búsqueda son gratis); US$0,0004 por tuit. Un rubro con 8 búsquedas y 100 ítems
ronda **US$0,06**.

> ⚠️ El plan free de Apify no permite correr actors por API (solo demo: 5 corridas/mes de 10
> ítems). Para automatizar hace falta un plan pago.

### Por rubro

Los rubros se definen en `rubros.json`. Cada entrada tiene `nombre`, `descripcion`, `usuarios`
(búsquedas de perfil), `tuits` (búsquedas de posts) y `excluir` (frases para descartar cuentas).

```bash
node discover.mjs rubros                          # lista los rubros
node discover.mjs --rubro rrhh --dry-run          # muestra búsquedas y costo, sin gastar
node discover.mjs --rubro rrhh                    # busca y muestra (no guarda)
node discover.mjs --rubro rrhh --save             # guarda en cuentas-por-rubro.json
node discover.mjs --rubro rrhh --via ambas --save # suma la señal de tuits
node discover.mjs --rubro rrhh --tipo persona --prospectos
```

`cuentas-por-rubro.json` es el relevamiento (personas + empresas + grupos) y está en `.gitignore`.
`--prospectos` copia los elegidos a `prospectos.json` para el flujo de DM de abajo.

### Query directa (modo viejo)

```bash
node discover.mjs "recruiter CABA" --save
node discover.mjs '("buscamos" OR "estamos buscando") junior (CABA OR Argentina) lang:es -filter:replies' --max 200 --save
```

## Flujo

```bash
# 1. agregás los que encontraste (o los copiás con discover.mjs --prospectos)
node cli.mjs add --handle @ana --nombre Ana --empresa ACME --nota "recluta backend"

# 2. el script te da el mensaje ya personalizado
node cli.mjs next

# 3. cuando lo mandás, lo marcás
node cli.mjs sent @ana

# control
node cli.mjs stats
node cli.mjs list --pendientes
node cli.mjs export > prospectos.csv
```

## Reglas que aplica

- **Cupo diario de 15** y aviso al alcanzarlo.
- **No repite handles** (normaliza con o sin `@`).
- Guarda fecha de envío para que no vuelvas a escribirle a la misma persona.
- El nombre sale de lo que cargues: no se inventa.

## Búsquedas útiles en X

**Para descubrir personas** (pestaña *Personas*; ahí no funcionan los operadores avanzados):

```
recruiter CABA
reclutador Argentina
talent acquisition LATAM
IT recruiter Buenos Aires
```

**Para verificar que están activos** (búsqueda de posts, últimos 30 días):

```
("recruiter" OR "reclutador" OR "talent acquisition") (CABA OR Argentina) lang:es -filter:replies since:2026-09-29 min_faves:5
```

**Para encontrar los que están publicando búsquedas ahora** — la mejor señal de que contratan:

```
("buscamos" OR "estamos buscando") (junior OR trainee OR "sin experiencia") (CABA OR Argentina) lang:es -filter:replies since:2026-10-15
```

### Sobre `min_faves`

Sirve para sacar ruido, pero **no lo subas mucho**: un reclutador que trabaja todo el día no
suele pasar los 100 likes. Con `min_faves:100` encontrás cuentas grandes y de contenido, que son
justamente las que menos contestan DMs. Rango útil: **5 a 20**.

### Sobre `-hiring`

Excluye a quien está publicando búsquedas, que es exactamente la señal de que está contratando.
Conviene usarlo solo si buscás cuentas de contenido, no reclutadores en activo.

Para DM, priorizá **personas**: las empresas y grupos sirven para el mapa y para detectar quién
contrata, pero contestan menos. Mirá si tienen el DM abierto y anotá en `--nota` algo real del
perfil: es lo que hace que el mensaje no parezca plantilla.

## Privacidad

`prospectos.json` y `cuentas-por-rubro.json` contienen datos de personas reales: están en
`.gitignore`, no se versionan.
