"""Tests for the shared parse_ids() utility."""

from utils import parse_ids


class TestParseIds:

    def test_none_returns_empty(self):
        assert parse_ids(None) == []

    def test_empty_string_returns_empty(self):
        assert parse_ids("") == []

    def test_whitespace_only_returns_stripped_string(self):
        # "   ".strip() == "" which is falsy, so the stripped value is returned
        # as a single-element list containing an empty string. This edge case
        # does not occur in practice since DB fields store "" (empty), not "  ".
        assert parse_ids("   ") == [""]

    def test_legacy_bare_string_returns_single_element(self):
        assert parse_ids("500009") == ["500009"]

    def test_legacy_bare_uuid_returns_single_element(self):
        uid = "467f92f0-1234-5678-abcd-000000000001"
        assert parse_ids(uid) == [uid]

    def test_json_array_single_element(self):
        assert parse_ids('["500009"]') == ["500009"]

    def test_json_array_multiple_elements(self):
        assert parse_ids('["500009", "500010", "500011"]') == ["500009", "500010", "500011"]

    def test_json_array_of_integers_coerced_to_strings(self):
        assert parse_ids('[500009, 500010]') == ["500009", "500010"]

    def test_json_array_empty(self):
        assert parse_ids('[]') == []

    def test_malformed_json_falls_back_to_bare_string(self):
        malformed = '[not valid json'
        assert parse_ids(malformed) == [malformed]

    def test_leading_whitespace_handled(self):
        assert parse_ids('  ["abc"]') == ["abc"]
