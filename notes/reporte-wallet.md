# Análisis de la wallet — MetaMask / Chrome `Profile 1`

| | |
|---|---|
| Dirección | `0xb6de4c431d6cdab878dd5db5354547c12e0e4920` |
| Perfil | `Profile 1` — `creycolon@gmail.com` |
| Tipo | EOA (no contrato) en todas las redes |
| Origen de los datos | `eth_requestAccounts` vía MetaMask + RPC públicos + Blockscout |
| Leído | 2026-10-27 |

## Saldos

| Red | Nativo | USD | Txs salientes (nonce) | ERC-20 |
|---|---|---|---|---|
| Ethereum | 0.00030853 ETH | $0.72 | 2 | ninguno |
| BNB Smart Chain | 0.01380134 BNB | $10.30 | 1 | no verificado |
| Base | 0 | $0 | 0 | ninguno |
| Arbitrum One | 0 | $0 | 0 | ninguno |
| Optimism | 0 | $0 | 0 | ninguno |
| Polygon | 0 | $0 | 0 | ninguno |
| Gnosis | 0 | $0 | 0 | ninguno |

**Total: ~$11.02** (ETH $2338, BNB $746 al momento de la lectura).

Sin ENS, sin NFTs, sin transferencias de tokens ERC-20 registradas.

## Qué pasó en esta wallet

Toda la actividad es de un solo día, **25 de marzo de 2024**, en Ethereum:

| Hora | Movimiento | Monto | Fee | Hash |
|---|---|---|---|---|
| 05:39:47 | Entrada desde `0x9696…6976` | +0.01101383 ETH | 0.00046986 | [`0x7ef7be86…`](https://etherscan.io/tx/0x7ef7be865b9fefa5e0d792ce7e810515f2a4f18baeaecd74bafd16fd21496ad4) |
| 06:40:47 | Autoenvío (a sí misma) | −0.010499 ETH | 0.00034256 | [`0x13621a05…`](https://etherscan.io/tx/0x13621a05c83765afc587c8e7f7fdefafe0efcefcafbc5bcbaa3cd152767afe85) |
| 07:12:35 | Salida a `0xb051…5101` | −0.01 ETH | 0.00036275 | [`0x4f37a41d…`](https://etherscan.io/tx/0x4f37a41d7ce98cdcd9e67fb7440d1770a74c6fd3fdc55574f87c08821a4a4bbd) |

Lectura: entró ~0.011 ETH, se autoenvió el grueso (patrón típico de prueba o de "mover el saldo para verificar control"), y a la media hora mandó 0.01 ETH a otra dirección. Quedó el polvo que ves hoy. No hay swaps, no hay aprobaciones a contratos, no hay interacción con DeFi — el gas de las tres txs es exactamente 21000, o sea transferencias simples.

Contrapartes:

- `0x9696f59E4d72E237BE84fFD425DCaD154Bf96976` — EOA sin etiqueta pública; no es un hot wallet de exchange identificado.
- `0xb051B6EebFAb9726c68a0Cc9f267A97162a05101` — destino de los 0.01 ETH.

## Límites de este análisis

- **BSC:** el saldo y el nonce salen de RPC, pero el historial no. Blockscout no tiene instancia para BSC y Etherscan V2 exige plan pago para esa cadena. Sé que hubo **1 tx saliente** y nada más.
- **Tokens en BSC (BEP-20):** no verificados por la misma razón. Si esa tx fue un swap, podría haber quedado algún token dando vueltas.
- El `Profile 1` es una de dos wallets. Falta revisar `Default` (`christiamrey@gmail.com`), que tiene más datos de MetaMask (9.4 MB vs 5.0 MB).

## Cómo se obtuvo

Chrome se lanzó sobre una **copia** del perfil (`work/ud`, 527 MB) con `--remote-debugging-port` y `playwright-core` por CDP; se pidió `eth_requestAccounts` desde una página de prueba y la cuenta se aprobó a mano en la ventana de MetaMask. La llave privada nunca salió de la extensión y el perfil original no se modificó.

> `--no-sandbox` fue necesario porque `/opt/google/chrome/chrome-sandbox` está owned por `nobody` en vez de `root`. Eso es un problema de la instalación de Chrome en el sistema, ajeno a este trabajo.
