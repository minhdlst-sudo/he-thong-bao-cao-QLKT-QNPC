import React, { useMemo, useState, useRef, useEffect } from "react";
import { 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  Search,
  ChevronRight,
  TrendingDown,
  X,
  ChevronDown,
  ExternalLink
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { ReportDefinition } from "../types";

interface SummaryReportProps {
  history: any[];
  allReports: ReportDefinition[];
  units: string[];
  loading: boolean;
  currentUserUnit: string;
  checkIsLate: (dateSent: string, deadline: string, period: string, year: any) => boolean;
  formatDate: (dateStr: string) => string;
}

export default function SummaryReport({ history, allReports, units, loading, currentUserUnit, checkIsLate, formatDate }: SummaryReportProps) {
  const [statusFilter, setStatusFilter] = React.useState<"Tất cả" | "Chưa báo cáo" | "Đúng hạn" | "Trễ hạn">("Tất cả");
  const [filter, setFilter] = React.useState<"Tất cả" | "Tuần" | "Tháng" | "Khác">("Tất cả");
  const [selectedWeek, setSelectedWeek] = React.useState("");
  const [selectedMonth, setSelectedMonth] = React.useState("");
  const [selectedOtherReport, setSelectedOtherReport] = React.useState("");
  const [selectedPeriodicReport, setSelectedPeriodicReport] = React.useState("");
  const [isPeriodicDropdownOpen, setIsPeriodicDropdownOpen] = React.useState(false);
  const [isOtherDropdownOpen, setIsOtherDropdownOpen] = React.useState(false);
  const [periodicSearchQuery, setPeriodicSearchQuery] = React.useState("");
  const [otherSearchQuery, setOtherSearchQuery] = React.useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const otherDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsPeriodicDropdownOpen(false);
      }
      if (otherDropdownRef.current && !otherDropdownRef.current.contains(event.target as Node)) {
        setIsOtherDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const getReportPeriodAndDeadline = (report: ReportDefinition) => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    let deadlineDate: Date | null = null;
    let periodStr = "";

    const cycle = report.cycle?.toLowerCase() || "";
    const deadline = report.deadline?.toLowerCase() || "";

    // Monthly report logic: "Ngày XX hàng tháng"
    const dayMatch = report.deadline.match(/Ngày (\d+)/i);
    if (dayMatch) {
      const day = parseInt(dayMatch[1]);
      const targetMonth = currentMonth - 1 || 12;
      const targetYear = currentMonth === 1 ? currentYear - 1 : currentYear;
      
      deadlineDate = new Date(currentYear, currentMonth - 1, day);
      deadlineDate.setHours(23, 59, 59, 999);
      periodStr = `Tháng ${targetMonth.toString().padStart(2, '0')}/${targetYear}`;
    } else if (cycle.includes("tuần")) {
      const startOfYear = new Date(currentYear, 0, 1);
      const days = Math.floor((now.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000));
      const currentWeek = Math.ceil((days + startOfYear.getDay() + 1) / 7);
      const targetWeek = currentWeek - 1;
      periodStr = `Tuần ${targetWeek.toString().padStart(2, '0')}/${currentYear}`;

      // Deadline was Friday of targetWeek
      deadlineDate = new Date(startOfYear);
      const firstFriday = (5 - startOfYear.getDay() + 7) % 7;
      deadlineDate.setDate(startOfYear.getDate() + firstFriday + (targetWeek - 1) * 7);
      deadlineDate.setHours(23, 59, 59, 999);
    } else if (cycle.includes("quý")) {
      const quarter = Math.floor((currentMonth - 1) / 3) + 1;
      periodStr = `Quý ${quarter}/${currentYear}`;
    } else if (cycle.includes("6 tháng")) {
      const half = currentMonth <= 6 ? "đầu" : "cuối";
      periodStr = `6 tháng ${half} năm ${currentYear}`;
    } else if (cycle.includes("năm")) {
      periodStr = `Năm ${currentYear}`;
    } else {
      const dmyMatch = report.deadline.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (dmyMatch) {
        deadlineDate = new Date(parseInt(dmyMatch[3]), parseInt(dmyMatch[2]) - 1, parseInt(dmyMatch[1]));
        deadlineDate.setHours(23, 59, 59, 999);
        periodStr = report.deadline;
      }
    }

    return { periodStr, deadlineDate };
  };

  // Extract unique report names for "Khác" category from both history and definitions
  const otherReportsList = useMemo(() => {
    const adminUnits = ["Phòng kỹ thuật", "Văn thư PKT"];
    const isAdmin = adminUnits.some(au => au.toLowerCase() === (currentUserUnit || "").toLowerCase().trim());

    const fromHistory = history
      .filter(h => {
        const lowerUnit = (h.unit || "").toLowerCase().trim();
        if (!isAdmin && adminUnits.some(au => au.toLowerCase() === lowerUnit)) return false;
        
        const period = String(h.period || "");
        return !period.startsWith("Tuần") && !period.startsWith("Tháng");
      })
      .map(h => h.content);
    
    const fromDefinitions = allReports
      .filter(r => r && r.content)
      .filter(r => {
        const unitStr = (r.unit || "").toLowerCase().trim();
        if (!isAdmin && adminUnits.some(au => au.toLowerCase() === unitStr)) return false;

        const cycle = (r.cycle || "").toLowerCase();
        const deadline = (r.deadline || "").toLowerCase();
        return !cycle.includes("tuần") && !cycle.includes("tháng") && 
               !deadline.includes("hàng tháng") && !deadline.includes("thứ");
      })
      .map(r => r.content);

    return Array.from(new Set([...fromHistory, ...fromDefinitions])).sort();
  }, [history, allReports, currentUserUnit]);

  // Extract unique periodic reports (Weekly/Monthly)
  const periodicReportsList = useMemo(() => {
    const adminUnits = ["Phòng kỹ thuật", "Văn thư PKT"];
    const isAdmin = adminUnits.some(au => au.toLowerCase() === (currentUserUnit || "").toLowerCase().trim());

    const fromHistory = history
      .filter(h => {
        const lowerUnit = (h.unit || "").toLowerCase().trim();
        if (!isAdmin && adminUnits.some(au => au.toLowerCase() === lowerUnit)) return false;
        
        const period = String(h.period || "");
        if (filter === "Tuần") return period.startsWith("Tuần");
        if (filter === "Tháng") return period.startsWith("Tháng");
        return false;
      })
      .map(h => h.content);

    const fromDefinitions = allReports
      .filter(r => r && r.content)
      .filter(r => {
        const unitStr = (r.unit || "").toLowerCase().trim();
        if (!isAdmin && adminUnits.some(au => au.toLowerCase() === unitStr)) return false;

        const cycle = (r.cycle || "").toLowerCase();
        const deadline = (r.deadline || "").toLowerCase();
        
        if (filter === "Tuần") {
          return cycle.includes("tuần");
        }
        if (filter === "Tháng") {
          return cycle.includes("tháng") || deadline.includes("hàng tháng");
        }
        return false;
      })
      .map(r => r.content);

    return Array.from(new Set([...fromHistory, ...fromDefinitions])).sort();
  }, [history, allReports, currentUserUnit, filter]);

  const filteredPeriodicReports = useMemo(() => {
    return periodicReportsList.filter(r => 
      r.toLowerCase().includes(periodicSearchQuery.toLowerCase())
    );
  }, [periodicReportsList, periodicSearchQuery]);

  const filteredOtherReports = useMemo(() => {
    return otherReportsList.filter(r => 
      r.toLowerCase().includes(otherSearchQuery.toLowerCase())
    );
  }, [otherReportsList, otherSearchQuery]);

  const summaryData = useMemo(() => {
    const adminUnits = ["Phòng kỹ thuật", "Văn thư PKT"];
    const isAdmin = adminUnits.some(au => au.toLowerCase() === (currentUserUnit || "").toLowerCase().trim());

    // Filter out specific units as requested by user
    const filteredUnits = units.filter(u => {
      const trimmedU = u.trim();
      const lowerU = trimmedU.toLowerCase();
      const lowerCurrentUserUnit = (currentUserUnit || "").toLowerCase().trim();
      
      // Always filter out labels
      if (lowerU === "điện lực" || lowerU === "tất cả") return false;
      
      // "Văn thư PKT" does not perform reports, so hide its card when logged in as "Văn thư PKT"
      if (lowerCurrentUserUnit === "văn thư pkt" && lowerU === "văn thư pkt") return false;

      // If not admin, cannot see admin units
      if (!isAdmin && adminUnits.some(au => au.toLowerCase() === lowerU)) return false;
      
      return true;
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
        const lowerUnitStr = unitStr.toLowerCase();
        
        if (lowerUnitStr === "tất cả") {
          filteredUnits.forEach(u => {
            const trimmedU = u.trim();
            const lowerU = trimmedU.toLowerCase();
            if (lowerU !== "phòng kỹ thuật" && lowerU !== "văn thư pkt") {
              unitsForReport.add(trimmedU);
            }
          });
        } else if (lowerUnitStr === "điện lực") {
          filteredUnits.forEach(u => {
            const trimmedU = u.trim();
            if (trimmedU.toUpperCase().startsWith("ĐL")) {
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
            if (selectedWeek && !period.includes(`Tuần ${selectedWeek}`)) return false;
            if (selectedPeriodicReport && h.content.trim() !== selectedPeriodicReport.trim()) return false;
            return true;
          }
          if (filter === "Tháng") {
            if (!period.startsWith("Tháng")) return false;
            if (selectedMonth && !period.includes(`Tháng ${selectedMonth}`)) return false;
            if (selectedPeriodicReport && h.content.trim() !== selectedPeriodicReport.trim()) return false;
            return true;
          }
          if (filter === "Khác") {
            if (period.startsWith("Tuần") || period.startsWith("Tháng")) return false;
            if (selectedOtherReport) return h.content.trim() === selectedOtherReport.trim();
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

      // Calculate missing late reports
      let missingLateCount = 0;
      const now = new Date();
      
      const unitExpectedReports = allReports.filter(report => {
        const unitStr = (report.unit || "").trim();
        const lowerUnitStr = unitStr.toLowerCase();
        const lowerUnitName = unitName.toLowerCase();

        if (lowerUnitStr === "tất cả") {
          return lowerUnitName !== "phòng kỹ thuật" && lowerUnitName !== "văn thư pkt";
        }
        if (lowerUnitStr === "điện lực") {
          return unitName.toUpperCase().startsWith("ĐL");
        }
        return unitStr.split(",").map(s => s.trim().toLowerCase()).includes(lowerUnitName);
      });

      unitExpectedReports.forEach(report => {
        const { periodStr, deadlineDate } = getReportPeriodAndDeadline(report);
        if (!periodStr || !deadlineDate) return;

        // Apply current filter to missing reports check
        if (filter === "Tuần" && !periodStr.startsWith("Tuần")) return;
        if (filter === "Tháng" && !periodStr.startsWith("Tháng")) return;
        if (filter === "Khác" && (periodStr.startsWith("Tuần") || periodStr.startsWith("Tháng"))) return;

        // Apply periodic report filter to missing reports check
        if ((filter === "Tuần" || filter === "Tháng") && selectedPeriodicReport && report.content.trim() !== selectedPeriodicReport.trim()) return;

        if (now > deadlineDate) {
          const isSubmitted = history.some(h => 
            h.unit === unitName && 
            h.content === report.content && 
            h.period === periodStr
          );
          if (!isSubmitted) {
            missingLateCount++;
          }
        }
      });

      return {
        unitName,
        history: processedHistory,
        totalReports,
        lateReports,
        onTimeReports,
        isWarning: consecutiveLates >= 2 || missingLateCount > 0,
        consecutiveLates,
        missingLateCount,
        lastReport: processedHistory[0] || null
      };
    });

    return unitsData;
  }, [history, allReports, checkIsLate, filter, selectedWeek, selectedMonth, selectedOtherReport, selectedPeriodicReport, currentUserUnit, units]);

  const relevantUnitsData = useMemo(() => {
    return summaryData.filter(d => {
      // If a specific periodic report is selected, only show units that have matching history or matching expected reports
      if ((filter === "Tuần" || filter === "Tháng") && selectedPeriodicReport) {
        const hasMatchingHistory = d.history.length > 0;
        const hasMatchingExpected = allReports.some(report => {
          const unitStr = (report.unit || "").trim();
          const lowerUnitStr = unitStr.toLowerCase();
          const lowerUnitName = d.unitName.toLowerCase();
          
          const isExpected = lowerUnitStr === "tất cả" ? (lowerUnitName !== "phòng kỹ thuật" && lowerUnitName !== "văn thư pkt") :
                            lowerUnitStr === "điện lực" ? d.unitName.toUpperCase().startsWith("ĐL") :
                            unitStr.split(",").map(s => s.trim().toLowerCase()).includes(lowerUnitName);
          
          return isExpected && report.content.trim() === selectedPeriodicReport.trim();
        });
        
        return hasMatchingHistory || hasMatchingExpected;
      }
      return true;
    });
  }, [summaryData, filter, selectedPeriodicReport, allReports]);

  const counts = useMemo(() => {
    return {
      all: relevantUnitsData.length,
      notReported: relevantUnitsData.filter(d => d.totalReports === 0).length,
      onTime: relevantUnitsData.filter(d => d.totalReports > 0 && !d.lastReport?.isLate).length,
      late: relevantUnitsData.filter(d => d.totalReports > 0 && d.lastReport?.isLate).length
    };
  }, [relevantUnitsData]);

  const filteredData = useMemo(() => {
    return relevantUnitsData.filter(d => {
      if (statusFilter === "Tất cả") return true;
      if (statusFilter === "Chưa báo cáo") return d.totalReports === 0;
      if (statusFilter === "Đúng hạn") return d.totalReports > 0 && !d.lastReport?.isLate;
      if (statusFilter === "Trễ hạn") return d.totalReports > 0 && d.lastReport?.isLate;
      return true;
    });
  }, [relevantUnitsData, statusFilter]);

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
      {/* Filters & Status Tabs */}
      <div className="space-y-6">
        <div className="flex flex-col lg:flex-row gap-4 items-center justify-between">
          <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto flex-1">
            {(filter === "Tuần" || filter === "Tháng") && (
              <div className="relative flex-1 max-w-md" ref={dropdownRef}>
                <button
                  onClick={() => setIsPeriodicDropdownOpen(!isPeriodicDropdownOpen)}
                  className="w-full bg-white border border-gray-200 rounded-2xl px-4 py-3 flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all shadow-sm text-left"
                >
                  <div className="flex items-center gap-3 overflow-hidden">
                    <Search className="w-5 h-5 text-gray-400 flex-shrink-0" />
                    <span className={`truncate ${selectedPeriodicReport ? 'text-gray-900 font-medium' : 'text-gray-400'}`}>
                      {selectedPeriodicReport || "Chọn báo cáo định kỳ..."}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {selectedPeriodicReport && (
                      <X 
                        className="w-4 h-4 text-gray-400 hover:text-gray-600 cursor-pointer" 
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedPeriodicReport("");
                        }}
                      />
                    )}
                    <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${isPeriodicDropdownOpen ? 'rotate-180' : ''}`} />
                  </div>
                </button>

                <AnimatePresence>
                  {isPeriodicDropdownOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className="absolute z-50 left-0 right-0 mt-2 bg-white border border-gray-100 rounded-2xl shadow-xl overflow-hidden"
                    >
                      <div className="p-3 border-bottom border-gray-50 bg-gray-50/50">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                          <input
                            type="text"
                            placeholder="Tìm nhanh báo cáo..."
                            className="w-full bg-white border border-gray-200 rounded-xl pl-9 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                            value={periodicSearchQuery}
                            onChange={(e) => setPeriodicSearchQuery(e.target.value)}
                            autoFocus
                          />
                        </div>
                      </div>
                      <div className="max-h-[300px] overflow-y-auto p-2">
                        <button
                          onClick={() => {
                            setSelectedPeriodicReport("");
                            setIsPeriodicDropdownOpen(false);
                            setPeriodicSearchQuery("");
                          }}
                          className={`w-full text-left px-4 py-2.5 rounded-xl text-sm transition-colors ${!selectedPeriodicReport ? 'bg-emerald-50 text-emerald-700 font-bold' : 'hover:bg-gray-50 text-gray-600'}`}
                        >
                          Tất cả báo cáo {filter.toLowerCase()}
                        </button>
                        {filteredPeriodicReports.map((report, i) => (
                          <button
                            key={i}
                            onClick={() => {
                              setSelectedPeriodicReport(report);
                              setIsPeriodicDropdownOpen(false);
                              setPeriodicSearchQuery("");
                            }}
                            className={`w-full text-left px-4 py-2.5 rounded-xl text-sm transition-colors ${selectedPeriodicReport === report ? 'bg-emerald-50 text-emerald-700 font-bold' : 'hover:bg-gray-50 text-gray-600'}`}
                          >
                            {report}
                          </button>
                        ))}
                        {filteredPeriodicReports.length === 0 && (
                          <div className="py-8 text-center text-gray-400 text-sm italic">
                            Không tìm thấy báo cáo nào
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
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
                <div className="relative min-w-[200px]" ref={otherDropdownRef}>
                  <button
                    onClick={() => setIsOtherDropdownOpen(!isOtherDropdownOpen)}
                    className="w-full bg-white border border-gray-200 rounded-xl px-3 py-1.5 flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all shadow-sm text-left"
                  >
                    <span className={`truncate text-xs font-bold ${selectedOtherReport ? 'text-emerald-600' : 'text-gray-400'}`}>
                      {selectedOtherReport || "Tất cả báo cáo khác"}
                    </span>
                    <div className="flex items-center gap-1">
                      {selectedOtherReport && (
                        <X 
                          className="w-3 h-3 text-gray-400 hover:text-gray-600 cursor-pointer" 
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedOtherReport("");
                          }}
                        />
                      )}
                      <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOtherDropdownOpen ? 'rotate-180' : ''}`} />
                    </div>
                  </button>

                  <AnimatePresence>
                    {isOtherDropdownOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        className="absolute z-50 right-0 mt-2 w-[250px] bg-white border border-gray-100 rounded-2xl shadow-xl overflow-hidden"
                      >
                        <div className="p-2 border-bottom border-gray-50 bg-gray-50/50">
                          <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                            <input
                              type="text"
                              placeholder="Tìm nhanh..."
                              className="w-full bg-white border border-gray-200 rounded-lg pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                              value={otherSearchQuery}
                              onChange={(e) => setOtherSearchQuery(e.target.value)}
                              autoFocus
                            />
                          </div>
                        </div>
                        <div className="max-h-[250px] overflow-y-auto p-1">
                          <button
                            onClick={() => {
                              setSelectedOtherReport("");
                              setIsOtherDropdownOpen(false);
                              setOtherSearchQuery("");
                            }}
                            className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors ${!selectedOtherReport ? 'bg-emerald-50 text-emerald-700 font-bold' : 'hover:bg-gray-50 text-gray-600'}`}
                          >
                            Tất cả báo cáo khác
                          </button>
                          {filteredOtherReports.map((report, i) => (
                            <button
                              key={i}
                              onClick={() => {
                                setSelectedOtherReport(report);
                                setIsOtherDropdownOpen(false);
                                setOtherSearchQuery("");
                              }}
                              className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors ${selectedOtherReport === report ? 'bg-emerald-50 text-emerald-700 font-bold' : 'hover:bg-gray-50 text-gray-600'}`}
                            >
                              {report}
                            </button>
                          ))}
                          {filteredOtherReports.length === 0 && (
                            <div className="py-4 text-center text-gray-400 text-xs italic">
                              Không tìm thấy
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            )}

            <div className="flex bg-gray-100 p-1 rounded-xl">
              {(["Tất cả", "Tuần", "Tháng", "Khác"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => {
                    setFilter(f);
                    if (f !== "Tuần" && f !== "Tháng") {
                      setSelectedPeriodicReport("");
                      setPeriodicSearchQuery("");
                    }
                    if (f !== "Khác") {
                      setSelectedOtherReport("");
                      setOtherSearchQuery("");
                    }
                    if (f !== "Tuần") setSelectedWeek("");
                    if (f !== "Tháng") setSelectedMonth("");
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

        {/* Status Filter Tabs */}
        <div className="flex flex-wrap gap-2">
          {[
            { label: "Tất cả", key: "all", color: "gray" },
            { label: "Chưa báo cáo", key: "notReported", color: "amber" },
            { label: "Đúng hạn", key: "onTime", color: "emerald" },
            { label: "Trễ hạn", key: "late", color: "red" }
          ].map((s) => (
            <button
              key={s.label}
              onClick={() => setStatusFilter(s.label as any)}
              className={`flex items-center gap-2 px-4 py-2 rounded-2xl text-xs font-bold transition-all border ${
                statusFilter === s.label 
                  ? `bg-${s.color}-50 border-${s.color}-200 text-${s.color}-700 shadow-sm` 
                  : "bg-white border-gray-100 text-gray-500 hover:bg-gray-50"
              }`}
            >
              <span>{s.label}</span>
              <span className={`px-2 py-0.5 rounded-lg ${
                statusFilter === s.label 
                  ? `bg-${s.color}-100 text-${s.color}-800` 
                  : "bg-gray-100 text-gray-600"
              }`}>
                {counts[s.key as keyof typeof counts]}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4">
        {filteredData.map((unit, idx) => (
          <motion.div 
            key={idx}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.03 }}
            className={`bg-white rounded-2xl border border-gray-100 p-5 shadow-sm hover:shadow-md transition-all ${unit.isWarning ? 'border-red-200 bg-red-50/10' : ''}`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4 min-w-[200px]">
                <div className={`w-3 h-3 rounded-full flex-shrink-0 ${unit.isWarning ? 'bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.5)]' : 'bg-emerald-500'}`}></div>
                <div>
                  <h4 className="text-base font-bold text-gray-900">{unit.unitName}</h4>
                </div>
              </div>

              <div className="flex-1 bg-gray-50/50 rounded-xl p-3 border border-gray-100">
                <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1">Báo cáo gần nhất</p>
                {unit.lastReport ? (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-gray-700 line-clamp-1">{unit.lastReport.content}</p>
                    <div className="flex items-center gap-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-[9px] font-bold bg-emerald-50 text-emerald-600 uppercase tracking-wider">
                        {unit.lastReport.period}
                      </span>
                      <span className="text-[10px] text-gray-400 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDate(unit.lastReport.dateSent)}
                      </span>
                      {unit.lastReport.attachment && (
                        <a 
                          href={unit.lastReport.attachment} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 hover:text-emerald-700 transition-colors"
                        >
                          <ExternalLink className="w-3 h-3" />
                          Xem báo cáo
                        </a>
                      )}
                    </div>
                  </div>
                ) : (
                  <span className="text-xs text-gray-400 italic">Chưa có dữ liệu báo cáo</span>
                )}
              </div>

              <div className="flex items-center justify-between sm:justify-end gap-6 sm:min-w-[120px]">
                <div className="text-right">
                  <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1">Tình trạng</p>
                  {unit.totalReports === 0 ? (
                    <span className="inline-flex items-center px-2 py-1 rounded-lg text-[9px] font-bold bg-gray-100 text-gray-500 uppercase tracking-wider">
                      Chưa báo cáo
                    </span>
                  ) : unit.lastReport?.isLate ? (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-bold bg-red-50 text-red-600 uppercase tracking-wider">
                      <AlertCircle className="w-3 h-3" />
                      Trễ hạn
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-bold bg-emerald-50 text-emerald-600 uppercase tracking-wider">
                      <CheckCircle2 className="w-3 h-3" />
                      Đúng hạn
                    </span>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        ))}
        
        {filteredData.length === 0 && (
          <div className="py-20 text-center bg-gray-50 rounded-3xl border border-dashed border-gray-200">
            <Search className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 font-medium">Không tìm thấy đơn vị phù hợp.</p>
          </div>
        )}
      </div>
    </div>
  );
}
