"""Tests for ScheduleCreate and ScheduleUpdate Pydantic schemas."""

import pytest
from pydantic import ValidationError

from routes.schedules import ScheduleCreate, ScheduleUpdate


class TestScheduleCreate:
    def _valid_payload(self, **overrides):
        base = {
            "name": "Daily Publish",
            "cron_expression": "0 9 * * *",
            "scenario_ids": ["500009"],
        }
        base.update(overrides)
        return base

    def test_minimal_valid_payload(self):
        s = ScheduleCreate(**self._valid_payload())
        assert s.name == "Daily Publish"
        assert s.scenario_ids == ["500009"]
        assert s.enabled is True
        assert s.branch == "master"
        assert s.locales == []
        assert s.document_ids == []

    def test_scenario_ids_as_strings(self):
        s = ScheduleCreate(**self._valid_payload(scenario_ids=["500009", "500010"]))
        assert s.scenario_ids == ["500009", "500010"]

    def test_scenario_ids_as_integers_coerced_to_strings(self):
        """Heretto API returns integer IDs; validator must coerce them."""
        s = ScheduleCreate(**self._valid_payload(scenario_ids=[500009, 500010]))
        assert s.scenario_ids == ["500009", "500010"]

    def test_scenario_ids_mixed_types_coerced(self):
        s = ScheduleCreate(**self._valid_payload(scenario_ids=[500009, "500010"]))
        assert s.scenario_ids == ["500009", "500010"]

    def test_scenario_ids_required(self):
        payload = self._valid_payload()
        del payload["scenario_ids"]
        with pytest.raises(ValidationError):
            ScheduleCreate(**payload)

    def test_name_required(self):
        payload = self._valid_payload()
        del payload["name"]
        with pytest.raises(ValidationError):
            ScheduleCreate(**payload)

    def test_cron_required(self):
        payload = self._valid_payload()
        del payload["cron_expression"]
        with pytest.raises(ValidationError):
            ScheduleCreate(**payload)

    def test_description_defaults_to_empty(self):
        s = ScheduleCreate(**self._valid_payload())
        assert s.description == ""

    def test_locales_stored_as_list(self):
        s = ScheduleCreate(**self._valid_payload(locales=["fr-fr", "de-de"]))
        assert s.locales == ["fr-fr", "de-de"]

    def test_publish_parameters_defaults_to_empty_list(self):
        s = ScheduleCreate(**self._valid_payload())
        assert s.publish_parameters == []

    def test_enabled_can_be_false(self):
        s = ScheduleCreate(**self._valid_payload(enabled=False))
        assert s.enabled is False


class TestScheduleUpdate:
    def test_all_fields_optional(self):
        # An empty update body should be valid
        s = ScheduleUpdate()
        assert s.name is None
        assert s.scenario_ids is None
        assert s.locales is None
        assert s.enabled is None

    def test_scenario_ids_integer_coercion(self):
        """Same coercion as ScheduleCreate."""
        s = ScheduleUpdate(scenario_ids=[500009])
        assert s.scenario_ids == ["500009"]

    def test_partial_update_only_name(self):
        s = ScheduleUpdate(name="New Name")
        assert s.name == "New Name"
        assert s.scenario_ids is None

    def test_locales_update(self):
        s = ScheduleUpdate(locales=["fr-fr"])
        assert s.locales == ["fr-fr"]

    def test_enabled_update(self):
        s = ScheduleUpdate(enabled=False)
        assert s.enabled is False
