from pydantic import BaseModel, ConfigDict, EmailStr, Field


class TokenSchema(BaseModel):
    access_token: str
    token_type: str


class UserRegisterSchema(BaseModel):
    email: EmailStr
    display_name: str | None = Field(default=None, max_length=120)
    password: str = Field(min_length=8, max_length=128)

    model_config = ConfigDict(from_attributes=True)


class UserOutSchema(BaseModel):
    id: int
    email: EmailStr
    display_name: str | None
    profile_image_data: str | None
    is_active: bool
    email_verified: bool
    role: str
    plan: str

    model_config = ConfigDict(from_attributes=True)


class UserRegisterResponseSchema(UserOutSchema):
    reactivated: bool = False
    welcome_message: str | None = None


class UserUpdateSchema(BaseModel):
    display_name: str | None = Field(default=None, max_length=120)
    email: EmailStr | None = None
    plan: str | None = Field(default=None, pattern="^(free|plus)$")
    profile_image_data: str | None = Field(default=None, max_length=1_500_000)

    model_config = ConfigDict(from_attributes=True)


PM_THRESHOLD_DEFAULTS = {
    "pm25_medium_threshold": 25.0,
    "pm25_high_threshold": 50.0,
    "pm25_critical_threshold": 75.0,
    "pm10_medium_threshold": 50.0,
    "pm10_high_threshold": 100.0,
    "pm10_critical_threshold": 150.0,
}

ALERT_THRESHOLD_DEFAULTS = {
    "outdoor_temp_high_c": 30.0,
    "uv_high_threshold": 6.0,
    "indoor_co2_medium_ppm": 800.0,
    "indoor_co2_high_ppm": 1200.0,
    "indoor_humidity_low_pct": 30.0,
    "indoor_humidity_high_pct": 70.0,
    "indoor_temp_hot_c": 28.0,
    "indoor_temp_cold_c": 16.0,
}

ALL_THRESHOLD_DEFAULTS = {**PM_THRESHOLD_DEFAULTS, **ALERT_THRESHOLD_DEFAULTS}


class UserPreferenceOutSchema(BaseModel):
    theme: str
    language_code: str | None
    timezone: str | None
    allow_gemini_health_insights: bool = False
    discord_morning_outlook_enabled: bool = False
    discord_outlook_webhook_configured: bool = False
    discord_outlook_local_hour: int = 7
    discord_outlook_local_minute: int = 0
    discord_indoor_alerts_enabled: bool = False
    discord_indoor_include_medium_priority: bool = False
    pm25_medium_threshold: float = PM_THRESHOLD_DEFAULTS["pm25_medium_threshold"]
    pm25_high_threshold: float = PM_THRESHOLD_DEFAULTS["pm25_high_threshold"]
    pm25_critical_threshold: float = PM_THRESHOLD_DEFAULTS["pm25_critical_threshold"]
    pm10_medium_threshold: float = PM_THRESHOLD_DEFAULTS["pm10_medium_threshold"]
    pm10_high_threshold: float = PM_THRESHOLD_DEFAULTS["pm10_high_threshold"]
    pm10_critical_threshold: float = PM_THRESHOLD_DEFAULTS["pm10_critical_threshold"]
    outdoor_temp_high_c: float = ALERT_THRESHOLD_DEFAULTS["outdoor_temp_high_c"]
    uv_high_threshold: float = ALERT_THRESHOLD_DEFAULTS["uv_high_threshold"]
    indoor_co2_medium_ppm: float = ALERT_THRESHOLD_DEFAULTS["indoor_co2_medium_ppm"]
    indoor_co2_high_ppm: float = ALERT_THRESHOLD_DEFAULTS["indoor_co2_high_ppm"]
    indoor_humidity_low_pct: float = ALERT_THRESHOLD_DEFAULTS["indoor_humidity_low_pct"]
    indoor_humidity_high_pct: float = ALERT_THRESHOLD_DEFAULTS["indoor_humidity_high_pct"]
    indoor_temp_hot_c: float = ALERT_THRESHOLD_DEFAULTS["indoor_temp_hot_c"]
    indoor_temp_cold_c: float = ALERT_THRESHOLD_DEFAULTS["indoor_temp_cold_c"]

    model_config = ConfigDict(from_attributes=True)


class UserPreferenceUpdateSchema(BaseModel):
    theme: str | None = Field(default=None, pattern="^(light|dark)$")
    language_code: str | None = None
    timezone: str | None = None
    allow_gemini_health_insights: bool | None = None
    discord_morning_outlook_enabled: bool | None = None
    discord_outlook_webhook_url: str | None = Field(default=None, max_length=2048)
    discord_outlook_local_hour: int | None = Field(default=None, ge=0, le=23)
    discord_outlook_local_minute: int | None = Field(default=None, ge=0, le=59)
    discord_indoor_alerts_enabled: bool | None = None
    discord_indoor_include_medium_priority: bool | None = None
    pm25_medium_threshold: float | None = Field(default=None, gt=0, le=500)
    pm25_high_threshold: float | None = Field(default=None, gt=0, le=500)
    pm25_critical_threshold: float | None = Field(default=None, gt=0, le=500)
    pm10_medium_threshold: float | None = Field(default=None, gt=0, le=500)
    pm10_high_threshold: float | None = Field(default=None, gt=0, le=500)
    pm10_critical_threshold: float | None = Field(default=None, gt=0, le=500)
    outdoor_temp_high_c: float | None = Field(default=None, ge=-50, le=60)
    uv_high_threshold: float | None = Field(default=None, ge=1, le=15)
    indoor_co2_medium_ppm: float | None = Field(default=None, ge=400, le=5000)
    indoor_co2_high_ppm: float | None = Field(default=None, ge=400, le=5000)
    indoor_humidity_low_pct: float | None = Field(default=None, ge=0, le=100)
    indoor_humidity_high_pct: float | None = Field(default=None, ge=0, le=100)
    indoor_temp_hot_c: float | None = Field(default=None, ge=10, le=50)
    indoor_temp_cold_c: float | None = Field(default=None, ge=-10, le=30)


class PasswordChangeSchema(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)


class DeleteAccountSchema(BaseModel):
    password: str


class ForgotPasswordSchema(BaseModel):
    email: EmailStr


class ResetPasswordSchema(BaseModel):
    token: str
    new_password: str = Field(min_length=8, max_length=128)


class SavedLocationOutSchema(BaseModel):
    id: int
    label: str
    lat: float
    lon: float
    sort_order: int

    model_config = ConfigDict(from_attributes=True)


class SavedLocationCreateSchema(BaseModel):
    label: str = Field(max_length=255)
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
