"""Generate an executive overview deck for the KE Simulator.

Reuses the theme/layouts of docs/BBPPTX.pptx (branding) but drops its existing
slides and any author citation, writing a NEW file so the original is untouched.
"""

import copy
from pptx import Presentation
from pptx.oxml.ns import qn
from pptx.util import Inches, Pt
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.dml.color import RGBColor

TEMPLATE = r"c:\proyectos\bluebird\ke-simulator\docs\BBPPTX.pptx"
OUT = r"c:\proyectos\bluebird\ke-simulator\docs\KE-Simulator-Executive-Overview.pptx"

BLUE = RGBColor(0x1F, 0x4E, 0x79)
LIGHT = RGBColor(0xDE, 0xEB, 0xF7)
GREEN = RGBColor(0x2E, 0x7D, 0x32)
AMBER = RGBColor(0xB5, 0x6A, 0x00)
GREY = RGBColor(0x59, 0x59, 0x59)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)

L_TITLE, L_CONTENT, L_SECTION, L_TITLE_ONLY = 0, 1, 2, 8

prs = Presentation(TEMPLATE)

# --- drop existing slides (remove parts, not just the id references) ---
sld_lst = prs.slides._sldIdLst
for sld in list(sld_lst):
    prs.part.drop_rel(sld.get(qn("r:id")))
    sld_lst.remove(sld)

# --- remove the original author's citation baked into masters/layouts ---
_CITATION_KEYS = ("Develder", "ugent", "Ghent", "Home Energy Management", "AI4E", "IDLab")


def _strip_citation(container):
    for shape in container.shapes:
        if shape.has_text_frame and any(k in shape.text_frame.text for k in _CITATION_KEYS):
            shape.text_frame.clear()


for master in prs.slide_masters:
    _strip_citation(master)
    for layout in master.slide_layouts:
        _strip_citation(layout)


def _set_footer(slide):
    for ph in slide.placeholders:
        if ph.placeholder_format.idx in (10, 14):  # FOOTER placeholders in this template
            ph.text_frame.text = "BlueBird · KE Simulator — Executive Overview"


def add_bullets(title, bullets, layout=L_CONTENT):
    slide = prs.slides.add_slide(prs.slide_layouts[layout])
    slide.shapes.title.text = title
    tf = slide.placeholders[1].text_frame
    tf.word_wrap = True
    tf.clear()
    for i, item in enumerate(bullets):
        text, level = item if isinstance(item, tuple) else (item, 0)
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.text = text
        p.level = level
        p.font.size = Pt(20 if level == 0 else 16)
    _set_footer(slide)
    return slide


# ============================ 1. Title ============================
s = prs.slides.add_slide(prs.slide_layouts[L_TITLE])
s.shapes.title.text = "KE Simulator — Executive Overview"
s.placeholders[1].text = (
    "BlueBird Knowledge Engine integration\n"
    "Day-ahead / intraday energy trading flow"
)
_set_footer(s)

# ============================ 2. What it is ============================
add_bullets(
    "What the KE Simulator is",
    [
        ("A visual, educational web application that shows how energy data flows through the "
         "BlueBird Knowledge Engine (KE) with Smart Connectors.", 0),
        ("Two coordinated views:", 0),
        ("A simple Market → Energy price-publication flow.", 1),
        ("A 13-step day-ahead / intraday Trading cycle (shortfall & surplus scenarios).", 1),
        ("Goal: make the KE architecture and the Trading / Flexibility interactions tangible "
         "for decision-makers and integration teams.", 0),
    ],
)

# ============================ 3. What it does today ============================
add_bullets(
    "What it does today",
    [
        ("Runs a complete day-ahead → intraday trading cycle end to end.", 0),
        ("Visualises each step: market prices, price forecast, demand forecast, Share Offer, "
         "day-ahead clearing and the intraday correction.", 0),
        ("Shows the live status of every Knowledge Engine exchange (which Knowledge Base "
         "answered, success / failure).", 0),
        ("Runs in two modes:", 0),
        ("Simulated (offline) — always works, for demos without infrastructure.", 1),
        ("KE-backed — real data flowing through the Knowledge Engine.", 1),
    ],
)

# ============================ 4. Architecture (diagram) ============================
s = prs.slides.add_slide(prs.slide_layouts[L_TITLE_ONLY])
s.shapes.title.text = "Architecture — everything through the Knowledge Engine"
_set_footer(s)


def box(slide, x, y, w, h, text, fill, font=WHITE, size=13):
    shp = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(x), Inches(y), Inches(w), Inches(h))
    shp.fill.solid()
    shp.fill.fore_color.rgb = fill
    shp.line.color.rgb = BLUE
    tf = shp.text_frame
    tf.word_wrap = True
    tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    p = tf.paragraphs[0]
    p.alignment = PP_ALIGN.CENTER
    p.text = text
    p.font.size = Pt(size)
    p.font.color.rgb = font
    p.font.bold = True
    return shp


