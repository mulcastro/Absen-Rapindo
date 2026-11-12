"""Pembuatan berkas rekap kehadiran dalam memori."""

from dataclasses import dataclass
from datetime import datetime
from html import escape
from io import BytesIO
from pathlib import Path
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Image, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from .models import Attendance, Participant, TrainingSession


@dataclass(frozen=True)
class ExportRow:
    number: int
    code: str
    name: str
    status: str
    marked_at: str
    location: str


def _local_time(value: datetime | None, timezone: str) -> str:
    if value is None:
        return "-"
    try:
        target_timezone = ZoneInfo(timezone)
    except ZoneInfoNotFoundError:
        target_timezone = ZoneInfo("UTC")
    return value.astimezone(target_timezone).strftime("%d-%m-%Y %H:%M")


def _spreadsheet_text(value: str) -> str:
    return f"'{value}" if value.startswith(("=", "+", "-", "@")) else value


def _indonesian_date(value: datetime, timezone: str) -> str:
    weekdays = ("Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu")
    months = (
        "Januari",
        "Februari",
        "Maret",
        "April",
        "Mei",
        "Juni",
        "Juli",
        "Agustus",
        "September",
        "Oktober",
        "November",
        "Desember",
    )
    try:
        target_timezone = ZoneInfo(timezone)
    except ZoneInfoNotFoundError:
        target_timezone = ZoneInfo("UTC")
    local_value = value.astimezone(target_timezone)
    return (
        f"{weekdays[local_value.weekday()]}, {local_value.day} "
        f"{months[local_value.month - 1]} {local_value.year}"
    )


def _time_range(session: TrainingSession) -> str:
    start = _local_time(session.starts_at, session.timezone)
    end = _local_time(session.ends_at, session.timezone)
    return f"{start[-5:]} - {end[-5:]} WIB"


def export_rows(
    session: TrainingSession,
    participants: list[Participant],
    attendance_by_participant: dict[str, Attendance],
) -> list[ExportRow]:
    rows = []
    for number, participant in enumerate(participants, start=1):
        attendance = attendance_by_participant.get(participant.id)
        rows.append(
            ExportRow(
                number=number,
                code=participant.code,
                name=participant.name,
                status=(attendance.status.title() if attendance else "Belum absen"),
                marked_at=_local_time(
                    attendance.marked_at if attendance else None,
                    session.timezone,
                ),
                location=(attendance.location_status or "-") if attendance else "-",
            )
        )
    return rows


def build_xlsx(session: TrainingSession, rows: list[ExportRow]) -> bytes:
    workbook = Workbook(write_only=False)
    sheet = workbook.active
    sheet.title = "Daftar Hadir"
    sheet.append(["DAFTAR HADIR PESERTA"])
    sheet.append(["Sesi", session.title])
    schedule = (
        f"{_local_time(session.starts_at, session.timezone)} - "
        f"{_local_time(session.ends_at, session.timezone)}"
    )
    sheet.append(["Jadwal", schedule])
    sheet.append([])
    headers = ["No.", "Kode Peserta", "Nama Peserta", "Status", "Waktu Kehadiran", "Lokasi"]
    sheet.append(headers)
    for row in rows:
        sheet.append(
            [
                row.number,
                _spreadsheet_text(row.code),
                _spreadsheet_text(row.name),
                row.status,
                row.marked_at,
                _spreadsheet_text(row.location),
            ]
        )

    sheet.merge_cells("A1:F1")
    sheet["A1"].font = Font(size=16, bold=True)
    sheet["A1"].alignment = Alignment(horizontal="center")
    for cell in sheet[5]:
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill("solid", fgColor="111111")
        cell.alignment = Alignment(horizontal="center")
    widths = {"A": 7, "B": 18, "C": 30, "D": 16, "E": 22, "F": 18}
    for column, width in widths.items():
        sheet.column_dimensions[column].width = width
    sheet.freeze_panes = "A6"
    sheet.auto_filter.ref = f"A5:F{max(5, 5 + len(rows))}"

    output = BytesIO()
    workbook.save(output)
    return output.getvalue()


