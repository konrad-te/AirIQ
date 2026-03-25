from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field, model_validator


class RecommendationConfigSchema(BaseModel):
    indoor_pm25_high_threshold: float = Field(default=25, gt=0)
    indoor_humidity_low_threshold: float = Field(default=30, ge=0, le=100)
    indoor_humidity_ideal_min: float = Field(default=40, ge=0, le=100)
    indoor_humidity_ideal_max: float = Field(default=60, ge=0, le=100)
    indoor_humidity_high_threshold: float = Field(default=60, ge=0, le=100)
    sleep_temp_ideal_min: float = Field(default=16)
    sleep_temp_ideal_max: float = Field(default=20)

    model_config = ConfigDict(extra="forbid")

    @model_validator(mode="after")
    def validate_ranges(self) -> "RecommendationConfigSchema":
        if self.indoor_humidity_ideal_min > self.indoor_humidity_ideal_max:
            raise ValueError("Humidity ideal min must be less than or equal to ideal max.")
        if self.sleep_temp_ideal_min > self.sleep_temp_ideal_max:
            raise ValueError("Sleep temperature ideal min must be less than or equal to ideal max.")
        return self


class RecommendationConfigUpdateSchema(BaseModel):
    indoor_pm25_high_threshold: float | None = Field(default=None, gt=0)
    indoor_humidity_low_threshold: float | None = Field(default=None, ge=0, le=100)
    indoor_humidity_ideal_min: float | None = Field(default=None, ge=0, le=100)
    indoor_humidity_ideal_max: float | None = Field(default=None, ge=0, le=100)
    indoor_humidity_high_threshold: float | None = Field(default=None, ge=0, le=100)
    sleep_temp_ideal_min: float | None = None
    sleep_temp_ideal_max: float | None = None

    model_config = ConfigDict(extra="forbid")

    @model_validator(mode="after")
    def validate_ranges(self) -> "RecommendationConfigUpdateSchema":
        if (
            self.indoor_humidity_ideal_min is not None
            and self.indoor_humidity_ideal_max is not None
            and self.indoor_humidity_ideal_min > self.indoor_humidity_ideal_max
        ):
            raise ValueError("Humidity ideal min must be less than or equal to ideal max.")
        if (
            self.sleep_temp_ideal_min is not None
            and self.sleep_temp_ideal_max is not None
            and self.sleep_temp_ideal_min > self.sleep_temp_ideal_max
        ):
            raise ValueError("Sleep temperature ideal min must be less than or equal to ideal max.")
        return self
