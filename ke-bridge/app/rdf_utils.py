"""Minimal N3 helpers to build ASK bindings and parse KE result bindings.

KE bindings are dicts of `varName -> RDF node in N3`, e.g.
`{"value": "\"150.5\"^^<http://www.w3.org/2001/XMLSchema#float>"}`.
"""

XSD = "http://www.w3.org/2001/XMLSchema#"


def uri(value: str) -> str:
    """Wrap a URI string as an N3 node."""
    return f"<{value}>"


def datetime_literal(iso: str) -> str:
    """An xsd:dateTime literal in N3."""
    return f'"{iso}"^^<{XSD}dateTime>'


def parse_node(n3: str) -> str:
    """Return the lexical value of an N3 node (strip <> or quotes/datatype)."""
    s = (n3 or "").strip()
    if s.startswith("<") and s.endswith(">"):
        return s[1:-1]
    if s.startswith('"'):
        end = s.index('"', 1)
        return s[1:end]
    return s


def parse_float(n3: str) -> float:
    return float(parse_node(n3))
