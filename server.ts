import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import Database from "better-sqlite3";
import { fileURLToPath } from "url";
import { GoogleSpreadsheet } from "google-spreadsheet";
import { JWT } from "google-auth-library";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("reports.db");

const SHEET_ID = "17VVgZJrpEByKRqMOAEZU0cDD8XwJSf7xsPVvbBHPU4o";
const LIET_KE_GID = "528046969";

// Initialize database
db.exec(`
  CREATE TABLE IF NOT EXISTS report_definitions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT,
    classification TEXT,
    specialist TEXT,
    cycle TEXT,
    deadline TEXT,
    unit TEXT,
    directing_document TEXT
  );

  CREATE TABLE IF NOT EXISTS report_submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    report_definition_id INTEGER,
    unit_name TEXT,
    date_sent TEXT,
    attachment_link TEXT,
    period TEXT,
    year INTEGER,
    FOREIGN KEY(report_definition_id) REFERENCES report_definitions(id)
  );
`);

async function getGoogleSheet() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  let privateKey = process.env.GOOGLE_PRIVATE_KEY;

  if (!email || !privateKey) {
    console.warn("Google Sheets credentials missing. Submission to sheet will fail.");
    return null;
  }

  // Robust parsing of the private key to handle various environment variable formats
  // 1. Handle literal \n (backslash + n) and actual newlines
  privateKey = privateKey.replace(/\\n/g, "\n");
  
  // 2. Remove any wrapping double or single quotes that might have been added
  privateKey = privateKey.replace(/^["']|["']$/g, "");

  // 3. Trim whitespace
  privateKey = privateKey.trim();

  // 4. Ensure the key has the correct PEM headers if they are somehow mangled
  if (privateKey && !privateKey.startsWith("-----BEGIN PRIVATE KEY-----")) {
    // If it's just the base64 part, wrap it (though usually it's the whole thing)
    if (!privateKey.includes("-----")) {
       privateKey = `-----BEGIN PRIVATE KEY-----\n${privateKey}\n-----END PRIVATE KEY-----`;
    }
  }

  try {
    console.log(`Attempting to connect with Service Account: ${email}`);
    const serviceAccountAuth = new JWT({
      email: email,
      key: privateKey,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });

    const doc = new GoogleSpreadsheet(SHEET_ID, serviceAccountAuth);
    await doc.loadInfo();
    console.log(`Successfully connected to Google Sheet: "${doc.title}"`);
    return doc;
  } catch (error: any) {
    console.error("Google Sheets Auth Error Details:");
    console.error(`- Message: ${error.message}`);
    if (error.message.includes("PEM_read_bio_PrivateKey")) {
      console.error("- Hint: The GOOGLE_PRIVATE_KEY format is invalid. Check for missing headers or incorrect newline characters.");
    } else if (error.message.includes("403") || error.message.includes("permission")) {
      console.error("- Hint: Permission denied. Make sure you have shared the Google Sheet with the Service Account email.");
    } else if (error.message.includes("404")) {
      console.error("- Hint: Sheet ID not found. Check if SHEET_ID is correct.");
    }
    return null;
  }
}

async function fetchReportDefinitions() {
  try {
    const csvUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${LIET_KE_GID}`;
    const response = await fetch(csvUrl);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch CSV from Google Sheets: ${response.status} ${response.statusText}`);
    }

    const csvText = await response.text();
    
    if (csvText.startsWith("<!DOCTYPE html>") || csvText.startsWith("<html>")) {
      throw new Error("Received HTML instead of CSV from Google Sheets. The sheet might not be public or the GID is wrong.");
    }
    const lines = csvText.split("\n").slice(1); // Skip header
    const reports = lines.map(line => {
      const parts = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/); // Split by comma not inside quotes
      if (parts.length < 8) return null;
      return {
        content: parts[1]?.replace(/^"|"$/g, "").trim(),
        classification: parts[2]?.replace(/^"|"$/g, "").trim(),
        specialist: parts[3]?.replace(/^"|"$/g, "").trim(),
        cycle: parts[4]?.replace(/^"|"$/g, "").trim(),
        deadline: parts[5]?.replace(/^"|"$/g, "").trim(),
        unit: parts[6]?.replace(/^"|"$/g, "").trim(),
        directing_document: parts[7]?.replace(/^"|"$/g, "").trim()
      };
    }).filter(r => r && r.content);

    // Update local DB cache
    db.transaction(() => {
      db.prepare("DELETE FROM report_definitions").run();
      
      const insert = db.prepare(`
        INSERT INTO report_definitions (content, classification, specialist, cycle, deadline, unit, directing_document)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      for (const report of reports) {
        insert.run(
          report.content,
          report.classification,
          report.specialist,
          report.cycle,
          report.deadline,
          report.unit,
          report.directing_document
        );
      }
    })();
    console.log(`Fetched ${reports.length} report definitions from Google Sheets.`);
  } catch (error) {
    console.error("Error fetching report definitions:", error);
  }
}

// Fetch on startup
fetchReportDefinitions();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.get("/api/all-reports", (req, res) => {
    const reports = db.prepare("SELECT * FROM report_definitions").all();
    res.json(reports);
  });

  app.get("/api/reports", (req, res) => {
    const unitName = req.query.unitName as string;
    
    // Logic:
    // 1. unit = 'Tất cả' AND unitName NOT IN ('Phòng kỹ thuật', 'Văn thư PKT')
    // 2. unit = 'Điện lực' AND unitName starts with 'ĐL'
    // 3. unit contains unitName (comma separated)
    const reports = db.prepare(`
      SELECT * FROM report_definitions 
      WHERE (unit = 'Tất cả' AND ? NOT IN ('Phòng kỹ thuật', 'Văn thư PKT'))
      OR (unit = 'Điện lực' AND ? LIKE 'ĐL%')
      OR unit LIKE '%' || ? || '%'
    `).all(unitName, unitName, unitName);
    res.json(reports);
  });

  app.get("/api/submissions", (req, res) => {
    const { unitName } = req.query;
    const submissions = db.prepare(`
      SELECT * FROM report_submissions 
      WHERE unit_name = ?
    `).all(unitName);
    res.json(submissions);
  });

  app.get("/api/form-metadata", async (req, res) => {
    try {
      const doc = await getGoogleSheet();
      if (!doc) throw new Error("Could not connect to Google Sheets");
      
      const sheet = doc.sheetsByTitle["Thu vien"];
      if (!sheet) throw new Error("Sheet 'Thu vien' not found");

      await sheet.loadCells({
        startRowIndex: 0,
        endRowIndex: 200,
        startColumnIndex: 0,
        endColumnIndex: 6
      });

      const classifications: string[] = [];
      const specialists: string[] = [];
      const cycles: string[] = [];
      const deadlines: string[] = [];
      const units: string[] = [];

      for (let i = 1; i < 200; i++) {
        const classCell = sheet.getCell(i, 0);
        const specCell = sheet.getCell(i, 1);
        const cycleCell = sheet.getCell(i, 3);
        const deadlineCell = sheet.getCell(i, 5);
        const unitCell = sheet.getCell(i, 4);

        if (classCell.value) classifications.push(String(classCell.value).trim());
        if (specCell.value) specialists.push(String(specCell.value).trim());
        if (cycleCell.value) cycles.push(String(cycleCell.value).trim());
        if (deadlineCell.value) deadlines.push(String(deadlineCell.value).trim());
        if (unitCell.value) units.push(String(unitCell.value).trim());
      }

      res.json({
        classifications: Array.from(new Set(classifications)),
        specialists: Array.from(new Set(specialists)),
        cycles: Array.from(new Set(cycles)),
        deadlines: Array.from(new Set(deadlines)),
        units: Array.from(new Set(units))
      });
    } catch (error) {
      console.error("Error fetching form metadata:", error);
      res.status(500).json({ error: "Failed to fetch metadata" });
    }
  });

  app.get("/api/units", async (req, res) => {
    try {
      const doc = await getGoogleSheet();
      if (!doc) throw new Error("Could not connect to Google Sheets");
      
      const sheet = doc.sheetsByTitle["Thu vien"];
      if (!sheet) {
        console.error("Sheet 'Thu vien' not found. Available sheets:", doc.sheetsByIndex.map(s => s.title));
        throw new Error("Sheet 'Thu vien' not found");
      }

      // Load cells for column E (index 4)
      await sheet.loadCells({
        startRowIndex: 0,
        endRowIndex: 200, // Load up to 200 rows
        startColumnIndex: 4,
        endColumnIndex: 5
      });

      const units: string[] = [];
      for (let i = 1; i < 200; i++) { // Start from row 1 to skip header
        const cell = sheet.getCell(i, 4);
        if (cell.value) {
          units.push(String(cell.value).trim());
        }
      }

      res.json(Array.from(new Set(units))); // Return unique units
    } catch (error) {
      console.error("Error fetching units from Google Sheets:", error);
      res.status(500).json({ error: "Failed to fetch units" });
    }
  });

  app.get("/api/all-history", async (req, res) => {
    try {
      const doc = await getGoogleSheet();
      if (!doc) throw new Error("Could not connect to Google Sheets");
      
      const sheet = doc.sheetsByTitle["Lich su"];
      if (!sheet) throw new Error("Sheet 'Lich su' not found");

      const rows = await sheet.getRows();
      const history = rows.map(row => ({
        timestamp: row.get("Thời gian cập nhật"),
        unit: row.get("Đơn vị báo cáo"),
        content: row.get("Nội dung báo cáo"),
        classification: row.get("Phân loại"),
        specialist: row.get("Phụ trách"),
        cycle: row.get("Chu kỳ"),
        deadline: row.get("Thời hạn"),
        period: row.get("Giá trị báo cáo"),
        year: row.get("Năm"),
        dateSent: row.get("Ngày gửi báo cáo"),
        attachment: row.get("Link đính kèm")
      }));

      res.json(history);
    } catch (error) {
      console.error("Error fetching all history:", error);
      res.status(500).json({ error: "Failed to fetch all history" });
    }
  });

  app.get("/api/history", async (req, res) => {
    const { unitName } = req.query;
    console.log(`Fetching history for unit: ${unitName}`);
    try {
      const doc = await getGoogleSheet();
      if (!doc) throw new Error("Could not connect to Google Sheets");
      
      const sheet = doc.sheetsByTitle["Lich su"];
      if (!sheet) {
        console.error("Sheet 'Lich su' not found. Available sheets:", doc.sheetsByIndex.map(s => `${s.title} (ID: ${s.sheetId})`));
        throw new Error("Sheet 'Lich su' not found");
      }

      const rows = await sheet.getRows();
      console.log(`Found ${rows.length} rows in 'Lich su' sheet`);
      if (rows.length > 0) {
        console.log("Sheet headers (from first row keys):", Object.keys(rows[0].toObject()));
      }

      const history = rows
        .filter(row => {
          const rowUnit = String(row.get("Đơn vị báo cáo") || "").trim();
          const targetUnit = String(unitName || "").trim();
          return rowUnit === targetUnit;
        })
        .map(row => ({
          timestamp: row.get("Thời gian cập nhật"),
          unit: row.get("Đơn vị báo cáo"),
          content: row.get("Nội dung báo cáo"),
          classification: row.get("Phân loại"),
          specialist: row.get("Phụ trách"),
          cycle: row.get("Chu kỳ"),
          deadline: row.get("Thời hạn"),
          period: row.get("Giá trị báo cáo"),
          year: row.get("Năm"),
          dateSent: row.get("Ngày gửi báo cáo"),
          attachment: row.get("Link đính kèm")
        }));

      console.log(`Filtered history: ${history.length} items`);
      res.json(history);
    } catch (error) {
      console.error("Error fetching history from Google Sheets:", error);
      res.status(500).json({ error: "Failed to fetch history" });
    }
  });

  app.post("/api/submissions", async (req, res) => {
    const { reportDefinitionId, unitName, dateSent, attachmentLink, period } = req.body;
    const year = new Date().getFullYear();
    
    // 1. Save to local DB
    const existing = db.prepare(`
      SELECT id FROM report_submissions 
      WHERE report_definition_id = ? AND unit_name = ? AND period = ? AND year = ?
    `).get(reportDefinitionId, unitName, period, year) as { id: number } | undefined;

    if (existing) {
      db.prepare(`
        UPDATE report_submissions 
        SET date_sent = ?, attachment_link = ? 
        WHERE id = ?
      `).run(dateSent, attachmentLink, existing.id);
    } else {
      db.prepare(`
        INSERT INTO report_submissions (report_definition_id, unit_name, date_sent, attachment_link, period, year)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(reportDefinitionId, unitName, dateSent, attachmentLink, period, year);
    }

    // 2. Sync to Google Sheets
    try {
      const doc = await getGoogleSheet();
      if (doc) {
        // Use the specific GID for 'cap nhat' sheet: 925215305
        const sheet = doc.sheetsById["925215305"] || doc.sheetsByTitle["cap nhat"];
        if (sheet) {
          await sheet.loadHeaderRow();
          const headers = sheet.headerValues;
          const reportDef = db.prepare("SELECT * FROM report_definitions WHERE id = ?").get(reportDefinitionId) as any;
          
          const rowData: any = {};
          const findHeader = (index: number, possibleNames: string[]) => {
            // 1. Try exact match
            for (const name of possibleNames) {
              if (headers.includes(name)) return name;
            }
            // 2. Try case-insensitive and trimmed match
            for (const name of possibleNames) {
              const found = headers.find(h => h && h.toLowerCase().trim() === name.toLowerCase().trim());
              if (found) return found;
            }
            // 3. Try partial match
            for (const name of possibleNames) {
              const found = headers.find(h => h && h.toLowerCase().includes(name.toLowerCase()));
              if (found) return found;
            }
            // 4. Fallback to index
            if (headers[index] && headers[index].trim()) return headers[index];
            return headers[index] || "";
          };

          rowData[findHeader(0, ["Thời gian cập nhật", "Timestamp"])] = new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
          rowData[findHeader(1, ["Đơn vị báo cáo", "Đơn vị", "Don vi"])] = unitName;
          rowData[findHeader(2, ["Nội dung báo cáo", "Nội dung", "Noi dung"])] = reportDef.content;
          rowData[findHeader(3, ["Phân loại", "Phan loai"])] = reportDef.classification;
          rowData[findHeader(4, ["Phụ trách", "Chuyên viên", "Người phụ trách", "Phu trach"])] = reportDef.specialist;
          rowData[findHeader(5, ["Chu kỳ", "Chu ky"])] = reportDef.cycle;
          rowData[findHeader(6, ["Thời hạn", "Thoi han"])] = reportDef.deadline;
          rowData[findHeader(7, ["Giá trị báo cáo", "Giá trị", "Gia tri"])] = period;
          rowData[findHeader(8, ["Năm", "Nam"])] = year;
          rowData[findHeader(9, ["Ngày gửi báo cáo", "Ngày gửi", "Ngay gui"])] = dateSent;
          rowData[findHeader(10, ["Link đính kèm", "Link"])] = attachmentLink;

          try {
            await sheet.addRow(rowData);
          } catch (err: any) {
            if (err.message?.includes("protected cell")) {
              const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
              throw new Error(`Trang tính "cap nhat" đang bị bảo vệ. Vui lòng cấp quyền chỉnh sửa cho email: ${email} trong phần "Trang tính và dải ô được bảo vệ" trên Google Sheets.`);
            }
            throw err;
          }
        } else {
          console.error("Sheet 'cap nhat' (GID: 925215305) not found.");
        }
      }
    } catch (error: any) {
      console.error("Error syncing to Google Sheets:", error);
      // We don't throw here to avoid blocking the local DB save, but we could
    }

    res.json({ message: "Updated successfully" });
  });

  app.post("/api/report-definitions", async (req, res) => {
    const { content, classification, specialist, cycle, deadline, unit, directingDocument } = req.body;
    
    try {
      const doc = await getGoogleSheet();
      if (doc) {
        const sheet = doc.sheetsById[LIET_KE_GID] || doc.sheetsByTitle["Liet ke"];
        if (sheet) {
          await sheet.loadHeaderRow();
          const headers = sheet.headerValues;
          
          // Map our data to the actual headers in the sheet
          const rowData: any = {};
          
          // Helper to find header by partial match or index
          const findHeader = (index: number, possibleNames: string[]) => {
            // 1. Try exact match
            for (const name of possibleNames) {
              if (headers.includes(name)) return name;
            }
            // 2. Try case-insensitive and trimmed match
            for (const name of possibleNames) {
              const found = headers.find(h => h && h.toLowerCase().trim() === name.toLowerCase().trim());
              if (found) return found;
            }
            // 3. Try partial match (if header contains any of the possible names)
            for (const name of possibleNames) {
              const found = headers.find(h => h && h.toLowerCase().includes(name.toLowerCase()));
              if (found) return found;
            }
            // 4. Fallback to index if it exists and is not empty
            if (headers[index] && headers[index].trim()) return headers[index];
            
            // 5. Last resort: find any header that looks like it might be the one
            return headers[index] || headers.find(h => h && h.length > 0) || "";
          };

          rowData[findHeader(1, ["Nội dung báo cáo"])] = content;
          rowData[findHeader(2, ["Phân loại"])] = classification;
          rowData[findHeader(3, ["Phụ trách"])] = specialist;
          rowData[findHeader(4, ["Chu kỳ", "Chu Kỳ"])] = cycle;
          rowData[findHeader(5, ["Thời hạn"])] = deadline;
          rowData[findHeader(6, ["Đơn vị"])] = unit;
          rowData[findHeader(7, ["Văn bản chỉ đạo"])] = directingDocument;

          try {
            await sheet.addRow(rowData);
          } catch (err: any) {
            if (err.message?.includes("protected cell")) {
              const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
              throw new Error(`Trang tính "Liet ke" đang bị bảo vệ. Vui lòng cấp quyền chỉnh sửa cho email: ${email} trong phần "Trang tính và dải ô được bảo vệ" trên Google Sheets.`);
            }
            throw err;
          }
          
          // Refresh local cache
          await fetchReportDefinitions();
          res.json({ message: "Report definition added successfully" });
        } else {
          throw new Error("Sheet 'Liet ke' not found");
        }
      } else {
        throw new Error("Could not connect to Google Sheets");
      }
    } catch (error: any) {
      console.error("Error adding report definition:", error);
      res.status(500).json({ error: error.message || "Failed to add report definition" });
    }
  });

  app.post("/api/refresh-definitions", async (req, res) => {
    await fetchReportDefinitions();
    res.json({ message: "Definitions refreshed" });
  });

  // 404 for API routes - prevent falling through to Vite/SPA
  app.all("/api/*", (req, res) => {
    console.warn(`404 API Not Found: ${req.method} ${req.url}`);
    res.status(404).json({ error: "API route not found" });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
