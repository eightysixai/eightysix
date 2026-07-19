import ExcelJS from "exceljs";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export interface ReportColumn {
  header: string;
  key: string;
}

export async function exportToExcel(
  title: string,
  columns: ReportColumn[],
  rows: Record<string, string | number>[],
) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(title.slice(0, 31));
  sheet.columns = columns.map((c) => ({ header: c.header, key: c.key, width: 18 }));
  sheet.getRow(1).font = { bold: true };
  rows.forEach((row) => sheet.addRow(row));

  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(
    new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    `${slugify(title)}.xlsx`,
  );
}

export function exportToPdf(
  title: string,
  columns: ReportColumn[],
  rows: Record<string, string | number>[],
) {
  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.text(title, 14, 18);
  doc.setFontSize(10);
  doc.setTextColor(120);
  doc.text(`Generated ${new Date().toLocaleString()}`, 14, 24);

  autoTable(doc, {
    startY: 30,
    head: [columns.map((c) => c.header)],
    body: rows.map((row) => columns.map((c) => String(row[c.key] ?? ""))),
    styles: { fontSize: 9 },
    headStyles: { fillColor: [10, 10, 10] },
  });

  doc.save(`${slugify(title)}.pdf`);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
