import React, { useState, useEffect, useRef } from 'react';
import {
  BookOpen,
  Upload,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Download,
  Copy,
  RefreshCw,
  Eye,
  Info,
  ShieldCheck,
  Check,
  FileText,
  HelpCircle,
} from 'lucide-react';
import { ComicPanel, AnalysisResponse, ImageMeta } from './types.ts';
import { SAMPLE_COMICS, SampleComic } from './data/sampleComics.ts';
import {
  validateAndParseResponse,
  generateMarkdownExport,
} from './utils/comicLensValidator.ts';

export default function App() {
  // Config state from server
  const [serverModel, setServerModel] = useState<string>('gemma-4-26b-a4b-it');
  const [serverHasKey, setServerHasKey] = useState<boolean>(true);

  // Step A: Image State
  const [currentImage, setCurrentImage] = useState<ImageMeta | null>(() => {
    // Default to the Tintin sample comic page for immediate testing
    const sample = SAMPLE_COMICS[0];
    return {
      name: 'tintin_chateau_de_moulinsart.png',
      size: 48128,
      width: sample.width,
      height: sample.height,
      dataUrl: sample.svgDataUrl,
      hash: sample.id,
    };
  });
  const [selectedSampleId, setSelectedSampleId] = useState<string>('tintin_chateau');
  const [imageError, setImageError] = useState<string | null>(null);

  // Step B: Analysis State
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [analysisSource, setAnalysisSource] = useState<'live_api' | 'sample_draft' | null>(null);

  // Step C & D: Panel Reviews & Export State
  const [analysisData, setAnalysisData] = useState<AnalysisResponse | null>(null);
  const [panels, setPanels] = useState<ComicPanel[]>([]);
  const [copiedExport, setCopiedExport] = useState<boolean>(false);
  const [exportFormat, setExportFormat] = useState<'markdown' | 'text'>('markdown');

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Fetch server config on mount (identifying actual server-side Gemma 4 model)
  useEffect(() => {
    fetch('/api/config')
      .then((res) => res.json())
      .then((data) => {
        if (data.model) setServerModel(data.model);
        if (typeof data.hasApiKey === 'boolean') setServerHasKey(data.hasApiKey);
      })
      .catch(() => {
        // Dev server or fallback default
      });
  }, []);

  // Handle uploading user-provided comic page
  // Preserves original aspect ratio and full resolution (no canvas compression)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImageError(null);
    setApiError(null);

    // 25 MB max limit
    if (file.size > 25 * 1024 * 1024) {
      setImageError('File size exceeds the 25 MB limit. Please select a smaller image.');
      return;
    }

    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      setImageError('Unsupported file format. Please upload a high-resolution PNG, JPEG, or WEBP image.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      const dataUrl = loadEvent.target?.result as string;
      const img = new Image();
      img.onload = () => {
        if (img.width < 50 || img.height < 50) {
          setImageError(`Image resolution (${img.width}×${img.height}px) is too small to transcribe legible text.`);
          return;
        }

        // Reset stale descriptions whenever a different image is uploaded
        setCurrentImage({
          name: file.name,
          size: file.size,
          width: img.width,
          height: img.height,
          dataUrl: dataUrl,
          hash: `${file.name}-${file.size}-${Date.now()}`,
        });
        setSelectedSampleId('');
        setAnalysisData(null);
        setPanels([]);
        setAnalysisSource(null);
      };
      img.onerror = () => {
        setImageError('Could not decode the selected file as a valid image. It may be corrupted.');
      };
      img.src = dataUrl;
    };
    reader.onerror = () => {
      setImageError('Failed to read the selected file from disk.');
    };
    reader.readAsDataURL(file);
  };

  // Load sample comic page
  const loadSample = (sample: SampleComic) => {
    setImageError(null);
    setApiError(null);
    setSelectedSampleId(sample.id);

    // Reset stale state
    setCurrentImage({
      name: `${sample.id}.png`,
      size: 48128,
      width: sample.width,
      height: sample.height,
      dataUrl: sample.svgDataUrl,
      hash: sample.id,
    });
    setAnalysisData(null);
    setPanels([]);
    setAnalysisSource(null);
  };

  // Trigger analysis through server-side Gemma 4 API
  const handleGenerate = async () => {
    if (!currentImage) return;

    setIsGenerating(true);
    setApiError(null);

    try {
      // Call server-side API proxy with uncompressed image and MEDIA_RESOLUTION_HIGH
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: currentImage.dataUrl,
          model: serverModel,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        // If server key is not configured or API fails, do not invent mock responses as API success
        throw new Error(result.error || `Server returned error (${response.status})`);
      }

      // Strict validation of model output
      const validation = validateAndParseResponse(result.rawText);
      if (!validation.isValid || !validation.data) {
        throw new Error(validation.error || 'Failed to parse model output into structured comic panels.');
      }

      setAnalysisData(validation.data);
      setPanels(validation.data.panels);
      setAnalysisSource('live_api');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setApiError(msg);

      // If user is testing with sample comic and API failed or key missing, provide option to view sample draft
      // but clearly label it as a demonstration draft rather than a successful API call
      const matchedSample = SAMPLE_COMICS.find((s) => s.id === selectedSampleId);
      if (matchedSample && !serverHasKey) {
        const validation = validateAndParseResponse(JSON.stringify(matchedSample.defaultDraft));
        if (validation.isValid && validation.data) {
          setAnalysisData(validation.data);
          setPanels(validation.data.panels);
          setAnalysisSource('sample_draft');
        }
      }
    } finally {
      setIsGenerating(false);
    }
  };

  // Human review edits (preserves user revisions)
  const handleUpdatePanel = (index: number, updates: Partial<ComicPanel>) => {
    setPanels((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], ...updates };
      return copy;
    });
  };

  const totalPanels = panels.length;
  const reviewedCount = panels.filter((p) => p.reviewed).length;
  const allReviewed = totalPanels > 0 && reviewedCount === totalPanels;

  const handleToggleAllReviewed = () => {
    const nextState = !allReviewed;
    setPanels((prev) => prev.map((p) => ({ ...p, reviewed: nextState })));
  };

  // Generate accessible export document (Markdown or Plain Text)
  const markdownExport = generateMarkdownExport({
    sourceFilename: currentImage?.name || 'comic_page.png',
    modelName: serverModel,
    pageSummary: analysisData?.page_summary || '',
    readingOrderNote: analysisData?.reading_order_note || '',
    overallUncertainties: analysisData?.overall_uncertainties || [],
    panels: panels,
  });

  // Plain-text alternative
  const plainTextExport = markdownExport
    .replace(/^#+\s+/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/^>\s+/gm, '   ')
    .replace(/---+/g, '----------------------------------------');

  const activeExportContent = exportFormat === 'markdown' ? markdownExport : plainTextExport;

  const handleDownload = () => {
    const ext = exportFormat === 'markdown' ? 'md' : 'txt';
    const mime = exportFormat === 'markdown' ? 'text/markdown;charset=utf-8' : 'text/plain;charset=utf-8';
    const blob = new Blob([activeExportContent], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `comiclens-${(currentImage?.name || 'accessible_page').replace(/\.[^/.]+$/, '')}.${ext}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(activeExportContent);
    setCopiedExport(true);
    setTimeout(() => setCopiedExport(false), 2000);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans flex flex-col">
      {/* Top Application Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold tracking-tight text-slate-900">ComicLens</h1>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                  Accessibility Workbench
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Human-reviewed visual descriptions & verbatim dialogue transcription
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 text-slate-600 border border-slate-200 font-mono text-[11px]">
              <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
              <span>Model: {serverModel}</span>
              <span className="text-slate-400">·</span>
              <span className="text-emerald-700 font-semibold">High Detail (OCR)</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 w-full flex-1 space-y-6">
        {/* Workflow Progression Banner */}
        <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-xs">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs font-semibold text-center">
            <div
              className={`p-2 rounded-lg flex items-center justify-center gap-2 ${
                currentImage ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' : 'bg-slate-50 text-slate-500'
              }`}
            >
              <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px]">
                1
              </span>
              Upload Comic Page
            </div>
            <div
              className={`p-2 rounded-lg flex items-center justify-center gap-2 ${
                analysisData ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' : 'bg-slate-50 text-slate-500'
              }`}
            >
              <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px]">
                2
              </span>
              Gemma 4 High-Res Analysis
            </div>
            <div
              className={`p-2 rounded-lg flex items-center justify-center gap-2 ${
                reviewedCount > 0
                  ? 'bg-amber-50 text-amber-800 border border-amber-200'
                  : 'bg-slate-50 text-slate-500'
              }`}
            >
              <span className="w-5 h-5 rounded-full bg-amber-600 text-white flex items-center justify-center text-[10px]">
                3
              </span>
              Human Review ({reviewedCount}/{totalPanels || 0})
            </div>
            <div
              className={`p-2 rounded-lg flex items-center justify-center gap-2 ${
                allReviewed
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : 'bg-slate-50 text-slate-500'
              }`}
            >
              <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px]">
                4
              </span>
              Accessible Export
            </div>
          </div>
        </div>

        {/* 2-Column Responsive Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Image Source & Control Panel (4 cols) */}
          <div className="lg:col-span-4 space-y-5">
            {/* Step 1: Upload Card */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                  <Upload className="w-4 h-4 text-indigo-600" />
                  Step 1 — Comic Page Source
                </h2>
                <span className="text-[11px] text-slate-400">PNG, JPG, WEBP</span>
              </div>

              {/* Sample Comics for fast testing */}
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1.5 block">
                  Demonstration Comic Pages:
                </label>
                <div className="grid grid-cols-1 gap-2">
                  {SAMPLE_COMICS.map((sample) => (
                    <button
                      key={sample.id}
                      onClick={() => loadSample(sample)}
                      className={`text-left p-2.5 rounded-lg border text-xs transition-all flex flex-col gap-0.5 cursor-pointer ${
                        selectedSampleId === sample.id
                          ? 'bg-indigo-50 border-indigo-300 text-indigo-900 font-medium shadow-xs'
                          : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                      }`}
                    >
                      <span className="font-semibold">{sample.title}</span>
                      <span className="text-[11px] text-slate-500">{sample.description}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* File upload input */}
              <div>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  id="comic-upload-input"
                />
                <label
                  htmlFor="comic-upload-input"
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-3 border-2 border-dashed border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:border-indigo-300 cursor-pointer transition-colors"
                >
                  <Upload className="w-4 h-4 text-slate-400" />
                  Upload your comic page (Up to 25MB)
                </label>
                <p className="text-[10px] text-slate-400 mt-1 text-center">
                  Original aspect ratio and pixels are preserved without downscaling.
                </p>
              </div>

              {imageError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <span>{imageError}</span>
                </div>
              )}

              {/* Image Preview with Dimensions & Aspect Ratio */}
              {currentImage && (
                <div className="bg-slate-50 rounded-lg p-3 border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">File:</span>
                    <span className="font-medium text-slate-800 truncate max-w-[170px]">
                      {currentImage.name}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">Resolution:</span>
                    <span className="font-medium text-slate-800">
                      {currentImage.width} × {currentImage.height} px
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">Aspect Ratio:</span>
                    <span className="font-medium text-slate-800">
                      {(currentImage.width / currentImage.height).toFixed(2)}:1 (Native)
                    </span>
                  </div>

                  <div className="rounded border border-slate-300 overflow-hidden bg-slate-900 mt-2">
                    <img
                      src={currentImage.dataUrl}
                      alt="Comic page preview"
                      className="w-full h-auto max-h-56 object-contain"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Step 2: Model Configuration & Analysis Trigger */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-3.5">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-indigo-600" />
                  Step 2 — Gemma 4 Analysis
                </h2>
                <span className="text-[11px] text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  Server-side API
                </span>
              </div>

              <div className="space-y-1 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Model:</span>
                  <span className="font-mono font-semibold text-slate-800">{serverModel}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Visual Token Setting:</span>
                  <span className="font-mono text-indigo-700 font-semibold">MEDIA_RESOLUTION_HIGH</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Transcription Priority:</span>
                  <span className="font-semibold text-slate-800">Verbatim Speech & Captions</span>
                </div>
              </div>

              {/* Generate Descriptions Button */}
              <button
                onClick={handleGenerate}
                disabled={!currentImage || isGenerating}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-semibold text-xs rounded-lg transition-all shadow-xs cursor-pointer disabled:cursor-not-allowed"
              >
                {isGenerating ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Gemma 4 transcribing dialogue & visual context...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Generate descriptions
                  </>
                )}
              </button>

              {apiError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold">Model Request Note</div>
                    <div className="text-[11px] leading-relaxed">{apiError}</div>
                  </div>
                </div>
              )}

              {/* Privacy Notice */}
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-[11px] text-slate-600 flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <strong>Privacy & Security</strong>: Credentials remain strictly server-side.
                  Comic images are transmitted securely for inference and never stored permanently.
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Human Review Interface & Accessible Export (8 cols) */}
          <div className="lg:col-span-8 space-y-6">
            {!analysisData ? (
              <div className="bg-white border border-slate-200 rounded-xl p-8 text-center shadow-xs flex flex-col items-center justify-center min-h-[380px]">
                <div className="w-12 h-12 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center mb-3">
                  <Sparkles className="w-6 h-6" />
                </div>
                <h3 className="text-base font-bold text-slate-800 mb-1">Ready for Accessible Transcription</h3>
                <p className="text-xs text-slate-500 max-w-md mb-4 leading-relaxed">
                  Click <strong>"Generate descriptions"</strong> to analyze panel reading order, transcribe
                  dialogue verbatim, and generate accessible descriptions for screen readers.
                </p>
                <button
                  onClick={handleGenerate}
                  disabled={!currentImage || isGenerating}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg shadow-xs cursor-pointer"
                >
                  Generate descriptions now
                </button>
              </div>
            ) : (
              <>
                {/* Step 3: Human Review & Editing Header */}
                <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                          <Eye className="w-4 h-4 text-amber-600" />
                          Step 3 — Human Review & Editing
                        </h2>
                        {analysisSource === 'live_api' ? (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Live Gemma 4 Analysis
                          </span>
                        ) : (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                            Demonstration Draft
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Verify panel sequence, edit visual details, and confirm transcribed dialogue.
                      </p>
                    </div>

                    <button
                      onClick={handleToggleAllReviewed}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-lg transition-colors cursor-pointer"
                    >
                      {allReviewed ? 'Unmark All' : 'Mark All Reviewed'}
                    </button>
                  </div>

                  {/* Progress bar */}
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex flex-col sm:flex-row items-center justify-between gap-3">
                    <div className="w-full sm:w-2/3 space-y-1">
                      <div className="flex justify-between text-xs font-semibold text-slate-700">
                        <span>Human Review Status</span>
                        <span>
                          {reviewedCount} / {totalPanels} panels ({Math.round((reviewedCount / totalPanels) * 100)}%)
                        </span>
                      </div>
                      <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                        <div
                          className={`h-2 rounded-full transition-all duration-300 ${
                            allReviewed ? 'bg-emerald-500' : 'bg-amber-500'
                          }`}
                          style={{ width: `${(reviewedCount / totalPanels) * 100}%` }}
                        />
                      </div>
                    </div>
                    <span
                      className={`text-xs font-bold px-3 py-1 rounded-full border ${
                        allReviewed
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                          : 'bg-amber-50 text-amber-700 border-amber-300'
                      }`}
                    >
                      {allReviewed ? '✓ Human-Reviewed' : '⚠️ Review Incomplete'}
                    </span>
                  </div>

                  {/* Page Summary and Reading Order Notes */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                      <div className="font-semibold text-slate-700 mb-1">Page Summary (AI Draft):</div>
                      <p className="text-slate-600 leading-relaxed">{analysisData.page_summary}</p>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                      <div className="font-semibold text-slate-700 mb-1">Reading Order Note:</div>
                      <p className="text-slate-600 leading-relaxed">{analysisData.reading_order_note}</p>
                    </div>
                  </div>

                  {analysisData.overall_uncertainties.length > 0 && (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                      <div className="font-bold mb-1 flex items-center gap-1">
                        <Info className="w-3.5 h-3.5 text-amber-600" />
                        Layout & Lettering Uncertainties Identified by Model:
                      </div>
                      <ul className="list-disc pl-5 space-y-0.5">
                        {analysisData.overall_uncertainties.map((u, i) => (
                          <li key={i}>{u}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                {/* Panel-by-Panel Cards */}
                <div className="space-y-4">
                  {panels.map((panel, idx) => (
                    <div
                      key={panel.sequence}
                      className={`bg-white border rounded-xl p-4 shadow-xs transition-all ${
                        panel.reviewed
                          ? 'border-emerald-300 ring-1 ring-emerald-100'
                          : 'border-slate-200'
                      }`}
                    >
                      {/* Card Header & Checkbox */}
                      <div className="flex items-center justify-between border-b border-slate-100 pb-2.5 mb-3">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold px-2.5 py-1 rounded-md bg-slate-800 text-white">
                            Panel {panel.sequence} of {totalPanels}
                          </span>
                          <span
                            className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
                              panel.reviewed
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-amber-50 text-amber-700 border-amber-200'
                            }`}
                          >
                            {panel.reviewed ? '✓ Reviewed by human' : '⚠️ AI Draft (Unreviewed)'}
                          </span>
                        </div>

                        <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer select-none bg-slate-50 hover:bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
                          <input
                            type="checkbox"
                            checked={panel.reviewed}
                            onChange={(e) => handleUpdatePanel(idx, { reviewed: e.target.checked })}
                            className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer"
                          />
                          Reviewed by human
                        </label>
                      </div>

                      {/* Explicit Separation: Output A (Visual Description) vs Output B (Verbatim Dialogue) */}
                      <div className="space-y-3.5">
                        {/* Output A: Visual Description */}
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                              <Eye className="w-3.5 h-3.5 text-indigo-600" />
                              Output A: Visual Description (Editable)
                            </label>
                            <span className="text-[10px] text-slate-400">Characters, postures, actions, scene</span>
                          </div>
                          <textarea
                            rows={3}
                            value={panel.visual_description}
                            onChange={(e) =>
                              handleUpdatePanel(idx, { visual_description: e.target.value })
                            }
                            placeholder="Describe visible actions, characters, postures, settings..."
                            className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white text-slate-800 leading-relaxed"
                          />
                          <div className="text-[11px] text-slate-500 italic mt-0.5">
                            Original AI Draft: "{panel.original_draft_visual}"
                          </div>
                        </div>

                        {/* Output B: Verbatim Dialogue & Transcription */}
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                              <FileText className="w-3.5 h-3.5 text-emerald-600" />
                              Output B: Verbatim Dialogue, Captions & Sound Effects (Editable)
                            </label>
                            <span className="text-[10px] text-slate-400">Word-for-word, letter-for-letter</span>
                          </div>
                          <textarea
                            rows={3}
                            value={panel.verbatim_transcription}
                            onChange={(e) =>
                              handleUpdatePanel(idx, { verbatim_transcription: e.target.value })
                            }
                            placeholder="Exact transcription of speech bubbles, captions, and sound effects..."
                            className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white text-slate-800 font-mono leading-relaxed"
                          />
                          {panel.original_draft_transcription && (
                            <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                              Original AI Transcript: {panel.original_draft_transcription}
                            </div>
                          )}
                        </div>

                        {panel.uncertainty && (
                          <div className="text-[11px] text-amber-800 bg-amber-50 p-2 rounded-lg border border-amber-200 flex items-start gap-1.5">
                            <HelpCircle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                            <div>
                              <strong>Model Uncertainty Note:</strong> {panel.uncertainty}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Step 4: Export Accessible Document */}
                <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                    <div>
                      <h2 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                        <Download className="w-4 h-4 text-emerald-600" />
                        Step 4 — Export Accessible Descriptions
                      </h2>
                      <p className="text-xs text-slate-500">
                        Exports screen-reader accessible document without redistributing original comic images.
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="flex items-center bg-slate-100 rounded-lg p-0.5 text-xs font-medium border border-slate-200">
                        <button
                          onClick={() => setExportFormat('markdown')}
                          className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                            exportFormat === 'markdown'
                              ? 'bg-white text-indigo-700 shadow-xs font-semibold'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          Markdown (.md)
                        </button>
                        <button
                          onClick={() => setExportFormat('text')}
                          className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                            exportFormat === 'text'
                              ? 'bg-white text-indigo-700 shadow-xs font-semibold'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          Plain Text (.txt)
                        </button>
                      </div>

                      <button
                        onClick={handleCopy}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-lg transition-colors cursor-pointer"
                      >
                        {copiedExport ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                        {copiedExport ? 'Copied!' : 'Copy'}
                      </button>
                      <button
                        onClick={handleDownload}
                        className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-lg transition-colors cursor-pointer shadow-xs"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Download
                      </button>
                    </div>
                  </div>

                  {/* Status Banner */}
                  <div
                    className={`p-3 rounded-lg border text-xs flex items-center justify-between ${
                      allReviewed
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : 'bg-amber-50 text-amber-800 border-amber-200'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {allReviewed ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-amber-600" />
                      )}
                      <div>
                        <strong>Document Review Status:</strong>{' '}
                        <span className="font-mono font-bold">
                          {allReviewed ? 'Human-reviewed' : 'Review incomplete'}
                        </span>
                        {!allReviewed && (
                          <span className="ml-1 text-[11px] block sm:inline">
                            ({reviewedCount} of {totalPanels} panels confirmed by reviewer)
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="text-[11px] text-slate-500">Screen-Reader Optimized</span>
                  </div>

                  {/* Export Document Preview */}
                  <div className="relative">
                    <pre className="p-4 bg-slate-900 text-slate-100 text-xs rounded-lg overflow-x-auto max-h-72 font-mono leading-relaxed">
                      {activeExportContent}
                    </pre>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </main>

      {/* Clean Footer without implementation clutter */}
      <footer className="bg-white border-t border-slate-200 py-3 text-center text-xs text-slate-500">
        ComicLens · Accessible Comic Workbench · <em>Gemma drafts. Python validates. Humans review. ComicLens exports.</em>
      </footer>
    </div>
  );
}