def arrow(slide, x, y, w):
    a = slide.shapes.add_shape(MSO_SHAPE.RIGHT_ARROW, Inches(x), Inches(y), Inches(w), Inches(0.35))
    a.fill.solid()
    a.fill.fore_color.rgb = GREY
    a.line.fill.background()
    return a


yb = 2.2
box(s, 0.5, yb, 2.5, 1.2, "Browser\nReact UI", BLUE)
arrow(s, 3.05, yb + 0.42, 0.7)
box(s, 3.8, yb, 2.5, 1.2, "KE Bridge\nPython + ke_client", BLUE)
arrow(s, 6.35, yb + 0.42, 0.7)
box(s, 7.1, yb, 2.6, 1.2, "Knowledge Engine\nTNO Smart Connector", BLUE)
arrow(s, 9.75, yb + 0.42, 0.7)
box(s, 10.5, yb, 2.4, 1.2, "Domain KBs\nTM · FM · Twins", BLUE)

tb = s.shapes.add_textbox(Inches(0.5), Inches(4.0), Inches(12.4), Inches(2.0)).text_frame
tb.word_wrap = True
for i, line in enumerate([
    "Browser ⇄ Bridge over REST + live events (SSE); Bridge ⇄ everyone else only via the KE.",
    "All inter-module data uses Knowledge Interactions: ASK · POST · ANSWER · REACT.",
    "A server-side bridge is required (the browser cannot run the Python KE client); secrets stay server-side.",
    "If the KE is unavailable, the app falls back to simulated data and is clearly labelled.",
]):
    p = tb.paragraphs[0] if i == 0 else tb.add_paragraph()
    p.text = "•  " + line
    p.font.size = Pt(16)

# ==================== Docker stack — diagram ====================
s = prs.slides.add_slide(prs.slide_layouts[L_TITLE_ONLY])
s.shapes.title.text = "Docker stack — current architecture"
_set_footer(s)

net = s.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.4), Inches(1.55), Inches(12.5), Inches(5.3))
net.fill.solid()
net.fill.fore_color.rgb = LIGHT
net.line.color.rgb = BLUE
net.shadow.inherit = False
net.text_frame.vertical_anchor = MSO_ANCHOR.TOP
np = net.text_frame.paragraphs[0]
np.text = "  Docker network:  ke-net"
np.alignment = PP_ALIGN.LEFT
np.font.size = Pt(12)
np.font.bold = True
np.font.color.rgb = BLUE

# pipeline row: ke-simulator -> ke-bridge -> ke-service
box(s, 0.9, 2.5, 2.7, 1.2, "ke-simulator\nnginx · React UI\n:8081 → 80", BLUE, size=12)
arrow(s, 3.65, 3.0, 0.55)
box(s, 4.3, 2.5, 2.7, 1.2, "ke-bridge\nFastAPI · ke_client\n:8090", BLUE, size=12)
arrow(s, 7.05, 3.0, 0.55)
box(s, 7.7, 2.5, 3.1, 1.2, "ke-service\nTNO Smart Connector (KE)\n:8280", BLUE, size=12)

# producers below, answering through the KE
box(s, 5.6, 4.8, 2.7, 1.2, "tm-standin\nday-ahead prices\nKB tm.bluebird.com", GREEN, size=12)
box(s, 8.9, 4.8, 2.7, 1.2, "fm-standin\nconsumption forecast\nKB fm.bluebird.com", GREEN, size=12)
for ax in (6.8, 10.1):
    up = s.shapes.add_shape(MSO_SHAPE.UP_ARROW, Inches(ax), Inches(3.8), Inches(0.3), Inches(0.95))
    up.fill.solid()
    up.fill.fore_color.rgb = GREY
    up.line.fill.background()

cap = s.shapes.add_textbox(Inches(0.5), Inches(6.25), Inches(12.3), Inches(0.7)).text_frame
cap.word_wrap = True
cap.paragraphs[0].text = ("Browser → ke-simulator (:8081); /bridge is proxied to ke-bridge. "
                          "Every Knowledge Base talks only through the KE (ke-service) via ASK / POST / ANSWER / REACT.")
cap.paragraphs[0].font.size = Pt(13)
cap.paragraphs[0].font.italic = True

