#!/usr/bin/env python3
"""Build the Maqam technical white paper and reproducibility receipt."""

from __future__ import annotations

import hashlib
import html
import json
import platform
import re
import shutil
from pathlib import Path

import reportlab
from pypdf import PdfReader
from reportlab import rl_config
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    HRFlowable,
    NextPageTemplate,
    PageBreak,
    PageTemplate,
    Paragraph,
    Preformatted,
    Spacer,
    Table,
    TableStyle,
)
from reportlab.platypus.tableofcontents import TableOfContents


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "docs" / "whitepaper.md"
FILENAME = "Maqam-Technical-White-Paper-v1.0.pdf"
OUTPUT = ROOT / "output" / "pdf" / FILENAME
DOCS_COPY = ROOT / "docs" / FILENAME
SITE_DIR = ROOT / "website" / "public" / "paper"
SITE_COPY = SITE_DIR / FILENAME
RECEIPT_NAME = "Maqam-Technical-White-Paper-v1.0.build.json"
HASH_NAME = "Maqam-Technical-White-Paper-v1.0.sha256"

PAGE_WIDTH, PAGE_HEIGHT = A4
LEFT = 24 * mm
RIGHT = 20 * mm
TOP = 22 * mm
BOTTOM = 19 * mm
WIDTH = PAGE_WIDTH - LEFT - RIGHT

INK = colors.HexColor("#07110E")
PAPER = colors.HexColor("#F4F7F5")
WHITE = colors.HexColor("#F8FBF9")
MUTED = colors.HexColor("#53645D")
GREEN = colors.HexColor("#57D3A9")
DARK_GREEN = colors.HexColor("#087457")
RULE = colors.HexColor("#CAD7D1")
CODE_BG = colors.HexColor("#07130F")

rl_config.invariant = 1


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def register_fonts() -> tuple[str, str, str, str, list[str]]:
    choices = [
        ("C:/Windows/Fonts/aptos.ttf", "C:/Windows/Fonts/aptos-bold.ttf",
         "C:/Windows/Fonts/aptos-italic.ttf", "C:/Windows/Fonts/consola.ttf"),
        ("C:/Windows/Fonts/calibri.ttf", "C:/Windows/Fonts/calibrib.ttf",
         "C:/Windows/Fonts/calibrii.ttf", "C:/Windows/Fonts/consola.ttf"),
        ("C:/Windows/Fonts/arial.ttf", "C:/Windows/Fonts/arialbd.ttf",
         "C:/Windows/Fonts/ariali.ttf", "C:/Windows/Fonts/consola.ttf"),
    ]
    for regular, bold, italic, mono in choices:
        paths = [Path(value) for value in (regular, bold, italic, mono)]
        if all(path.exists() for path in paths):
            pdfmetrics.registerFont(TTFont("MaqamBody", str(paths[0])))
            pdfmetrics.registerFont(TTFont("MaqamBody-Bold", str(paths[1])))
            pdfmetrics.registerFont(TTFont("MaqamBody-Italic", str(paths[2])))
            pdfmetrics.registerFont(TTFont("MaqamMono", str(paths[3])))
            pdfmetrics.registerFontFamily(
                "MaqamBody",
                normal="MaqamBody",
                bold="MaqamBody-Bold",
                italic="MaqamBody-Italic",
                boldItalic="MaqamBody-Bold",
            )
            return "MaqamBody", "MaqamBody-Bold", "MaqamBody-Italic", "MaqamMono", [str(path) for path in paths]
    return "Helvetica", "Helvetica-Bold", "Helvetica-Oblique", "Courier", ["ReportLab base 14 fonts"]


