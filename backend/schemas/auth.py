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
    role: str

    model_config = ConfigDict(from_attributes=True)


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
