export interface Unit {
  id: string;
  name: string;
}

export interface ReportDefinition {
  id: string;
  content: string;
  classification: string;
  specialist: string;
  cycle: string;
  deadline: string;
  unit: string;
  directingDocument: string;
}

export interface ReportSubmission {
  id?: string;
  reportDefinitionId: string;
  unitName: string;
  dateSent: string;
  attachmentLink: string;
  period: string; // e.g., "Tuần 10/2024", "Tháng 03/2024", "Quý 1/2024"
  year: number;
}