BODY, BOLD, ITALIC, MONO, FONT_FILES = register_fonts()
BASE = getSampleStyleSheet()
STYLES = {
    "cover-kicker": ParagraphStyle(
        "CoverKicker", parent=BASE["Normal"], fontName=BOLD, fontSize=9,
        leading=12, textColor=GREEN, spaceAfter=7 * mm,
    ),
    "cover-title": ParagraphStyle(
        "CoverTitle", parent=BASE["Title"], fontName=BOLD, fontSize=30,
        leading=34, textColor=WHITE, spaceAfter=5 * mm,
    ),
    "cover-subtitle": ParagraphStyle(
        "CoverSubtitle", parent=BASE["Normal"], fontName=BODY, fontSize=13.5,
        leading=19, textColor=colors.HexColor("#B8C8C1"), spaceAfter=10 * mm,
    ),
    "cover-meta": ParagraphStyle(
        "CoverMeta", parent=BASE["Normal"], fontName=BODY, fontSize=8.8,
        leading=13.5, textColor=colors.HexColor("#AAB9B3"),
    ),
    "h1": ParagraphStyle(
        "PaperH1", parent=BASE["Heading1"], fontName=BOLD, fontSize=20,
        leading=24, textColor=INK, spaceBefore=7 * mm, spaceAfter=3 * mm,
        keepWithNext=True,
    ),
    "h2": ParagraphStyle(
        "PaperH2", parent=BASE["Heading2"], fontName=BOLD, fontSize=13,
        leading=17, textColor=DARK_GREEN, spaceBefore=5 * mm,
        spaceAfter=2.5 * mm, keepWithNext=True,
    ),
    "body": ParagraphStyle(
        "PaperBody", parent=BASE["BodyText"], fontName=BODY, fontSize=9.2,
        leading=14, textColor=INK, spaceAfter=2.8 * mm,
        allowWidows=0, allowOrphans=0,
    ),
    "small": ParagraphStyle(
        "PaperSmall", parent=BASE["BodyText"], fontName=BODY, fontSize=7.3,
        leading=10, textColor=MUTED,
    ),
    "code": ParagraphStyle(
        "PaperCode", parent=BASE["Code"], fontName=MONO, fontSize=7.1,
        leading=10, textColor=WHITE, splitLongWords=True,
    ),
    "toc-title": ParagraphStyle(
        "TocTitle", parent=BASE["Heading1"], fontName=BOLD, fontSize=22,
        leading=26, textColor=INK, spaceAfter=7 * mm,
    ),
}


class PaperTemplate(BaseDocTemplate):
    def __init__(self, filename: str):
        super().__init__(
            filename,
            pagesize=A4,
            leftMargin=LEFT,
            rightMargin=RIGHT,
            topMargin=TOP,
            bottomMargin=BOTTOM,
            title="Maqam: Exact-Input Governance for Registered AI-Agent Actions",
            author="Ajnas N B",
            subject="Implementation-backed technical white paper for Maqam 0.3.3",
            creator="Maqam white-paper build",
            pageCompression=1,
        )
        cover = Frame(
            LEFT, BOTTOM, WIDTH, PAGE_HEIGHT - BOTTOM - 14 * mm,
            id="cover", leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0,
        )
        body = Frame(
            LEFT, BOTTOM, WIDTH, PAGE_HEIGHT - TOP - BOTTOM,
            id="body", leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0,
        )
        self.addPageTemplates([
            PageTemplate(id="Cover", frames=[cover], onPage=self.cover_page),
            PageTemplate(id="Body", frames=[body], onPage=self.body_page),
        ])

    @staticmethod
    def cover_page(canvas, _doc):
        canvas.saveState()
        canvas.setFillColor(colors.HexColor("#030806"))
        canvas.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, stroke=0, fill=1)
        canvas.setFillColor(GREEN)
        canvas.rect(0, PAGE_HEIGHT - 7 * mm, PAGE_WIDTH, 7 * mm, stroke=0, fill=1)
        canvas.setStrokeColor(colors.HexColor("#173C2E"))
        for radius, alpha in [(72, 0.28), (53, 0.42), (34, 0.7)]:
            canvas.setStrokeAlpha(alpha)
            canvas.circle(PAGE_WIDTH - 43 * mm, PAGE_HEIGHT - 59 * mm, radius * mm / 4, stroke=1, fill=0)
        canvas.setStrokeAlpha(1)
        canvas.line(LEFT, 16 * mm, PAGE_WIDTH - RIGHT, 16 * mm)
        canvas.setFillColor(colors.HexColor("#91A69E"))
        canvas.setFont(MONO, 7.2)
        canvas.drawString(LEFT, 10 * mm, "MAQAM / TECHNICAL WHITE PAPER")
        canvas.drawRightString(PAGE_WIDTH - RIGHT, 10 * mm, "AUGUST 2026")
        canvas.restoreState()

    @staticmethod
    def body_page(canvas, doc):
        canvas.saveState()
        canvas.setFillColor(PAPER)
        canvas.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, stroke=0, fill=1)
        canvas.setStrokeColor(RULE)
        canvas.line(LEFT, PAGE_HEIGHT - 14 * mm, PAGE_WIDTH - RIGHT, PAGE_HEIGHT - 14 * mm)
        canvas.setFont(BOLD, 7.2)
        canvas.setFillColor(DARK_GREEN)
        canvas.drawString(LEFT, PAGE_HEIGHT - 10 * mm, "MAQAM")
        canvas.setFont(BODY, 7.2)
        canvas.setFillColor(MUTED)
        canvas.drawRightString(PAGE_WIDTH - RIGHT, PAGE_HEIGHT - 10 * mm, "EXACT AUTHORITY FOR REGISTERED ACTIONS")
        canvas.setStrokeColor(RULE)
        canvas.line(LEFT, 13 * mm, PAGE_WIDTH - RIGHT, 13 * mm)
        canvas.setFont(BODY, 7.2)
        canvas.drawString(LEFT, 8 * mm, "Ajnas N B - Technical white paper v1.0")
        canvas.drawRightString(PAGE_WIDTH - RIGHT, 8 * mm, str(doc.page))
        canvas.restoreState()

    def afterFlowable(self, flowable):
        if not isinstance(flowable, Paragraph):
            return
        level = getattr(flowable, "_toc_level", None)
        if level is None:
            return
        title = flowable.getPlainText()
        key = f"section-{self.seq.nextf('heading')}"
        self.canv.bookmarkPage(key)
        self.canv.addOutlineEntry(title, key, level=level, closed=False)
        self.notify("TOCEntry", (level, title, self.page, key))


