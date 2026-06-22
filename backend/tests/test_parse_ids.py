"""Tests for the _parse_ids() helper used in routes and job executor."""

import pytest

# Import from both locations that define _parse_ids
from routes.schedules import _parse_ids as route_parse_ids
from services.job_executor import _parse_ids as executor_parse_ids


@pytest.mark.parametrize("parse_ids", [route_parse_ids, executor_parse_ids])
class TestParseIds:
    """Run the same tests against both implementations."""

    def test_none_returns_empty(self, parse_ids):
        assert parse_ids(None) == []

    def test_empty_string_returns_empty(self, parse_ids):
        assert parse_ids("") == []

    def test_whitespace_only_returns_stripped_string(self, parse_ids):
        # "   ".strip() == "" which is falsy, so the stripped value is returned
        # as a single-element list containing an empty string. This edge case
        # does not occur in practice since DB fields store "" (empty), not "  ".
        assert parse_ids("   ") == [""]

    def test_legacy_bare_string_returns_single_element(self, parse_ids):
        assert parse_ids("500009") == ["500009"]

    def test_legacy_bare_uuid_returns_single_element(self, parse_ids):
        uid = "467f92f0-1234-5678-abcd-000000000001"
        assert parse_ids(uid) == [uid]

    def test_json_array_single_element(self, parse_ids):
        assert parse_ids('["500009"]') == ["500009"]

    def test_json_array_multiple_elements(self, parse_ids):
        assert parse_ids('["500009", "500010", "500011"]') == ["500009", "500010", "500011"]

    def test_json_array_of_integers_coerced_to_strings(self, parse_ids):
        assert parse_ids('[500009, 500010]') == ["500009", "500010"]

    def test_json_array_empty(self, parse_ids):
        assert parse_ids('[]') == []

    def test_malformed_json_falls_back_to_bare_string(self, parse_ids):
        malformed = '[not valid json'
        assert parse_ids(malformed) == [malformed]

    def test_leading_whitespace_handled(self, parse_ids):
        assert parse_ids('  ["abc"]') == ["abc"]
