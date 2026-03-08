"""create phase1 schema

Revision ID: d4d0914ae15a
Revises: 
Create Date: 2026-03-07 20:56:46.091560

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = "d4d0914ae15a"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("display_name", sa.String(length=120), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("email", name="uq_users_email"),
        sa.CheckConstraint("position('@' in email) > 1", name="ck_users_email_format"),
    )

    op.create_table(
        "data_providers",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("provider_code", sa.String(length=32), nullable=False),
        sa.Column("display_name", sa.String(length=80), nullable=False),
        sa.Column("base_url", sa.Text(), nullable=False),
        sa.Column("auth_type", sa.String(length=16), nullable=False, server_default="none"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("default_timeout_ms", sa.Integer(), nullable=False, server_default="10000"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("provider_code", name="uq_data_providers_provider_code"),
        sa.CheckConstraint("auth_type IN ('none','api_key')", name="ck_data_providers_auth_type"),
    )

    op.create_table(
        "city_points",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("country_code", sa.String(length=2), nullable=True),
        sa.Column("country_name", sa.String(length=120), nullable=False),
        sa.Column("city_name", sa.String(length=120), nullable=False),
        sa.Column("lat", sa.Numeric(9, 6), nullable=False),
        sa.Column("lon", sa.Numeric(9, 6), nullable=False),
        sa.Column("population", sa.BigInteger(), nullable=True),
        sa.Column("is_capital", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("source_dataset", sa.String(length=64), nullable=False, server_default="geonames_restcountries"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("country_name", "city_name", name="uq_city_points_country_city"),
        sa.CheckConstraint("lat BETWEEN -90 AND 90", name="ck_city_points_lat_range"),
        sa.CheckConstraint("lon BETWEEN -180 AND 180", name="ck_city_points_lon_range"),
        sa.CheckConstraint(
            "population IS NULL OR population >= 0",
            name="ck_city_points_population_nonnegative",
        ),
    )
    op.create_index("ix_city_points_is_active", "city_points", ["is_active"], unique=False)

    op.create_table(
        "households",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("slug", sa.String(length=180), nullable=False),
        sa.Column("owner_user_id", sa.BigInteger(), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("timezone", sa.String(length=64), nullable=False, server_default="UTC"),
        sa.Column("country_code", sa.String(length=2), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["owner_user_id"], ["users.id"]),
        sa.UniqueConstraint("slug", name="uq_households_slug"),
    )

    op.create_table(
        "user_preferences",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("theme", sa.String(length=16), nullable=False, server_default="light"),
        sa.Column("language_code", sa.String(length=10), nullable=True),
        sa.Column("timezone", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.UniqueConstraint("user_id", name="uq_user_preferences_user_id"),
        sa.CheckConstraint("theme IN ('light','dark')", name="ck_user_preferences_theme"),
    )

    op.create_table(
        "household_members",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("household_id", sa.BigInteger(), nullable=False),
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("role", sa.String(length=24), nullable=False, server_default="member"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("joined_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("invited_by_user_id", sa.BigInteger(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["household_id"], ["households.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["invited_by_user_id"], ["users.id"]),
        sa.UniqueConstraint("household_id", "user_id", name="uq_household_members_household_user"),
        sa.CheckConstraint("role IN ('owner','admin','member','viewer')", name="ck_household_members_role"),
    )

    op.create_table(
        "external_stations",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("provider_id", sa.BigInteger(), nullable=False),
        sa.Column("provider_station_id", sa.String(length=64), nullable=False),
        sa.Column("station_name", sa.String(length=200), nullable=False),
        sa.Column("country_code", sa.String(length=2), nullable=True),
        sa.Column("city_name", sa.String(length=120), nullable=True),
        sa.Column("lat", sa.Numeric(9, 6), nullable=True),
        sa.Column("lon", sa.Numeric(9, 6), nullable=True),
        sa.Column("timezone", sa.String(length=64), nullable=True),
        sa.Column("is_mobile", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("is_monitor", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("first_seen_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("metadata_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["provider_id"], ["data_providers.id"]),
        sa.UniqueConstraint(
            "provider_id",
            "provider_station_id",
            name="uq_external_stations_provider_station",
        ),
        sa.CheckConstraint("lat IS NULL OR lat BETWEEN -90 AND 90", name="ck_external_stations_lat_range"),
        sa.CheckConstraint("lon IS NULL OR lon BETWEEN -180 AND 180", name="ck_external_stations_lon_range"),
    )

    op.create_table(
        "geocode_cache_entries",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("provider_id", sa.BigInteger(), nullable=False),
        sa.Column("query_hash", sa.String(length=16), nullable=False),
        sa.Column("query_text", sa.Text(), nullable=False),
        sa.Column("normalized_query", sa.Text(), nullable=False),
        sa.Column("lat", sa.Numeric(9, 6), nullable=False),
        sa.Column("lon", sa.Numeric(9, 6), nullable=False),
        sa.Column("display_name", sa.Text(), nullable=True),
        sa.Column("external_place_id", sa.String(length=64), nullable=True),
        sa.Column("cached_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("use_count", sa.Integer(), nullable=False, server_default="1"),
        sa.ForeignKeyConstraint(["provider_id"], ["data_providers.id"]),
        sa.UniqueConstraint(
            "provider_id",
            "query_hash",
            name="uq_geocode_cache_entries_provider_query_hash",
        ),
        sa.CheckConstraint("lat BETWEEN -90 AND 90", name="ck_geocode_cache_entries_lat_range"),
        sa.CheckConstraint("lon BETWEEN -180 AND 180", name="ck_geocode_cache_entries_lon_range"),
    )

    op.create_table(
        "location_station_cache",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("provider_id", sa.BigInteger(), nullable=False),
        sa.Column("coord_key", sa.String(length=32), nullable=False),
        sa.Column("lat_rounded", sa.Numeric(8, 3), nullable=False),
        sa.Column("lon_rounded", sa.Numeric(8, 3), nullable=False),
        sa.Column("external_station_id", sa.BigInteger(), nullable=True),
        sa.Column("distance_km", sa.Numeric(8, 3), nullable=True),
        sa.Column("cached_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("hit_count", sa.Integer(), nullable=False, server_default="0"),
        sa.ForeignKeyConstraint(["provider_id"], ["data_providers.id"]),
        sa.ForeignKeyConstraint(["external_station_id"], ["external_stations.id"]),
        sa.UniqueConstraint(
            "provider_id",
            "coord_key",
            name="uq_location_station_cache_provider_coord_key",
        ),
        sa.CheckConstraint(
            "distance_km IS NULL OR distance_km >= 0",
            name="ck_location_station_cache_distance_nonnegative",
        ),
    )

    op.create_table(
        "provider_cache_entries",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("provider_id", sa.BigInteger(), nullable=False),
        sa.Column("cache_key", sa.String(length=200), nullable=False),
        sa.Column("cache_kind", sa.String(length=32), nullable=False),
        sa.Column("method", sa.String(length=32), nullable=True),
        sa.Column("coord_key", sa.String(length=32), nullable=True),
        sa.Column("external_station_id", sa.BigInteger(), nullable=True),
        sa.Column("variant_key", sa.String(length=80), nullable=True),
        sa.Column("payload_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("cached_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("hit_count", sa.Integer(), nullable=False, server_default="0"),
        sa.ForeignKeyConstraint(["provider_id"], ["data_providers.id"]),
        sa.ForeignKeyConstraint(["external_station_id"], ["external_stations.id"]),
        sa.UniqueConstraint(
            "provider_id",
            "cache_key",
            name="uq_provider_cache_entries_provider_cache_key",
        ),
        sa.CheckConstraint(
            "cache_kind IN ('aq_normalized','weather','station_lookup')",
            name="ck_provider_cache_entries_cache_kind",
        ),
        sa.CheckConstraint(
            "method IS NULL OR method IN ('point','nearest_station','model','batch_ingest')",
            name="ck_provider_cache_entries_method",
        ),
    )

    op.create_table(
        "ingest_runs",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("provider_id", sa.BigInteger(), nullable=False),
        sa.Column("job_name", sa.String(length=64), nullable=False, server_default="globe_ingest_hourly"),
        sa.Column("triggered_by", sa.String(length=16), nullable=False, server_default="scheduler"),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("total_points", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("success_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("fail_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["provider_id"], ["data_providers.id"]),
        sa.CheckConstraint(
            "status IN ('running','success','failed','partial')",
            name="ck_ingest_runs_status",
        ),
    )

    op.create_table(
        "globe_aq_cache",
        sa.Column("city_point_id", sa.BigInteger(), nullable=False),
        sa.Column("provider_id", sa.BigInteger(), nullable=False),
        sa.Column("pm25", sa.Numeric(8, 2), nullable=True),
        sa.Column("pm10", sa.Numeric(8, 2), nullable=True),
        sa.Column("us_aqi", sa.Integer(), nullable=True),
        sa.Column("eu_aqi", sa.Integer(), nullable=True),
        sa.Column("band", sa.String(length=16), nullable=True),
        sa.Column("observed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("stale", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("payload_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.ForeignKeyConstraint(["city_point_id"], ["city_points.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["provider_id"], ["data_providers.id"]),
        sa.PrimaryKeyConstraint("city_point_id"),
        sa.CheckConstraint(
            "pm25 IS NULL OR pm25 >= 0",
            name="ck_globe_aq_cache_pm25_nonnegative",
        ),
        sa.CheckConstraint(
            "pm10 IS NULL OR pm10 >= 0",
            name="ck_globe_aq_cache_pm10_nonnegative",
        ),
        sa.CheckConstraint(
            "us_aqi IS NULL OR us_aqi BETWEEN 0 AND 500",
            name="ck_globe_aq_cache_us_aqi_range",
        ),
        sa.CheckConstraint(
            "eu_aqi IS NULL OR eu_aqi >= 0",
            name="ck_globe_aq_cache_eu_aqi_nonnegative",
        ),
        sa.CheckConstraint(
            "band IS NULL OR band IN ('0-10','10-20','20-25','25-50','50-75','75+')",
            name="ck_globe_aq_cache_band",
        ),
    )


def downgrade() -> None:
    op.drop_table("globe_aq_cache")
    op.drop_table("ingest_runs")
    op.drop_table("provider_cache_entries")
    op.drop_table("location_station_cache")
    op.drop_table("geocode_cache_entries")
    op.drop_table("external_stations")
    op.drop_table("household_members")
    op.drop_table("user_preferences")
    op.drop_table("households")
    op.drop_index("ix_city_points_is_active", table_name="city_points")
    op.drop_table("city_points")
    op.drop_table("data_providers")
    op.drop_table("users")