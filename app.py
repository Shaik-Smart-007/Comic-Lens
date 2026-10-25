"""
ComicLens: A human-reviewed accessibility workbench for comic pages.
Core Principle: Gemma drafts. Python validates. Humans review. ComicLens exports.

MVP Stack:
- Python 3.11 / 3.12
- Streamlit
- google-genai (Official Google Gen AI SDK)
- Pillow (PIL)
- python-dotenv
"""

import io
import os
import json
import re
import hashlib
from typing import Dict, Any, List, Optional, Tuple
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    def load_dotenv():
        pass

try:
    from PIL import Image, UnidentifiedImageError
except ImportError:
    Image = None  # type: ignore
    class UnidentifiedImageError(Exception):  # type: ignore
        pass

try:
    import streamlit as st
except ImportError:
    st = None  # type: ignore

# ==============================================================================
# Configuration & Constants
# ==============================================================================
APP_TITLE = "ComicLens"
APP_TAGLINE = "Turn comic pages into human-reviewed accessible descriptions."
WORKFLOW_STEPS = "Upload → Generate → Review → Export"

MAX_FILE_SIZE_MB = 15
MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024
SUPPORTED_EXTENSIONS = ["png", "jpg", "jpeg", "webp"]

env_gemma_model = os.getenv("GEMMA_MODEL", "")
DEFAULT_GEMMA_MODEL = env_gemma_model if "gemma" in env_gemma_model.lower() else "gemma-4-26b-a4b-it"
DOCUMENTED_GEMMA_MODELS = [
    "gemma-4-26b-a4b-it",
    "gemma-4-31b-it",
]

# Verbatim OCR & Accessibility Analysis Prompt for Gemma 4
ANALYSIS_PROMPT = """You are ComicLens, an assistive accessibility workbench that drafts precise descriptions and verbatim transcripts for comic pages (such as Franco-Belgian ligne claire like Tintin, American comic books, manga, and graphic novels).

Analyze the supplied comic page image with maximum attention to visual details and verbatim text transcription.

CRITICAL OCR & TRANSCRIPTION RULES:
1. Provide two strictly separated outputs for every identified panel:
   A. "visual_description": A detailed, objective visual description of characters, actions, postures, settings, expressions, and key props.
   B. "verbatim_transcription": An exact, word-for-word, letter-for-letter transcription of ALL readable text in the panel.
2. Under "verbatim_transcription", categorize and transcribe every piece of text:
   - Speech bubbles: identify the speaker or location if clear, followed by the exact quoted words.
   - Narration captions / caption boxes: transcribe verbatim.
   - In-scene signs / labels / documents: transcribe visible lettering.
   - Sound effects (onomatopoeia): transcribe exact spelling (e.g., "TAP! TAP! TAP!").
3. DO NOT PARAPHRASE dialogue. Transcribe the exact words as lettered.
4. DO NOT INVENT missing words or attempt to "smooth out" incomplete or stylized grammar.
5. DO NOT silently correct uncertain, damaged, or stylized lettering.
6. If any word or letter is faint, cropped, or partially illegible:
   - Transcribe what is confident and use "[unclear]" or "[?]" for doubtful portions.
   - Explicitly describe the ambiguity in the "uncertainty" field rather than guessing.
7. Keep visual descriptions completely distinct from dialogue transcripts.
8. If no text exists in a panel, set "verbatim_transcription" to "".

Return one JSON object with this exact structure:
{
  "page_summary": "A concise summary of the overall visible page.",
  "reading_order_note": "A short note about the inferred reading sequence and any layout ambiguity.",
  "panels": [
    {
      "sequence": 1,
      "visual_description": "Objective description of characters, actions, settings, and visual storytelling.",
      "verbatim_transcription": "Exact letter-for-letter transcript of speech bubbles, captions, and sound effects.",
      "uncertainty": "Specific text or visual uncertainties, or empty string."
    }
  ],
  "overall_uncertainties": [
    "Any important unresolved page-level ambiguity."
  ]
}

Return valid JSON only, without Markdown fences or conversational commentary."""

# ==============================================================================
# Helper & Validation Functions (Section 6 & 7)
# ==============================================================================

