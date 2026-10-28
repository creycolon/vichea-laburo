# Rastreo — 54 USDT en BNB Chain

## La transacción

| | |
|---|---|
| Hash | [`0xb31443c739f274f6ed7481a6f2c76a163101cd559826f8349abbb01bf128a95c`](https://bscscan.com/tx/0xb31443c739f274f6ed7481a6f2c76a163101cd559826f8349abbb01bf128a95c) |
| Bloque | 36978598 — 2024-03-15 00:41:12 UTC (14/03 21:41 en Buenos Aires) |
| De | `0xb6de4c431d6cdab878dd5db5354547c12e0e4920` (nonce 0) |
| `to` de la tx | `0x55d398326f99059ff775485246999027b3197955` — **contrato USDT (BSC-USD), no una persona** |
| Método | `0xa9059cbb` → `transfer(address,uint256)` |
| Estado | success (0x1), gas 46815 @ 3 gwei → fee ≈ 0.00014 BNB |
| **Destinatario real** | **`0xf33f1a8cab63389e80db15accfebe3912b5176cf`** |
| Monto | 54.0 USDT exactos |

El `to` de una transferencia de token es el contrato. El receptor viaja en el `input`, después del selector: `transfer(0xf33f1a8cab63389e80db15accfebe3912b5176cf, 54000000000000000000)`.

## Estado del destinatario (hoy)

| Dato | Valor |
|---|---|
| Tipo | EOA (sin código) |
| Nonce | **0** — nunca envió una transacción |
| BNB | 0 |
| USDT | **54.0** — intactos |

Los fondos siguen ahí, sin tocar, dos años y medio después.

## Por qué esto descarta a Binance

Una dirección de depósito de Binance es una EOA que Binance controla, y Binance **barre** (sweep) los depósitos: manda los tokens a su wallet caliente. Barrer requiere que la dirección de depósito *firme* una transacción, o sea nonce ≥ 1.

`0xf33f…76cf` tiene nonce 0 y conserva los 54 USDT exactos. Nunca se movió nada. Si fuera de Binance, hace rato estaría vacía y con nonce alto.

Además, el saldo es exactamente 54.0: eso implica que es la **única** transferencia de USDT que recibió en su vida. No es una dirección de depósito en uso.

## Conclusión

- No es una dirección de Binance. Un ticket a Binance sobre esta tx va a terminar en "esa dirección no es nuestra".
- Los fondos **no fueron robados, están varados**. Nadie los movió.
- Son recuperables únicamente por quien tenga la llave privada de `0xf33f…76cf`. Si la dirección salió de un typo, nadie la tiene y no hay nada que hacer.
- Si salió de una dirección **parecida a la que querías** (mismos primeros y últimos caracteres), es *address poisoning*: un ataque, no un error.

## Prueba decisiva pendiente

Mirar en Binance → Wallet → Deposit → historial de direcciones BEP-20:

- Si `0xf33f1a8cab63389e80db15accfebe3912b5176cf` **aparece** en tu lista de direcciones de depósito → sí es tuya, Binance puede acreditarla con el hash como prueba.
- Si **no aparece** → no es de Binance, y el reclamo no tiene sustento.

## Datos técnicos crudos

```json
{ "to": "0x55d398326f99059ff775485246999027b3197955",
  "input": "0xa9059cbb000000000000000000000000f33f1a8cab63389e80db15accfebe3912b5176cf000000000000000000000000000000000000000000000002ed6689e54f180000" }
```

`0x2ed6689e54f180000` = 54 000 000 000 000 000 000 = 54 USDT (18 decimales).
