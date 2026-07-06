import React, { useState, useEffect, useMemo } from "react";
import { 
  CheckCircle2, 
  AlertCircle, 
  Search, 
  ExternalLink, 
  Lock, 
  User, 
  Calendar, 
  FileText, 
  RefreshCw, 
  MessageSquare, 
  Award,
  ChevronRight,
  Filter,
  BarChart3,
  PieChart as LucidePieChart,
  Building2,
  TrendingUp,
  Inbox,
  Briefcase
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as RechartsTooltip, 
  Legend, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell 
} from "recharts";

interface CapNhatRow {
  rowNumber: number;
  timestamp: string;
  unit: string;
  content: string;
  classification: string;
  specialist: string;
  cycle: string;
  deadline: string;
  period: string;
  year: string | number;
  dateSent: string;
  attachment: string;
  rating: string;
  note: string;
}

interface EvaluationProps {
  onRefreshAll?: () => Promise<void>;
}

export default function Evaluation({ onRefreshAll }: EvaluationProps) {
  const [rows, setRows] = useState<CapNhatRow[]>([]);
  const [specialists, setSpecialists] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCycleTab, setSelectedCycleTab] = useState<string>("Tất cả");
  const [selectedRow, setSelectedRow] = useState<CapNhatRow | null>(null);
  const [summaryViewTab, setSummaryViewTab] = useState<"unit" | "classification">("unit");
  const [selectedMonthFilter, setSelectedMonthFilter] = useState<string>("Tất cả");
  const [summaryMetricTab, setSummaryMetricTab] = useState<"quality" | "timeliness">("quality");

  const checkIsLate = (dateSentStr: string, deadlineStr: string, periodStr: string, reportYear?: string | number) => {
    if (!dateSentStr || !deadlineStr || !periodStr) return false;

    try {
      const parseDateStr = (str: string) => {
        if (!str) return null;
        // Handle DD/MM/YYYY
        const dmyMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (dmyMatch) {
          return new Date(parseInt(dmyMatch[3]), parseInt(dmyMatch[2]) - 1, parseInt(dmyMatch[1]));
        }
        // Handle YYYY-MM-DD
        const ymdMatch = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
        if (ymdMatch) {
          return new Date(parseInt(ymdMatch[1]), parseInt(ymdMatch[2]) - 1, parseInt(ymdMatch[3]));
        }
        const d = new Date(str);
        return isNaN(d.getTime()) ? null : d;
      };

      const sentDate = parseDateStr(dateSentStr);
      if (!sentDate) return false;

      // Handle "Thứ X" for Weekly reports
      const weekMatch = periodStr.match(/Tuần (\d+)/i);
      const dayOfWeekMatch = deadlineStr.match(/Thứ (\d+)/i);

      if (weekMatch && dayOfWeekMatch) {
        const weekNum = parseInt(weekMatch[1]);
        const dayOfWeek = parseInt(dayOfWeekMatch[1]); // 2, 3, 4, 5, 6, 7, 8 (CN)
        const year = reportYear ? parseInt(String(reportYear)) : sentDate.getFullYear();
        
        const startOfYear = new Date(year, 0, 1);
        const startDay = startOfYear.getDay();
        
        // Find the date for this week and day
        for (let d = 0; d < 366; d++) {
          const testDate = new Date(year, 0, 1 + d);
          if (testDate.getFullYear() !== year) break;
          
          const week = Math.ceil((d + startDay + 1) / 7);
          const targetDay = dayOfWeek === 8 ? 0 : dayOfWeek - 1;
          
          if (week === weekNum && testDate.getDay() === targetDay) {
            const deadlineDate = new Date(testDate);
            deadlineDate.setHours(23, 59, 59, 999);
            return sentDate > deadlineDate;
          }
        }
      }

      // Handle "Ngày XX hàng tháng"
      const dayMatch = deadlineStr.match(/Ngày (\d+)/i);
      const monthMatch = periodStr.match(/Tháng (\d+)/i);
      
      if (dayMatch && monthMatch) {
        const day = parseInt(dayMatch[1]);
        const reportMonth = parseInt(monthMatch[1]);
        const year = reportYear ? parseInt(String(reportYear)) : sentDate.getFullYear();
        
        // Deadline is Day XX of Month N+1
        const deadlineDate = new Date(year, reportMonth, day);
        deadlineDate.setHours(23, 59, 59, 999);
        return sentDate > deadlineDate;
      }

      // Handle direct date comparison
      const deadlineDate = parseDateStr(deadlineStr);
      if (deadlineDate) {
        deadlineDate.setHours(23, 59, 59, 999);
        return sentDate > deadlineDate;
      }
    } catch (e) {
      return false;
    }
    return false;
  };

  // Helper helper to get month from deadline string
  const getMonthFromDeadline = (deadlineStr: string): string => {
    if (!deadlineStr) return "Khác";
    const cleaned = deadlineStr.trim();

    // 1. Try to match "Tháng X" or "tháng X"
    const thangMatch = cleaned.match(/tháng\s*(\d+)/i);
    if (thangMatch) {
      const m = parseInt(thangMatch[1], 10);
      if (m >= 1 && m <= 12) {
        return `Tháng ${m.toString().padStart(2, "0")}`;
      }
    }

    // 2. Try to match DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
    const parts = cleaned.split(/[\/\-\.]/);
    if (parts.length === 3) {
      const p0 = parts[0].trim();
      const p1 = parts[1].trim();
      const p2 = parts[2].trim();
      if (p2.length === 4 && !isNaN(Number(p1))) {
        // DD/MM/YYYY
        const m = parseInt(p1, 10);
        if (m >= 1 && m <= 12) {
          return `Tháng ${m.toString().padStart(2, "0")}`;
        }
      } else if (p0.length === 4 && !isNaN(Number(p1))) {
        // YYYY/MM/DD
        const m = parseInt(p1, 10);
        if (m >= 1 && m <= 12) {
          return `Tháng ${m.toString().padStart(2, "0")}`;
        }
      }
    }

    // 3. Try to match MM/YYYY or M/YYYY
    const myMatch = cleaned.match(/\b(\d{1,2})\/(\d{4})\b/);
    if (myMatch) {
      const m = parseInt(myMatch[1], 10);
      if (m >= 1 && m <= 12) {
        return `Tháng ${m.toString().padStart(2, "0")}`;
      }
    }

    // 4. Try native Date parsing as a fallback
    const d = new Date(cleaned);
    if (!isNaN(d.getTime())) {
      const m = d.getMonth() + 1;
      return `Tháng ${m.toString().padStart(2, "0")}`;
    }

    return "Khác";
  };

  const availableMonths = useMemo(() => {
    const months = new Set<string>();
    rows.forEach(r => {
      if (r.deadline) {
        const m = getMonthFromDeadline(r.deadline);
        if (m) {
          months.add(m);
        }
      }
    });
    return Array.from(months).sort((a, b) => {
      if (a === "Khác") return 1;
      if (b === "Khác") return -1;
      const numA = parseInt(a.replace("Tháng ", ""), 10);
      const numB = parseInt(b.replace("Tháng ", ""), 10);
      return numA - numB;
    });
  }, [rows]);

  const filteredStatsRows = useMemo(() => {
    if (selectedMonthFilter === "Tất cả") return rows;
    return rows.filter(r => getMonthFromDeadline(r.deadline) === selectedMonthFilter);
  }, [rows, selectedMonthFilter]);

  // Form states
  const [evalSpecialist, setEvalSpecialist] = useState("");
  const [password, setPassword] = useState("");
  const [rating, setRating] = useState<"Đạt" | "Chưa đạt" | "">("");
  const [note, setNote] = useState("");
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  // Statistics and Aggregation Calculations
  const stats = useMemo(() => {
    const total = filteredStatsRows.length;
    const dat = filteredStatsRows.filter(r => r.rating === "Đạt").length;
    const chuaDat = filteredStatsRows.filter(r => r.rating === "Chưa đạt").length;
    const chuaDanhGia = filteredStatsRows.filter(r => r.rating !== "Đạt" && r.rating !== "Chưa đạt").length;
    const rateDat = total > 0 ? Math.round((dat / total) * 100) : 0;

    const totalLate = filteredStatsRows.filter(r => checkIsLate(r.dateSent, r.deadline, r.period, r.year)).length;
    const totalOnTime = total - totalLate;
    const rateOnTime = total > 0 ? Math.round((totalOnTime / total) * 100) : 0;

    // Grouping by Unit (Đơn vị)
    const unitMap: { [key: string]: { total: number; dat: number; chuaDat: number; chuaDanhGia: number; onTime: number; late: number } } = {};
    filteredStatsRows.forEach(r => {
      const u = r.unit?.trim() || "Chưa xác định";
      if (!unitMap[u]) {
        unitMap[u] = { total: 0, dat: 0, chuaDat: 0, chuaDanhGia: 0, onTime: 0, late: 0 };
      }
      unitMap[u].total += 1;
      if (r.rating === "Đạt") unitMap[u].dat += 1;
      else if (r.rating === "Chưa đạt") unitMap[u].chuaDat += 1;
      else unitMap[u].chuaDanhGia += 1;

      if (checkIsLate(r.dateSent, r.deadline, r.period, r.year)) {
        unitMap[u].late += 1;
      } else {
        unitMap[u].onTime += 1;
      }
    });

    const unitList = Object.entries(unitMap).map(([name, d]) => ({
      name,
      ...d,
      rateDat: d.total > 0 ? Math.round((d.dat / d.total) * 100) : 0,
      rateOnTime: d.total > 0 ? Math.round((d.onTime / d.total) * 100) : 0
    })).sort((a, b) => b.total - a.total);

    // Grouping by Report Type/Classification (Loại báo cáo)
    const classMap: { [key: string]: { total: number; dat: number; chuaDat: number; chuaDanhGia: number; onTime: number; late: number } } = {};
    filteredStatsRows.forEach(r => {
      const c = r.classification?.trim() || "Khác";
      if (!classMap[c]) {
        classMap[c] = { total: 0, dat: 0, chuaDat: 0, chuaDanhGia: 0, onTime: 0, late: 0 };
      }
      classMap[c].total += 1;
      if (r.rating === "Đạt") classMap[c].dat += 1;
      else if (r.rating === "Chưa đạt") classMap[c].chuaDat += 1;
      else classMap[c].chuaDanhGia += 1;

      if (checkIsLate(r.dateSent, r.deadline, r.period, r.year)) {
        classMap[c].late += 1;
      } else {
        classMap[c].onTime += 1;
      }
    });

    const classList = Object.entries(classMap).map(([name, d]) => ({
      name,
      ...d,
      rateDat: d.total > 0 ? Math.round((d.dat / d.total) * 100) : 0,
      rateOnTime: d.total > 0 ? Math.round((d.onTime / d.total) * 100) : 0
    })).sort((a, b) => b.total - a.total);

    // Data for charts
    const pieData = [
      { name: "Đạt", value: dat, color: "#10b981" },
      { name: "Chưa đạt", value: chuaDat, color: "#f43f5e" },
      { name: "Chưa đánh giá", value: chuaDanhGia, color: "#94a3b8" }
    ].filter(d => d.value > 0);

    const pieDataTimeliness = [
      { name: "Đúng hạn", value: totalOnTime, color: "#10b981" },
      { name: "Trễ hạn", value: totalLate, color: "#f43f5e" }
    ].filter(d => d.value > 0);

    return {
      total,
      dat,
      chuaDat,
      chuaDanhGia,
      rateDat,
      totalLate,
      totalOnTime,
      rateOnTime,
      unitList,
      classList,
      pieData,
      pieDataTimeliness
    };
  }, [filteredStatsRows]);

  const fetchCapNhatData = async () => {
    try {
      const res = await fetch("/api/cap-nhat-rows");
      if (res.ok) {
        const data = await res.json();
        setRows(data);
        
        // If we have a selected row, update its reference with fresh data
        if (selectedRow) {
          const updated = data.find((r: CapNhatRow) => r.rowNumber === selectedRow.rowNumber);
          if (updated) setSelectedRow(updated);
        }
      }
    } catch (error) {
      console.error("Error fetching cap-nhat rows:", error);
    }
  };

  const fetchSpecialists = async () => {
    try {
      const res = await fetch("/api/specialists-list");
      if (res.ok) {
        const data = await res.json();
        setSpecialists(data);
      }
    } catch (error) {
      console.error("Error fetching specialists:", error);
    }
  };

  const loadData = async () => {
    setLoading(true);
    await Promise.all([fetchCapNhatData(), fetchSpecialists()]);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchCapNhatData(), fetchSpecialists()]);
    if (onRefreshAll) await onRefreshAll();
    setRefreshing(false);
  };

  // Extract unique cycles from rows for tab filtering
  const cycleTabs = ["Tất cả", ...Array.from(new Set(rows.map(r => r.cycle).filter(Boolean)))];

  // Filter rows based on search and selected cycle tab
  const filteredRows = rows.filter(row => {
    const matchesSearch = 
      row.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
      row.unit.toLowerCase().includes(searchTerm.toLowerCase()) ||
      row.specialist.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesCycle = selectedCycleTab === "Tất cả" || row.cycle === selectedCycleTab;
    
    return matchesSearch && matchesCycle;
  });

  // Automatically pre-fill specialist when a row is selected
  useEffect(() => {
    if (selectedRow) {
      setEvalSpecialist(selectedRow.specialist);
      setRating(selectedRow.rating === "Đạt" ? "Đạt" : selectedRow.rating ? "Chưa đạt" : "");
      setNote(selectedRow.note || "");
      setPassword("");
      setMessage(null);
    }
  }, [selectedRow]);

  const handleSubmitEvaluation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRow) return;
    if (!evalSpecialist) {
      setMessage({ type: 'error', text: "Vui lòng chọn tên chuyên viên để đánh giá" });
      return;
    }
    if (!password) {
      setMessage({ type: 'error', text: "Vui lòng nhập mật khẩu xác thực" });
      return;
    }
    if (!rating) {
      setMessage({ type: 'error', text: "Vui lòng chọn mức đánh giá: Đạt hoặc Chưa đạt" });
      return;
    }

    setFormSubmitting(true);
    setMessage(null);

    try {
      const res = await fetch("/api/update-evaluation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rowNumber: selectedRow.rowNumber,
          specialist: evalSpecialist,
          password: password,
          rating: rating,
          note: note
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setMessage({ type: 'success', text: "Cập nhật đánh giá chất lượng thành công!" });
        setPassword(""); // clear password
        await fetchCapNhatData(); // reload rows
      } else {
        setMessage({ type: 'error', text: data.error || "Mật khẩu chuyên viên không chính xác hoặc có lỗi xảy ra" });
      }
    } catch (error) {
      console.error("Error submitting evaluation:", error);
      setMessage({ type: 'error', text: "Lỗi kết nối máy chủ" });
    } finally {
      setFormSubmitting(false);
    }
  };

  return (
    <div className="space-y-10">
      {/* SECTION 1: Evaluation List & Detailed Input */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Sidebar: List of reports */}
        <div className="lg:col-span-5 bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden flex flex-col h-[750px]">
          {/* Header and Controls */}
          <div className="p-6 border-b border-gray-200 bg-gray-50/50">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-lg text-gray-900">Đánh giá chất lượng báo cáo</h3>
                <p className="text-xs text-gray-500 font-medium">Chọn báo cáo để đánh giá chất lượng</p>
              </div>
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className={`p-2 hover:bg-emerald-50 rounded-full transition-all text-emerald-600 ${refreshing ? "animate-spin" : ""}`}
                title="Làm mới danh sách"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>

            {/* Search Input */}
            <div className="relative mb-4">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-400" />
              <input
                type="text"
                placeholder="Tìm nội dung, đơn vị, phụ trách..."
                className="w-full bg-white border border-gray-200 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all placeholder:text-gray-400"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            {/* Cycle Tabs */}
            <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
              {cycleTabs.map(tab => (
                <button
                  key={tab}
                  onClick={() => setSelectedCycleTab(tab)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all shrink-0 ${
                    selectedCycleTab === tab 
                      ? "bg-emerald-600 text-white shadow-sm" 
                      : "bg-white border border-gray-200 text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          {/* List Body */}
          <div className="overflow-y-auto flex-1 divide-y divide-gray-100">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <div className="w-8 h-8 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-xs text-gray-400 font-bold">Đang tải danh sách báo cáo...</p>
              </div>
            ) : filteredRows.length === 0 ? (
              <div className="p-10 text-center text-gray-500 flex flex-col items-center justify-center gap-3">
                <FileText className="w-10 h-10 text-gray-300" />
                <p className="text-sm font-medium">Không tìm thấy báo cáo nào phù hợp</p>
              </div>
            ) : (
              filteredRows.map((row) => {
                const isSelected = selectedRow?.rowNumber === row.rowNumber;
                const hasRated = row.rating === "Đạt" || row.rating === "Chưa đạt";
                
                return (
                  <button
                    key={row.rowNumber}
                    onClick={() => setSelectedRow(row)}
                    className={`w-full text-left p-5 transition-all flex items-start gap-3 border-l-4 ${
                      isSelected 
                        ? "bg-emerald-50/50 border-emerald-500" 
                        : "border-transparent hover:bg-gray-50"
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100">
                          {row.unit}
                        </span>
                        <span className="text-[10px] font-bold text-gray-400">
                          {row.period}
                        </span>
                        {row.rating === "Đạt" ? (
                          <span className="text-[9px] font-bold text-emerald-700 bg-emerald-100/80 px-1.5 py-0.5 rounded-full flex items-center gap-0.5 shrink-0 ml-auto">
                            <CheckCircle2 className="w-2.5 h-2.5" /> Đạt
                          </span>
                        ) : row.rating === "Chưa đạt" ? (
                          <span className="text-[9px] font-bold text-red-700 bg-red-100/80 px-1.5 py-0.5 rounded-full flex items-center gap-0.5 shrink-0 ml-auto">
                            <AlertCircle className="w-2.5 h-2.5" /> Chưa đạt
                          </span>
                        ) : (
                          <span className="text-[9px] font-bold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-full shrink-0 ml-auto">
                            Chưa đánh giá
                          </span>
                        )}
                      </div>
                      <h4 className="font-semibold text-sm text-gray-900 leading-snug line-clamp-2">
                        {row.content}
                      </h4>
                      <div className="flex items-center justify-between mt-3 text-[11px] text-gray-400 font-medium">
                        <span className="flex items-center gap-1">
                          <User className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                          Phụ trách: {row.specialist}
                        </span>
                        <span>
                          Gửi: {row.dateSent}
                        </span>
                      </div>
                    </div>
                    <ChevronRight className={`w-5 h-5 text-gray-400 shrink-0 self-center transition-transform ${isSelected ? "translate-x-1" : ""}`} />
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right side: Detailed View & Evaluation Form */}
        <div className="lg:col-span-7">
          <AnimatePresence mode="wait">
            {selectedRow ? (
              <motion.div
                key={selectedRow.rowNumber}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6 sm:p-8"
              >
                <h3 className="font-bold text-xl text-gray-900 mb-6 flex items-center gap-2">
                  <Award className="w-6 h-6 text-emerald-600" />
                  Chi tiết & Đánh giá chất lượng
                </h3>

                {/* Information Grid */}
                <div className="bg-gray-50 rounded-2xl p-6 border border-gray-100 space-y-4 mb-8">
                  <div>
                    <h4 className="text-[10px] font-extrabold uppercase tracking-wider text-gray-400 mb-1">Nội dung báo cáo</h4>
                    <p className="text-sm font-semibold text-gray-800 leading-relaxed">{selectedRow.content}</p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-gray-200/60">
                    <div className="flex items-start gap-2.5">
                      <FileText className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-[10px] font-extrabold uppercase tracking-wider text-gray-400">Đơn vị báo cáo</p>
                        <p className="text-sm font-bold text-gray-700">{selectedRow.unit}</p>
                      </div>
                    </div>

                    <div className="flex items-start gap-2.5">
                      <Calendar className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-[10px] font-extrabold uppercase tracking-wider text-gray-400">Kỳ báo cáo</p>
                        <p className="text-sm font-bold text-gray-700">{selectedRow.period} (Năm {selectedRow.year})</p>
                      </div>
                    </div>

                    <div className="flex items-start gap-2.5">
                      <Filter className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-[10px] font-extrabold uppercase tracking-wider text-gray-400">Phân loại / Chu kỳ</p>
                        <p className="text-sm font-semibold text-gray-700">{selectedRow.classification} / {selectedRow.cycle}</p>
                      </div>
                    </div>

                    <div className="flex items-start gap-2.5">
                      <User className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-[10px] font-extrabold uppercase tracking-wider text-gray-400">Chuyên viên phụ trách</p>
                        <p className="text-sm font-bold text-gray-700">{selectedRow.specialist}</p>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-gray-200/60">
                    <div>
                      <p className="text-[10px] font-extrabold uppercase tracking-wider text-gray-400 mb-0.5">Ngày nộp báo cáo</p>
                      <p className="text-sm font-semibold text-gray-700">{selectedRow.dateSent || "Chưa có"}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-extrabold uppercase tracking-wider text-gray-400 mb-0.5">Thời hạn quy định</p>
                      <p className="text-sm font-semibold text-gray-700">{selectedRow.deadline || "Chưa có"}</p>
                    </div>
                  </div>

                  {/* Attachment Link */}
                  <div className="pt-3 border-t border-gray-200/60">
                    <p className="text-[10px] font-extrabold uppercase tracking-wider text-gray-400 mb-1.5">File tài liệu đính kèm</p>
                    {selectedRow.attachment ? (
                      <a
                        href={selectedRow.attachment}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2 rounded-xl shadow-sm transition-all hover:shadow"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        Xem file đính kèm
                      </a>
                    ) : (
                      <span className="text-xs text-gray-400 font-semibold italic">Không có tài liệu đính kèm</span>
                    )}
                  </div>
                </div>

                {/* Evaluation Form */}
                <form onSubmit={handleSubmitEvaluation} className="space-y-6">
                  <h4 className="font-bold text-base text-gray-800 border-b border-gray-100 pb-2 mb-4">Nhập thông tin đánh giá</h4>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    {/* Lock to report's specialist */}
                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Chuyên viên đánh giá</label>
                      <div className="relative">
                        <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-emerald-600" />
                        <select
                          className="w-full bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all appearance-none"
                          value={evalSpecialist}
                          onChange={(e) => setEvalSpecialist(e.target.value)}
                        >
                          <option value="">-- Chọn chuyên viên phụ trách --</option>
                          {specialists.map(spec => (
                            <option key={spec} value={spec}>{spec}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Password Verification */}
                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Mật khẩu xác thực</label>
                      <div className="relative">
                        <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-400" />
                        <input
                          type="password"
                          placeholder="Nhập mã xác thực..."
                          className="w-full bg-white border border-gray-200 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all placeholder:text-gray-400 font-mono"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          required
                        />
                      </div>
                    </div>
                  </div>

                  {/* Rating Level Option Cards */}
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Kết quả đánh giá chất lượng</label>
                    <div className="grid grid-cols-2 gap-4">
                      {/* OPTION: ĐẠT */}
                      <button
                        type="button"
                        onClick={() => setRating("Đạt")}
                        className={`flex flex-col items-center justify-center p-5 rounded-2xl border-2 transition-all gap-2 text-center relative overflow-hidden ${
                          rating === "Đạt"
                            ? "border-emerald-500 bg-emerald-50/50 text-emerald-900"
                            : "border-gray-200 bg-white hover:bg-gray-50 text-gray-500"
                        }`}
                      >
                        <CheckCircle2 className={`w-8 h-8 ${rating === "Đạt" ? "text-emerald-600" : "text-gray-400"}`} />
                        <span className="font-bold text-sm">Đạt yêu cầu</span>
                        {rating === "Đạt" && (
                          <div className="absolute top-0 right-0 bg-emerald-500 text-white w-5 h-5 flex items-center justify-center rounded-bl-xl text-[10px] font-bold">✓</div>
                        )}
                      </button>

                      {/* OPTION: CHƯA ĐẠT */}
                      <button
                        type="button"
                        onClick={() => setRating("Chưa đạt")}
                        className={`flex flex-col items-center justify-center p-5 rounded-2xl border-2 transition-all gap-2 text-center relative overflow-hidden ${
                          rating === "Chưa đạt"
                            ? "border-red-500 bg-red-50/50 text-red-900"
                            : "border-gray-200 bg-white hover:bg-gray-50 text-gray-500"
                        }`}
                      >
                        <AlertCircle className={`w-8 h-8 ${rating === "Chưa đạt" ? "text-red-500" : "text-gray-400"}`} />
                        <span className="font-bold text-sm">Chưa đạt yêu cầu</span>
                        {rating === "Chưa đạt" && (
                          <div className="absolute top-0 right-0 bg-red-500 text-white w-5 h-5 flex items-center justify-center rounded-bl-xl text-[10px] font-bold">✕</div>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Note Field */}
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Ghi chú nhận xét chi tiết</label>
                    <div className="relative">
                      <MessageSquare className="absolute left-3.5 top-3.5 w-4.5 h-4.5 text-gray-400" />
                      <textarea
                        rows={4}
                        placeholder="Nhập hướng dẫn chỉnh sửa, góp ý chi tiết cho đơn vị..."
                        className="w-full bg-white border border-gray-200 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all placeholder:text-gray-400 leading-relaxed"
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Form feedback and Save Button */}
                  {message && (
                    <div className={`p-4 rounded-xl flex items-start gap-3 border text-sm font-medium ${
                      message.type === 'success' 
                        ? "bg-emerald-50 border-emerald-200 text-emerald-800" 
                        : "bg-red-50 border-red-200 text-red-800"
                    }`}>
                      {message.type === 'success' ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                      ) : (
                        <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                      )}
                      <p>{message.text}</p>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={formSubmitting || !rating || !password}
                    className="w-full bg-emerald-600 text-white font-bold py-3.5 rounded-xl hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-600/15 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {formSubmitting ? (
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      "Cập nhật Đánh giá chất lượng"
                    )}
                  </button>
                </form>
              </motion.div>
            ) : (
              <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-12 text-center h-[500px] flex flex-col items-center justify-center gap-4">
                <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center text-gray-400 shadow-inner">
                  <Award className="w-8 h-8 text-gray-400" />
                </div>
                <div>
                  <h4 className="font-bold text-lg text-gray-900">Chưa chọn báo cáo</h4>
                  <p className="text-sm text-gray-500 max-w-sm mx-auto mt-1 leading-relaxed">
                    Vui lòng chọn bất kỳ báo cáo nộp của đơn vị nào từ danh sách bên trái để xem thông tin chi tiết và tiến hành đánh giá chất lượng.
                  </p>
                </div>
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* SECTION 2: Summary Cards & Visual Charts */}
      <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6 sm:p-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-100 pb-6 mb-6">
          <div>
            <h3 className="font-extrabold text-xl text-gray-900 flex items-center gap-2">
              <BarChart3 className="w-6 h-6 text-emerald-600" />
              Báo cáo Tổng hợp & Thống kê Chất lượng
            </h3>
            <p className="text-sm text-gray-500">
              Biểu đồ và bảng số liệu phân tích trạng thái đánh giá báo cáo của các đơn vị.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {/* Bộ lọc tháng */}
            <div className="inline-flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-1.5 shadow-sm">
              <Calendar className="w-3.5 h-3.5 text-emerald-600" />
              <select
                value={selectedMonthFilter}
                onChange={(e) => setSelectedMonthFilter(e.target.value)}
                className="bg-transparent border-none text-gray-700 text-xs font-extrabold focus:outline-none cursor-pointer pr-1"
              >
                <option value="Tất cả">Tất cả các tháng</option>
                {availableMonths.map(month => (
                  <option key={month} value={month}>{month}</option>
                ))}
              </select>
            </div>

            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-xl text-xs font-bold transition-all disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
              Làm mới số liệu
            </button>
          </div>
        </div>

        {/* 4 Metric cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-gray-50/50 rounded-2xl p-5 border border-gray-100 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gray-100 text-gray-600 flex items-center justify-center shrink-0">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block">Tổng số báo cáo</span>
              <span className="text-2xl font-black text-gray-900">{stats.total}</span>
            </div>
          </div>

          {summaryMetricTab === "quality" ? (
            <>
              <div className="bg-emerald-50/30 rounded-2xl p-5 border border-emerald-100/50 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-emerald-100/80 text-emerald-700 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider block">Báo cáo Đạt</span>
                  <span className="text-2xl font-black text-emerald-700">{stats.dat}</span>
                  <span className="text-[10px] text-emerald-500 font-bold ml-1.5">({stats.rateDat}%)</span>
                </div>
              </div>

              <div className="bg-rose-50/30 rounded-2xl p-5 border border-rose-100/50 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-rose-100/80 text-rose-700 flex items-center justify-center shrink-0">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-[11px] font-bold text-rose-600 uppercase tracking-wider block">Báo cáo Chưa đạt</span>
                  <span className="text-2xl font-black text-rose-700">{stats.chuaDat}</span>
                </div>
              </div>

              <div className="bg-slate-50/60 rounded-2xl p-5 border border-slate-200/50 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-slate-200/80 text-slate-600 flex items-center justify-center shrink-0">
                  <Inbox className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Chưa đánh giá</span>
                  <span className="text-2xl font-black text-slate-800">{stats.chuaDanhGia}</span>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="bg-emerald-50/30 rounded-2xl p-5 border border-emerald-100/50 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-emerald-100/80 text-emerald-700 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider block">Đúng hạn</span>
                  <span className="text-2xl font-black text-emerald-700">{stats.totalOnTime}</span>
                  <span className="text-[10px] text-emerald-500 font-bold ml-1.5">({stats.rateOnTime}%)</span>
                </div>
              </div>

              <div className="bg-rose-50/30 rounded-2xl p-5 border border-rose-100/50 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-rose-100/80 text-rose-700 flex items-center justify-center shrink-0">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-[11px] font-bold text-rose-600 uppercase tracking-wider block">Trễ hạn</span>
                  <span className="text-2xl font-black text-rose-700">{stats.totalLate}</span>
                </div>
              </div>

              <div className="bg-slate-50/60 rounded-2xl p-5 border border-slate-200/50 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-slate-200/80 text-slate-600 flex items-center justify-center shrink-0">
                  <TrendingUp className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Hiệu suất đúng hạn</span>
                  <span className="text-2xl font-black text-slate-800">{stats.rateOnTime}%</span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Chart and Tables Grid */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
          
          {/* LEFT: Summary Tables (7 cols) */}
          <div className="xl:col-span-7 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSummaryViewTab("unit")}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    summaryViewTab === "unit"
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "bg-gray-50 text-gray-500 hover:text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  Tổng hợp theo Đơn vị ({stats.unitList.length})
                </button>
                <button
                  onClick={() => setSummaryViewTab("classification")}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    summaryViewTab === "classification"
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "bg-gray-50 text-gray-500 hover:text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  Tổng hợp theo Loại báo cáo ({stats.classList.length})
                </button>
              </div>

              {/* Selector cho Metric */}
              <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl">
                <button
                  onClick={() => setSummaryMetricTab("quality")}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                    summaryMetricTab === "quality"
                      ? "bg-white text-gray-950 shadow-xs animate-none"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  Chất lượng
                </button>
                <button
                  onClick={() => setSummaryMetricTab("timeliness")}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                    summaryMetricTab === "timeliness"
                      ? "bg-white text-gray-950 shadow-xs animate-none"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  Trễ hạn / Đúng hạn
                </button>
              </div>
            </div>

            {summaryMetricTab === "quality" ? (
              summaryViewTab === "unit" ? (
                <div className="overflow-x-auto rounded-2xl border border-gray-100 max-h-[480px]">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-gray-50 text-gray-500 border-b border-gray-100 uppercase tracking-wider font-extrabold text-[10px]">
                        <th className="p-4">Đơn vị báo cáo</th>
                        <th className="p-4 text-center">Tổng số</th>
                        <th className="p-4 text-center text-emerald-600">Đạt</th>
                        <th className="p-4 text-center text-rose-600">Chưa đạt</th>
                        <th className="p-4 text-center text-slate-500">Chưa đánh giá</th>
                        <th className="p-4 text-right">Tỉ lệ đạt</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 font-medium text-gray-700">
                      {stats.unitList.map((item, idx) => (
                        <tr key={idx} className="hover:bg-gray-50/50 transition-colors">
                          <td className="p-4 font-bold text-gray-900 flex items-center gap-2">
                            <Building2 className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                            {item.name}
                          </td>
                          <td className="p-4 text-center font-extrabold text-gray-900 bg-gray-50/20">{item.total}</td>
                          <td className="p-4 text-center">
                            <span className={item.dat > 0 ? "text-emerald-600 font-extrabold" : "text-gray-400"}>
                              {item.dat}
                            </span>
                          </td>
                          <td className="p-4 text-center">
                            <span className={item.chuaDat > 0 ? "text-rose-600 font-extrabold" : "text-gray-400"}>
                              {item.chuaDat}
                            </span>
                          </td>
                          <td className="p-4 text-center">
                            <span className={item.chuaDanhGia > 0 ? "text-slate-500 font-extrabold" : "text-gray-400"}>
                              {item.chuaDanhGia}
                            </span>
                          </td>
                          <td className="p-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <span className="font-extrabold text-emerald-700">{item.rateDat}%</span>
                              <div className="w-16 bg-gray-100 h-2 rounded-full overflow-hidden shrink-0">
                                <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${item.rateDat}%` }} />
                              </div>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-gray-100 max-h-[480px]">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-gray-50 text-gray-500 border-b border-gray-100 uppercase tracking-wider font-extrabold text-[10px]">
                        <th className="p-4">Loại báo cáo</th>
                        <th className="p-4 text-center">Tổng số</th>
                        <th className="p-4 text-center text-emerald-600">Đạt</th>
                        <th className="p-4 text-center text-rose-600">Chưa đạt</th>
                        <th className="p-4 text-center text-slate-500">Chưa đánh giá</th>
                        <th className="p-4 text-right">Tỉ lệ đạt</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 font-medium text-gray-700">
                      {stats.classList.map((item, idx) => (
                        <tr key={idx} className="hover:bg-gray-50/50 transition-colors">
                          <td className="p-4 font-bold text-gray-900 flex items-center gap-2">
                            <Briefcase className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                            {item.name}
                          </td>
                          <td className="p-4 text-center font-extrabold text-gray-900 bg-gray-50/20">{item.total}</td>
                          <td className="p-4 text-center">
                            <span className={item.dat > 0 ? "text-emerald-600 font-extrabold" : "text-gray-400"}>
                              {item.dat}
                            </span>
                          </td>
                          <td className="p-4 text-center">
                            <span className={item.chuaDat > 0 ? "text-rose-600 font-extrabold" : "text-gray-400"}>
                              {item.chuaDat}
                            </span>
                          </td>
                          <td className="p-4 text-center">
                            <span className={item.chuaDanhGia > 0 ? "text-slate-500 font-extrabold" : "text-gray-400"}>
                              {item.chuaDanhGia}
                            </span>
                          </td>
                          <td className="p-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <span className="font-extrabold text-emerald-700">{item.rateDat}%</span>
                              <div className="w-16 bg-gray-100 h-2 rounded-full overflow-hidden shrink-0">
                                <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${item.rateDat}%` }} />
                              </div>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            ) : (
              summaryViewTab === "unit" ? (
                <div className="overflow-x-auto rounded-2xl border border-gray-100 max-h-[480px]">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-gray-50 text-gray-500 border-b border-gray-100 uppercase tracking-wider font-extrabold text-[10px]">
                        <th className="p-4">Đơn vị báo cáo</th>
                        <th className="p-4 text-center">Tổng số</th>
                        <th className="p-4 text-center text-emerald-600">Đúng hạn</th>
                        <th className="p-4 text-center text-rose-600">Trễ hạn</th>
                        <th className="p-4 text-right">Tỉ lệ đúng hạn</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 font-medium text-gray-700">
                      {stats.unitList.map((item, idx) => (
                        <tr key={idx} className="hover:bg-gray-50/50 transition-colors">
                          <td className="p-4 font-bold text-gray-900 flex items-center gap-2">
                            <Building2 className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                            {item.name}
                          </td>
                          <td className="p-4 text-center font-extrabold text-gray-900 bg-gray-50/20">{item.total}</td>
                          <td className="p-4 text-center">
                            <span className={item.onTime > 0 ? "text-emerald-600 font-extrabold" : "text-gray-400"}>
                              {item.onTime}
                            </span>
                          </td>
                          <td className="p-4 text-center">
                            <span className={item.late > 0 ? "text-rose-600 font-extrabold" : "text-gray-400"}>
                              {item.late}
                            </span>
                          </td>
                          <td className="p-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <span className="font-extrabold text-emerald-700">{item.rateOnTime}%</span>
                              <div className="w-16 bg-gray-100 h-2 rounded-full overflow-hidden shrink-0">
                                <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${item.rateOnTime}%` }} />
                              </div>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-gray-100 max-h-[480px]">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-gray-50 text-gray-500 border-b border-gray-100 uppercase tracking-wider font-extrabold text-[10px]">
                        <th className="p-4">Loại báo cáo</th>
                        <th className="p-4 text-center">Tổng số</th>
                        <th className="p-4 text-center text-emerald-600">Đúng hạn</th>
                        <th className="p-4 text-center text-rose-600">Trễ hạn</th>
                        <th className="p-4 text-right">Tỉ lệ đúng hạn</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 font-medium text-gray-700">
                      {stats.classList.map((item, idx) => (
                        <tr key={idx} className="hover:bg-gray-50/50 transition-colors">
                          <td className="p-4 font-bold text-gray-900 flex items-center gap-2">
                            <Briefcase className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                            {item.name}
                          </td>
                          <td className="p-4 text-center font-extrabold text-gray-900 bg-gray-50/20">{item.total}</td>
                          <td className="p-4 text-center">
                            <span className={item.onTime > 0 ? "text-emerald-600 font-extrabold" : "text-gray-400"}>
                              {item.onTime}
                            </span>
                          </td>
                          <td className="p-4 text-center">
                            <span className={item.late > 0 ? "text-rose-600 font-extrabold" : "text-gray-400"}>
                              {item.late}
                            </span>
                          </td>
                          <td className="p-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <span className="font-extrabold text-emerald-700">{item.rateOnTime}%</span>
                              <div className="w-16 bg-gray-100 h-2 rounded-full overflow-hidden shrink-0">
                                <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${item.rateOnTime}%` }} />
                              </div>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}
          </div>

          {/* RIGHT: Visual Charts (5 cols) */}
          <div className="xl:col-span-5 space-y-6">
            {/* Status Breakdown Chart (Pie) */}
            <div className="bg-gray-50/40 rounded-2xl p-5 border border-gray-100/60">
              <h4 className="font-bold text-sm text-gray-800 mb-4 flex items-center gap-2">
                <LucidePieChart className="w-4.5 h-4.5 text-emerald-600" />
                {summaryMetricTab === "quality" ? "Tỉ lệ trạng thái đánh giá chung" : "Tỉ lệ nộp báo cáo đúng hạn"}
              </h4>
              <div className="h-[200px] flex items-center justify-center">
                {stats.total === 0 ? (
                  <span className="text-xs text-gray-400">Không có dữ liệu</span>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={summaryMetricTab === "quality" ? stats.pieData : stats.pieDataTimeliness}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={75}
                        paddingAngle={4}
                        dataKey="value"
                      >
                        {(summaryMetricTab === "quality" ? stats.pieData : stats.pieDataTimeliness).map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <RechartsTooltip 
                        formatter={(value) => [`${value} báo cáo`, "Số lượng"]}
                        contentStyle={{ borderRadius: "12px", border: "1px solid #e2e8f0", fontSize: "11px" }}
                      />
                      <Legend 
                        verticalAlign="bottom" 
                        height={36}
                        iconType="circle"
                        iconSize={8}
                        wrapperStyle={{ fontSize: "11px", fontWeight: "bold" }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Units Comparison Stacked Bar Chart */}
            <div className="bg-gray-50/40 rounded-2xl p-5 border border-gray-100/60">
              <h4 className="font-bold text-sm text-gray-800 mb-4 flex items-center gap-2">
                <BarChart3 className="w-4.5 h-4.5 text-emerald-600" />
                {summaryMetricTab === "quality" ? "Chất lượng báo cáo theo đơn vị" : "Thời hạn báo cáo theo đơn vị"}
              </h4>
              <div className="h-[400px] overflow-y-auto pr-1 scrollbar-thin">
                {stats.unitList.length === 0 ? (
                  <span className="text-xs text-gray-400">Không có dữ liệu</span>
                ) : (
                  <ResponsiveContainer width="100%" height={Math.max(380, stats.unitList.length * 36)}>
                    <BarChart
                      data={stats.unitList} // Show all units
                      layout="vertical"
                      margin={{ top: 5, right: 10, left: 10, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                      <XAxis 
                        type="number"
                        tick={{ fill: "#64748b", fontSize: 9, fontWeight: "bold" }} 
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis 
                        type="category"
                        dataKey="name"
                        width={130}
                        tick={{ fill: "#64748b", fontSize: 9, fontWeight: "bold" }} 
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(val) => val.length > 20 ? `${val.substring(0, 18)}...` : val}
                      />
                      <RechartsTooltip 
                        contentStyle={{ borderRadius: "12px", border: "1px solid #e2e8f0", fontSize: "11px" }}
                      />
                      {summaryMetricTab === "quality" ? (
                        <>
                          <Bar dataKey="dat" name="Đạt" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} />
                          <Bar dataKey="chuaDat" name="Chưa đạt" stackId="a" fill="#f43f5e" radius={[0, 0, 0, 0]} />
                          <Bar dataKey="chuaDanhGia" name="Chưa đánh giá" stackId="a" fill="#94a3b8" radius={[0, 4, 4, 0]} />
                        </>
                      ) : (
                        <>
                          <Bar dataKey="onTime" name="Đúng hạn" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} />
                          <Bar dataKey="late" name="Trễ hạn" stackId="a" fill="#f43f5e" radius={[0, 4, 4, 0]} />
                        </>
                      )}
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
