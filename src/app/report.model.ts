export interface ReportParamInfo {
  name: string;
  type: string;
}

export interface ReportRef {
  name: string;
  parameters: ReportParamInfo[];
}
