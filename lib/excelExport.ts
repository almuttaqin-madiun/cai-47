import * as XLSX from "xlsx";

export interface ExcelSheetData {
  sheetName: string;
  title?: string;
  subtitle?: string;
  headers: string[];
  rows: (string | number | boolean | null | undefined)[][];
  customColWidths?: number[];
}

/**
 * Helper to export clean, auto-sized Excel (.xlsx) files
 */
export function exportDataToExcel(
  filename: string,
  sheets: ExcelSheetData[]
) {
  const wb = XLSX.utils.book_new();

  sheets.forEach((sheet) => {
    const aoaData: any[][] = [];

    // Title & Metadata header banner
    if (sheet.title) {
      aoaData.push([sheet.title.toUpperCase()]);
      if (sheet.subtitle) {
        aoaData.push([sheet.subtitle]);
      }
      aoaData.push([`Diekspor pada: ${new Date().toLocaleString("id-ID")}`]);
      aoaData.push([`Total Data: ${sheet.rows.length} baris`]);
      aoaData.push([]); // blank spacing row
    }

    // Header row
    aoaData.push(sheet.headers);

    // Data rows
    sheet.rows.forEach((row) => {
      aoaData.push(row);
    });

    const ws = XLSX.utils.aoa_to_sheet(aoaData);

    // Auto-calculate column widths
    const maxCols = aoaData.reduce((max, row) => Math.max(max, row.length), 0);
    const cols: { wch: number }[] = [];

    for (let c = 0; c < maxCols; c++) {
      if (sheet.customColWidths && sheet.customColWidths[c]) {
        cols.push({ wch: sheet.customColWidths[c] });
        continue;
      }

      let maxLen = (sheet.headers[c] ? sheet.headers[c].length : 8) + 4;
      // Scan data rows for column length (skip title rows if merged/single)
      const dataStartRow = sheet.title ? (sheet.subtitle ? 5 : 4) : 1;
      for (let r = dataStartRow; r < aoaData.length; r++) {
        const val = aoaData[r][c];
        if (val !== undefined && val !== null) {
          const str = String(val);
          if (str.length + 3 > maxLen) {
            maxLen = Math.min(str.length + 4, 60);
          }
        }
      }
      cols.push({ wch: Math.max(maxLen, 10) });
    }

    ws["!cols"] = cols;

    // Sanitize sheet name (Excel max 31 chars, no special characters like / \ ? * : [ ])
    const safeSheetName = sheet.sheetName
      .replace(/[/\\?*:[\]]/g, "_")
      .trim()
      .slice(0, 31) || "Sheet1";

    XLSX.utils.book_append_sheet(wb, ws, safeSheetName);
  });

  const finalName = filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  XLSX.writeFile(wb, finalName);
}
