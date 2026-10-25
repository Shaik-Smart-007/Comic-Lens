import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanJsonText,
  validateAndParseResponse,
  generateMarkdownExport,
} from './comicLensValidator.ts';

test('cleanJsonText strips markdown fences', () => {
  const fenced = '```json\n{"page_summary": "Test", "panels": []}\n```';
  assert.equal(cleanJsonText(fenced), '{"page_summary": "Test", "panels": []}');
});

test('cleanJsonText extracts JSON amidst commentary', () => {
  const text = 'Here is the result:\n{"page_summary": "A", "panels": []}\nHope that helps!';
  assert.equal(cleanJsonText(text), '{"page_summary": "A", "panels": []}');
});

test('validateAndParseResponse handles array-wrapped root object', () => {
  const arrayWrapped = JSON.stringify([
    {
      page_summary: 'Tintin adventure',
      reading_order_note: 'Left to right',
      panels: [
        {
          sequence: 1,
          visual_description: 'Tintin running',
          verbatim_transcription: 'Great Scott!',
          uncertainty: '',
        },
      ],
    },
  ]);
  const result = validateAndParseResponse(arrayWrapped);
  assert.equal(result.isValid, true);
  assert.ok(result.data);
  assert.equal(result.data.panels.length, 1);
  assert.equal(result.data.panels[0].verbatim_transcription, 'Great Scott!');
});

test('validateAndParseResponse supports both verbatim_transcription and visible_text', () => {
  const payload = JSON.stringify({
    page_summary: 'Overall summary',
    reading_order_note: 'Left-to-right',
    panels: [
      {
        sequence: 1,
        visual_description: 'Panel 1 action',
        verbatim_transcription: 'Speech bubble: "Hello!"',
        uncertainty: '',
      },
      {
        sequence: 2,
        visual_description: 'Panel 2 action',
        visible_text: 'Legacy format text',
        uncertainty: 'Shadowed',
      },
    ],
    overall_uncertainties: ['Color palette is washed out'],
  });

  const result = validateAndParseResponse(payload);
  assert.equal(result.isValid, true);
  assert.ok(result.data);
  assert.equal(result.data.panels.length, 2);
  assert.equal(result.data.panels[0].reviewed, false);
  assert.equal(result.data.panels[0].verbatim_transcription, 'Speech bubble: "Hello!"');
  assert.equal(result.data.panels[1].verbatim_transcription, 'Legacy format text');
});

test('generateMarkdownExport distinguishes Human-reviewed vs Review incomplete', () => {
  const incompleteExport = generateMarkdownExport({
    sourceFilename: 'tintin_chateau.png',
    modelName: 'gemma-4-26b-a4b-it',
    pageSummary: 'Tintin investigates Moulinsart',
    readingOrderNote: 'Left to right',
    overallUncertainties: [],
    panels: [
      {
        sequence: 1,
        visual_description: 'Tintin on mantelpiece',
        verbatim_transcription: 'Great Scott, Snowy!',
        uncertainty: '',
        reviewed: true,
        original_draft_visual: 'Tintin on mantelpiece',
        original_draft_transcription: 'Great Scott, Snowy!',
      },
      {
        sequence: 2,
        visual_description: 'Haddock shouting',
        verbatim_transcription: 'Billions of blue blistering barnacles!',
        uncertainty: '',
        reviewed: false,
        original_draft_visual: 'Haddock shouting',
        original_draft_transcription: 'Billions of blue blistering barnacles!',
      },
    ],
  });

  assert.match(incompleteExport, /Review incomplete/);
  assert.match(incompleteExport, /1\/2 panels verified/);
  assert.match(incompleteExport, /Billions of blue blistering barnacles!/);

  const completeExport = generateMarkdownExport({
    sourceFilename: 'tintin_chateau.png',
    modelName: 'gemma-4-26b-a4b-it',
    pageSummary: 'Tintin investigates Moulinsart',
    readingOrderNote: 'Left to right',
    overallUncertainties: [],
    panels: [
      {
        sequence: 1,
        visual_description: 'Tintin on mantelpiece',
        verbatim_transcription: 'Great Scott, Snowy!',
        uncertainty: '',
        reviewed: true,
        original_draft_visual: 'Tintin on mantelpiece',
        original_draft_transcription: 'Great Scott, Snowy!',
      },
      {
        sequence: 2,
        visual_description: 'Haddock shouting',
        verbatim_transcription: 'Billions of blue blistering barnacles!',
        uncertainty: '',
        reviewed: true,
        original_draft_visual: 'Haddock shouting',
        original_draft_transcription: 'Billions of blue blistering barnacles!',
      },
    ],
  });

  assert.match(completeExport, /Human-reviewed/);
  assert.doesNotMatch(completeExport, /Review incomplete/);
});
