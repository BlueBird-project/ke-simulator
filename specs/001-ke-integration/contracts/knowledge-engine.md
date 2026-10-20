# Contract — Knowledge Engine (shared)

How the simulator's **KE Bridge** joins and speaks to the Knowledge Engine.
This is the transport contract shared by the per-module contracts
([trading-manager.md](trading-manager.md), [flexibility-manager.md](flexibility-manager.md)).

Planning only — signatures are quoted from the real `ke_client==0.32.3` surface
discovered in the repos.

---

## 1. Connection

| Setting | Value / env var |
|---------|-----------------|
| REST endpoint | `KE_REST_ENDPOINT` — e.g. `http://tm-ke-service:8280/rest/` (must end `/rest/`) |
| KB id | `KE_KNOWLEDGE_BASE_ID` — e.g. `http://simulator.bluebird.com` *(confirm, Q1)* |
| KI config | `KE_KI_CONFIG_PATH` — YAML graph patterns, e.g. `./resources/ke_config.yml` |
| Reasoner | `KE_REASONER_LEVEL` (1–4) |
| TLS verify | `KE_VERIFY_SERVER_CERT` |
| Smart Connector image | `ghcr.io/tno/knowledge-engine/smart-connector:1.5.0` |

All of the above live **server-side** in the Bridge; never in browser bundles.

---

## 2. Lifecycle (Bridge startup)

```python
client = KEClient.build()          # uses KE_* settings + ki_conf
client.include(ki_holder=sim_ki)   # simulator's interactions
client.register()                  # register KB + KIs with the KE
client.start()                     # background handler loop (ANSWER/REACT)
# ... later ...
client.stop()
```

- Handler loop polls `GET {endpoint}sc/handle` → `200` handle / `202`
  heartbeat / `410` stop.
- `client.is_registered` gates readiness; retry/backoff like TM's
  `smart_client.py`.

---

## 3. Operations

| Op | ke_client call / decorator | KE REST |
|----|----------------------------|---------|
| Query | `client.ask_ke(bindings, ki_id, ki_name) -> KIAskResponse` | `POST sc/ask` |
| Publish | `client.post_ke(bindings, ki_id, ki_name) -> KIPostResponse` | `POST sc/post` |
| Serve query | `@sim_ki.answer("<pattern>")` handler | via `sc/handle` |
| Serve publish | `@sim_ki.react("<pattern>")` handler | via `sc/handle` |

Request headers: `Knowledge-Base-Id`, `Knowledge-Interaction-Id`.

---

## 4. Bindings format

- Bindings are `List[Dict[str, str]]`; values are **N3** RDF nodes:
  - URI: `"<http://example.org/x>"`
  - Literal: `"\"150.5\"^^<http://www.w3.org/2001/XMLSchema#float>"`
  - dateTime: `"\"2026-10-06T00:15:00Z\"^^<…#dateTime>"`
- Target a specific KB with
  `TargetedBindings(bindings=[...], knowledge_bases=[kb_id])`.
- Define typed helpers by subclassing `BindingsBase` (as TM does in
  `fm_model.py`), calling `.n3()` to emit bindings.

---

## 5. Response objects

```python
class KIAskResponse:  binding_set: List[Dict]; exchangeInfo: List[ExchangeInfo]
class KIPostResponse: resultBindingSet: List[Dict]; exchangeInfo: List[ExchangeInfo]
class ExchangeInfo:   knowledgeBaseId: str; status: "SUCCEEDED"|"FAILED"; failedMessage; bindings
```

The Bridge forwards, per stage, `{ kb, status, values }` to the frontend over
SSE so the UI timeline shows **real** outcomes (FR-5).

---

## 6. YAML graph-pattern skeleton

```yaml
knowledge_engine:
  knowledge_base_id: "http://simulator.bluebird.com"
  kb_name: "ke-simulator"
  kb_description: "BlueBird KE Simulator bridge"
  prefixes:
    kb: "${KB_ID}/"
    rdf: "http://www.w3.org/1999/02/22-rdf-syntax-ns#"
    saref: "https://saref.etsi.org/core/"
    s4ener: "https://saref.etsi.org/saref4ener/"
    time: "http://www.w3.org/2006/time#"
    ubmarket: "https://ubflex.bluebird.eu/market/"
    xsd: "http://www.w3.org/2001/XMLSchema#"
  include:
    - "./resources/ki/trading-manager.yaml"
    - "./resources/ki/flexibility-manager.yaml"
```

---

## 7. Error / fallback contract

- Registration failure or missing producer ⇒ Bridge responds
  `{ "mode": "simulated", ... }`; frontend runs mock and labels the run.
- Per-stage `FAILED` exchangeInfo ⇒ surfaced in the timeline, cycle continues.
