import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { GoogleSpreadsheet } from "google-spreadsheet";
import { JWT } from "google-auth-library";
import dotenv from "dotenv";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read Firebase Config safely
let firebaseConfig: any = {};
try {
  const configPath = path.join(process.cwd(), "firebase-applet-config.json");
  if (fs.existsSync(configPath)) {
    firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
  }
} catch (err) {
  console.warn("Could not read firebase-applet-config.json:", err);
}

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
    
    // Use the database ID from the config file
    const dbId = firebaseConfig.firestoreDatabaseId || process.env.FIREBASE_DATABASE_ID;
    if (dbId) {
      db = getFirestore(dbId);
      console.log(`Firebase Admin initialized with database ID: ${dbId}`);
    } else {
      db = getFirestore();
      console.log("Firebase Admin initialized with default database");
    }
  } else {
    console.warn("FIREBASE_SERVICE_ACCOUNT missing. Firestore operations will fail on server.");
  }
} catch (error) {
  console.error("Error initializing Firebase Admin:", error);
}

const SHEET_ID = process.env.GOOGLE_SHEET_ID || "17VVgZJrpEByKRqMOAEZU0cDD8XwJSf7xsPVvbBHPU4o";
const LIET_KE_GID = "528046969";

// Cache for Google Sheets document
let cachedDoc: GoogleSpreadsheet | null = null;
let lastLoadTime = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

async function getGoogleSheet() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  let privateKey = process.env.GOOGLE_PRIVATE_KEY;

  if (!email || !privateKey) {
    console.warn("Google Sheets credentials missing.");
    return null;
  }

  // Return cached doc if it's still fresh
  const now = Date.now();
  if (cachedDoc && (now - lastLoadTime < CACHE_DURATION)) {
    return cachedDoc;
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
    console.log(`Successfully connected to Google Sheet: ${doc.title}`);
    
    cachedDoc = doc;
    lastLoadTime = Date.now();
    
    return doc;
  } catch (error: any) {
    console.error("Google Sheets Connection Error:", {
      message: error.message,
      sheetId: SHEET_ID,
      email: email
    });
    return null;
  }
}

// Simple memory cache for API responses
const apiCache = new Map<string, { data: any, timestamp: number }>();
const API_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
const pendingRequests = new Map<string, Promise<any>>();

function getCachedData(key: string) {
  const cached = apiCache.get(key);
  if (cached && (Date.now() - cached.timestamp < API_CACHE_DURATION)) {
    return cached.data;
  }
  return null;
}

function setCachedData(key: string, data: any) {
  apiCache.set(key, { data, timestamp: Date.now() });
}