def compute_image_hash(image_bytes: bytes) -> str:
    """Computes SHA-256 hash to reliably detect image changes across reruns."""
    return hashlib.sha256(image_bytes).hexdigest()


def validate_image_file(uploaded_file) -> Tuple[bool, Optional[str], Optional[Any], Optional[Tuple[int, int]]]:
    """
    Validates uploaded file safely without unnecessary memory duplication.
    Returns: (is_valid, error_message, pil_image, (width, height))
    """
    if uploaded_file is None:
        return False, "No file provided.", None, None

    # Check file size limit
    file_bytes = uploaded_file.getvalue()
    if len(file_bytes) == 0:
        return False, "The uploaded file is empty (0 bytes).", None, None

    if len(file_bytes) > MAX_FILE_SIZE_BYTES:
        return False, f"File exceeds the maximum size of {MAX_FILE_SIZE_MB} MB.", None, None

    # Check extension
    extension = uploaded_file.name.rsplit(".", 1)[-1].lower() if "." in uploaded_file.name else ""
    if extension not in SUPPORTED_EXTENSIONS:
        return (
            False,
            f"Unsupported file format '{extension}'. Please upload a PNG, JPEG, or WEBP image.",
            None,
            None,
        )

    # Validate image data using Pillow
    try:
        # Open and load image safely
        image = Image.open(io.BytesIO(file_bytes))
        image.load()  # Force load pixel data to detect truncated or corrupted files
        width, height = image.size

        if width < 50 or height < 50:
            return False, f"Image dimensions ({width}x{height}px) are too small to analyze.", None, None

        return True, None, image, (width, height)
    except UnidentifiedImageError:
        return False, "The file could not be decoded as an image. It may be corrupted or renamed.", None, None
    except Exception as exc:
        return False, f"Invalid image file: {str(exc)}", None, None


def clean_json_text(raw_text: str) -> str:
    """Extracts raw JSON substring if model returns markdown code fences or conversational text."""
    text = raw_text.strip()

    # Strip markdown code blocks like ```json ... ```
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
        text = re.sub(r"\s*```$", "", text)
        text = text.strip()

    # If surrounding text exists, extract outermost braces
    brace_start = text.find("{")
    brace_end = text.rfind("}")
    if brace_start != -1 and brace_end != -1 and brace_end > brace_start:
        text = text[brace_start : brace_end + 1]

    return text


def validate_and_parse_response(raw_text: str) -> Tuple[bool, Optional[str], Optional[Dict[str, Any]]]:
    """
    Strict Python validator for Gemma model output.
    Does NOT use eval(). Handles malformed JSON, missing fields, and extra fields safely.
    Returns: (is_valid, error_message, sanitized_dict)
    """
    if not raw_text or not raw_text.strip():
        return False, "Model returned an empty response.", None

    cleaned_text = clean_json_text(raw_text)

    try:
        data = json.loads(cleaned_text)
    except json.JSONDecodeError as err:
        return (
            False,
            f"Failed to parse model output as valid JSON (line {err.lineno}, col {err.colno}): {err.msg}",
            None,
        )

    # Handle case where model returns an array containing the root object
    if isinstance(data, list) and len(data) > 0 and isinstance(data[0], dict):
        data = data[0]

    # Root must be a dictionary
    if not isinstance(data, dict):
        return False, f"Root JSON entity must be an object/dict, got {type(data).__name__}.", None

    # Safe extraction of page summary
    page_summary = data.get("page_summary", "")
    if not isinstance(page_summary, str):
        page_summary = str(page_summary)

    # Safe extraction of reading order note
    reading_order_note = data.get("reading_order_note", "")
    if not isinstance(reading_order_note, str):
        reading_order_note = str(reading_order_note)

    # Panels check: must be a list
    raw_panels = data.get("panels")
    if not isinstance(raw_panels, list):
        return False, f"The 'panels' field must be a list, got {type(raw_panels).__name__}.", None

    validated_panels: List[Dict[str, Any]] = []
    for idx, panel in enumerate(raw_panels, start=1):
        if not isinstance(panel, dict):
            continue  # Ignore invalid item safely

        # Sequence validation: handle numbers or string numbers
        raw_seq = panel.get("sequence", idx)
        try:
            seq_val = int(raw_seq)
        except (ValueError, TypeError):
            seq_val = idx

        # Visual description
        vis_desc = panel.get("visual_description", "")
        if not isinstance(vis_desc, str):
            vis_desc = str(vis_desc) if vis_desc is not None else ""

        # Verbatim transcription (support both verbatim_transcription and visible_text)
        transcription = panel.get("verbatim_transcription", "")
        if not transcription:
            transcription = panel.get("visible_text", "")
        if not isinstance(transcription, str):
            transcription = str(transcription) if transcription is not None else ""

        # Uncertainty note
        uncertainty = panel.get("uncertainty", "")
        if not isinstance(uncertainty, str):
            uncertainty = str(uncertainty) if uncertainty is not None else ""

        validated_panels.append({
            "sequence": seq_val,
            "visual_description": vis_desc.strip(),
            "verbatim_transcription": transcription.strip(),
            "visible_text": transcription.strip(),  # backward compatibility
            "uncertainty": uncertainty.strip(),
        })

    # Sort panels by sequence
    validated_panels.sort(key=lambda p: p["sequence"])

    # Safe extraction of overall uncertainties
    raw_uncertainties = data.get("overall_uncertainties", [])
    overall_uncertainties: List[str] = []
    if isinstance(raw_uncertainties, list):
        for item in raw_uncertainties:
            if isinstance(item, str) and item.strip():
                overall_uncertainties.append(item.strip())
            elif item is not None:
                overall_uncertainties.append(str(item))

    sanitized = {
        "page_summary": page_summary.strip(),
        "reading_order_note": reading_order_note.strip(),
        "panels": validated_panels,
        "overall_uncertainties": overall_uncertainties,
    }
    return True, None, sanitized