def inline(value: str) -> str:
    protected: dict[str, str] = {}

    def reserve(fragment: str) -> str:
        token = f"MAQAMPLACEHOLDER{len(protected)}TOKEN"
        protected[token] = fragment
        return token

    value = re.sub(
        r"`([^`]+)`",
        lambda match: reserve(f'<font name="{MONO}" color="#087457">{html.escape(match.group(1))}</font>'),
        value,
    )
    value = re.sub(
        r"\[([^\]]+)\]\(([^)]+)\)",
        lambda match: reserve(
            f'<link href="{html.escape(match.group(2), quote=True)}" color="#087457"><u>{html.escape(match.group(1))}</u></link>'
        ),
        value,
    )
    value = html.escape(value)
    value = re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", value)
    value = re.sub(r"(?<!\*)\*([^*]+)\*(?!\*)", r"<i>\1</i>", value)
    for token, fragment in protected.items():
        value = value.replace(token, fragment)
    return value


def heading(value: str, level: int) -> Paragraph:
    paragraph = Paragraph(inline(value), STYLES["h1" if level == 2 else "h2"])
    paragraph._toc_level = 0 if level == 2 else 1
    return paragraph


def code_block(value: str) -> Table:
    pre = Preformatted(value, STYLES["code"], maxLineLength=92)
    table = Table([[pre]], colWidths=[WIDTH], hAlign="LEFT")
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), CODE_BG),
        ("BOX", (0, 0), (-1, -1), 0.5, DARK_GREEN),
        ("LEFTPADDING", (0, 0), (-1, -1), 4 * mm),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4 * mm),
        ("TOPPADDING", (0, 0), (-1, -1), 3 * mm),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3 * mm),
    ]))
    return table


def list_table(items: list[str], ordered: bool) -> Table:
    markers = [str(index) for index in range(1, len(items) + 1)] if ordered else ["&#8226;"] * len(items)
    table = Table(
        [[Paragraph(marker, STYLES["body"]), Paragraph(inline(item), STYLES["body"])] for marker, item in zip(markers, items)],
        colWidths=[7 * mm if ordered else 5 * mm, WIDTH - (7 * mm if ordered else 5 * mm)],
        hAlign="LEFT",
        splitByRow=True,
    )
    table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0.8 * mm),
    ]))
    return table


def parse_markdown(text: str) -> list:
    lines = text.splitlines()
    story: list = []
    paragraph: list[str] = []
    code: list[str] = []
    in_code = False

    def flush():
        if paragraph:
            story.append(Paragraph(inline(" ".join(line.strip() for line in paragraph)), STYLES["body"]))
            paragraph.clear()

    index = 0
    while index < len(lines):
        raw = lines[index]
        line = raw.rstrip()
        if line.startswith("```"):
            if in_code:
                story.append(code_block("\n".join(code)))
                story.append(Spacer(1, 2 * mm))
                code.clear()
                in_code = False
            else:
                flush()
                in_code = True
            index += 1
            continue
        if in_code:
            code.append(raw)
            index += 1
            continue
        match = re.match(r"^(#{2,3})\s+(.+)$", line)
        if match:
            flush()
            story.append(heading(match.group(2), len(match.group(1))))
            index += 1
            continue
        if re.match(r"^(?:- |\d+\. )", line):
            flush()
            ordered = bool(re.match(r"^\d+\.", line))
            items: list[str] = []
            while index < len(lines) and re.match(r"^(?:- |\d+\. )", lines[index]):
                items.append(re.sub(r"^(?:- |\d+\. )", "", lines[index]).strip())
                index += 1
            story.append(list_table(items, ordered))
            story.append(Spacer(1, 1.7 * mm))
            continue
        if not line.strip():
            flush()
        else:
            paragraph.append(line)
        index += 1
    flush()
    return story