async function coalesceRequest(key: string, fetchFn: () => Promise<any>) {
  const cached = getCachedData(key);
  if (cached) return cached;

  const pending = pendingRequests.get(key);
  if (pending) return pending;

  const promise = fetchFn().then(data => {
    setCachedData(key, data);
    pendingRequests.delete(key);
    return data;
  }).catch(err => {
    pendingRequests.delete(key);
    throw err;
  });

  pendingRequests.set(key, promise);
  return promise;
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
    const headers = sheet.headerValues;
    console.log("Detected headers:", headers);

    const reports = rows.map((row) => {
      const getVal = (possibleNames: string[]) => {
        for (const name of possibleNames) {
          // Try exact match
          let val = row.get(name);
          if (val !== undefined && val !== null) return String(val).trim();
          
          // Try case-insensitive match by looking through headers
          const actualHeader = headers.find(h => 
            possibleNames.some(p => h.toLowerCase().trim() === p.toLowerCase().trim())
          );
          if (actualHeader) {
            val = row.get(actualHeader);
            if (val !== undefined && val !== null) return String(val).trim();
          }
        }
        return "";
      };

      return {
        content: getVal(["Nội dung báo cáo", "Noi dung bao cao", "Nội dung"]),
        classification: getVal(["Phân loại", "Phan loai"]),
        specialist: getVal(["Phụ trách", "Phu trach"]),
        cycle: getVal(["Chu kỳ", "Chu ky"]),
        deadline: getVal(["Thời hạn", "Thoi han"]),
        unit: getVal(["Đơn vị", "Don vi"]),
        directingDocument: getVal(["Văn bản chỉ đạo", "Van ban chi dao", "Văn bản"])
      };
    }).filter(r => r.content && r.content.toLowerCase() !== "nội dung báo cáo");

    if (reports.length === 0) {
      console.warn("No reports found in Google Sheet. Check column headers: 'Nội dung báo cáo', 'Phân loại', etc.");
      return { success: false, message: "No reports found in sheet" };
    }

    // Sync to Firestore
    const collectionRef = db.collection("report_definitions");
    const snapshot = await collectionRef.get();
    const existingDocs = snapshot.docs;
    
    let added = 0;
    let updated = 0;
    let deleted = 0;
    
    // Deduplicate reports from sheet by content
    const uniqueSheetReports = [];
    const seenInSheet = new Set();
    for (const r of reports) {
      if (!seenInSheet.has(r.content)) {
        uniqueSheetReports.push(r);
        seenInSheet.add(r.content);
      }
    }

    // Delete reports that are no longer in the sheet OR are duplicates in Firestore
    const seenInFirestore = new Set();
    for (const doc of existingDocs) {
      const data = doc.data();
      if (!seenInSheet.has(data.content) || seenInFirestore.has(data.content)) {
        await doc.ref.delete();
        deleted++;
      } else {
        seenInFirestore.add(data.content);
      }
    }
    
    for (const report of uniqueSheetReports) {
      const q = await collectionRef.where("content", "==", report.content).limit(1).get();
      if (q.empty) {
        await collectionRef.add(report);
        added++;
      } else {
        await q.docs[0].ref.update(report);
        updated++;
      }
    }
    const msg = `Successfully synced ${uniqueSheetReports.length} reports (Added: ${added}, Updated: ${updated}, Deleted: ${deleted})`;
    console.log(msg);
    return { success: true, message: msg };
  } catch (error: any) {
    console.error("Error fetching report definitions:", error);
    return { success: false, error: error.message };
  }
}

// Initial sync - don't block startup
fetchReportDefinitions().catch(err => console.error("Initial sync failed:", err));

const app = express();
app.use(express.json());

