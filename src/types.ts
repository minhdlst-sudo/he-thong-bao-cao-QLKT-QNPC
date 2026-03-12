export interface Unit {
  id: string;
  name: string;
}

export interface ReportDefinition {
  id: number;
  content: string;
  classification: string;
  specialist: string;
  cycle: string;
  deadline: string;
  unit: string;
  directingDocument: string;
}

export interface ReportSubmission {
  id?: number;
  reportDefinitionId: number;
  unitName: string;
  dateSent: string;
  attachmentLink: string;
  period: string; // e.g., "Tuần 10/2024", "Tháng 03/2024", "Quý 1/2024"
  year: number;
}

export const UNITS: string[] = [
  "ĐL Thành phố Quảng Ngãi",
  "ĐL Trà Bồng",
  "ĐL Sơn Tịnh",
  "ĐL Sơn Hà",
  "ĐL Tư Nghĩa",
  "ĐL Nghĩa Hành",
  "ĐL Mộ Đức",
  "ĐL Đức Phổ",
  "ĐL Ba Tơ",
  "ĐL Lý Sơn",
  "ĐL TP Kon Tum",
  "ĐL Đăk Hà",
  "ĐL Kon Rẫy",
  "ĐL Đăk Tô",
  "ĐL Sa Thầy",
  "ĐL Ngọc Hồi",
  "ĐL Đăk Glei",
  "ĐL Kon Plong",
  "Tu Mơ Rông",
  "XNLĐ CT Quảng Ngãi"
];
