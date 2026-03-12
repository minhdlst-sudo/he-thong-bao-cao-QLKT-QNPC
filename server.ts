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
    const serviceAccountAuth = new JWT({
      email: email,
      key: privateKey,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });

    const doc = new GoogleSpreadsheet(SHEET_ID, serviceAccountAuth);
    await doc.loadInfo();
    console.log(`Successfully connected to Google Sheet: ${doc.title}`);
    return doc;
  } catch (error) {
    console.error("Failed to initialize Google Sheets Auth or loadInfo:", error);
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
      db.prepare("DELETE FROM report_submissions").run();
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
  app.get("/api/reports", (req, res) => {
    const unitName = req.query.unitName as string;
    // If unitName is "Tất cả" or "Điện lực", it matches many units.
    // For simplicity, we'll return reports where unit is 'Tất cả', 'Điện lực' or the specific unit name.
    const reports = db.prepare(`
      SELECT * FROM report_definitions 
      WHERE unit = 'Tất cả' 
      OR unit = 'Điện lực' 
      OR unit = ?
    `).all(unitName);
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
          const reportDef = db.prepare("SELECT * FROM report_definitions WHERE id = ?").get(reportDefinitionId) as any;
          await sheet.addRow({
            "Thời gian cập nhật": new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }),
            "Đơn vị báo cáo": unitName,
            "Nội dung báo cáo": reportDef.content,
            "Phân loại": reportDef.classification,
            "Phụ trách": reportDef.specialist,
            "Chu kỳ": reportDef.cycle,
            "Thời hạn": reportDef.deadline,
            "Giá trị báo cáo": period,
            "Năm": year,
            "Ngày gửi báo cáo": dateSent,
            "Link đính kèm": attachmentLink
          });
        } else {
          console.error("Sheet 'cap nhat' (GID: 925215305) not found.");
        }
      }
    } catch (error) {
      console.error("Error syncing to Google Sheets:", error);
    }

    res.json({ message: "Updated successfully" });
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