# ==============================================================================
# Gemma 4 API Integration (Section 3)
# ==============================================================================

def call_gemma_api(pil_image: Any, model_name: str, api_key: str) -> Tuple[bool, Optional[str], Optional[str]]:
    """
    Sends the comic page to the Gemma 4 model using the official google-genai SDK.
    Returns: (success, error_message, raw_response_text)
    """
    try:
        from google import genai
        from google.genai import types
    except ImportError:
        return (
            False,
            "The 'google-genai' SDK is not installed. Run 'pip install google-genai' to enable API calls.",
            None,
        )

    if not api_key or not api_key.strip():
        return (
            False,
            "Gemini API key is missing. Set GEMINI_API_KEY in your .env file or the sidebar.",
            None,
        )

    try:
        # Initialize Google Gen AI client with user API key
        client = genai.Client(api_key=api_key.strip())

        # Prepare request config requesting JSON output with high visual token resolution for OCR
        config_kwargs = {
            "response_mime_type": "application/json",
            "temperature": 0.1,
        }
        try:
            config = types.GenerateContentConfig(
                **config_kwargs,
                media_resolution="MEDIA_RESOLUTION_HIGH",
            )
        except (TypeError, ValueError):
            config = types.GenerateContentConfig(**config_kwargs)

        # Execute API call with image and prompt
        response = client.models.generate_content(
            model=model_name.strip(),
            contents=[pil_image, ANALYSIS_PROMPT],
            config=config,
        )

        if not response or not hasattr(response, "text") or not response.text:
            return False, "The model completed the request but returned no text content.", None

        return True, None, response.text

    except Exception as exc:
        err_msg = str(exc)
        # Check for common API errors and provide actionable feedback without exposing credentials
        if "404" in err_msg or "not found" in err_msg.lower():
            return (
                False,
                f"Model '{model_name}' was not found or is unavailable to your API key. "
                "Try specifying another Gemma model in the sidebar, or verify that your key has access to Gemma 4.",
                None,
            )
        elif "403" in err_msg or "permission" in err_msg.lower() or "api_key_invalid" in err_msg.lower():
            return False, "Authentication failure: The provided GEMINI_API_KEY is invalid or lacks necessary permissions.", None
        elif "429" in err_msg or "quota" in err_msg.lower() or "resource_exhausted" in err_msg.lower():
            return False, "API quota exhausted or rate limit exceeded. Please wait a moment before retrying.", None
        elif "deadline" in err_msg.lower() or "timeout" in err_msg.lower():
            return False, "Request timed out while contacting Google Gen AI API. Please check your connection and retry.", None
        else:
            return False, f"API Error: {err_msg}", None


