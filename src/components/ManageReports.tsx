import React, { useState, useEffect } from "react";
import { 
  Plus, 
  Save, 
  X, 
  AlertCircle, 
  CheckCircle2,
  RefreshCw,
  FilePlus,
  ChevronDown,
  Check,
  Calendar,
  Search,
  FileText,
  ChevronRight
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import DatePicker, { registerLocale } from "react-datepicker";
import { vi } from "date-fns/locale/vi";
import "react-datepicker/dist/react-datepicker.css";
import { ReportDefinition } from "../types";

registerLocale("vi", vi);

interface ManageReportsProps {
  units: string[];
  reports: ReportDefinition[];
  allHistory: any[];
  onRefresh: () => Promise<void>;
}

export default function ManageReports({ units: initialUnits, reports, allHistory, onRefresh }: ManageReportsProps) {
  const [loading, setLoading] = useState(false);
  const [metaLoading, setMetaLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  
  const [classifications, setClassifications] = useState<string[]>([]);
  const [specialists, setSpecialists] = useState<string[]>([]);
  const [cycles, setCycles] = useState<string[]>([]);
  const [deadlines, setDeadlines] = useState<string[]>([]);
  const [availableUnits, setAvailableUnits] = useState<string[]>([]);
  const [showUnitDropdown, setShowUnitDropdown] = useState(false);
  const [specificDate, setSpecificDate] = useState<Date | null>(null);

  const getReportStats = (report: ReportDefinition) => {
    const normalizeUnit = (u: string) => (u || "").toLowerCase().trim().replace(/\s+/g, ' ');
    const normalizePeriod = (s: string) => (s || "").toLowerCase().trim().replace(/\s+/g, ' ').replace(/\b0+(\d+)/g, '$1');

    const assignedUnits = report.unit.split(",").map(u => u.trim());
    let targetUnits: string[] = [];

    const normalizedAvailableUnits = availableUnits.map(normalizeUnit);

    if (assignedUnits.some(u => normalizeUnit(u) === "tất cả")) {
      targetUnits = availableUnits.filter(u => {
        const nu = normalizeUnit(u);
        return nu !== "phòng kỹ thuật" && nu !== "văn thư pkt";
      });
    } else if (assignedUnits.some(u => normalizeUnit(u) === "điện lực")) {
      targetUnits = availableUnits.filter(u => normalizeUnit(u).startsWith("đl"));
    } else {
      targetUnits = assignedUnits;
    }

    // Determine current period for this report type
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    let periodStr = "";

    const cycle = report.cycle?.toLowerCase() || "";
    const isPeriodic = cycle.includes("tuần") || cycle.includes("tháng") || cycle.includes("quý") || cycle.includes("năm");

    if (cycle.includes("tuần")) {
      const startOfYear = new Date(currentYear, 0, 1);
      const days = Math.floor((now.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000));
      const currentWeek = Math.ceil((days + startOfYear.getDay() + 1) / 7);
      const targetWeek = currentWeek - 1 || 52;
      const targetYear = targetWeek === 52 && now.getMonth() === 0 ? currentYear - 1 : currentYear;
      periodStr = `Tuần ${targetWeek.toString().padStart(2, '0')}/${targetYear}`;
    } else if (cycle.includes("tháng")) {
      const targetMonth = currentMonth - 1 || 12;
      const targetYear = currentMonth === 1 ? currentYear - 1 : currentYear;
      periodStr = `Tháng ${targetMonth.toString().padStart(2, '0')}/${targetYear}`;
    } else if (cycle.includes("quý")) {
      const quarter = Math.floor((currentMonth - 1) / 3) + 1;
      periodStr = `Quý ${quarter}/${currentYear}`;
    } else if (cycle.includes("năm")) {
      periodStr = `Năm ${currentYear}`;
    } else {
      periodStr = report.deadline;
    }

    const normalizedPeriod = normalizePeriod(periodStr);
    const normalizedReportContent = (report.content || "").trim().toLowerCase();

    const reportedUnits = new Set(
      allHistory
        .filter(h => 
          (h.content || "").trim().toLowerCase() === normalizedReportContent && 
          normalizePeriod(h.period || "") === normalizedPeriod
        )
        .map(h => normalizeUnit(h.unit))
    );

    const reportedCount = targetUnits.filter(u => reportedUnits.has(normalizeUnit(u))).length;
    return { reported: reportedCount, total: targetUnits.length, currentPeriod: periodStr, isPeriodic };
  };

  const [formData, setFormData] = useState({
    content: "",
    classification: "",
    specialist: "",
    cycle: "",
    deadline: "",
    selectedUnits: ["Tất cả"] as string[],
    directingDocument: ""
  });

  useEffect(() => {
    const fetchMeta = async () => {
      try {
        const res = await fetch("/api/form-metadata");
        if (res.ok) {
          const data = await res.json();
          setClassifications(data.classifications);
          setSpecialists(data.specialists);
          setCycles(data.cycles);
          setDeadlines(data.deadlines);
          setAvailableUnits(data.units);
        }
      } catch (error) {
        console.error("Error fetching metadata:", error);
      } finally {
        setMetaLoading(false);
      }
    };
    fetchMeta();
  }, []);

  const toggleUnit = (unit: string) => {
    let newSelected = [...formData.selectedUnits];
    
    if (unit === "Tất cả") {
      newSelected = ["Tất cả"];
    } else if (unit === "Điện lực") {
      newSelected = ["Điện lực"];
    } else {
      // Remove "Tất cả" or "Điện lực" if a specific unit is selected
      newSelected = newSelected.filter(u => u !== "Tất cả" && u !== "Điện lực");
      
      if (newSelected.includes(unit)) {
        newSelected = newSelected.filter(u => u !== unit);
        if (newSelected.length === 0) newSelected = ["Tất cả"];
      } else {
        newSelected.push(unit);
      }
    }
    
    setFormData({ ...formData, selectedUnits: newSelected });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    let finalDeadline = formData.deadline;
    if (formData.deadline === "Ngày cụ thể" && specificDate) {
      finalDeadline = specificDate.toLocaleDateString("vi-VN");
    }

    try {
      const res = await fetch("/api/report-definitions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          deadline: finalDeadline,
          unit: formData.selectedUnits.join(", ")
        })
      });

      if (res.ok) {
        setMessage({ type: 'success', text: "Đã thêm yêu cầu báo cáo mới thành công!" });
        setFormData({
          content: "",
          classification: "",
          specialist: "",
          cycle: "",
          deadline: "",
          selectedUnits: ["Tất cả"],
          directingDocument: ""
        });
        setSpecificDate(null);
        await onRefresh();
      } else {
        const data = await res.json();
        throw new Error(data.error || "Lỗi khi thêm yêu cầu báo cáo");
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setLoading(false);
    }
  };

  if (metaLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl border border-gray-200">
        <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin mb-4" />
        <p className="text-gray-500 font-medium">Đang tải dữ liệu cấu hình...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-gray-100 bg-emerald-50/30">
          <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <FilePlus className="text-emerald-600 w-6 h-6" />
            Thêm yêu cầu báo cáo mới
          </h3>
          <p className="text-sm text-gray-500 mt-1">Nhập thông tin chi tiết để tạo yêu cầu báo cáo mới trong hệ thống.</p>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Nội dung báo cáo</label>
              <textarea 
                required
                rows={3}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
                placeholder="Nhập nội dung báo cáo chi tiết..."
                value={formData.content}
                onChange={(e) => setFormData({...formData, content: e.target.value})}
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Phân loại</label>
              <div className="relative">
                <select 
                  required
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 appearance-none focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all cursor-pointer"
                  value={formData.classification}
                  onChange={(e) => setFormData({...formData, classification: e.target.value})}
                >
                  <option value="">-- Chọn phân loại --</option>
                  {classifications.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                  <ChevronDown className="w-5 h-5 text-gray-400" />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Phụ trách (Chuyên viên)</label>
              <div className="relative">
                <select 
                  required
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 appearance-none focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all cursor-pointer"
                  value={formData.specialist}
                  onChange={(e) => setFormData({...formData, specialist: e.target.value})}
                >
                  <option value="">-- Chọn chuyên viên --</option>
                  {specialists.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                  <ChevronDown className="w-5 h-5 text-gray-400" />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Chu kỳ</label>
              <div className="relative">
                <select 
                  required
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 appearance-none focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all cursor-pointer"
                  value={formData.cycle}
                  onChange={(e) => setFormData({...formData, cycle: e.target.value})}
                >
                  <option value="">-- Chọn chu kỳ --</option>
                  {cycles.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                  <ChevronDown className="w-5 h-5 text-gray-400" />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Thời hạn</label>
              <div className="space-y-3">
                <div className="relative">
                  <select 
                    required
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 appearance-none focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all cursor-pointer"
                    value={formData.deadline}
                    onChange={(e) => setFormData({...formData, deadline: e.target.value})}
                  >
                    <option value="">-- Chọn thời hạn --</option>
                    {deadlines.filter(d => d !== "Ngày cụ thể").map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                    <option value="Ngày cụ thể">Ngày cụ thể</option>
                  </select>
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                    <ChevronDown className="w-5 h-5 text-gray-400" />
                  </div>
                </div>

                {formData.deadline === "Ngày cụ thể" && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="relative custom-datepicker"
                  >
                    <DatePicker
                      selected={specificDate}
                      onChange={(date) => setSpecificDate(date)}
                      dateFormat="dd/MM/yyyy"
                      locale="vi"
                      required
                      className="w-full bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all cursor-pointer"
                      placeholderText="Chọn ngày cụ thể..."
                    />
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-emerald-600">
                      <Calendar className="w-5 h-5" />
                    </div>
                  </motion.div>
                )}
              </div>
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Đơn vị thực hiện (Chọn một hoặc nhiều)</label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowUnitDropdown(!showUnitDropdown)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-left focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all flex items-center justify-between"
                >
                  <span className="truncate">
                    {formData.selectedUnits.length > 0 
                      ? formData.selectedUnits.join(", ") 
                      : "Chọn đơn vị..."}
                  </span>
                  <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${showUnitDropdown ? 'rotate-180' : ''}`} />
                </button>

                <AnimatePresence>
                  {showUnitDropdown && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setShowUnitDropdown(false)} />
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="absolute z-20 w-full mt-2 bg-white border border-gray-200 rounded-2xl shadow-xl max-h-64 overflow-y-auto p-2"
                      >
                        <div 
                          onClick={() => toggleUnit("Tất cả")}
                          className="flex items-center justify-between px-4 py-2.5 hover:bg-emerald-50 rounded-xl cursor-pointer transition-colors"
                        >
                          <span className="text-sm font-bold text-gray-700">Tất cả đơn vị</span>
                          {formData.selectedUnits.includes("Tất cả") && <Check className="w-4 h-4 text-emerald-600" />}
                        </div>
                        <div 
                          onClick={() => toggleUnit("Điện lực")}
                          className="flex items-center justify-between px-4 py-2.5 hover:bg-emerald-50 rounded-xl cursor-pointer transition-colors"
                        >
                          <span className="text-sm font-bold text-gray-700">Các Điện lực (ĐL)</span>
                          {formData.selectedUnits.includes("Điện lực") && <Check className="w-4 h-4 text-emerald-600" />}
                        </div>
                        <div className="h-px bg-gray-100 my-1" />
                        {availableUnits
                          .filter(u => u !== "Phòng kỹ thuật" && u !== "Văn thư PKT")
                          .map(u => (
                            <div 
                              key={u}
                              onClick={() => toggleUnit(u)}
                              className="flex items-center justify-between px-4 py-2.5 hover:bg-emerald-50 rounded-xl cursor-pointer transition-colors"
                            >
                              <span className="text-sm text-gray-600">{u}</span>
                              {formData.selectedUnits.includes(u) && <Check className="w-4 h-4 text-emerald-600" />}
                            </div>
                          ))}
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>
              <p className="mt-2 text-[10px] text-gray-400 italic">
                * "Điện lực": Giao cho tất cả đơn vị có chữ "ĐL". "Tất cả": Giao cho mọi đơn vị trừ PKT và Văn thư.
              </p>
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Văn bản chỉ đạo</label>
              <input 
                type="text"
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
                placeholder="Số hiệu văn bản..."
                value={formData.directingDocument}
                onChange={(e) => setFormData({...formData, directingDocument: e.target.value})}
              />
            </div>
          </div>

          <div className="pt-6 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-4">
            {message && (
              <motion.div 
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className={`flex items-center gap-2 text-sm font-medium ${message.type === 'success' ? 'text-emerald-600' : 'text-red-600'}`}
              >
                {message.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                {message.text}
              </motion.div>
            )}
            
            <button 
              type="submit"
              disabled={loading}
              className="w-full sm:w-auto bg-emerald-600 text-white font-bold px-8 py-3 rounded-xl hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
              Lưu yêu cầu báo cáo
            </button>
          </div>
        </form>
      </div>

      {/* List of Existing Reports */}
      <div className="mt-12 bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-gray-100 bg-gray-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <Calendar className="text-emerald-600 w-6 h-6" />
              Danh sách yêu cầu báo cáo
            </h3>
            <p className="text-sm text-gray-500 mt-1">Các yêu cầu báo cáo hiện có trong hệ thống (đồng bộ từ Google Sheets).</p>
          </div>
          
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input 
              type="text"
              placeholder="Tìm kiếm báo cáo..."
              className="pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all w-full sm:w-64"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-1 gap-6">
            {reports
              .filter(r => 
                r.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
                r.classification.toLowerCase().includes(searchTerm.toLowerCase()) ||
                r.specialist.toLowerCase().includes(searchTerm.toLowerCase()) ||
                r.unit.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (r.directingDocument || "").toLowerCase().includes(searchTerm.toLowerCase())
              )
              .map((report, index) => {
                const stats = getReportStats(report);
                const progress = stats.total > 0 ? (stats.reported / stats.total) * 100 : 0;
                
                return (
                  <motion.div 
                    key={report.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="group bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-emerald-200 transition-all overflow-hidden"
                  >
                    <div className="flex flex-col md:flex-row">
                      {/* Index & Content Section */}
                      <div className="p-5 md:w-2/5 border-b md:border-b-0 md:border-r border-gray-50">
                        <div className="flex items-start gap-4">
                          <span className="flex-shrink-0 w-8 h-8 rounded-lg bg-gray-50 text-gray-400 text-xs font-bold flex items-center justify-center border border-gray-100">
                            {index + 1}
                          </span>
                          <div className="space-y-2">
                            <h4 className="text-base font-bold text-gray-900 leading-snug group-hover:text-emerald-700 transition-colors">
                              {report.content}
                            </h4>
                            <div className="flex flex-wrap gap-2">
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100 uppercase tracking-wider">
                                {report.classification}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Metadata Grid */}
                      <div className="p-5 md:w-2/5 grid grid-cols-2 sm:grid-cols-3 gap-4 border-b md:border-b-0 md:border-r border-gray-50 bg-gray-50/30">
                        <div>
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Phụ trách</p>
                          <p className="text-sm font-medium text-gray-700">{report.specialist}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Thời hạn</p>
                          <p className="text-sm font-medium text-gray-700">{report.deadline}</p>
                        </div>
                        <div>
                          {stats.isPeriodic ? (
                            <div className="mt-1">
                              <p className="text-sm font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg inline-block border border-emerald-100">
                                {stats.currentPeriod}
                              </p>
                            </div>
                          ) : (
                            <div className="bg-blue-50/50 p-2 rounded-xl border border-blue-100">
                              <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest mb-1 flex items-center gap-1">
                                <FileText className="w-3 h-3" />
                                Văn bản chỉ đạo
                              </p>
                              <p className="text-xs font-bold text-blue-800 leading-tight">
                                {report.directingDocument || "Chưa cập nhật"}
                              </p>
                            </div>
                          )}
                        </div>
                        <div className="col-span-full">
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Đơn vị thực hiện</p>
                          <p className="text-xs text-gray-500 leading-relaxed">{report.unit}</p>
                        </div>
                      </div>

                      {/* Stats Section */}
                      <div className="p-5 md:w-1/5 flex flex-col items-center justify-center bg-white">
                        <div className="text-center space-y-3 w-full max-w-[120px]">
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Tiến độ nộp</p>
                          <div className="relative pt-1">
                            <div className="flex items-center justify-between mb-2">
                              <div>
                                <span className={`text-xs font-bold inline-block py-1 px-2 uppercase rounded-full ${progress === 100 ? 'text-emerald-600 bg-emerald-50' : 'text-blue-600 bg-blue-50'}`}>
                                  {stats.reported}/{stats.total}
                                </span>
                              </div>
                              <div className="text-right">
                                <span className={`text-xs font-bold inline-block ${progress === 100 ? 'text-emerald-600' : 'text-blue-600'}`}>
                                  {Math.round(progress)}%
                                </span>
                              </div>
                            </div>
                            <div className="overflow-hidden h-2 mb-4 text-xs flex rounded bg-gray-100">
                              <motion.div 
                                initial={{ width: 0 }}
                                animate={{ width: `${progress}%` }}
                                transition={{ duration: 1, ease: "easeOut" }}
                                className={`shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center ${progress === 100 ? 'bg-emerald-500' : 'bg-blue-500'}`}
                              ></motion.div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}

            {reports.length === 0 && (
              <div className="py-20 text-center bg-gray-50 rounded-3xl border border-dashed border-gray-200">
                <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500 font-medium">Chưa có yêu cầu báo cáo nào được tạo.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
