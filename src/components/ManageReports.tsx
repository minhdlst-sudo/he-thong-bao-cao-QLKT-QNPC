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
  Calendar
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import DatePicker, { registerLocale } from "react-datepicker";
import { vi } from "date-fns/locale/vi";
import "react-datepicker/dist/react-datepicker.css";

registerLocale("vi", vi);

interface ManageReportsProps {
  units: string[];
  onRefresh: () => Promise<void>;
}

export default function ManageReports({ units: initialUnits, onRefresh }: ManageReportsProps) {
  const [loading, setLoading] = useState(false);
  const [metaLoading, setMetaLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  
  const [classifications, setClassifications] = useState<string[]>([]);
  const [specialists, setSpecialists] = useState<string[]>([]);
  const [cycles, setCycles] = useState<string[]>([]);
  const [deadlines, setDeadlines] = useState<string[]>([]);
  const [availableUnits, setAvailableUnits] = useState<string[]>([]);
  const [showUnitDropdown, setShowUnitDropdown] = useState(false);
  const [specificDate, setSpecificDate] = useState<Date | null>(null);

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
                    {deadlines.map(d => (
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
    </div>
  );
}
