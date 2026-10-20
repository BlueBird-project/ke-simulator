# ke-simulator

Visual demonstration of how energy price data flows through the Knowledge Engine
(KE) architecture with Smart Connectors. React 18 + TypeScript + Vite + Tailwind.

## Run (dev)
```bash
npm install
npm run dev        # http://localhost:5173
```

## Knowledge Engine integration (optional)
By default the app **simulates** the trading cycle in the browser. It can instead
talk to the real BlueBird modules **through the Knowledge Engine** via a
server-side **KE Bridge** (Python + `ke_client`). See
[specs/001-ke-integration/](specs/001-ke-integration/) for the full plan and
[ke-bridge/](ke-bridge/) for the bridge.

- Enable in the frontend with `VITE_USE_KE=true` (see [.env.example](.env.example));
  calls are proxied to the bridge at `/bridge`.
- Full stack (KE + bridge + FM stand-in + frontend) via Docker:
  ```bash
  cd ke-bridge/compose
  docker compose up --build      # frontend on http://localhost:8081
  ```
- If the KE is unavailable the app falls back to ENTSO-E/mock and labels the run
  as **simulated** (the Trading Manager panel shows a "KE bridge: …" badge).

## Docs
- [ARCHITECTURE.md](ARCHITECTURE.md) — layers and data flow.
- [specs/001-ke-integration/](specs/001-ke-integration/) — KE integration spec,
  plan, contracts, tasks and stage→interaction traceability.
- [docs/SIMULATE_DAY_AHEAD_SHORTFALL.md](docs/SIMULATE_DAY_AHEAD_SHORTFALL.md) —
  detailed walkthrough of the shortfall scenario.