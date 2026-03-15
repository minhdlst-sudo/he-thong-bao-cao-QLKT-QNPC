import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleSpreadsheet } from "google-spreadsheet";
import { JWT } from "google-auth-library";
import dotenv from "dotenv";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Firebase Admin
let db: any;
try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    if (getApps().length === 0) {
      initializeApp({
        credential: cert(serviceAccount)
      });
    }
    // CRITICAL: Use the specific database ID from your config
    db = getFirestore("ai-studio-f099909a-83bc-4220-985c-854c259d85ed");
    console.log("Firebase Admin initialized with database: ai-studio-f099909a-83bc-4220-985c-854c259d85ed");
  } else {
    console.warn("FIREBASE_SERVICE_ACCOUNT missing. Firestore operations will fail on server.");
  }
} catch (error) {
  console.error("Error initializing Firebase Admin:", error);
}

const SHEET_ID = process.env.GOOGLE_SHEET_ID || "17VVgZJrpEByKRqMOAEZU0cDD8XwJSf7xsPVvbBHPU4o";
const LIET_KE_GID = "528046969";

async function getGoogleSheet() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  let privateKey = process.env.GOOGLE_PRIVATE_KEY;

  if (!email || !privateKey) {
    console.warn("Google Sheets credentials missing.");
    return null;
  }

  // Improved private key handling for Vercel
  privateKey = privateKey.replace(/\\n/g, "\n")
                         .replace(/^["']|["']$/g, "")
                         .trim();
  
  if (privateKey && !privateKey.startsWith("-----BEGIN PRIVATE KEY-----")) {
    privateKey = `-----BEGIN PRIVATE KEY-----\n${privateKey}\n-----END PRIVATE KEY-----`;
  }

  try {
    const serviceAccountAuth = new JWT({
      email: email,
      key: privateKey,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });

    const doc = new GoogleSpreadsheet(SHEET_ID, serviceAccountAuth);
    await doc.loadInfo();
    return doc;
  } catch (error: any) {
    console.error("Google Sheets Auth Error:", error.message);
    return null;
  }
}

async function fetchReportDefinitions() {
  if (!db) return;
  try {
    // Use Service Account to fetch definitions instead of public CSV for better reliability
    const doc = await getGoogleSheet();
    if (!doc) {
      console.warn("Could not connect to Google Sheets for definitions sync. Check credentials and sharing permissions.");
      return;
    }

    const sheet = doc.sheetsById[LIET_KE_GID] || doc.sheetsByTitle["Liet ke"];
    if (!sheet) {
      console.error(`Sheet with GID ${LIET_KE_GID} or title 'Liet ke' not found.`);
      return;
    }

    const rows = await sheet.getRows();
    console.log(`Found ${rows.length} rows in sheet.`);

    const reports = rows.map((row, index) => {
      // Try to get by name (case-insensitive and trimmed), fallback to index if needed
      const getVal = (possibleNames: string[]) => {
        // Get all keys from the row to find a match
        const keys = row.getRawData() ? Object.keys(row.getRawData()) : [];
        for (const name of possibleNames) {
          const target = name.toLowerCase().trim();
          // Try exact match first
          let val = row.get(name);
          if (val !== undefined && val !== null) return String(val).trim();
          
          // Try case-insensitive match
          const matchingKey = keys.find(k => k.toLowerCase().trim() === target);
          if (matchingKey) {
            val = row.get(matchingKey);
            if (val !== undefined && val !== null) return String(val).trim();
          }
        }
        return "";
      };

      return {
        content: getVal(["Nội dung báo cáo", "Noi dung bao cao", "Content"]),
        classification: getVal(["Phân loại", "Phan loai", "Classification"]),
        specialist: getVal(["Phụ trách", "Phu trach", "Specialist"]),
        cycle: getVal(["Chu kỳ", "Chu ky", "Cycle"]),
        deadline: getVal(["Thời hạn", "Thoi han", "Deadline"]),
        unit: getVal(["Đơn vị", "Don vi", "Unit"]),
        directingDocument: getVal(["Văn bản chỉ đạo", "Van ban chi dao", "Document"])
      };
    }).filter(r => r.content && r.content.toLowerCase() !== "nội dung báo cáo");

    if (reports.length === 0) {
      console.warn("No reports found in Google Sheet. Check column headers: 'Nội dung báo cáo', 'Phân loại', etc.");
      return { success: false, message: "No reports found in sheet" };
    }

    // Sync to Firestore
    const collectionRef = db.collection("report_definitions");
    let added = 0;
    let updated = 0;
    
    for (const report of reports) {
      const q = await collectionRef.where("content", "==", report.content).limit(1).get();
      if (q.empty) {
        await collectionRef.add(report);
        added++;
      } else {
        await q.docs[0].ref.update(report);
        updated++;
      }
    }
    const msg = `Successfully synced ${reports.length} reports (Added: ${added}, Updated: ${updated})`;
    console.log(msg);
    return { success: true, message: msg };
  } catch (error: any) {
    console.error("Error fetching report definitions:", error);
    return { success: false, error: error.message };
  }
}

// Initial sync - don't block startup
if (process.env.NODE_ENV === "production") {
  fetchReportDefinitions().catch(err => console.error("Initial sync failed:", err));
}

const app = express();

async function setupApp() {
  const PORT = 3000;

  app.use(express.json());

  // Manual Sync Endpoint
  app.post("/api/refresh-definitions", async (req, res) => {
    const result = await fetchReportDefinitions();
    res.json(result);
  });

  app.get("/api/sync", async (req, res) => {
    const result = await fetchReportDefinitions();
    res.json(result);
  });

  // API Routes
  app.get("/api/all-reports", async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not initialized" });
    const snapshot = await db.collection("report_definitions").get();
    const reports = snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
    res.json(reports);
  });

  app.get("/api/reports", async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not initialized" });
    const unitName = (req.query.unitName as string || "").trim().toLowerCase();
    const snapshot = await db.collection("report_definitions").get();
    const allReports = snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
    
    const isDLUnit = unitName.startsWith("đl") || unitName.startsWith("điện lực");
    const filteredReports = allReports.filter((r: any) => {
      const reportUnit = (r.unit || "").toLowerCase();
      if (reportUnit.includes("tất cả")) return true;
      if (isDLUnit && reportUnit.includes("điện lực")) return true;
      if (reportUnit.includes(unitName)) return true;
      return false;
    });
    res.json(filteredReports);
  });

  app.get("/api/submissions", async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not initialized" });
    const { unitName } = req.query;
    const snapshot = await db.collection("report_submissions")
      .where("unitName", "==", unitName)
      .get();
    const submissions = snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
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
    if (!db) return res.status(500).json({ error: "DB not initialized" });
    const { reportDefinitionId, unitName, dateSent, attachmentLink, period } = req.body;
    const year = new Date().getFullYear();
    
    // 1. Save to Firestore
    const submissionsRef = db.collection("report_submissions");
    const q = await submissionsRef
      .where("reportDefinitionId", "==", reportDefinitionId)
      .where("unitName", "==", unitName)
      .where("period", "==", period)
      .where("year", "==", year)
      .get();

    const submissionData = {
      reportDefinitionId,
      unitName,
      dateSent,
      attachmentLink,
      period,
      year,
      timestamp: new Date().toISOString()
    };

    if (!q.empty) {
      await q.docs[0].ref.update(submissionData);
    } else {
      await submissionsRef.add(submissionData);
    }

    // 2. Sync to Google Sheets
    try {
      const doc = await getGoogleSheet();
      if (doc) {
        const sheet = doc.sheetsById["925215305"] || doc.sheetsByTitle["cap nhat"];
        if (sheet) {
          await sheet.loadHeaderRow();
          const headers = sheet.headerValues;
          
          // Get report definition for sheet sync
          const defSnapshot = await db.collection("report_definitions").doc(reportDefinitionId).get();
          const reportDef = defSnapshot.data() || {};
          
          const rowData: any = {};
          const findHeader = (index: number, possibleNames: string[]) => {
            for (const name of possibleNames) {
              if (headers.includes(name)) return name;
            }
            for (const name of possibleNames) {
              const found = headers.find((h: any) => h && h.toLowerCase().trim() === name.toLowerCase().trim());
              if (found) return found;
            }
            return headers[index] || "";
          };

          rowData[findHeader(0, ["Thời gian cập nhật", "Timestamp"])] = new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
          rowData[findHeader(1, ["Đơn vị báo cáo", "Đơn vị", "Don vi"])] = unitName;
          rowData[findHeader(2, ["Nội dung báo cáo", "Nội dung", "Noi dung"])] = reportDef.content || "";
          rowData[findHeader(3, ["Phân loại", "Phan loai"])] = reportDef.classification || "";
          rowData[findHeader(4, ["Phụ trách", "Chuyên viên", "Người phụ trách", "Phu trach"])] = reportDef.specialist || "";
          rowData[findHeader(5, ["Chu kỳ", "Chu ky"])] = reportDef.cycle || "";
          rowData[findHeader(6, ["Thời hạn", "Thoi han"])] = reportDef.deadline || "";
          rowData[findHeader(7, ["Giá trị báo cáo", "Giá trị", "Gia tri"])] = period;
          rowData[findHeader(8, ["Năm", "Nam"])] = year;
          rowData[findHeader(9, ["Ngày gửi báo cáo", "Ngày gửi", "Ngay gui"])] = dateSent;
          rowData[findHeader(10, ["Link đính kèm", "Link"])] = attachmentLink;

          await sheet.addRow(rowData);
        }
      }
    } catch (error: any) {
      console.error("Error syncing to Google Sheets:", error);
    }

    res.json({ message: "Updated successfully" });
  });

  app.post("/api/report-definitions", async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not initialized" });
    const { content, classification, specialist, cycle, deadline, unit, directingDocument } = req.body;
    
    try {
      // 1. Save to Firestore
      await db.collection("report_definitions").add({
        content, classification, specialist, cycle, deadline, unit, directingDocument
      });

      // 2. Sync to Google Sheets
      const doc = await getGoogleSheet();
      if (doc) {
        const sheet = doc.sheetsById[LIET_KE_GID] || doc.sheetsByTitle["Liet ke"];
        if (sheet) {
          await sheet.loadHeaderRow();
          const headers = sheet.headerValues;
          const rowData: any = {};
          const findHeader = (index: number, possibleNames: string[]) => {
            for (const name of possibleNames) {
              if (headers.includes(name)) return name;
            }
            return headers[index] || "";
          };

          rowData[findHeader(1, ["Nội dung báo cáo"])] = content;
          rowData[findHeader(2, ["Phân loại"])] = classification;
          rowData[findHeader(3, ["Phụ trách"])] = specialist;
          rowData[findHeader(4, ["Chu kỳ", "Chu Kỳ"])] = cycle;
          rowData[findHeader(5, ["Thời hạn"])] = deadline;
          rowData[findHeader(6, ["Đơn vị"])] = unit;
          rowData[findHeader(7, ["Văn bản chỉ đạo"])] = directingDocument;

          await sheet.addRow(rowData);
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
    const { createServer: createViteServer } = await import("vite");
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

  if (process.env.NODE_ENV !== "production") {
    const PORT = 3000;
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  }
}

setupApp();

export default app;
