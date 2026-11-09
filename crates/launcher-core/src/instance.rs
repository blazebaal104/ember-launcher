//! Instances: isolated game directories + a hook pipeline that runs on creation.
//!
//! The pipeline is how features "intercept" instance creation without the manager
//! knowing about them: the performance bundle, the overlay, future modpack importers.
use crate::paths::{LauncherPaths, INSTANCE_DIRS};
use crate::{Error, Result};
use async_trait::async_trait;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Arc;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Loader {
    Vanilla,
    Fabric,
    Quilt,
    NeoForge,
}

impl Loader {
    pub fn modrinth_names(&self) -> &'static [&'static str] {
        match self {
            Loader::Vanilla => &[],
            Loader::Fabric => &["fabric"],
            Loader::Quilt => &["quilt", "fabric"], // Quilt runs Fabric mods
            Loader::NeoForge => &["neoforge"],
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstanceConfig {
    pub id: String,
    pub name: String,
    pub game_version: String,
    pub loader: Loader,
    pub loader_version: Option<String>,
    pub memory_mb: u32,
    #[serde(default)]
    pub jvm_args: Vec<String>,
    #[serde(default)]
    pub java_path: Option<PathBuf>,
    /// Auto-inject the curated performance stack (default on).
    pub performance_bundle: bool,
    /// Install the Ember in-game overlay mod when available for this version.
    pub overlay: bool,
    pub created_at: DateTime<Utc>,
    pub last_played: Option<DateTime<Utc>>,
    #[serde(default)]
    pub icon: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateInstance {
    pub name: String,
    pub game_version: String,
    #[serde(default = "default_loader")]
    pub loader: Loader,
    #[serde(default = "yes")]
    pub performance_bundle: bool,
    #[serde(default = "yes")]
    pub overlay: bool,
    #[serde(default)]
    pub memory_mb: Option<u32>,
}
fn default_loader() -> Loader {
    Loader::Fabric
}
fn yes() -> bool {
    true
}

/// What a hook did, shown to the user after creation.
#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct HookReport {
    pub hook: String,
    pub installed: Vec<String>,
    pub skipped: Vec<String>,
    pub warnings: Vec<String>,
}

pub struct HookContext {
    pub paths: LauncherPaths,
    pub client: reqwest::Client,
    pub instance_dir: PathBuf,
}

#[async_trait]
pub trait InstanceHook: Send + Sync {
    fn name(&self) -> &'static str;
    /// May adjust the config before anything is written (e.g. choose a loader).
    async fn before_create(&self, _ctx: &HookContext, _cfg: &mut InstanceConfig) -> Result<()> {
        Ok(())
    }
    /// Runs after directories and instance.json exist.
    async fn after_create(&self, ctx: &HookContext, cfg: &InstanceConfig) -> Result<HookReport>;
}

pub struct InstanceManager {
    paths: LauncherPaths,
    client: reqwest::Client,
    hooks: Vec<Arc<dyn InstanceHook>>,
}

impl InstanceManager {
    pub fn new(paths: LauncherPaths, client: reqwest::Client) -> Self {
        Self { paths, client, hooks: Vec::new() }
    }

    pub fn with_hook(mut self, hook: Arc<dyn InstanceHook>) -> Self {
        self.hooks.push(hook);
        self
    }

    pub fn paths(&self) -> &LauncherPaths {
        &self.paths
    }

    pub async fn create(&self, req: CreateInstance) -> Result<(InstanceConfig, Vec<HookReport>)> {
        let id = unique_id(&req.name);
        let dir = self.paths.instance(&id);
        let ctx = HookContext { paths: self.paths.clone(), client: self.client.clone(), instance_dir: dir.clone() };

        let mut cfg = InstanceConfig {
            id: id.clone(),
            name: req.name,
            game_version: req.game_version,
            loader: req.loader,
            loader_version: None,
            memory_mb: req.memory_mb.unwrap_or_else(default_memory_mb),
            jvm_args: vec![],
            java_path: None,
            performance_bundle: req.performance_bundle,
            overlay: req.overlay,
            created_at: Utc::now(),
            last_played: None,
            icon: None,
        };

        for hook in &self.hooks {
            hook.before_create(&ctx, &mut cfg).await?;
        }

        for sub in INSTANCE_DIRS {
            tokio::fs::create_dir_all(dir.join(sub)).await?;
        }
        self.save(&cfg).await?;

        // Hook failures never break instance creation; they become warnings.
        let mut reports = Vec::new();
        for hook in &self.hooks {
            match hook.after_create(&ctx, &cfg).await {
                Ok(r) => reports.push(r),
                Err(e) => reports.push(HookReport { hook: hook.name().into(), warnings: vec![e.to_string()], ..Default::default() }),
            }
        }
        Ok((cfg, reports))
    }

    pub async fn save(&self, cfg: &InstanceConfig) -> Result<()> {
        let path = self.paths.instance(&cfg.id).join("instance.json");
        tokio::fs::create_dir_all(path.parent().unwrap()).await?;
        tokio::fs::write(path, serde_json::to_vec_pretty(cfg)?).await?;
        Ok(())
    }

    pub async fn load(&self, id: &str) -> Result<InstanceConfig> {
        let path = self.paths.instance(id).join("instance.json");
        let bytes = tokio::fs::read(&path).await.map_err(|_| Error::NotFound(format!("instance {id}")))?;
        Ok(serde_json::from_slice(&bytes)?)
    }

    pub async fn list(&self) -> Result<Vec<InstanceConfig>> {
        let mut out = Vec::new();
        let Ok(mut rd) = tokio::fs::read_dir(self.paths.instances()).await else { return Ok(out) };
        while let Some(entry) = rd.next_entry().await? {
            if let Some(id) = entry.file_name().to_str() {
                if let Ok(cfg) = self.load(id).await {
                    out.push(cfg);
                }
            }
        }
        out.sort_by(|a, b| b.last_played.cmp(&a.last_played).then(b.created_at.cmp(&a.created_at)));
        Ok(out)
    }

    pub async fn delete(&self, id: &str) -> Result<()> {
        // Guard against path tricks: ids are generated by us, but the UI sends them back.
        if id.contains(['/', '\\']) || id.contains("..") || id.is_empty() {
            return Err(Error::Other("invalid instance id".into()));
        }
        tokio::fs::remove_dir_all(self.paths.instance(id)).await?;
        Ok(())
    }
}

fn unique_id(name: &str) -> String {
    let slug: String = name
        .to_lowercase()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect::<String>()
        .split('-')
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("-");
    let short = &uuid::Uuid::new_v4().simple().to_string()[..6];
    format!("{}-{short}", if slug.is_empty() { "instance" } else { &slug })
}

/// 4 GB is the sweet spot for performance-modded 1.21+; heavy packs can raise it.
fn default_memory_mb() -> u32 {
    4096
}