app.post("/api/refresh-definitions", async (req, res) => {
    try {
      const result = await fetchReportDefinitions();
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get("/api/sync", async (req, res) => {
    // Clear caches on manual sync
    cachedDoc = null;
    lastLoadTime = 0;
    apiCache.clear();
    
    const result = await fetchReportDefinitions();
    res.json(result);
  });

// API Routes
app.get("/api/all-reports", async (req, res) => {
  console.log("GET /api/all-reports requested");
  const cacheKey = "all-reports";
  
  try {
    const reports = await coalesceRequest(cacheKey, async () => {
      if (!db) throw new Error("DB not initialized");
      const snapshot = await db.collection("report_definitions").get();
      return snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
    });
    
    console.log(`Returning ${reports.length} report definitions`);
    res.json(reports);
  } catch (error: any) {
    console.error("Error fetching all-reports:", error);
    res.status(500).json({ error: error.message });
  }
});

  app.get("/api/reports", async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not initialized" });
    const unitName = (req.query.unitName as string || "").trim().toLowerCase();
    try {
      const snapshot = await db.collection("report_definitions").get();
      const allReports = snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
      
      const isDLUnit = unitName.startsWith("đl") || unitName.startsWith("điện lực");
      const filteredReports = allReports.filter((r: any) => {
        const reportUnit = (r.unit || "").toLowerCase();
        
        // "Văn thư PKT" does not perform reports, only assigns them
        if (unitName === "văn thư pkt") {
          // Only show reports explicitly assigned to "Văn thư PKT" (if any)
          return reportUnit.includes(unitName);
        }

        // If unit is empty or "tất cả", show to everyone else
        if (!reportUnit || reportUnit.includes("tất cả")) return true;
        
        // If user is a DL unit and report is for "điện lực"
        if (isDLUnit && reportUnit.includes("điện lực")) return true;
        
        // Check if unit name is mentioned in the report's unit field
        if (reportUnit.includes(unitName) || unitName.includes(reportUnit)) return true;
        
        return false;
      });
      res.json(filteredReports);
    } catch (error: any) {
      console.error("Error fetching reports:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/submissions", async (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not initialized" });
    const { unitName } = req.query;
    try {
      const snapshot = await db.collection("report_submissions")
        .where("unitName", "==", unitName)
        .get();
      const submissions = snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
      res.json(submissions);
    } catch (error: any) {
      console.error("Error fetching submissions:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/form-metadata", async (req, res) => {
    const cacheKey = "form-metadata";
    
    try {
      const result = await coalesceRequest(cacheKey, async () => {
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

        return {
          classifications: Array.from(new Set(classifications)),
          specialists: Array.from(new Set(specialists)),
          cycles: Array.from(new Set(cycles)),
          deadlines: Array.from(new Set(deadlines)),
          units: Array.from(new Set(units))
        };
      });

      res.json(result);
    } catch (error) {
      console.error("Error fetching form metadata:", error);
      res.status(500).json({ error: "Failed to fetch metadata" });
    }
  });

  app.get("/api/units", async (req, res) => {
    const cacheKey = "units";
    console.log("GET /api/units requested");
    
    try {
      const result = await coalesceRequest(cacheKey, async () => {
        const doc = await getGoogleSheet();
        if (!doc) {
          console.error("Failed to connect to Google Sheets in /api/units");
          throw new Error("Could not connect to Google Sheets");
        }
        
        const sheet = doc.sheetsByTitle["Thu vien"] || doc.sheetsByTitle["Thư viện"];
        if (!sheet) {
          console.error("Sheet 'Thu vien' or 'Thư viện' not found. Available sheets:", doc.sheetsByIndex.map(s => s.title));
          throw new Error("Sheet 'Thu vien' not found");
        }

        console.log(`Found sheet: ${sheet.title}. Column count: ${sheet.columnCount}`);

        // Load header row to find the correct column
        await sheet.loadCells('1:1');
        let unitColIndex = 4; // Default to column E
        const headers = [];
        for (let col = 0; col < sheet.columnCount; col++) {
          const headerValue = sheet.getCell(0, col).value;
          const header = String(headerValue || "").toLowerCase().trim();
          headers.push(header);
          if (header.includes("đơn vị") || header.includes("don vi")) {
            unitColIndex = col;
            console.log(`Found 'Đơn vị' column at index ${col} (Header: "${headerValue}")`);
            break;
          }
        }

        if (unitColIndex === 4 && !headers[4]?.includes("đơn vị")) {
          console.warn("Could not find 'Đơn vị' column by name. Using default index 4. Headers found:", headers);
        }

        // Load cells for the identified column
        await sheet.loadCells({
          startRowIndex: 0,
          endRowIndex: 200,
          startColumnIndex: unitColIndex,
          endColumnIndex: unitColIndex + 1
        });

        const units: string[] = [];
        for (let i = 1; i < 200; i++) {
          const cell = sheet.getCell(i, unitColIndex);
          if (cell.value) {
            units.push(String(cell.value).trim());
          }
        }

        return Array.from(new Set(units));
      });

      console.log(`Returning ${result.length} unique units.`);
      res.json(result);
    } catch (error) {
      console.error("Error fetching units from Google Sheets:", error);
      res.status(500).json({ error: "Failed to fetch units" });
    }
  });

app.get("/api/all-history", async (req, res) => {
  console.log("GET /api/all-history requested");
  const cacheKey = "all-history";

  try {
    const history = await coalesceRequest(cacheKey, async () => {
      const doc = await getGoogleSheet();
      if (!doc) throw new Error("Could not connect to Google Sheets");
      
      const sheet = doc.sheetsByTitle["Lich su"];
      if (!sheet) throw new Error("Sheet 'Lich su' not found");

      console.log("Fetching rows from 'Lich su' sheet...");
      const rows = await sheet.getRows();
      console.log(`Fetched ${rows.length} rows from 'Lich su'`);
      
      return rows.map(row => ({
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
    });

    console.log(`Returning ${history.length} history items`);
    res.json(history);
  } catch (error: any) {
    console.error("Error fetching all history:", error);
    res.status(500).json({ error: error.message || "Failed to fetch all history" });
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

// 404 for API routes - prevent falling through to Vite/SPA
app.all("/api/*", (req, res) => {
  console.warn(`404 API Not Found: ${req.method} ${req.url}`);
  res.status(404).json({ error: "API route not found" });
});

async function setupVite() {
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
}

setupVite().catch(err => console.error("Vite setup failed:", err));

const PORT = 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});

export default app;
