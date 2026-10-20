from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Bridge settings. KE_* mirror the variables ke_client itself reads."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    ke_rest_endpoint: str = "http://tm-ke-service:8280/rest/"
    ke_knowledge_base_id: str = "http://simulator.bluebird.com"
    ke_ki_config_path: str = "./resources/ke_config.yml"
    ke_verify_server_cert: bool = False
    ke_reasoner_level: int = 1

    bridge_host: str = "0.0.0.0"
    bridge_port: int = 8090


settings = Settings()
