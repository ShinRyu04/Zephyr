// errors.rs — ZephyrError kanonik (ARCHITECTURE.md §8).
// Semua command mengembalikan Result<T, ZephyrError> dan frontend
// menerima objek { code, message }.

use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum ZephyrError {
    #[error("tidak ditemukan: {0}")]
    NotFound(String),
    #[error("input tidak valid: {0}")]
    InvalidInput(String),
    #[error("izin ditolak: {0}")]
    Permission(String),
    #[error("path di luar workspace: {0}")]
    WorkspaceOutside(String),
    #[error("git: {0}")]
    #[allow(dead_code)]
    Git(String),
    #[error("pty: {0}")]
    #[allow(dead_code)]
    Pty(String),
    #[error("ssh: {0}")]
    #[allow(dead_code)]
    Ssh(String),
    #[error("mcp: {0}")]
    #[allow(dead_code)]
    Mcp(String),
    #[error("encoding: {0}")]
    Encoding(String),
    #[error("io: {0}")]
    Io(String),
    #[error("internal: {0}")]
    Internal(String),
}

impl ZephyrError {
    /// Kode stabil yang dibaca frontend (jangan diubah tanpa update types.ts).
    pub fn code(&self) -> &'static str {
        match self {
            ZephyrError::NotFound(_) => "NotFound",
            ZephyrError::InvalidInput(_) => "InvalidInput",
            ZephyrError::Permission(_) => "Permission",
            ZephyrError::WorkspaceOutside(_) => "WorkspaceOutside",
            ZephyrError::Git(_) => "Git",
            ZephyrError::Pty(_) => "Pty",
            ZephyrError::Ssh(_) => "Ssh",
            ZephyrError::Mcp(_) => "Mcp",
            ZephyrError::Encoding(_) => "Encoding",
            ZephyrError::Io(_) => "Io",
            ZephyrError::Internal(_) => "Internal",
        }
    }
}

impl From<std::io::Error> for ZephyrError {
    fn from(e: std::io::Error) -> Self {
        match e.kind() {
            std::io::ErrorKind::NotFound => ZephyrError::NotFound(e.to_string()),
            std::io::ErrorKind::PermissionDenied => ZephyrError::Permission(e.to_string()),
            _ => ZephyrError::Io(e.to_string()),
        }
    }
}

impl From<serde_json::Error> for ZephyrError {
    fn from(e: serde_json::Error) -> Self {
        ZephyrError::Internal(format!("json: {e}"))
    }
}

impl From<tauri::Error> for ZephyrError {
    fn from(e: tauri::Error) -> Self {
        ZephyrError::Internal(e.to_string())
    }
}

/// Bentuk yang di-serialize ke frontend: { code, message }.
impl Serialize for ZephyrError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        use serde::ser::SerializeStruct;
        let mut s = serializer.serialize_struct("ZephyrError", 2)?;
        s.serialize_field("code", self.code())?;
        s.serialize_field("message", &self.to_string())?;
        s.end()
    }
}

pub type ZResult<T> = Result<T, ZephyrError>;