# ==============================================================================
# Markdown Exporter (Section 4, Step D)
# ==============================================================================

def generate_markdown_export(
    source_filename: str,
    model_name: str,
    page_summary: str,
    reading_order_note: str,
    overall_uncertainties: List[str],
    panels_state: List[Dict[str, Any]],
) -> str:
    """
    Constructs clean, accessible Markdown according to Section 4 Step D requirements.
    Never embeds or redistributes the original comic image.
    Labels as 'Human-reviewed' only if all panels are explicitly reviewed.
    """
    total_panels = len(panels_state)
    reviewed_count = sum(1 for p in panels_state if p.get("reviewed", False))
    is_fully_reviewed = (total_panels > 0 and reviewed_count == total_panels)

    review_label = "Human-reviewed" if is_fully_reviewed else "Review incomplete"

    lines: List[str] = [
        f"# ComicLens Accessible Comic Description",
        f"",
        f"**Project**: ComicLens — Human-reviewed accessibility workbench for comic pages",
        f"**Review Status**: {review_label} ({reviewed_count}/{total_panels} panels verified by human)",
        f"**Source Image**: {source_filename or 'Unknown file'}",
        f"**Drafting Model**: {model_name or 'Configured Gemma 4 model'}",
        f"**Authoring Principle**: Gemma drafts. Python validates. Humans review. ComicLens exports.",
        f"",
        f"> **Notice**: This description was drafted with assistance from Gemma 4 and reviewed by a human author. "
        f"It is an assistive authoring aid and may contain errors. It does not certify compliance with all "
        f"statutory accessibility standards.",
        f"",
        f"---",
        f"",
        f"## Page Summary",
        f"",
        f"{page_summary or 'No summary provided.'}",
        f"",
        f"## Reading Order Note",
        f"",
        f"{reading_order_note or 'Standard reading sequence assumed. Review recommended.'}",
        f"",
    ]

    if overall_uncertainties:
        lines.append("## Layout & Story Uncertainty Notes")
        lines.append("")
        for u in overall_uncertainties:
            lines.append(f"- {u}")
        lines.append("")

    lines.append("## Panel-by-Panel Descriptions")
    lines.append("")

    if not panels_state:
        lines.append("*No panel descriptions available for this page.*")
    else:
        for p in panels_state:
            seq = p.get("sequence", 1)
            reviewed = p.get("reviewed", False)
            status_tag = "✓ Human-reviewed" if reviewed else "⚠️ Unreviewed AI draft"
            vis_desc = p.get("visual_description", "").strip()
            vis_text = p.get("visible_text", "").strip()
            uncertainty = p.get("uncertainty", "").strip()

            lines.append(f"### Panel {seq} ({status_tag})")
            lines.append("")
            lines.append(f"**Visual Description**:")
            lines.append(f"{vis_desc or '*(No visual description provided)*'}")
            lines.append("")

            if vis_text:
                lines.append(f"**Transcribed Text / Dialogue**:")
                lines.append(f"> {vis_text}")
                lines.append("")
            else:
                lines.append(f"**Transcribed Text / Dialogue**: *None visible / legible.*")
                lines.append("")

            if uncertainty:
                lines.append(f"**Uncertainty / Ambiguity**:")
                lines.append(f"- {uncertainty}")
                lines.append("")

            lines.append("---")
            lines.append("")

    return "\n".join(lines)


# ==============================================================================
# Streamlit UI & Session State (Section 4 & 9)
# ==============================================================================

def initialize_session_state():
    """Initializes and guards state variables across Streamlit reruns."""
    if "current_image_hash" not in st.session_state:
        st.session_state.current_image_hash = None
    if "current_filename" not in st.session_state:
        st.session_state.current_filename = None
    if "analysis_data" not in st.session_state:
        st.session_state.analysis_data = None
    if "panel_reviews" not in st.session_state:
        st.session_state.panel_reviews = []
    if "raw_api_response" not in st.session_state:
        st.session_state.raw_api_response = None
    if "api_error" not in st.session_state:
        st.session_state.api_error = None


