"""Pembuatan berkas rekap kehadiran dalam memori."""

from dataclasses import dataclass
from datetime import datetime
from html import escape
from io import BytesIO
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

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
        pagesize=landscape(A4),
        rightMargin=12 * mm,
        leftMargin=12 * mm,
        topMargin=12 * mm,
        bottomMargin=12 * mm,
        title=f"Daftar Hadir - {session.title}",
        author="LPK Rapindo",
    )
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "ReportTitle", parent=styles["Title"], alignment=TA_CENTER, fontSize=16, leading=19
    )
    subtitle_style = ParagraphStyle(
        "ReportSubtitle", parent=styles["Normal"], alignment=TA_CENTER, fontSize=10, leading=12
    )
    metadata_style = ParagraphStyle(
        "ReportMetadata", parent=styles["Normal"], fontSize=9, leading=13
    )
    footer_style = ParagraphStyle(
        "ReportFooter", parent=styles["Normal"], alignment=TA_CENTER, fontSize=9, leading=12
    )
    generated_at = session.starts_at.astimezone(
        ZoneInfo(session.timezone)
    ).year
    story = [
        Paragraph("DAFTAR HADIR PESERTA", title_style),
        Paragraph("Attendance Record", subtitle_style),
        Spacer(1, 5 * mm),
    ]
    metadata = [
        [
            Paragraph(f"<b>Nama Sesi</b><br/>: {escape(session.title)}", metadata_style),
            Paragraph(f"<b>Waktu</b><br/>: {escape(_time_range(session))}", metadata_style),
        ],
        [
            Paragraph(
                f"<b>Hari / Tanggal</b><br/>: "
                f"{escape(_indonesian_date(session.starts_at, session.timezone))}",
                metadata_style,
            ),
            Paragraph("<b>Tempat</b><br/>: ", metadata_style),
        ],
        [
            Paragraph(f"<b>Jumlah Peserta</b><br/>: {len(rows)} orang", metadata_style),
            Paragraph("<b>Narasumber</b><br/>: ", metadata_style),
        ],
    ]
    metadata_table = Table(metadata, colWidths=[125 * mm, 125 * mm])
    metadata_table.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 1),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 1),
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
        colWidths=[12 * mm, 30 * mm, 65 * mm, 32 * mm, 45 * mm, 45 * mm],
    )
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#111111")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#777777")),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F3F3F3")]),
                ("LEFTPADDING", (0, 0), (-1, -1), 4),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    story.extend(
        [
            table,
            Spacer(1, 5 * mm),
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
    document.build(story)
    return output.getvalue()
