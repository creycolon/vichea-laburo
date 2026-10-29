# Prospección de DMs en X

Herramienta local para contactar reclutadores sin parecer envío masivo. **No busca gente ni
scrapea X**: eso viola sus términos y expone la cuenta. El descubrimiento lo hacés vos (la
búsqueda de X es buena para eso); el script se ocupa de lo repetitivo.

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

```
"recruiter" (CABA OR Argentina) -hiring
"talent acquisition" Argentina
"busco programador" junior
"reclutador" remoto LATAM
```

Filtrá por personas (no cuentas de empresa), mirá si tienen el DM abierto y anotá en `--nota`
algo real del perfil: es lo que hace que el mensaje no parezca plantilla.

## Privacidad

`prospectos.json` contiene datos de personas reales: está en `.gitignore`, no se versiona.