def reset_analysis_for_new_image(new_hash: str, filename: str):
    """Resets stale analysis data when a different image is uploaded (Section 7)."""
    st.session_state.current_image_hash = new_hash
    st.session_state.current_filename = filename
    st.session_state.analysis_data = None
    st.session_state.panel_reviews = []
    st.session_state.raw_api_response = None
    st.session_state.api_error = None


def main():
    st.set_page_config(
        page_title="ComicLens — Accessible Comic Workbench",
        page_icon="📖",
        layout="wide",
        initial_sidebar_state="expanded",
    )
    initialize_session_state()

    # --------------------------------------------------------------------------
    # Sidebar: Model Configuration, Privacy, Limitations
    # --------------------------------------------------------------------------
    with st.sidebar:
        st.title("📖 ComicLens")
        st.markdown(f"**Workflow**: `{WORKFLOW_STEPS}`")
        st.markdown("---")

        st.subheader("Model Configuration")
        # Allow selecting or entering Gemma model
        selected_model = st.selectbox(
            "Selected Gemma 4 Model",
            options=DOCUMENTED_GEMMA_MODELS,
            index=0 if DEFAULT_GEMMA_MODEL in DOCUMENTED_GEMMA_MODELS else 0,
            help="Gemma 4 model identifier used for multimodal panel analysis."
        )

        custom_model = st.text_input(
            "Or enter custom model ID",
            value="" if selected_model in DOCUMENTED_GEMMA_MODELS else DEFAULT_GEMMA_MODEL,
            placeholder="e.g. gemma-4-26b-a4b-it",
            help="Overrides the selection above if specified."
        )
        active_model = custom_model.strip() if custom_model.strip() else selected_model

        st.markdown("---")
        st.subheader("API Credentials")
        env_key = os.getenv("GEMINI_API_KEY", "")
        if env_key:
            st.success("✓ `GEMINI_API_KEY` detected in environment (.env).")
            api_key = env_key
        else:
            api_key = st.text_input(
                "Gemini API Key",
                type="password",
                help="Enter your API key. ComicLens never saves or logs your key.",
            )
            if not api_key:
                st.warning("⚠️ Enter key above or set `GEMINI_API_KEY` in `.env`")

        st.markdown("---")
        st.subheader("Privacy & Responsible Use")
        st.info(
            "🔒 **Data Flow Note**: Uploaded images are transmitted to the configured Google Gen AI API "
            "for multimodal analysis. They are NOT stored permanently on the server or in any database."
        )

        st.subheader("Limitations")
        st.caption(
            "ComicLens is an assistive authoring prototype, not an autonomous certification tool. "
            "Gemma 4 drafts reading orders and dialogue, but visual layouts can be ambiguous. "
            "Human review is required before publishing accessible transcripts."
        )

    # --------------------------------------------------------------------------
    # Main Header & Overview
    # --------------------------------------------------------------------------
    st.title("ComicLens")
    st.subheader(APP_TAGLINE)
    st.caption("Assistive authoring prototype: *Gemma drafts. Python validates. Humans review. ComicLens exports.*")

    # Step indicator visual
    st.markdown(
        """
        <div style="display:flex; justify-content:space-between; background-color:#f1f5f9; padding:10px 16px; border-radius:8px; margin-bottom:20px; font-weight:500;">
            <span>Step A: Upload Comic Page</span>
            <span>→</span>
            <span>Step B: Analyze with Gemma 4</span>
            <span>→</span>
            <span>Step C: Human Review & Edit</span>
            <span>→</span>
            <span>Step D: Export Accessible Markdown</span>
        </div>
        """,
        unsafe_allow_html=True,
    )

    # --------------------------------------------------------------------------
    # Step A: Upload & Image Validation
    # --------------------------------------------------------------------------
    st.header("Step A — Upload Comic Page")
    uploaded_file = st.file_uploader(
        "Upload one comic page (PNG, JPEG, or WEBP, max 15MB)",
        type=SUPPORTED_EXTENSIONS,
        help="Choose a high-contrast comic page you own or are licensed to transcribe.",
    )

    current_image = None
    if uploaded_file is not None:
        file_bytes = uploaded_file.getvalue()
        file_hash = compute_image_hash(file_bytes)

        # Detect new image upload and clear stale data
        if st.session_state.current_image_hash != file_hash:
            reset_analysis_for_new_image(file_hash, uploaded_file.name)

        is_valid, err_msg, pil_img, dims = validate_image_file(uploaded_file)

        if not is_valid:
            st.error(f"❌ Image Validation Failed: {err_msg}")
        else:
            current_image = pil_img
            width, height = dims
            col_img, col_info = st.columns([1, 1])

            with col_img:
                st.image(pil_img, caption=f"Uploaded: {uploaded_file.name}", use_container_width=True)

            with col_info:
                st.success("✓ Image is valid and ready for analysis.")
                st.metric("Filename", uploaded_file.name)
                st.metric("Dimensions", f"{width} × {height} pixels")
                st.metric("File Size", f"{len(file_bytes) / 1024:.1f} KB")

                st.markdown("---")
                st.markdown(f"**Target Model**: `{active_model}`")

                generate_clicked = st.button(
                    "Generate descriptions",
                    type="primary",
                    use_container_width=True,
                    disabled=(pil_img is None or not api_key),
                )

                if not api_key:
                    st.warning("⚠️ Please provide a GEMINI_API_KEY to enable description generation.")

                # --------------------------------------------------------------
                # Step B: Analyze with Gemma 4
                # --------------------------------------------------------------
                if generate_clicked and pil_img is not None and api_key:
                    with st.spinner(f"Analyzing comic layout with {active_model}..."):
                        success, err, raw_text = call_gemma_api(pil_img, active_model, api_key)

                        if not success:
                            st.session_state.api_error = err
                            st.session_state.analysis_data = None
                            st.session_state.raw_api_response = None
                        else:
                            st.session_state.api_error = None
                            st.session_state.raw_api_response = raw_text

                            # Python validation of JSON structure
                            valid_json, json_err, sanitized = validate_and_parse_response(raw_text)
                            if not valid_json:
                                st.session_state.api_error = f"Response Validation Error: {json_err}"
                                st.session_state.analysis_data = None
                            else:
                                st.session_state.analysis_data = sanitized
                                # Initialize panel reviews from parsed output
                                reviews = []
                                for p in sanitized["panels"]:
                                    reviews.append({
                                        "sequence": p["sequence"],
                                        "visual_description": p["visual_description"],
                                        "visible_text": p["visible_text"],
                                        "uncertainty": p["uncertainty"],
                                        "reviewed": False,  # Gemma drafts are NEVER automatically approved!
                                        "original_draft": p["visual_description"],
                                    })
                                st.session_state.panel_reviews = reviews

    # Display API or Validation Errors near action
    if st.session_state.api_error:
        st.error(f"❌ {st.session_state.api_error}")
        st.caption("You can verify your API key, check your network connection, or try a different Gemma model.")
        if st.session_state.raw_api_response:
            with st.expander("Inspect Raw Model Response (Debugging)"):
                st.code(st.session_state.raw_api_response, language="json")

    # --------------------------------------------------------------------------
    # Step C: Human Review Interface (Section 4, Step C)
    # --------------------------------------------------------------------------
    if st.session_state.analysis_data and st.session_state.panel_reviews:
        st.markdown("---")
        st.header("Step C — Human Review & Editing")

        analysis = st.session_state.analysis_data
        panels = st.session_state.panel_reviews

        # Page Summary & Context Notes
        st.subheader("Page-Level Context")
        summary_col1, summary_col2 = st.columns(2)
        with summary_col1:
            st.markdown(f"**Overall Page Summary (AI-drafted)**:\n\n{analysis.get('page_summary', 'None')}")
        with summary_col2:
            st.markdown(f"**Reading Order Note**:\n\n{analysis.get('reading_order_note', 'None')}")

        if analysis.get("overall_uncertainties"):
            with st.expander("⚠️ Identified Layout / Story Uncertainties"):
                for unc in analysis["overall_uncertainties"]:
                    st.markdown(f"- {unc}")

        # Review Progress Indicator
        total_p = len(panels)
        reviewed_p = sum(1 for p in panels if p.get("reviewed", False))
        pct = int((reviewed_p / total_p) * 100) if total_p > 0 else 0

        st.markdown("---")
        prog_col1, prog_col2 = st.columns([3, 1])
        with prog_col1:
            st.progress(pct / 100.0)
            st.markdown(f"**Review Status**: `{reviewed_p} of {total_p} panels reviewed` ({pct}%)")
        with prog_col2:
            if st.button("Mark all as reviewed" if reviewed_p < total_p else "Unmark all"):
                new_state = (reviewed_p < total_p)
                for p in panels:
                    p["reviewed"] = new_state
                st.rerun()

        # Panel-by-Panel Cards
        st.subheader("Panel Descriptions (Drafted by Gemma 4)")
        st.caption(
            "Every panel draft requires human review before export. Check dialogue, describe key visual actions, and confirm."
        )

        for i, panel in enumerate(panels):
            seq = panel["sequence"]
            is_reviewed = panel.get("reviewed", False)

            card_title = f"Panel {seq}" + (" ✅ (Reviewed)" if is_reviewed else " ⚠️ (Unreviewed Draft)")

            with st.expander(card_title, expanded=(not is_reviewed)):
                # Original draft callout
                st.info(f"**Original Gemma Draft**: {panel.get('original_draft', '')}")

                # Editable text area for visual description
                vis_key = f"vis_desc_{seq}_{st.session_state.current_image_hash}"
                edited_vis = st.text_area(
                    f"Visual Description for Panel {seq}",
                    value=panel.get("visual_description", ""),
                    key=vis_key,
                    height=100,
                    help="Describe character actions, settings, expressions, and story-critical details.",
                )
                panel["visual_description"] = edited_vis

                # Editable text area for visible text / speech bubbles
                text_key = f"text_{seq}_{st.session_state.current_image_hash}"
                edited_text = st.text_area(
                    f"Transcribed Text / Speech Bubbles for Panel {seq}",
                    value=panel.get("visible_text", ""),
                    key=text_key,
                    height=70,
                    help="Transcribe legible dialogue and captions only. Keep separate from visual description.",
                )
                panel["visible_text"] = edited_text

                # Uncertainty note if present
                if panel.get("uncertainty"):
                    st.caption(f"ℹ️ Model Uncertainty Note: {panel['uncertainty']}")

                # Human review checkbox
                check_key = f"check_{seq}_{st.session_state.current_image_hash}"
                chk = st.checkbox(
                    "Reviewed by human",
                    value=panel.get("reviewed", False),
                    key=check_key,
                    help="Confirm that you have reviewed and approved this panel description.",
                )
                panel["reviewed"] = chk

        # ----------------------------------------------------------------------
        # Step D: Export Accessible Markdown (Section 4, Step D)
        # ----------------------------------------------------------------------
        st.markdown("---")
        st.header("Step D — Export Accessible Markdown")

        is_complete = (reviewed_p == total_p and total_p > 0)
        if is_complete:
            st.success("🎉 All panels have been human-reviewed! The export will be labeled 'Human-reviewed'.")
        else:
            st.warning(
                f"⚠️ Review incomplete: Only {reviewed_p} of {total_p} panels are marked reviewed. "
                "The export will be labeled 'Review incomplete'."
            )

        markdown_doc = generate_markdown_export(
            source_filename=st.session_state.current_filename or "comic_page",
            model_name=active_model,
            page_summary=analysis.get("page_summary", ""),
            reading_order_note=analysis.get("reading_order_note", ""),
            overall_uncertainties=analysis.get("overall_uncertainties", []),
            panels_state=panels,
        )

        with st.expander("Preview Markdown Document"):
            st.markdown(markdown_doc)

        out_filename = f"comiclens-{(st.session_state.current_filename or 'page').rsplit('.', 1)[0]}.md"
        st.download_button(
            label="Download Accessible Markdown (.md)",
            data=markdown_doc,
            file_name=out_filename,
            mime="text/markdown",
            type="primary",
        )

    elif current_image is not None and not st.session_state.analysis_data:
        st.info("👈 Click **Generate descriptions** in Step A above to begin Gemma 4 panel analysis.")


if __name__ == "__main__":
    main()