def cover_story() -> list:
    return [
        Spacer(1, 29 * mm),
        Paragraph("MAQAM / SOFTWARE VERSION 0.3.3", STYLES["cover-kicker"]),
        Paragraph("Exact-input governance for registered AI-agent actions", STYLES["cover-title"]),
        Paragraph(
            "An implementation-backed account of policy-before-dispatch, exact one-use approval, execution receipts, evidence links, adapters, and their limits.",
            STYLES["cover-subtitle"],
        ),
        HRFlowable(width="100%", thickness=0.8, color=colors.HexColor("#24453A")),
        Spacer(1, 8 * mm),
        Paragraph(
            "<b>Author:</b> Ajnas N B<br/>"
            "<b>Paper version:</b> 1.0<br/>"
            "<b>Date:</b> 8 August 2026<br/>"
            "<b>Implementation:</b> v0.3.3 / f43c2493084f8a6c8c755a50a3d9feb38d72ebcc<br/>"
            "<b>Software license:</b> MIT<br/>"
            "<b>Manuscript license:</b> Not assigned; author selection required before publication<br/>"
            "<b>DOI:</b> Not assigned<br/>"
            "<b>Status:</b> Project-authored technical report. No independent peer review, formal verification, penetration test, or independent security certification is claimed.",
            STYLES["cover-meta"],
        ),
        NextPageTemplate("Body"),
        PageBreak(),
    ]


def toc_story() -> list:
    toc = TableOfContents()
    toc.levelStyles = [
        ParagraphStyle(
            "TOC1", fontName=BOLD, fontSize=8.7, leading=11.1,
            textColor=INK, leftIndent=0, firstLineIndent=0, spaceBefore=0.5,
        ),
        ParagraphStyle(
            "TOC2", fontName=BODY, fontSize=7.4, leading=9.3,
            textColor=MUTED, leftIndent=8 * mm, firstLineIndent=0,
        ),
    ]
    return [
        Paragraph("Contents", STYLES["toc-title"]),
        Paragraph("Architecture, authority, adapters, verification, measurements, and explicit limits.", STYLES["body"]),
        Spacer(1, 3 * mm),
        toc,
        PageBreak(),
    ]


def write_receipt() -> None:
    reader = PdfReader(str(OUTPUT))
    receipt = {
        "schema": "maqam.whitepaper-build/v1",
        "paperVersion": "1.0",
        "softwareVersion": "0.3.3",
        "softwareTag": "v0.3.3",
        "softwareCommit": "f43c2493084f8a6c8c755a50a3d9feb38d72ebcc",
        "builtAt": "2026-08-08T00:00:00Z",
        "source": {"path": "docs/whitepaper.md", "sha256": sha256(SOURCE)},
        "builder": {"path": "scripts/build-whitepaper-pdf.py", "sha256": sha256(Path(__file__))},
        "pdf": {"filename": FILENAME, "sha256": sha256(OUTPUT), "bytes": OUTPUT.stat().st_size, "pages": len(reader.pages)},
        "runtime": {"python": platform.python_version(), "reportlab": reportlab.Version, "fonts": FONT_FILES},
        "claims": {
            "peerReviewed": False,
            "independentlySecurityCertified": False,
            "newMgesResultForSoftwareVersion": False,
        },
    }
    encoded = json.dumps(receipt, indent=2, ensure_ascii=True) + "\n"
    hash_line = f"{receipt['pdf']['sha256']}  {FILENAME}\n"
    for directory in (OUTPUT.parent, ROOT / "docs", SITE_DIR):
        directory.mkdir(parents=True, exist_ok=True)
        (directory / RECEIPT_NAME).write_text(encoded, encoding="utf-8")
        (directory / HASH_NAME).write_text(hash_line, encoding="ascii")


def build() -> None:
    text = SOURCE.read_text(encoding="utf-8")
    start = text.find("## Abstract")
    if start < 0:
        raise ValueError("docs/whitepaper.md does not contain an Abstract section")
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    SITE_DIR.mkdir(parents=True, exist_ok=True)
    story = cover_story() + toc_story() + parse_markdown(text[start:])
    PaperTemplate(str(OUTPUT)).multiBuild(story)
    shutil.copyfile(OUTPUT, DOCS_COPY)
    shutil.copyfile(OUTPUT, SITE_COPY)
    write_receipt()
    print(OUTPUT)


if __name__ == "__main__":
    build()
