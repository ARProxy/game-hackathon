#!/usr/bin/env python3
"""Build polished Korean submission PDFs from the final Markdown sources."""

from __future__ import annotations

import html
import re
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    HRFlowable,
    Image,
    KeepTogether,
    ListFlowable,
    ListItem,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output" / "pdf"
ROSTER = ROOT / "docs" / "assets" / "character-roster-concept-v1.png"
BODY_FONT = "/System/Library/Fonts/Supplemental/AppleGothic.ttf"
DISPLAY_FONT = (
    "/System/Library/AssetsV2/com_apple_MobileAsset_Font8/"
    "c6821a5885b1c099dc7e340ca61cd3ddb35cb62e.asset/AssetData/"
    "HeadlineA.ttf"
)

INK = colors.HexColor("#10171C")
MUTED = colors.HexColor("#63707A")
ICE = colors.HexColor("#8DD3E8")
ICE_DARK = colors.HexColor("#23718A")
ALERT = colors.HexColor("#D55464")
PAPER = colors.HexColor("#F4F1E8")
PANEL = colors.HexColor("#E7EDF0")
NIGHT = colors.HexColor("#070C10")


def register_fonts() -> None:
    pdfmetrics.registerFont(TTFont("BodyKR", BODY_FONT))
    pdfmetrics.registerFont(TTFont("DisplayKR", DISPLAY_FONT))
    pdfmetrics.registerFontFamily(
        "BodyKR", normal="BodyKR", bold="BodyKR", italic="BodyKR", boldItalic="BodyKR"
    )


def clean_inline(text: str) -> str:
    escaped = html.escape(text.strip())
    escaped = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", escaped)
    escaped = re.sub(
        r"`([^`]+)`",
        r'<font name="BodyKR" color="#23718A">\1</font>',
        escaped,
    )
    return escaped.replace("  ", " ")


def make_styles():
    base = getSampleStyleSheet()
    return {
        "cover_kicker": ParagraphStyle(
            "CoverKicker",
            parent=base["Normal"],
            fontName="BodyKR",
            fontSize=9,
            leading=13,
            textColor=ICE,
            alignment=TA_CENTER,
            spaceAfter=9,
        ),
        "cover_title": ParagraphStyle(
            "CoverTitle",
            parent=base["Title"],
            fontName="DisplayKR",
            fontSize=35,
            leading=41,
            textColor=PAPER,
            alignment=TA_CENTER,
            spaceAfter=10,
        ),
        "cover_subtitle": ParagraphStyle(
            "CoverSubtitle",
            parent=base["Normal"],
            fontName="BodyKR",
            fontSize=13,
            leading=20,
            textColor=colors.HexColor("#C9D4D8"),
            alignment=TA_CENTER,
            spaceAfter=18,
        ),
        "h1": ParagraphStyle(
            "H1",
            parent=base["Heading1"],
            fontName="DisplayKR",
            fontSize=23,
            leading=29,
            textColor=INK,
            spaceBefore=8,
            spaceAfter=10,
            keepWithNext=True,
        ),
        "h2": ParagraphStyle(
            "H2",
            parent=base["Heading2"],
            fontName="DisplayKR",
            fontSize=16,
            leading=21,
            textColor=ICE_DARK,
            spaceBefore=12,
            spaceAfter=7,
            keepWithNext=True,
        ),
        "h3": ParagraphStyle(
            "H3",
            parent=base["Heading3"],
            fontName="BodyKR",
            fontSize=11,
            leading=16,
            textColor=ALERT,
            spaceBefore=8,
            spaceAfter=4,
            keepWithNext=True,
        ),
        "body": ParagraphStyle(
            "BodyKRStyle",
            parent=base["BodyText"],
            fontName="BodyKR",
            fontSize=9,
            leading=15,
            textColor=INK,
            spaceAfter=6,
            wordWrap="CJK",
        ),
        "bullet": ParagraphStyle(
            "BulletKR",
            parent=base["BodyText"],
            fontName="BodyKR",
            fontSize=8.6,
            leading=14,
            textColor=INK,
            leftIndent=1,
            wordWrap="CJK",
        ),
        "quote": ParagraphStyle(
            "QuoteKR",
            parent=base["BodyText"],
            fontName="BodyKR",
            fontSize=9.2,
            leading=15,
            textColor=colors.HexColor("#263A43"),
            borderColor=ICE,
            borderWidth=1,
            borderPadding=(7, 9, 7, 11),
            backColor=colors.HexColor("#E4F3F7"),
            spaceBefore=4,
            spaceAfter=9,
            wordWrap="CJK",
        ),
        "code": ParagraphStyle(
            "CodeKR",
            parent=base["Code"],
            fontName="BodyKR",
            fontSize=8,
            leading=13,
            textColor=colors.HexColor("#D7E3E8"),
            backColor=colors.HexColor("#172127"),
            borderPadding=8,
            leftIndent=7,
            rightIndent=7,
            spaceBefore=4,
            spaceAfter=8,
            wordWrap="CJK",
        ),
        "table": ParagraphStyle(
            "TableKR",
            parent=base["BodyText"],
            fontName="BodyKR",
            fontSize=7.2,
            leading=10.5,
            textColor=INK,
            wordWrap="CJK",
        ),
    }