# ==================== Docker stack — what each runs ====================
s = prs.slides.add_slide(prs.slide_layouts[L_TITLE_ONLY])
s.shapes.title.text = "Docker stack — what each container runs"
_set_footer(s)
_rows = [
    ("Container", "Image / base", "Role & key contents", "Port(s)"),
    ("ke-service", "ghcr.io/tno/…/smart-connector:1.5.0",
     "Knowledge Engine (TNO Smart Connector). Routes all Knowledge Interactions between the Knowledge Bases.", "8280"),
    ("ke-bridge", "python:3.12 · FastAPI · ke_client",
     "The simulator's Knowledge Base. REST + SSE to the UI; ASKs day-ahead prices (tou-price) and consumption "
     "(fm-ts) through the KE.  KB http://simulator.bluebird.com", "8090"),
    ("tm-standin", "python:3.12 · ke_client",
     "Trading-Manager price producer (stand-in). ANSWERs tm-info / tou-price with a synthetic day-ahead curve.  "
     "KB http://tm.bluebird.com", "—"),
    ("fm-standin", "python:3.12 · ke_client",
     "Flexibility-Manager producer (stand-in). ANSWERs fm-ts-info-request / fm-ts with a synthetic consumption "
     "curve.  KB http://fm.bluebird.com", "—"),
    ("ke-simulator", "node build → nginx:1.27",
     "React single-page app served by nginx; proxies /bridge → ke-bridge. Built with VITE_USE_KE=true.", "8081→80"),
]
tbl = s.shapes.add_table(len(_rows), 4, Inches(0.4), Inches(1.6), Inches(12.5), Inches(5.0)).table
tbl.columns[0].width = Inches(1.7)
tbl.columns[1].width = Inches(2.9)
tbl.columns[2].width = Inches(6.4)
tbl.columns[3].width = Inches(1.5)
for r, row in enumerate(_rows):
    for c, val in enumerate(row):
        cell = tbl.cell(r, c)
        cell.text = val
        pr = cell.text_frame.paragraphs[0]
        pr.font.size = Pt(12 if r == 0 else 10)
        pr.font.bold = (r == 0)

# ============================ 5. What works via the real KE ============================
add_bullets(
    "What works today — via the real Knowledge Engine",
    [
        ("KE Smart Connector + KE Bridge running; the simulator is registered as its own "
         "Knowledge Base.", 0),
        ("Day-ahead prices delivered through the KE (96 × 15-minute points).", 0),
        ("Flexibility (consumption) forecast delivered through the KE.", 0),
        ("The Trading cycle consumes real KE prices and the real KE forecast — validated "
         "end to end in the browser.", 0),
        ("Graceful fallback to simulated data whenever the KE is unavailable.", 0),
    ],
)

# ============================ 6. Stand-ins ============================
add_bullets(
    "What is still a stand-in (today)",
    [
        ("Trading Manager — the real module sits behind a private registry; replaced by a "
         "price stand-in producing a synthetic day-ahead curve over the KE.", 0),
        ("Flexibility Manager — has no KE integration yet; replaced by a consumption "
         "stand-in answering over the KE.", 0),
        ("Still local / simulated: intraday prices, the Share-Offer write-back, and the two "
         "Digital Twins (price-forecast & consumption).", 0),
        ("Important: the simulator consumes them through the KE already — swapping a "
         "stand-in for the real module requires no change on the simulator side.", 0),
    ],
)

# ============================ 7. What's missing ============================
add_bullets(
    "What's missing for the complete real flow",
    [
        ("Access to the real Trading Manager (private registry credentials) and an ENTSO-E "
         "token, so real prices and market clearing flow through the KE.", 0),
        ("KE integration inside the Flexibility Manager (register its KB + consumption "
         "Knowledge Interaction).", 0),
        ("Intraday price interaction over the KE (today only day-ahead is standardised).", 0),
        ("Share-Offer write path — actually POST offers to the Trading Manager, with market "
         "session timing and permissions.", 0),
        ("Real price-forecast and consumption Digital Twins as KE participants.", 0),
    ],
)

# ============================ 8. Next steps ============================
add_bullets(
    "Next steps",
    [
        ("Obtain registry credentials + ENTSO-E token → replace the TM stand-in with the "
         "real Trading Manager (no simulator change).", 0),
        ("Flexibility Manager team adds KE support → retire the FM stand-in.", 0),
        ("Add the intraday and offer-write Knowledge Interactions; wire the Digital Twins.", 0),
        ("Harden deployment: shared KE network, authentication and monitoring.", 0),
    ],
)

# ============================ 9. Summary ============================
add_bullets(
    "Summary",
    [
        ("The simulator demonstrates the end-to-end, KE-mediated trading flow — today with "
         "real day-ahead prices and a real demand forecast flowing through the Knowledge Engine.", 0),
        ("The remaining work is mainly access / credentials and completing KE integration "
         "inside the domain modules.", 0),
        ("The simulator is ready to consume the real modules with no changes once they are "
         "available on the KE.", 0),
    ],
    layout=L_CONTENT,
)

prs.save(OUT)
print("Saved:", OUT, "slides:", len(prs.slides.__iter__.__self__._sldIdLst))
