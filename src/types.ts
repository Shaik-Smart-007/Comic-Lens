export interface ComicPanel {
  sequence: number;
  visual_description: string;
  verbatim_transcription: string;
  uncertainty: string;
  reviewed: boolean;
  original_draft_visual: string;
  original_draft_transcription: string;
}

export interface AnalysisResponse {
  page_summary: string;
  reading_order_note: string;
  panels: ComicPanel[];
  overall_uncertainties: string[];
}

export interface ImageMeta {
  name: string;
  size: number;
  width: number;
  height: number;
  dataUrl: string;
  hash: string;
}