def cover_story(title: str, kind: str, styles: dict) -> list:
    subtitle = (
        "게임이 내 말을 배운다.<br/>나는 게임이 무엇을 배웠는지 모른다."
        if "게임 기획서" in title
        else "생성 모델은 추천하고, 서버 규칙은 판정한다."
    )
    story = [
        Spacer(1, 21 * mm),
        Paragraph("NAN 2026 · GAME AI SUBMISSION", styles["cover_kicker"]),
        Paragraph(clean_inline(title), styles["cover_title"]),
        Paragraph(subtitle, styles["cover_subtitle"]),
        HRFlowable(width="32%", thickness=2, color=ICE, spaceBefore=1, spaceAfter=15),
    ]
    if ROSTER.exists():
        image = Image(str(ROSTER), width=174 * mm, height=78.3 * mm)
        story.extend([image, Spacer(1, 11 * mm)])
    story.extend(
        [
            Paragraph(
                "음성 협동형 학교 탈출 호러 · PC Web · 10-15분",
                styles["cover_subtitle"],
            ),
            Paragraph(
                f"{kind} · FINAL · 2026.08.10",
                styles["cover_kicker"],
            ),
            PageBreak(),
        ]
    )
    return story


def paragraph_from_lines(lines: list[str], styles: dict):
    text = " ".join(line.strip() for line in lines)
    return Paragraph(clean_inline(text), styles["body"])


def table_from_lines(lines: list[str], styles: dict, available_width: float):
    rows = []
    for line in lines:
        cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
        if all(re.fullmatch(r":?-{3,}:?", cell) for cell in cells):
            continue
        rows.append([Paragraph(clean_inline(cell), styles["table"]) for cell in cells])
    if not rows:
        return Spacer(1, 1)
    columns = max(len(row) for row in rows)
    for row in rows:
        row.extend([Paragraph("", styles["table"])] * (columns - len(row)))
    if columns == 2:
        widths = [available_width * 0.28, available_width * 0.72]
    elif columns == 3:
        widths = [available_width * 0.22, available_width * 0.27, available_width * 0.51]
    else:
        widths = [available_width / columns] * columns
    table = Table(rows, colWidths=widths, repeatRows=1, hAlign="LEFT")
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#15313D")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, -1), "BodyKR"),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#A8B8BF")),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, PANEL]),
                ("LEFTPADDING", (0, 0), (-1, -1), 5),
                ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    return table


