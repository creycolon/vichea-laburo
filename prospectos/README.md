# Prospección de DMs en X

Herramienta local para contactar reclutadores sin parecer envío masivo. **No busca gente ni
scrapea X**: eso viola sus términos y expone la cuenta. El descubrimiento lo hacés vos (la
búsqueda de X es buena para eso); el script se ocupa de lo repetitivo.

## Descubrimiento automático (Apify)

X no tiene búsqueda pública de personas y Nitter quedó dado de baja por reclamos legales. La vía
que funciona es **Apify**, que ya usás para Computrabajo: el actor `apidojo/tweet-scraper` cobra
**US$0,0001 por tweet** (1.000 tuits = 10 centavos) y el tier gratuito da US$5 mensuales.

```bash
echo 'APIFY_TOKEN=apify_api_...' > .env     # https://console.apify.com/account/integrations

node discover.mjs "recruiter CABA"          # muestra los autores
node discover.mjs "recruiter CABA" --save   # los agrega como pendientes
node discover.mjs '("buscamos" OR "estamos buscando") junior (CABA OR Argentina) lang:es -filter:replies since:2026-10-15' --max 200 --save
```

Toma los autores únicos de los tuits que matchean la query, descarta los que ya están en la lista
y guarda nombre, handle y bio (la bio se usa como nota al lado del mensaje).

## Flujo

```bash
# 1. agregás los que encontraste
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

Filtrá por personas (no cuentas de empresa), mirá si tienen el DM abierto y anotá en `--nota`
algo real del perfil: es lo que hace que el mensaje no parezca plantilla.

## Privacidad

`prospectos.json` contiene datos de personas reales: está en `.gitignore`, no se versiona.
