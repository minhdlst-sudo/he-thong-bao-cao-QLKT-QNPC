import React, { useState, useEffect } from "react";
import { 
  LayoutDashboard, 
  FileText, 
  CheckCircle2, 
  Clock, 
  ExternalLink, 
  LogOut, 
  ChevronRight,
  Plus,
  Search,
  Calendar,
  Filter,
  AlertCircle,
  RefreshCw,
  Send
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import DatePicker, { registerLocale } from "react-datepicker";
import { vi } from "date-fns/locale/vi";
import "react-datepicker/dist/react-datepicker.css";
import { UNITS, ReportDefinition, ReportSubmission } from "./types";
import SummaryReport from "./components/SummaryReport";

registerLocale("vi", vi);

export default function App() {
  const [selectedUnit, setSelectedUnit] = useState<string | null>(() => localStorage.getItem("selectedUnit"));
  const [reports, setReports] = useState<ReportDefinition[]>([]);
  const [submissions, setSubmissions] = useState<ReportSubmission[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [historyFilter, setHistoryFilter] = useState<"Tất cả" | "Tuần" | "Tháng" | "Khác">("Tất cả");
  const [loading, setLoading] = useState(false);
  const [selectedReportId, setSelectedReportId] = useState<number | "">("");
  const selectedReport = reports.find(r => r.id === selectedReportId);
  
  const [currentView, setCurrentView] = useState<"dashboard" | "summary">("dashboard");
  const [allHistory, setAllHistory] = useState<any[]>([]);
  const [summaryLoading, setSummaryLoading] = useState(false);
  
  // Period Selection
  const [periodType, setPeriodType] = useState<"week" | "month" | "other">("month");
  const [periodValue, setPeriodValue] = useState("");
  
  const [updateForm, setUpdateForm] = useState({
    dateSent: new Date().toISOString().split('T')[0],
    attachmentLink: "",
  });

  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const getReportStatus = (report: ReportDefinition) => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    let deadlineDate: Date | null = null;
    let periodStr = "";
    let resetDate: Date | null = null;

    const cycle = report.cycle?.toLowerCase() || "";

    // Monthly report logic: "Ngày XX hàng tháng"
    const dayMatch = report.deadline.match(/Ngày (\d+)/i);
    if (dayMatch) {
      const day = parseInt(dayMatch[1]);
      const targetMonth = currentMonth - 1 || 12;
      const targetYear = currentMonth === 1 ? currentYear - 1 : currentYear;
      
      deadlineDate = new Date(currentYear, currentMonth - 1, day);
      deadlineDate.setHours(23, 59, 59, 999);
      periodStr = `Tháng ${targetMonth.toString().padStart(2, '0')}/${targetYear}`;
      
      // Reset 4 days before next month starts
      resetDate = new Date(currentYear, currentMonth, 1);
      resetDate.setDate(resetDate.getDate() - 4);
      resetDate.setHours(0, 0, 0, 0);
    } else if (cycle.includes("tuần")) {
      // Weekly logic: Reset 4 days before next Monday
      const dayOfWeek = now.getDay();
      const daysToNextMonday = (1 - dayOfWeek + 7) % 7 || 7;
      const nextMonday = new Date(now);
      nextMonday.setDate(now.getDate() + daysToNextMonday);
      nextMonday.setHours(0, 0, 0, 0);
      
      resetDate = new Date(nextMonday);
      resetDate.setDate(resetDate.getDate() - 4);
      resetDate.setHours(0, 0, 0, 0);

      // Determine target week (previous week)
      const startOfYear = new Date(currentYear, 0, 1);
      const days = Math.floor((now.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000));
      const currentWeek = Math.ceil((days + startOfYear.getDay() + 1) / 7);
      const targetWeek = currentWeek - 1;
      periodStr = `Tuần ${targetWeek.toString().padStart(2, '0')}/${currentYear}`;

      // Deadline for weekly (assume Friday of current week)
      deadlineDate = new Date(now);
      const daysToFriday = (5 - dayOfWeek + 7) % 7;
      deadlineDate.setDate(now.getDate() + daysToFriday);
      deadlineDate.setHours(23, 59, 59, 999);
    } else {
      // Try parsing as direct date DD/MM/YYYY
      const dmyMatch = report.deadline.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (dmyMatch) {
        deadlineDate = new Date(parseInt(dmyMatch[3]), parseInt(dmyMatch[2]) - 1, parseInt(dmyMatch[1]));
        deadlineDate.setHours(23, 59, 59, 999);
        periodStr = report.deadline;
      }
    }

    // Reset logic: 4 days before next cycle
    if (resetDate && now >= resetDate) {
      return { type: 'normal', color: 'text-gray-400', label: '', icon: '' };
    }

    if (!deadlineDate) return { type: 'normal', color: 'text-gray-400', label: '', icon: '' };

    // Check if submitted for this period
    const submission = submissions.find(s => 
      s.reportDefinitionId === report.id && 
      (s.period.includes(periodStr) || s.period === periodStr)
    );

    if (submission) {
      const isLate = checkIsLate(submission.dateSent, report.deadline, submission.period, submission.year);
      if (isLate) {
        return { 
          type: 'submitted-late', 
          color: 'text-red-600', 
          label: `Đã báo cáo - Trễ hạn`, 
          icon: '🔴',
          bg: 'bg-red-50',
          border: 'border-red-200'
        };
      }
      return { 
        type: 'submitted', 
        color: 'text-purple-600', 
        label: `Đã báo cáo kỳ ${periodStr}`, 
        icon: '✅',
        bg: 'bg-purple-50',
        border: 'border-purple-200'
      };
    }

    const diffTime = deadlineDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return { type: 'late', color: 'text-red-600', label: 'Trễ hạn', icon: '🔴', bg: 'bg-red-50', border: 'border-red-200' };
    if (diffDays <= 2) return { type: 'urgent', color: 'text-amber-600', label: 'Cận hạn (2 ngày)', icon: '🟠', bg: 'bg-amber-50', border: 'border-amber-200' };
    if (diffDays <= 3) return { type: 'warning', color: 'text-emerald-600', label: 'Sắp hạn (3 ngày)', icon: '🟢', bg: 'bg-emerald-50', border: 'border-emerald-200' };

    return { type: 'normal', color: 'text-gray-500', label: 'Chưa nộp', icon: '⚪' };
  };

  useEffect(() => {
    if (selectedUnit) {
      localStorage.setItem("selectedUnit", selectedUnit);
      fetchData();
    }
  }, [selectedUnit]);

  useEffect(() => {
    if (selectedReport) {
      const cycle = selectedReport.cycle?.toLowerCase() || "";
      let newType: "week" | "month" | "other" = "other";
      
      if (cycle.includes("tuần")) {
        newType = "week";
      } else if (cycle.includes("tháng")) {
        newType = "month";
      }

      setPeriodType(newType);
      
      if (newType === "other") {
        setPeriodValue(selectedReport.deadline || "");
      } else {
        // If current value is not a valid number for the new type, reset it
        const valNum = parseInt(periodValue);
        const max = newType === "week" ? 52 : 12;
        if (isNaN(valNum) || valNum > max || valNum < 1) {
          setPeriodValue("");
        }
      }
    }
  }, [selectedReport]);

  useEffect(() => {
    if (currentView === "summary") {
      fetchAllHistory();
    }
  }, [currentView]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [reportsRes, submissionsRes, historyRes] = await Promise.all([
        fetch(`/api/reports?unitName=${encodeURIComponent(selectedUnit!)}`),
        fetch(`/api/submissions?unitName=${encodeURIComponent(selectedUnit!)}`),
        fetch(`/api/history?unitName=${encodeURIComponent(selectedUnit!)}`)
      ]);
      
      if (!reportsRes.ok || !submissionsRes.ok || !historyRes.ok) {
        const errorText = await (!reportsRes.ok ? reportsRes.text() : !submissionsRes.ok ? submissionsRes.text() : historyRes.text());
        throw new Error(`Server error: ${errorText}`);
      }

      const reportsData = await reportsRes.json();
      const submissionsData = await submissionsRes.json();
      const historyData = await historyRes.json();
      setReports(reportsData);
      setSubmissions(submissionsData);
      setHistory(historyData);
    } catch (error) {
      console.error("Error fetching data:", error);
      setMessage({ type: 'error', text: "Lỗi khi tải dữ liệu từ máy chủ. Vui lòng thử lại sau." });
    } finally {
      setLoading(false);
    }
  };

  const fetchAllHistory = async () => {
    setSummaryLoading(true);
    try {
      const res = await fetch("/api/all-history");
      if (res.ok) {
        const data = await res.json();
        setAllHistory(data);
      }
    } catch (error) {
      console.error("Error fetching all history:", error);
    } finally {
      setSummaryLoading(false);
    }
  };

  const refreshDefinitions = async () => {
    setLoading(true);
    await fetch("/api/refresh-definitions", { method: "POST" });
    await fetchData();
  };

  const handleLogout = () => {
    setShowLogoutConfirm(true);
  };

  const confirmLogout = () => {
    setSelectedUnit(null);
    localStorage.removeItem("selectedUnit");
    setShowLogoutConfirm(false);
  };

  const reportStats = reports.reduce((acc, r) => {
    const status = getReportStatus(r);
    if (status.type === 'late' || status.type === 'submitted-late') acc.late++;
    else if (status.type === 'urgent') acc.urgent++;
    else if (status.type === 'warning') acc.warning++;
    else if (status.type === 'submitted') acc.submitted++;
    else acc.pending++;
    return acc;
  }, { late: 0, urgent: 0, warning: 0, submitted: 0, pending: 0 });

  const handleUpdateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReportId || !periodValue) {
      setMessage({ type: 'error', text: "Vui lòng chọn báo cáo và kỳ báo cáo" });
      return;
    }

    const currentPeriod = periodType === 'other' ? periodValue : `${periodType === 'week' ? 'Tuần' : 'Tháng'} ${periodValue}`;
    const currentContent = selectedReport?.content;

    // Check for duplicates in history
    const isDuplicate = history.some(h => 
      h.content === currentContent && 
      h.period === currentPeriod
    );

    if (isDuplicate) {
      setMessage({ type: 'error', text: "Báo cáo kỳ này đã được cập nhật và số liệu sẽ không gửi đi" });
      return;
    }

    setSubmitting(true);
    setMessage(null);
    try {
      const res = await fetch("/api/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportDefinitionId: selectedReportId,
          unitName: selectedUnit,
          dateSent: updateForm.dateSent,
          attachmentLink: updateForm.attachmentLink,
          period: currentPeriod,
        })
      });
      if (res.ok) {
        setMessage({ type: 'success', text: "Cập nhật thành công và đã đồng bộ lên Google Sheet!" });
        setUpdateForm({ ...updateForm, attachmentLink: "" });
        fetchData();
      } else {
        setMessage({ type: 'error', text: "Có lỗi xảy ra khi gửi dữ liệu" });
      }
    } catch (error) {
      setMessage({ type: 'error', text: "Lỗi kết nối máy chủ" });
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "";
    // Handle YYYY-MM-DD
    const ymdMatch = dateStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (ymdMatch) {
      return `${ymdMatch[3].padStart(2, '0')}/${ymdMatch[2].padStart(2, '0')}/${ymdMatch[1]}`;
    }
    // Handle YYYY-MM-DDTHH:mm:ss...
    const isoMatch = dateStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})T/);
    if (isoMatch) {
      return `${isoMatch[3].padStart(2, '0')}/${isoMatch[2].padStart(2, '0')}/${isoMatch[1]}`;
    }
    return dateStr;
  };

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
        const d = new Date(str);
        return isNaN(d.getTime()) ? null : d;
      };

      const sentDate = parseDateStr(dateSentStr);
      if (!sentDate) return false;

      // Handle "Ngày XX hàng tháng"
      const dayMatch = deadlineStr.match(/Ngày (\d+)/i);
      const monthMatch = periodStr.match(/Tháng (\d+)/i);
      
      if (dayMatch && monthMatch) {
        const day = parseInt(dayMatch[1]);
        const reportMonth = parseInt(monthMatch[1]); // Month N (1-12)
        const year = reportYear ? parseInt(String(reportYear)) : sentDate.getFullYear();
        
        // Deadline is Day XX of Month N+1
        const deadlineDate = new Date(year, reportMonth, day);
        deadlineDate.setHours(23, 59, 59, 999);
        return sentDate > deadlineDate;
      }

      // Handle direct date comparison (like 24/01/2026)
      const deadlineDate = parseDateStr(deadlineStr);
      if (deadlineDate) {
        // Set time to end of day for deadline
        deadlineDate.setHours(23, 59, 59, 999);
        return sentDate > deadlineDate;
      }
    } catch (e) {
      return false;
    }
    return false;
  };

  if (!selectedUnit) {
    return (
      <div className="min-h-screen bg-[#F5F5F5] flex items-center justify-center p-4 font-sans">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-3xl shadow-xl p-8 w-full max-w-md border border-black/5"
        >
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center mb-4">
              <FileText className="text-emerald-600 w-8 h-8" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 text-center">Hệ thống báo cáo QLKT-QNPC</h1>
            <p className="text-gray-500 text-sm mt-2">Vui lòng chọn đơn vị để tiếp tục</p>
            
            <div className="mt-6 p-4 bg-amber-50 border border-amber-100 rounded-2xl">
              <div className="flex gap-3">
                <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800 leading-relaxed font-medium">
                  Ứng dụng này chỉ dành riêng cho công tác báo cáo <span className="font-bold">Phòng Kỹ thuật - Công ty Điện lực Quảng Ngãi</span> đang quản lý.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="relative">
              <select 
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 appearance-none focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all cursor-pointer"
                onChange={(e) => setSelectedUnit(e.target.value)}
                defaultValue=""
              >
                <option value="" disabled>Chọn đơn vị của bạn...</option>
                {UNITS.map(unit => (
                  <option key={unit} value={unit}>{unit}</option>
                ))}
              </select>
              <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                <ChevronRight className="w-5 h-5 text-gray-400 rotate-90" />
              </div>
            </div>
            
            <button 
              disabled={!selectedUnit}
              className="w-full bg-emerald-600 text-white font-semibold py-3 rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-600/20"
            >
              Đăng nhập
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F9FA] font-sans text-gray-900 pb-12">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-600 p-2 rounded-lg">
              <FileText className="text-white w-5 h-5" />
            </div>
            <span className="font-bold text-lg hidden sm:block">QLKT-QNPC</span>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl mr-2">
              <button 
                onClick={() => setCurrentView("dashboard")}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${currentView === 'dashboard' ? 'bg-white text-emerald-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                Điện lực
              </button>
              <button 
                onClick={() => setCurrentView("summary")}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${currentView === 'summary' ? 'bg-white text-emerald-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                Tất cả đơn vị
              </button>
            </div>

            <button 
              onClick={refreshDefinitions}
              className={`p-2 hover:bg-emerald-50 rounded-full transition-all text-emerald-600 hover:text-emerald-700 shadow-sm hover:shadow active:scale-95 ${loading ? 'animate-spin' : ''}`}
              title="Làm mới danh mục báo cáo"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
            <div className="text-right hidden sm:block">
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-0.5">Đơn vị</p>
              <p className="text-sm font-bold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-lg border border-emerald-100 shadow-sm">{selectedUnit}</p>
            </div>
            <button 
              onClick={handleLogout}
              className="p-2 hover:bg-red-50 rounded-full transition-colors text-gray-400 hover:text-red-500"
              title="Đăng xuất"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <AnimatePresence mode="wait">
          {currentView === "dashboard" ? (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.2 }}
            >
              <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Cập nhật báo cáo</h2>
                  <p className="text-gray-500">Chọn nội dung báo cáo từ danh sách và nhập kết quả thực hiện.</p>
                </div>
                
                <div className="flex flex-wrap gap-3">
                  <div className="bg-white border border-amber-100 rounded-2xl px-4 py-2 shadow-sm flex items-center gap-3">
                    <div className="w-8 h-8 bg-amber-50 rounded-lg flex items-center justify-center text-amber-600 font-bold text-sm">
                      {reportStats.urgent}
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Cận hạn</p>
                      <p className="text-xs font-bold text-amber-600">Trong 2 ngày</p>
                    </div>
                  </div>

                  <div className="bg-white border border-emerald-100 rounded-2xl px-4 py-2 shadow-sm flex items-center gap-3">
                    <div className="w-8 h-8 bg-emerald-50 rounded-lg flex items-center justify-center text-emerald-600 font-bold text-sm">
                      {reportStats.warning}
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Sắp hạn</p>
                      <p className="text-xs font-bold text-emerald-600">Trong 3 ngày</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left Column: Form */}
                <div className="lg:col-span-1">
                  <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6 sm:p-8 sticky top-24">
                    <form onSubmit={handleUpdateSubmit} className="space-y-6">
                      {/* Report Selection */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider">Nội dung báo cáo</label>
                          <div className="flex gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-purple-500" title="Đã báo cáo"></span>
                            <span className="w-2 h-2 rounded-full bg-emerald-500" title="Sắp hạn (3 ngày)"></span>
                            <span className="w-2 h-2 rounded-full bg-amber-500" title="Cận hạn (2 ngày)"></span>
                            <span className="w-2 h-2 rounded-full bg-red-500" title="Trễ hạn"></span>
                          </div>
                        </div>
                        <div className="relative">
                          <select 
                            required
                            value={selectedReportId}
                            onChange={(e) => setSelectedReportId(e.target.value ? Number(e.target.value) : "")}
                            className={`w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 appearance-none focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all ${
                              selectedReportId ? getReportStatus(reports.find(r => r.id === selectedReportId)!).color : ''
                            }`}
                          >
                            <option value="">-- Chọn nội dung báo cáo --</option>
                            {reports.map(r => {
                              const status = getReportStatus(r);
                              return (
                                <option key={r.id} value={r.id} className={status.color}>
                                  {status.icon} {r.content} {status.label ? `(${status.label})` : ''}
                                </option>
                              );
                            })}
                          </select>
                          <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                            <ChevronRight className="w-5 h-5 text-gray-400 rotate-90" />
                          </div>
                        </div>
                      </div>

                      {/* Auto-filled Fields */}
                      <AnimatePresence>
                        {selectedReport && (
                          <motion.div 
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-emerald-50/50 p-4 rounded-2xl border border-emerald-100"
                          >
                            <div>
                              <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Phân loại</p>
                              <p className="text-sm font-medium">{selectedReport.classification}</p>
                            </div>
                            <div>
                              <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Phụ trách</p>
                              <p className="text-sm font-medium">{selectedReport.specialist}</p>
                            </div>
                            <div>
                              <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Chu kỳ</p>
                              <p className="text-sm font-medium">{selectedReport.cycle}</p>
                            </div>
                            <div>
                              <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Thời hạn</p>
                              <p className="text-sm font-medium">{selectedReport.deadline || "N/A"}</p>
                            </div>
                            <div className="col-span-1 sm:col-span-2 mt-2 pt-2 border-t border-emerald-100/50">
                              <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                getReportStatus(selectedReport).bg || 'bg-gray-100'
                              } ${getReportStatus(selectedReport).color}`}>
                                <span>{getReportStatus(selectedReport).icon}</span>
                                <span>Tình trạng: {getReportStatus(selectedReport).label}</span>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {/* Period Selection */}
                      <div className="grid grid-cols-1 gap-6">
                        <div>
                          <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Giá trị kỳ báo cáo</label>
                          {periodType === 'other' ? (
                            <input 
                              type="text" 
                              required
                              readOnly
                              placeholder="Lấy từ thời hạn báo cáo..."
                              className="w-full bg-gray-100 border border-gray-200 rounded-xl px-4 py-2.5 focus:outline-none cursor-not-allowed text-gray-600"
                              value={periodValue}
                            />
                          ) : (
                            <div className="relative">
                              <select 
                                required
                                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 appearance-none focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all cursor-pointer"
                                value={periodValue}
                                onChange={(e) => setPeriodValue(e.target.value)}
                              >
                                <option value="">-- Chọn {periodType === 'week' ? 'tuần' : 'tháng'} --</option>
                                {Array.from({ length: periodType === 'week' ? 52 : 12 }, (_, i) => {
                                  const val = (i + 1).toString().padStart(2, '0');
                                  return <option key={val} value={val}>{periodType === 'week' ? `Tuần ${val}` : `Tháng ${val}`}</option>;
                                })}
                              </select>
                              <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                                <ChevronRight className="w-5 h-5 text-gray-400 rotate-90" />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Submission Details */}
                      <div className="grid grid-cols-1 gap-6">
                        <div>
                          <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Ngày gửi báo cáo</label>
                          <div className="relative custom-datepicker">
                            <DatePicker
                              selected={updateForm.dateSent ? new Date(updateForm.dateSent) : null}
                              onChange={(date) => setUpdateForm({...updateForm, dateSent: date ? date.toISOString().split('T')[0] : ""})}
                              dateFormat="dd/MM/yyyy"
                              locale="vi"
                              required
                              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all cursor-pointer"
                              placeholderText="Chọn ngày gửi báo cáo"
                            />
                            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                              <Calendar className="w-5 h-5" />
                            </div>
                          </div>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Link báo cáo đính kèm</label>
                        <input 
                          type="url" 
                          required
                          placeholder="Dán link Google Drive hoặc Sharepoint tại đây..."
                          className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
                          value={updateForm.attachmentLink}
                          onChange={(e) => setUpdateForm({...updateForm, attachmentLink: e.target.value})}
                        />
                      </div>

                      <button 
                        type="submit"
                        disabled={submitting}
                        className="w-full bg-emerald-600 text-white font-bold py-4 rounded-xl hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        {submitting ? (
                          <RefreshCw className="w-5 h-5 animate-spin" />
                        ) : (
                          <Send className="w-5 h-5" />
                        )}
                        Gửi báo cáo
                      </button>

                      {message && (
                        <motion.div 
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className={`p-4 rounded-xl text-sm font-medium flex items-center gap-2 ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-red-50 text-red-700 border border-red-100'}`}
                        >
                          {message.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                          {message.text}
                        </motion.div>
                      )}
                    </form>
                  </div>
                </div>

                {/* Right Column: Dashboard Stats & History */}
                <div className="lg:col-span-2 space-y-8">
                  {/* History Table */}
                  <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                      <h3 className="font-bold flex items-center gap-2">
                        <Clock className="text-emerald-600 w-5 h-5" />
                        Lịch sử cập nhật của đơn vị
                      </h3>
                      <div className="flex bg-gray-100 p-1 rounded-xl">
                        {(["Tất cả", "Tuần", "Tháng", "Khác"] as const).map((f) => (
                          <button
                            key={f}
                            onClick={() => setHistoryFilter(f)}
                            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                              historyFilter === f ? "bg-white text-emerald-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
                            }`}
                          >
                            {f}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-gray-50 border-b border-gray-200">
                            <th className="px-3 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Thời gian cập nhật</th>
                            <th className="px-3 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Nội dung báo cáo</th>
                            <th className="px-3 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Kỳ báo cáo</th>
                            <th className="px-3 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Thời hạn</th>
                            <th className="px-3 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-wider text-center">Ngày gửi</th>
                            <th className="px-3 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-wider text-center">Trạng thái</th>
                            <th className="px-3 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-wider text-center">Tài liệu</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {history
                            .filter(item => {
                              const period = String(item.period || "");
                              if (historyFilter === "Tất cả") return true;
                              if (historyFilter === "Tuần") return period.startsWith("Tuần");
                              if (historyFilter === "Tháng") return period.startsWith("Tháng");
                              if (historyFilter === "Khác") return !period.startsWith("Tuần") && !period.startsWith("Tháng");
                              return true;
                            })
                            .slice().reverse().map((item, idx) => {
                              const isLate = checkIsLate(item.dateSent, item.deadline, item.period, item.year);
                              return (
                                <tr key={idx} className="hover:bg-gray-50/50 transition-colors">
                                  <td className="px-3 py-4 text-[10px] text-gray-500 leading-tight">
                                    {item.timestamp?.split(' ').map((part: string, i: number) => (
                                      <div key={i}>{part}</div>
                                    ))}
                                  </td>
                                  <td className="px-3 py-4">
                                    <p className="text-xs font-medium text-gray-900 break-words whitespace-pre-wrap line-clamp-2" title={item.content}>{item.content}</p>
                                    <p className="text-[9px] text-gray-400 mt-1 line-clamp-1">{item.classification}</p>
                                  </td>
                                  <td className="px-3 py-4">
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-emerald-50 text-emerald-600 uppercase tracking-wider whitespace-nowrap">
                                      {item.period}
                                    </span>
                                  </td>
                                  <td className="px-3 py-4 text-[10px] text-gray-500 whitespace-nowrap">{formatDate(item.deadline)}</td>
                                  <td className="px-3 py-4 text-[10px] text-gray-500 whitespace-nowrap text-center">{formatDate(item.dateSent)}</td>
                                  <td className="px-3 py-4 text-center">
                                    {isLate ? (
                                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-red-50 text-red-600 uppercase tracking-wider whitespace-nowrap">
                                        <AlertCircle className="w-2.5 h-2.5" />
                                        Trễ
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-emerald-50 text-emerald-600 uppercase tracking-wider whitespace-nowrap">
                                        <CheckCircle2 className="w-2.5 h-2.5" />
                                        Đúng hạn
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-3 py-4 text-center">
                                    <a 
                                      href={item.attachment} 
                                      target="_blank" 
                                      rel="noopener noreferrer"
                                      className="text-emerald-600 hover:text-emerald-700 transition-colors inline-block"
                                    >
                                      <ExternalLink className="w-3.5 h-3.5" />
                                    </a>
                                  </td>
                                </tr>
                              );
                            })}
                          {history.length === 0 && (
                            <tr>
                              <td colSpan={7} className="px-6 py-12 text-center text-gray-400 text-sm">
                                Chưa có dữ liệu cập nhật nào được ghi nhận trên Google Sheet.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="summary"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              <div className="mb-8">
                <h2 className="text-2xl font-bold text-gray-900">Tổng hợp báo cáo toàn đơn vị</h2>
                <p className="text-gray-500">Theo dõi tình hình thực hiện báo cáo của tất cả các đơn vị trực thuộc.</p>
              </div>
              <SummaryReport 
                history={allHistory} 
                loading={summaryLoading} 
                checkIsLate={checkIsLate}
                formatDate={formatDate}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Logout Confirmation Modal */}
      <AnimatePresence>
        {showLogoutConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl border border-gray-100"
            >
              <div className="flex items-center gap-3 text-red-600 mb-4">
                <div className="bg-red-50 p-2 rounded-lg">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <h3 className="font-bold text-lg">Xác nhận đăng xuất</h3>
              </div>
              
              <p className="text-gray-600 mb-6 leading-relaxed">
                Bạn có muốn thoát phiên làm việc này không?
              </p>
              
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowLogoutConfirm(false)}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 font-bold text-gray-500 hover:bg-gray-50 transition-colors"
                >
                  No
                </button>
                <button 
                  onClick={confirmLogout}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-red-600 text-white font-bold hover:bg-red-700 transition-colors shadow-lg shadow-red-600/20"
                >
                  Yes
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
