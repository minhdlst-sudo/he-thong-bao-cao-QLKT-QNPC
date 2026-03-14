import React, { useMemo } from "react";
import { 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  Search,
  ChevronRight,
  TrendingDown
} from "lucide-react";
import { motion } from "motion/react";
import { ReportDefinition } from "../types";

interface SummaryReportProps {
  history: any[];
  allReports: ReportDefinition[];
  units: string[];
  loading: boolean;
  checkIsLate: (dateSent: string, deadline: string, period: string, year: any) => boolean;
  formatDate: (dateStr: string) => string;
}

export default function SummaryReport({ history, allReports, units, loading, checkIsLate, formatDate }: SummaryReportProps) {
  const [searchTerm, setSearchTerm] = React.useState("");
  const [filter, setFilter] = React.useState<"Tất cả" | "Tuần" | "Tháng" | "Khác">("Tất cả");
  const [selectedWeek, setSelectedWeek] = React.useState("");
  const [selectedMonth, setSelectedMonth] = React.useState("");
  const [selectedOtherReport, setSelectedOtherReport] = React.useState("");

  // Extract unique report names for "Khác" category from both history and definitions
  const otherReportsList = useMemo(() => {
    const fromHistory = history
      .filter(h => {
        const period = String(h.period || "");
        return !period.startsWith("Tuần") && !period.startsWith("Tháng");
      })
      .map(h => h.content);
    
    const fromDefinitions = allReports
      .filter(r => r && r.content)
      .filter(r => {
        const cycle = (r.cycle || "").toLowerCase();
        const deadline = (r.deadline || "").toLowerCase();
        return !cycle.includes("tuần") && !cycle.includes("tháng") && 
               !deadline.includes("hàng tháng") && !deadline.includes("thứ");
      })
      .map(r => r.content);

    return Array.from(new Set([...fromHistory, ...fromDefinitions])).sort();
  }, [history, allReports]);

  const summaryData = useMemo(() => {
    // Filter out specific units as requested by user
    const filteredUnits = units.filter(u => {
      const trimmedU = u.trim();
      return trimmedU !== "Điện lực" && trimmedU !== "Tất cả" && trimmedU !== "Văn thư PKT";
    });

    // Determine which units are required for the selected report if in "Khác" mode
    let requiredUnits = filteredUnits;
    if (filter === "Khác" && selectedOtherReport) {
      // Find ALL definitions that match the selected report content
      const reportDefs = allReports.filter(r => 
        r && (r.content || "").trim() === selectedOtherReport.trim()
      );
      
      const unitsForReport = new Set<string>();
      
      reportDefs.forEach(def => {
        const unitStr = (def.unit || "").trim();
        if (unitStr === "Tất cả") {
          filteredUnits.forEach(u => {
            const trimmedU = u.trim();
            if (trimmedU !== "Phòng kỹ thuật" && trimmedU !== "Văn thư PKT") {
              unitsForReport.add(trimmedU);
            }
          });
        } else if (unitStr === "Điện lực") {
          filteredUnits.forEach(u => {
            const trimmedU = u.trim();
            if (trimmedU.startsWith("ĐL")) {
              unitsForReport.add(trimmedU);
            }
          });
        } else if (unitStr) {
          // Handle comma separated specific units
          unitStr.split(",").forEach(u => {
            const trimmedU = u.trim();
            if (trimmedU) unitsForReport.add(trimmedU);
          });
        }
      });
      
      // If we found specific units in definitions, filter the units list
      if (unitsForReport.size > 0) {
        requiredUnits = filteredUnits.filter(u => {
          const normalizedU = u.trim();
          return Array.from(unitsForReport).some(ru => ru === normalizedU);
        });
      }
    }

    const unitsData = requiredUnits.map(unitName => {
      const unitHistory = history
        .filter(h => h.unit === unitName)
        .filter(h => {
          const period = String(h.period || "");
          if (filter === "Tất cả") return true;
          if (filter === "Tuần") {
            if (!period.startsWith("Tuần")) return false;
            if (selectedWeek) return period.includes(`Tuần ${selectedWeek}`);
            return true;
          }
          if (filter === "Tháng") {
            if (!period.startsWith("Tháng")) return false;
            if (selectedMonth) return period.includes(`Tháng ${selectedMonth}`);
            return true;
          }
          if (filter === "Khác") {
            if (period.startsWith("Tuần") || period.startsWith("Tháng")) return false;
            if (selectedOtherReport) return h.content === selectedOtherReport;
            return true;
          }
          return true;
        })
        .sort((a, b) => {
          // Simple sort by timestamp for now, or we could parse period
          return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
        });

      const processedHistory = unitHistory.map(h => ({
        ...h,
        isLate: checkIsLate(h.dateSent, h.deadline, h.period, h.year)
      }));

      // Check for consecutive lates (2 or more)
      let consecutiveLates = 0;
      for (let i = 0; i < processedHistory.length; i++) {
        if (processedHistory[i].isLate) {
          consecutiveLates++;
        } else {
          break; // Stop at first on-time report
        }
      }

      const totalReports = processedHistory.length;
      const lateReports = processedHistory.filter(h => h.isLate).length;
      const onTimeReports = totalReports - lateReports;

      return {
        unitName,
        history: processedHistory,
        totalReports,
        lateReports,
        onTimeReports,
        isWarning: consecutiveLates >= 2,
        consecutiveLates,
        lastReport: processedHistory[0] || null
      };
    });

    return unitsData;
  }, [history, allReports, checkIsLate, filter, selectedWeek, selectedMonth, selectedOtherReport]);

  const filteredData = summaryData.filter(d => {
    const matchesSearch = d.unitName.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch;
  });

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="w-10 h-10 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-gray-500 font-medium">Đang tổng hợp dữ liệu từ Google Sheets...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-1 gap-6">
        <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm">
          <div className="flex items-center gap-4 mb-4">
            <div className="bg-orange-100 p-3 rounded-2xl">
              <TrendingDown className="text-orange-600 w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Cảnh báo</p>
              <h4 className="text-2xl font-bold">{summaryData.filter(d => d.isWarning).length}</h4>
            </div>
          </div>
          <p className="text-xs text-gray-400">Đơn vị trễ từ 2 chu kỳ liên tiếp</p>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col lg:flex-row gap-4 items-center justify-between">
        <div className="relative w-full lg:w-96">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input 
            type="text" 
            placeholder="Tìm kiếm đơn vị..."
            className="w-full bg-white border border-gray-200 rounded-2xl pl-12 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all shadow-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {filter === "Tuần" && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-gray-400 uppercase">Chọn tuần:</span>
              <select 
                value={selectedWeek}
                onChange={(e) => setSelectedWeek(e.target.value)}
                className="bg-white border border-gray-200 rounded-xl px-3 py-1.5 text-xs font-bold text-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
              >
                <option value="">Tất cả tuần</option>
                {Array.from({ length: 52 }, (_, i) => {
                  const val = (i + 1).toString().padStart(2, '0');
                  return <option key={val} value={val}>Tuần {val}</option>;
                })}
              </select>
            </div>
          )}

          {filter === "Tháng" && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-gray-400 uppercase">Chọn tháng:</span>
              <select 
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="bg-white border border-gray-200 rounded-xl px-3 py-1.5 text-xs font-bold text-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
              >
                <option value="">Tất cả tháng</option>
                {Array.from({ length: 12 }, (_, i) => {
                  const val = (i + 1).toString().padStart(2, '0');
                  return <option key={val} value={val}>Tháng {val}</option>;
                })}
              </select>
            </div>
          )}

          {filter === "Khác" && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-gray-400 uppercase">Chọn báo cáo:</span>
              <select 
                value={selectedOtherReport}
                onChange={(e) => setSelectedOtherReport(e.target.value)}
                className="bg-white border border-gray-200 rounded-xl px-3 py-1.5 text-xs font-bold text-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm max-w-[200px]"
              >
                <option value="">Tất cả báo cáo khác</option>
                {otherReportsList.map((report, i) => (
                  <option key={i} value={report}>{report}</option>
                ))}
              </select>
            </div>
          )}

          <div className="flex bg-gray-100 p-1 rounded-xl">
            {(["Tất cả", "Tuần", "Tháng", "Khác"] as const).map((f) => (
              <button
                key={f}
                onClick={() => {
                  setFilter(f);
                  if (f !== "Tuần") setSelectedWeek("");
                  if (f !== "Tháng") setSelectedMonth("");
                  if (f !== "Khác") setSelectedOtherReport("");
                }}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  filter === f ? "bg-white text-emerald-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Summary Table */}
      <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Đơn vị</th>
                <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Báo cáo gần nhất</th>
                <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Tình trạng</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredData.map((unit, idx) => (
                <tr key={idx} className={`hover:bg-gray-50/50 transition-colors ${unit.isWarning ? 'bg-red-50/30' : ''}`}>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${unit.isWarning ? 'bg-red-500 animate-pulse' : 'bg-emerald-500'}`}></div>
                      <span className="text-sm font-bold text-gray-900">{unit.unitName}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {unit.lastReport ? (
                      <div>
                        <p className="text-xs font-medium text-gray-700 line-clamp-1">{unit.lastReport.content}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded uppercase">{unit.lastReport.period}</span>
                          <span className="text-[10px] text-gray-400">{formatDate(unit.lastReport.dateSent)}</span>
                        </div>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400 italic">Chưa có dữ liệu</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    {unit.totalReports === 0 ? (
                      <span className="text-[10px] text-gray-400 uppercase font-bold">Chưa báo cáo</span>
                    ) : unit.lastReport?.isLate ? (
                      <div className="flex items-center gap-2 text-red-600">
                        <AlertCircle className="w-4 h-4" />
                        <span className="text-[10px] font-bold uppercase tracking-wider">Trễ hạn</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-emerald-600">
                        <CheckCircle2 className="w-4 h-4" />
                        <span className="text-[10px] font-bold uppercase tracking-wider">Đúng hạn</span>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
