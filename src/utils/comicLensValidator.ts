import { AnalysisResponse, ComicPanel } from '../types.ts';

export function cleanJsonText(rawText: string): string {
  let text = rawText.trim();
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  }
  const braceStart = text.indexOf('{');
  const braceEnd = text.lastIndexOf('}');
  if (braceStart !== -1 && braceEnd !== -1 && braceEnd > braceStart) {
    text = text.substring(braceStart, braceEnd + 1);
  }
  return text;
}

export function validateAndParseResponse(rawText: string): {
  isValid: boolean;
  error?: string;
  data?: AnalysisResponse;
} {
  if (!rawText || !rawText.trim()) {
    return { isValid: false, error: 'Model returned an empty response.' };
  }

  const cleaned = cleanJsonText(rawText);
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e: unknown) {
    // If wrapping in array, try parsing whole text
    try {
      parsed = JSON.parse(rawText.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim());
    } catch {
      const msg = e instanceof Error ? e.message : String(e);
      return { isValid: false, error: `Failed to parse model output as valid JSON: ${msg}` };
    }
  }

  // Handle case where model returns an array containing the root object
  let record: Record<string, unknown>;
  if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'object' && parsed[0] !== null) {
    record = parsed[0] as Record<string, unknown>;
  } else if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
    record = parsed as Record<string, unknown>;
  } else {
    return { isValid: false, error: 'Root JSON entity must be an object.' };
  }

  const page_summary = typeof record.page_summary === 'string' ? record.page_summary.trim() : '';
  const reading_order_note = typeof record.reading_order_note === 'string' ? record.reading_order_note.trim() : '';

  if (!Array.isArray(record.panels)) {
    return { isValid: false, error: "The 'panels' field must be a list." };
  }

  const panels: ComicPanel[] = [];
  record.panels.forEach((p, idx) => {
    if (typeof p !== 'object' || p === null) return;
    const pRec = p as Record<string, unknown>;

    let seq = idx + 1;
    if (typeof pRec.sequence === 'number') seq = pRec.sequence;
    else if (typeof pRec.sequence === 'string' && !isNaN(parseInt(pRec.sequence, 10))) {
      seq = parseInt(pRec.sequence, 10);
    }

    const visDesc = typeof pRec.visual_description === 'string' ? pRec.visual_description.trim() : '';
    
    // Support verbatim_transcription or visible_text
    let transcription = '';
    if (typeof pRec.verbatim_transcription === 'string') {
      transcription = pRec.verbatim_transcription.trim();
    } else if (typeof pRec.visible_text === 'string') {
      transcription = pRec.visible_text.trim();
    }

    const uncertainty = typeof pRec.uncertainty === 'string' ? pRec.uncertainty.trim() : '';

    panels.push({
      sequence: seq,
      visual_description: visDesc,
      verbatim_transcription: transcription,
      uncertainty,
      reviewed: false, // Never automatically marked reviewed
      original_draft_visual: visDesc,
      original_draft_transcription: transcription,
    });
  });

  panels.sort((a, b) => a.sequence - b.sequence);

  const rawUncertainties = Array.isArray(record.overall_uncertainties) ? record.overall_uncertainties : [];
  const overall_uncertainties: string[] = rawUncertainties
    .filter((u): u is string => typeof u === 'string' && u.trim().length > 0)
    .map((u) => u.trim());

  return {
    isValid: true,
    data: {
      page_summary,
      reading_order_note,
      panels,
      overall_uncertainties,
    },
  };
}

export function generateMarkdownExport(params: {
  sourceFilename: string;
  modelName: string;
  pageSummary: string;
  readingOrderNote: string;
  overallUncertainties: string[];
  panels: ComicPanel[];
}): string {
  const total = params.panels.length;
  const reviewedCount = params.panels.filter((p) => p.reviewed).length;
  const isFullyReviewed = total > 0 && reviewedCount === total;
  const reviewLabel = isFullyReviewed ? 'Human-reviewed' : 'Review incomplete';

  const lines: string[] = [
    `# ComicLens Accessible Comic Description`,
    ``,
    `**Project**: ComicLens — Human-reviewed accessibility workbench for comic pages`,
    `**Review Status**: ${reviewLabel} (${reviewedCount}/${total} panels verified by human)`,
    `**Source Image**: ${params.sourceFilename || 'Unknown file'}`,
    `**Drafting Model**: ${params.modelName || 'gemma-4-26b-a4b-it'}`,
    `**Authoring Principle**: Gemma drafts. Python validates. Humans review. ComicLens exports.`,
    ``,
    `> **Important Notice**: This document was drafted using Gemma 4 and reviewed by a human author. It is an assistive authoring aid and may contain errors. It does not certify compliance with all statutory accessibility standards. Original comic artwork is not redistributed.`,
    ``,
    `---`,
    ``,
    `## Page Summary`,
    ``,
    params.pageSummary || 'No summary provided.',
    ``,
    `## Reading Order Note`,
    ``,
    params.readingOrderNote || 'Standard reading sequence assumed. Human review recommended.',
    ``,
  ];

  if (params.overallUncertainties.length > 0) {
    lines.push(`## Layout & Lettering Uncertainty Notes`, ``);
    params.overallUncertainties.forEach((u) => lines.push(`- ${u}`));
    lines.push(``);
  }

  lines.push(`## Panel-by-Panel Descriptions & Verbatim Dialogue`, ``);

  if (params.panels.length === 0) {
    lines.push(`*No panel descriptions available for this page.*`);
  } else {
    params.panels.forEach((p) => {
      const statusTag = p.reviewed ? '✓ Human-reviewed' : '⚠️ Unreviewed AI draft';
      lines.push(`### Panel ${p.sequence} (${statusTag})`);
      lines.push(``);
      lines.push(`**Visual Description (Human Verified)**:`);
      lines.push(p.visual_description || '*(No visual description provided)*');
      lines.push(``);

      lines.push(`**Verbatim Dialogue, Captions & Sound Effects**:`);
      if (p.verbatim_transcription) {
        // Indent lines as blockquote
        const formatted = p.verbatim_transcription
          .split('\n')
          .map((line) => `> ${line}`)
          .join('\n');
        lines.push(formatted);
      } else {
        lines.push(`> *(None legible or present)*`);
      }
      lines.push(``);

      if (p.uncertainty) {
        lines.push(`**Uncertainty / Ambiguity Notes**:`);
        lines.push(`- ${p.uncertainty}`);
        lines.push(``);
      }

      lines.push(`---`, ``);
    });
  }

  return lines.join('\n');
}
