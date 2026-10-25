"""
Unit tests for ComicLens core validation and export logic.
Runs with standard Python unittest without requiring external network or API keys.
"""

import unittest
import json
from app import (
    validate_and_parse_response,
    clean_json_text,
    generate_markdown_export,
)


class TestComicLensLogic(unittest.TestCase):

    def test_clean_json_text_with_fences(self):
        fenced = '```json\n{"page_summary": "Test", "panels": []}\n```'
        cleaned = clean_json_text(fenced)
        self.assertEqual(cleaned, '{"page_summary": "Test", "panels": []}')

    def test_clean_json_text_with_conversational_chatter(self):
        raw = 'Here is the output:\n{"page_summary": "Test", "panels": []}\nHope this helps!'
        cleaned = clean_json_text(raw)
        self.assertEqual(cleaned, '{"page_summary": "Test", "panels": []}')

    def test_validate_empty_response(self):
        valid, err, data = validate_and_parse_response("")
        self.assertFalse(valid)
        self.assertIn("empty", err.lower())

    def test_validate_malformed_json(self):
        valid, err, data = validate_and_parse_response("{invalid_json: 123")
        self.assertFalse(valid)
        self.assertIn("Failed to parse", err)

    def test_validate_root_not_object(self):
        valid, err, data = validate_and_parse_response('["item1", "item2"]')
        self.assertFalse(valid)
        self.assertIn("Root JSON entity must be an object", err)

    def test_validate_panels_not_list(self):
        valid, err, data = validate_and_parse_response('{"page_summary": "Summary", "panels": "not a list"}')
        self.assertFalse(valid)
        self.assertIn("'panels' field must be a list", err)

    def test_validate_valid_payload(self):
        sample = {
            "page_summary": "A hero faces a villain in the city.",
            "reading_order_note": "Left to right, top to bottom.",
            "panels": [
                {
                    "sequence": 1,
                    "visual_description": "Hero lands on rooftop.",
                    "visible_text": "I will not let you escape!",
                    "uncertainty": ""
                },
                {
                    "sequence": 2,
                    "visual_description": "Villain laughs in the shadows.",
                    "visible_text": "Mwahaha!",
                    "uncertainty": "Face is shrouded"
                }
            ],
            "overall_uncertainties": ["Exact background city landmark is unclear."]
        }
        valid, err, data = validate_and_parse_response(json.dumps(sample))
        self.assertTrue(valid)
        self.assertIsNone(err)
        self.assertEqual(len(data["panels"]), 2)
        self.assertEqual(data["panels"][0]["sequence"], 1)
        self.assertEqual(data["panels"][1]["visible_text"], "Mwahaha!")

    def test_validate_handles_extra_fields_and_missing_fields(self):
        sample = {
            "page_summary": "Test",
            "panels": [
                {
                    "sequence": "3",  # string number
                    "visual_description": "A close up",
                    "extra_key": "ignore me"
                    # missing visible_text and uncertainty
                }
            ]
        }
        valid, err, data = validate_and_parse_response(json.dumps(sample))
        self.assertTrue(valid)
        self.assertEqual(len(data["panels"]), 1)
        self.assertEqual(data["panels"][0]["sequence"], 3)
        self.assertEqual(data["panels"][0]["visible_text"], "")
        self.assertEqual(data["panels"][0]["uncertainty"], "")

    def test_markdown_export_incomplete_review(self):
        panels = [
            {"sequence": 1, "visual_description": "P1 desc", "visible_text": "Hi", "reviewed": True},
            {"sequence": 2, "visual_description": "P2 desc", "visible_text": "Bye", "reviewed": False},
        ]
        doc = generate_markdown_export(
            source_filename="test_comic.png",
            model_name="gemma-4-26b-a4b-it",
            page_summary="Test Summary",
            reading_order_note="L to R",
            overall_uncertainties=[],
            panels_state=panels,
        )
        self.assertIn("Review incomplete", doc)
        self.assertIn("1/2 panels verified", doc)
        self.assertIn("test_comic.png", doc)
        self.assertIn("gemma-4-26b-a4b-it", doc)
        self.assertIn("⚠️ Unreviewed AI draft", doc)
        self.assertIn("✓ Human-reviewed", doc)

    def test_markdown_export_complete_review(self):
        panels = [
            {"sequence": 1, "visual_description": "P1 desc", "visible_text": "Hi", "reviewed": True},
            {"sequence": 2, "visual_description": "P2 desc", "visible_text": "Bye", "reviewed": True},
        ]
        doc = generate_markdown_export(
            source_filename="test_comic.png",
            model_name="gemma-4-26b-a4b-it",
            page_summary="Test Summary",
            reading_order_note="L to R",
            overall_uncertainties=[],
            panels_state=panels,
        )
        self.assertIn("Human-reviewed", doc)
        self.assertNotIn("Review incomplete", doc)
        self.assertIn("2/2 panels verified", doc)


if __name__ == "__main__":
    unittest.main()