def markdown_story(source: Path, styles: dict, available_width: float) -> tuple[str, list]:
    lines = source.read_text(encoding="utf-8").splitlines()
    title = next(line[2:].strip() for line in lines if line.startswith("# "))
    kind = "FINAL GAME DESIGN" if "게임 기획서" in title else "FINAL AI TECHNOLOGY"
    story = cover_story(title, kind, styles)
    title_seen = False
    i = 0
    while i < len(lines):
        line = lines[i].rstrip()
        if line.startswith("# ") and not title_seen:
            title_seen = True
            i += 1
            continue
        if not line or line == "---":
            i += 1
            continue
        if line.startswith("# "):
            story.extend([Paragraph(clean_inline(line[2:]), styles["h1"]), Spacer(1, 2 * mm)])
            i += 1
            continue
        if line.startswith("## "):
            heading = Paragraph(clean_inline(line[3:]), styles["h1"])
            story.extend(
                [
                    Spacer(1, 2 * mm),
                    HRFlowable(width="100%", thickness=0.8, color=ICE, spaceAfter=6),
                    heading,
                ]
            )
            i += 1
            continue
        if line.startswith("### "):
            story.append(Paragraph(clean_inline(line[4:]), styles["h2"]))
            i += 1
            continue
        if line.startswith("#### "):
            story.append(Paragraph(clean_inline(line[5:]), styles["h3"]))
            i += 1
            continue
        if line.startswith(">"):
            quote_lines = []
            while i < len(lines) and lines[i].lstrip().startswith(">"):
                quote_lines.append(lines[i].lstrip()[1:].strip())
                i += 1
            story.append(Paragraph(clean_inline(" ".join(quote_lines)), styles["quote"]))
            continue
        if line.startswith("|"):
            table_lines = []
            while i < len(lines) and lines[i].lstrip().startswith("|"):
                table_lines.append(lines[i])
                i += 1
            story.extend([table_from_lines(table_lines, styles, available_width), Spacer(1, 3 * mm)])
            continue
        if line.startswith("    "):
            code_lines = []
            while i < len(lines) and (lines[i].startswith("    ") or not lines[i].strip()):
                code_lines.append(lines[i][4:] if lines[i].startswith("    ") else "")
                i += 1
            story.append(
                Paragraph("<br/>".join(html.escape(item) for item in code_lines), styles["code"])
            )
            continue
        if re.match(r"^- ", line):
            items = []
            while i < len(lines) and re.match(r"^- ", lines[i].rstrip()):
                items.append(
                    ListItem(
                        Paragraph(clean_inline(lines[i].strip()[2:]), styles["bullet"]),
                        leftIndent=10,
                    )
                )
                i += 1
            story.append(
                ListFlowable(items, bulletType="bullet", bulletColor=ICE_DARK, leftIndent=15)
            )
            story.append(Spacer(1, 2 * mm))
            continue
        if re.match(r"^\d+\. ", line):
            items = []
            while i < len(lines) and re.match(r"^\d+\. ", lines[i].rstrip()):
                text = re.sub(r"^\d+\. ", "", lines[i].strip())
                items.append(ListItem(Paragraph(clean_inline(text), styles["bullet"]), leftIndent=11))
                i += 1
            story.append(
                ListFlowable(
                    items,
                    bulletType="1",
                    bulletFontName="BodyKR",
                    bulletFontSize=8,
                    leftIndent=17,
                )
            )
            story.append(Spacer(1, 2 * mm))
            continue

        paragraph_lines = [line]
        i += 1
        while i < len(lines):
            next_line = lines[i].rstrip()
            if (
                not next_line
                or next_line == "---"
                or next_line.startswith(("#", ">", "|", "    "))
                or re.match(r"^(- |\d+\. )", next_line)
            ):
                break
            paragraph_lines.append(next_line)
            i += 1
        story.append(paragraph_from_lines(paragraph_lines, styles))
    return title, story


def draw_first_page(canvas, doc) -> None:
    canvas.saveState()
    canvas.setFillColor(NIGHT)
    canvas.rect(0, 0, A4[0], A4[1], fill=1, stroke=0)
    canvas.setStrokeColor(colors.HexColor("#16323D"))
    canvas.setLineWidth(0.6)
    for inset in (12, 16):
        canvas.rect(inset * mm, inset * mm, A4[0] - inset * 2 * mm, A4[1] - inset * 2 * mm)
    canvas.restoreState()


def draw_later_pages(canvas, doc) -> None:
    canvas.saveState()
    page = canvas.getPageNumber()
    canvas.setFillColor(PAPER)
    canvas.rect(0, 0, A4[0], A4[1], fill=1, stroke=0)
    canvas.setStrokeColor(colors.HexColor("#B9C7CC"))
    canvas.line(19 * mm, A4[1] - 15 * mm, A4[0] - 19 * mm, A4[1] - 15 * mm)
    canvas.setFont("BodyKR", 7.3)
    canvas.setFillColor(MUTED)
    canvas.drawString(19 * mm, A4[1] - 11.5 * mm, "얼음, 땡! · NAN 2026")
    canvas.drawRightString(A4[0] - 19 * mm, 10 * mm, f"{page - 1:02d}")
    canvas.restoreState()


def build_one(source: Path, target: Path) -> None:
    styles = make_styles()
    doc = SimpleDocTemplate(
        str(target),
        pagesize=A4,
        rightMargin=19 * mm,
        leftMargin=19 * mm,
        topMargin=20 * mm,
        bottomMargin=17 * mm,
        title=source.stem,
        author="NAN",
        subject="NAN 2026 Game AI Submission",
    )
    _, story = markdown_story(source, styles, doc.width)
    doc.build(story, onFirstPage=draw_first_page, onLaterPages=draw_later_pages)


def main() -> None:
    register_fonts()
    OUTPUT.mkdir(parents=True, exist_ok=True)
    targets = [
        (
            ROOT / "docs" / "submission" / "final-game-design.md",
            OUTPUT / "ice-ddaeng-final-game-design.pdf",
        ),
        (
            ROOT / "docs" / "submission" / "final-ai-technology.md",
            OUTPUT / "ice-ddaeng-final-ai-technology.pdf",
        ),
    ]
    for source, target in targets:
        build_one(source, target)
        print(target)


if __name__ == "__main__":
    main()
