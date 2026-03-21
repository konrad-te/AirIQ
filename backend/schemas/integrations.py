from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class QingpingConnectSchema(BaseModel):
    app_key: str = Field(min_length=3, max_length=255)
    app_secret: str = Field(min_length=3, max_length=255)


class QingpingConnectResponseSchema(BaseModel):
    ok: bool
    integration_id: int
    provider: str
    message: str
    token_expires_at: datetime | None

    model_config = ConfigDict(from_attributes=True)


class QingpingDeviceSchema(BaseModel):
    device_id: str
    device_name: str
    product_name: str | None = None
    serial_number: str | None = None
    wifi_mac: str | None = None
    firmware_version: str | None = None
    is_selected: bool = False


class QingpingDevicesResponseSchema(BaseModel):
    ok: bool
    count: int
    devices: list[QingpingDeviceSchema]


class QingpingSelectDeviceSchema(BaseModel):
    device_id: str = Field(min_length=1, max_length=255)


class QingpingStatusResponseSchema(BaseModel):
    ok: bool
    provider: str
    is_connected: bool
    selected_device_id: str | None = None
    selected_device_name: str | None = None
    selected_product_name: str | None = None
    selected_serial_number: str | None = None
    selected_wifi_mac: str | None = None
    token_expires_at: datetime | None = None


class QingpingLatestReadingResponseSchema(BaseModel):
    ok: bool
    provider: str
    message: str
    device_id: str | None = None
    device_name: str | None = None
    product_name: str | None = None
    serial_number: str | None = None
    wifi_mac: str | None = None
    synced_at: datetime | None = None
    updated_at: datetime | None = None
    temperature_c: float | None = None
    humidity_pct: float | None = None
    pm2_5_ug_m3: float | None = None
    pm10_ug_m3: float | None = None
    co2_ppm: float | None = None
    battery_pct: float | None = None
