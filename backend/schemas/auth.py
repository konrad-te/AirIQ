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
    is_active: bool
    email_verified: bool
    role: str

    model_config = ConfigDict(from_attributes=True)


class UserRegisterResponseSchema(UserOutSchema):
    reactivated: bool = False
    welcome_message: str | None = None


class UserUpdateSchema(BaseModel):
    display_name: str | None = Field(default=None, max_length=120)
    email: EmailStr | None = None

    model_config = ConfigDict(from_attributes=True)


class UserPreferenceOutSchema(BaseModel):
    theme: str
    language_code: str | None
    timezone: str | None

    model_config = ConfigDict(from_attributes=True)


class UserPreferenceUpdateSchema(BaseModel):
    theme: str | None = Field(default=None, pattern="^(light|dark)$")
    language_code: str | None = None
    timezone: str | None = None

    model_config = ConfigDict(from_attributes=True)


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