def build_pdf(session: TrainingSession, rows: list[ExportRow]) -> bytes:
    output = BytesIO()
    document = SimpleDocTemplate(
        output,
        pagesize=A4,
        rightMargin=15 * mm,
        leftMargin=15 * mm,
        topMargin=12 * mm,
        bottomMargin=19 * mm,
        title=f"Daftar Hadir - {session.title}",
        author="LPK Rapindo",
    )
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "ReportTitle",
        parent=styles["Title"],
        alignment=TA_CENTER,
        fontName="Helvetica-Bold",
        fontSize=16,
        leading=19,
    )
    subtitle_style = ParagraphStyle(
        "ReportSubtitle", parent=styles["Normal"], alignment=TA_CENTER, fontSize=10, leading=12
    )
    metadata_style = ParagraphStyle(
        "ReportMetadata", parent=styles["Normal"], fontSize=8.5, leading=11
    )
    footer_style = ParagraphStyle(
        "ReportFooter", parent=styles["Normal"], alignment=TA_RIGHT, fontSize=9, leading=12
    )

    def draw_footer(canvas, doc):
        canvas.saveState()
        canvas.setStrokeColor(colors.HexColor("#B7B7B7"))
        canvas.setLineWidth(0.35)
        canvas.line(doc.leftMargin, 13 * mm, A4[0] - doc.rightMargin, 13 * mm)
        canvas.setFillColor(colors.HexColor("#667085"))
        canvas.setFont("Helvetica", 7)
        canvas.drawString(
            doc.leftMargin,
            8 * mm,
            "Dihasilkan otomatis oleh Aplikasi Absensi LPK Rapindo  |  "
            f"Kode dokumen: ABS/{session.starts_at.year}/"
            f"{session.starts_at.month:02d}/{session.id[:4].upper()}",
        )
        canvas.drawRightString(A4[0] - doc.rightMargin, 8 * mm, f"Halaman {doc.page}")
        canvas.restoreState()

    logo_path = Path(__file__).resolve().parents[2] / "public" / "logo-lpk-rapindo-1024.png"
    logo = Image(str(logo_path), width=34 * mm, height=24 * mm) if logo_path.exists() else ""
    header = Table(
        [
            [
                Paragraph(
                    "<font size=17><b>LPK RAPINDO</b></font><br/>"
                    "Jl. Moh. Taher No. 169-170, Desa Cot Mesjid, "
                    "Kecamatan Lueng Bata Kota Banda Aceh<br/>"
                    "E-mail           : www.rapyrapindo@gmail.com<br/>"
                    "Contact Person   : 0651 - 8083763 / 0821 64833402",
                    ParagraphStyle(
                        "ReportHeader",
                        parent=styles["Normal"],
                        fontSize=8.5,
                        leading=11,
                    ),
                ),
                logo,
            ]
        ],
        colWidths=[145 * mm, 35 * mm],
    )
    header.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("ALIGN", (1, 0), (1, 0), "RIGHT"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
                ("LINEBELOW", (0, 0), (-1, -1), 2, colors.HexColor("#4472C4")),
            ]
        )
    )
    generated_at = session.starts_at.astimezone(ZoneInfo(session.timezone)).year
    story = [
        header,
        Spacer(1, 7 * mm),
        Paragraph("DAFTAR HADIR PESERTA", title_style),
        Paragraph("Attendance Record", subtitle_style),
        Spacer(1, 4 * mm),
    ]
    metadata = [
        [
            Paragraph(f"<b>Nama Sesi</b>      : {escape(session.title)}", metadata_style),
            Paragraph(f"<b>Waktu</b>           : {escape(_time_range(session))}", metadata_style),
        ],
        [
            Paragraph(
                f"<b>Hari / Tanggal</b> : "
                f"{escape(_indonesian_date(session.starts_at, session.timezone))}",
                metadata_style,
            ),
            Paragraph("<b>Tempat</b>          : ..............................", metadata_style),
        ],
        [
            Paragraph(f"<b>Jumlah Peserta</b>  : {len(rows)} orang", metadata_style),
            Paragraph("<b>Narasumber</b>       : ..............................", metadata_style),
        ],
    ]
    metadata_table = Table(metadata, colWidths=[90 * mm, 90 * mm])
    metadata_table.setStyle(
        TableStyle(
            [
                ("BOX", (0, 0), (-1, -1), 0.8, colors.black),
                ("LINEBEFORE", (0, 0), (0, -1), 2, colors.HexColor("#C00000")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 4),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ]
        )
    )
    story.extend([metadata_table, Spacer(1, 5 * mm)])
    data = [["No.", "Kode", "Nama Peserta", "Status", "Waktu Hadir", "Lokasi"]]
    data.extend(
        [
            [
                str(row.number),
                escape(row.code),
                escape(row.name),
                row.status,
                row.marked_at,
                escape(row.location),
            ]
            for row in rows
        ]
    )
    table = Table(
        data,
        repeatRows=1,
        colWidths=[11 * mm, 26 * mm, 53 * mm, 29 * mm, 34 * mm, 27 * mm],
    )
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#111111")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#B7B7B7")),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F3F3F3")]),
                ("LEFTPADDING", (0, 0), (-1, -1), 4),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                ("ALIGN", (0, 0), (1, -1), "CENTER"),
                ("ALIGN", (3, 0), (-1, -1), "CENTER"),
            ]
        )
    )
    story.extend(
        [
            table,
            Spacer(1, 4 * mm),
            Paragraph(
                "Keterangan: Status kehadiran, waktu hadir, dan lokasi terisi otomatis "
                "oleh aplikasi saat peserta melakukan absen.",
                ParagraphStyle(
                    "ReportNote",
                    parent=styles["Normal"],
                    fontSize=8,
                    leading=10,
                ),
            ),
            Spacer(1, 8 * mm),
            Paragraph(
                f"Banda Aceh, ..... ................. {generated_at}<br/><br/>"
                "LPK Rapindo<br/><br/><br/>"
                "<b>Siswandi</b><br/>Ketua LPK",
                footer_style,
            ),
        ]
    )
    document.build(story, onFirstPage=draw_footer, onLaterPages=draw_footer)
    return output.getvalue()
