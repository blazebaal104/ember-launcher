//! The per-version JSON (client.json) and the loader-profile merge.
use crate::rules::Rule;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VersionJson {
    pub id: String,
    #[serde(default)]
    pub inherits_from: Option<String>,
    pub main_class: String,
    #[serde(default)]
    pub arguments: Arguments,
    #[serde(default)]
    pub libraries: Vec<Library>,
    #[serde(default)]
    pub asset_index: Option<AssetIndexRef>,
    #[serde(default)]
    pub assets: Option<String>,
    #[serde(default)]
    pub downloads: Option<Downloads>,
    #[serde(default)]
    pub java_version: Option<JavaVersion>,
    #[serde(default)]
    pub logging: Option<Logging>,
    #[serde(rename = "type", default)]
    pub kind: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Arguments {
    #[serde(default)]
    pub game: Vec<Argument>,
    #[serde(default)]
    pub jvm: Vec<Argument>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum Argument {
    Plain(String),
    Conditional { rules: Vec<Rule>, value: ArgValue },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum ArgValue {
    One(String),
    Many(Vec<String>),
}

impl ArgValue {
    pub fn values(&self) -> Vec<String> {
        match self {
            ArgValue::One(s) => vec![s.clone()],
            ArgValue::Many(v) => v.clone(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Library {
    /// Maven coordinate.
    pub name: String,
    #[serde(default)]
    pub downloads: Option<LibraryDownloads>,
    /// Loader libraries (Fabric/Quilt) give a Maven repo base URL instead of `downloads`.
    #[serde(default)]
    pub url: Option<String>,
    #[serde(default)]
    pub sha1: Option<String>,
    #[serde(default)]
    pub size: Option<u64>,
    #[serde(default)]
    pub rules: Vec<Rule>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LibraryDownloads {
    pub artifact: Option<Artifact>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Artifact {
    pub path: Option<String>,
    pub url: String,
    pub sha1: String,
    pub size: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetIndexRef {
    pub id: String,
    pub url: String,
    pub sha1: String,
    pub size: u64,
    pub total_size: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Downloads {
    pub client: Artifact,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JavaVersion {
    /// Mojang runtime component, e.g. "java-runtime-delta" (Java 21).
    pub component: String,
    pub major_version: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Logging {
    pub client: Option<LoggingClient>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoggingClient {
    pub argument: String,
    pub file: LoggingFile,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoggingFile {
    pub id: String,
    pub url: String,
    pub sha1: String,
    pub size: u64,
}

impl Library {
    /// group:artifact[:classifier] - used to let loader libraries override vanilla ones.
    pub fn identity(&self) -> String {
        let p: Vec<&str> = self.name.split('@').next().unwrap_or("").split(':').collect();
        match p.as_slice() {
            [g, a, _v, c, ..] => format!("{g}:{a}:{c}"),
            [g, a, ..] => format!("{g}:{a}"),
            _ => self.name.clone(),
        }
    }
}

/// Merge a loader profile (`inheritsFrom: <vanilla>`) on top of the vanilla JSON.
/// Loader main class wins, arguments are appended, libraries are de-duplicated with the
/// loader's copy taking precedence (Fabric ships newer ASM etc.).
pub fn merge(vanilla: VersionJson, loader: VersionJson) -> VersionJson {
    let mut libs: Vec<Library> = Vec::new();
    let loader_ids: std::collections::HashSet<String> = loader.libraries.iter().map(|l| l.identity()).collect();
    libs.extend(loader.libraries);
    libs.extend(vanilla.libraries.into_iter().filter(|l| !loader_ids.contains(&l.identity())));

    let mut arguments = vanilla.arguments;
    arguments.jvm.extend(loader.arguments.jvm);
    arguments.game.extend(loader.arguments.game);

    VersionJson {
        id: loader.id,
        inherits_from: None,
        main_class: loader.main_class,
        arguments,
        libraries: libs,
        asset_index: vanilla.asset_index,
        assets: vanilla.assets,
        downloads: vanilla.downloads,
        java_version: vanilla.java_version,
        logging: vanilla.logging,
        kind: vanilla.kind,
    }
}
