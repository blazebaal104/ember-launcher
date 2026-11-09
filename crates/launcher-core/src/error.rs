use serde::{Serialize, Serializer};

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("network error: {0}")]
    Http(#[from] reqwest::Error),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("invalid json: {0}")]
    Json(#[from] serde_json::Error),
    #[error("hash mismatch for {path}: expected {expected}, got {actual}")]
    HashMismatch { path: String, expected: String, actual: String },
    #[error("unsupported version {0}: Ember supports Minecraft 1.21 and newer")]
    UnsupportedVersion(String),
    #[error("not found: {0}")]
    NotFound(String),
    #[error("authentication failed: {0}")]
    Auth(String),
    #[error("this Microsoft account does not own Minecraft: Java Edition")]
    NoEntitlement,
    #[error("Microsoft sign-in isn't set up yet: add your Azure app's client ID in Settings")]
    NoClientId,
    #[error("you're not signed in: sign in with your Microsoft account first")]
    NotSignedIn,
    #[error("Mojang hasn't approved this Azure app for Minecraft sign-in yet. Submit the review form (Settings has the link) and try again once you get the approval email. It can take up to 24 hours after approval to start working")]
    AppNotApproved,
    #[error("Azure app setup problem: {0}")]
    AppMisconfigured(String),
    #[error("{0}")]
    Other(String),
}

pub type Result<T> = std::result::Result<T, Error>;

impl Error {
    /// Stable machine-readable code so the UI can react (e.g. open Settings).
    pub fn code(&self) -> &'static str {
        match self {
            Error::Http(_) => "network",
            Error::Io(_) => "io",
            Error::Json(_) => "json",
            Error::HashMismatch { .. } => "hash_mismatch",
            Error::UnsupportedVersion(_) => "unsupported_version",
            Error::NotFound(_) => "not_found",
            Error::Auth(_) => "auth",
            Error::NoEntitlement => "no_entitlement",
            Error::NoClientId => "no_client_id",
            Error::NotSignedIn => "not_signed_in",
            Error::AppNotApproved => "app_not_approved",
            Error::AppMisconfigured(_) => "app_misconfigured",
            Error::Other(_) => "other",
        }
    }
}

/// Tauri commands need serialisable errors: `{ code, message }`.
impl Serialize for Error {
    fn serialize<S: Serializer>(&self, s: S) -> std::result::Result<S::Ok, S::Error> {
        use serde::ser::SerializeStruct;
        let mut st = s.serialize_struct("Error", 2)?;
        st.serialize_field("code", self.code())?;
        st.serialize_field("message", &self.to_string())?;
        st.end()
    }
}
