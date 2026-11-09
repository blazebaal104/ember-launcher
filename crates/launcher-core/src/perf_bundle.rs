//! Performance Injection
//! =====================
//! An [`InstanceHook`] that runs on every new instance:
//!
//! * `before_create`: a vanilla instance with the bundle enabled is switched to Fabric
//!   (performance mods need a loader) and the newest stable loader is pinned. If Fabric
//!   doesn't support the version yet (fresh snapshot), the instance stays vanilla.
//! * `after_create`: resolves every bundle mod for the EXACT game version + loader on
//!   Modrinth, pulls required dependencies, drops mods that declare each other
//!   incompatible, downloads with hash verification into `mods/`, and writes
//!   `.ember/bundle.lock.json` so the bundle can be updated or removed without touching
//!   the user's own mods.
use crate::download::{download_all, DownloadJob};
use crate::instance::{HookContext, HookReport, InstanceConfig, InstanceHook, Loader};
use crate::modrinth::{self, MrVersion};
use crate::{fabric, Result};
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet, VecDeque};

/// One entry of the curated stack.
#[derive(Debug, Clone, Serialize)]
pub struct BundleMod {
    pub slug: &'static str,
    pub purpose: &'static str,
    pub loaders: &'static [Loader],
}

use Loader::{Fabric, NeoForge, Quilt};

/// Curated, conservative stack: client-side, broadly compatible, actively maintained.
/// Kept as data so it can be overridden by a remote JSON (see docs/ARCHITECTURE.md).
pub const BUNDLE: &[BundleMod] = &[
    BundleMod { slug: "sodium", purpose: "Modern renderer, the single biggest FPS gain", loaders: &[Fabric, Quilt, NeoForge] },
    BundleMod { slug: "lithium", purpose: "Game logic / tick optimisations", loaders: &[Fabric, Quilt, NeoForge] },
    BundleMod { slug: "ferrite-core", purpose: "Lower memory usage", loaders: &[Fabric, Quilt, NeoForge] },
    BundleMod { slug: "immediatelyfast", purpose: "Faster immediate-mode rendering (HUD, text, entities)", loaders: &[Fabric, Quilt, NeoForge] },
    BundleMod { slug: "entityculling", purpose: "Skip rendering hidden entities / block entities", loaders: &[Fabric, Quilt, NeoForge] },
    BundleMod { slug: "modernfix", purpose: "Faster launch, lower memory, bug fixes", loaders: &[Fabric, Quilt, NeoForge] },
    BundleMod { slug: "dynamic-fps", purpose: "Throttle FPS when the window is unfocused/minimised", loaders: &[Fabric, Quilt, NeoForge] },
    BundleMod { slug: "krypton", purpose: "Networking stack optimisations", loaders: &[Fabric, Quilt] },
    // Base library for Fabric mods and the Ember overlay.
    BundleMod { slug: "fabric-api", purpose: "Required library for Fabric mods and the Ember overlay", loaders: &[Fabric, Quilt] },
];

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct BundleLock {
    pub game_version: String,
    pub loader: Option<Loader>,
    pub files: Vec<LockedFile>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LockedFile {
    pub project_id: String,
    pub slug: Option<String>,
    pub version_id: String,
    pub file_name: String,
    pub sha1: String,
    pub reason: String,
}

pub struct PerformanceBundleHook;

#[async_trait]
impl InstanceHook for PerformanceBundleHook {
    fn name(&self) -> &'static str {
        "performance-bundle"
    }

    async fn before_create(&self, ctx: &HookContext, cfg: &mut InstanceConfig) -> Result<()> {
        // Pin a loader version for every modded instance (also when the bundle is off).
        if cfg.loader == Loader::Quilt && cfg.loader_version.is_none() {
            cfg.loader_version = Some(fabric::latest_quilt_loader(&ctx.client, &cfg.game_version).await?);
        }
        if cfg.loader == Loader::NeoForge && cfg.loader_version.is_none() {
            cfg.loader_version = Some(crate::neoforge::latest(&ctx.client, &cfg.game_version).await?);
        }
        if cfg.loader == Loader::Vanilla && (cfg.performance_bundle || cfg.overlay) {
            cfg.loader = Loader::Fabric;
        }
        if cfg.loader == Loader::Fabric && cfg.loader_version.is_none() {
            match fabric::latest_loader(&ctx.client, &cfg.game_version).await {
                Ok(v) => cfg.loader_version = Some(v),
                Err(e) => {
                    tracing::warn!(version = %cfg.game_version, error = %e, "Fabric unavailable, staying vanilla");
                    cfg.loader = Loader::Vanilla;
                }
            }
        }
        Ok(())
    }

    async fn after_create(&self, ctx: &HookContext, cfg: &InstanceConfig) -> Result<HookReport> {
        let mut report = HookReport { hook: self.name().into(), ..Default::default() };
        if !cfg.performance_bundle {
            return Ok(report);
        }
        if cfg.loader == Loader::Vanilla {
            report.warnings.push(format!(
                "No mod loader supports {} yet, so the performance bundle was skipped. It will be offered once Fabric adds support.",
                cfg.game_version
            ));
            return Ok(report);
        }

        let plan = resolve_bundle(&ctx.client, &cfg.game_version, cfg.loader, &mut report).await?;
        let mods_dir = ctx.instance_dir.join("mods");
        let jobs = plan
            .iter()
            .filter_map(|(_, v, _)| v.primary_file())
            .map(|f| DownloadJob { url: f.url.clone(), dest: mods_dir.join(&f.filename), sha1: Some(f.hashes.sha1.clone()), size: Some(f.size) })
            .collect();
        download_all(&ctx.client, jobs, 8, None).await?;

        let lock = BundleLock {
            game_version: cfg.game_version.clone(),
            loader: Some(cfg.loader),
            files: plan
                .iter()
                .filter_map(|(slug, v, reason)| {
                    let f = v.primary_file()?;
                    Some(LockedFile {
                        project_id: v.project_id.clone(),
                        slug: slug.clone(),
                        version_id: v.id.clone(),
                        file_name: f.filename.clone(),
                        sha1: f.hashes.sha1.clone(),
                        reason: reason.clone(),
                    })
                })
                .collect(),
        };
        for f in &lock.files {
            report.installed.push(format!("{} ({})", f.slug.as_deref().unwrap_or(&f.project_id), f.file_name));
        }
        let lock_path = ctx.instance_dir.join(".ember").join("bundle.lock.json");
        tokio::fs::create_dir_all(lock_path.parent().unwrap()).await?;
        tokio::fs::write(lock_path, serde_json::to_vec_pretty(&lock)?).await?;

        if cfg.overlay {
            install_overlay(ctx, cfg, &mut report).await?;
        }
        Ok(report)
    }
}

/// (slug if a bundle root, version, why it's installed)
type Planned = (Option<String>, MrVersion, String);

pub async fn resolve_bundle(client: &reqwest::Client, game_version: &str, loader: Loader, report: &mut HookReport) -> Result<Vec<Planned>> {
    let loaders = loader.modrinth_names();
    let mut planned: Vec<Planned> = Vec::new();
    let mut have: HashSet<String> = HashSet::new();

    // Resolve the roots in parallel; the API filter guarantees exact version + loader.
    let roots: Vec<&BundleMod> = BUNDLE.iter().filter(|m| m.loaders.contains(&loader)).collect();
    let gv = [game_version];
    let results = futures::future::join_all(
        roots.iter().map(|m| modrinth::project_versions(client, m.slug, loaders, &gv)),
    )
    .await;
    for (m, res) in roots.iter().zip(results) {
        match res.map(modrinth::best) {
            Ok(Some(v)) => {
                have.insert(v.project_id.clone());
                planned.push((Some(m.slug.into()), v, m.purpose.into()));
            }
            Ok(None) => report.skipped.push(format!("{} - no build for {game_version} yet", m.slug)),
            Err(e) => report.warnings.push(format!("{}: {e}", m.slug)),
        }
    }

    // Required dependencies, transitively.
    let mut queue: VecDeque<MrVersion> = planned.iter().map(|(_, v, _)| v.clone()).collect();
    while let Some(v) = queue.pop_front() {
        for dep in v.dependencies.iter().filter(|d| d.dependency_type == "required") {
            let Some(pid) = &dep.project_id else { continue };
            if !have.insert(pid.clone()) {
                continue;
            }
            match modrinth::best(modrinth::project_versions(client, pid, loaders, &[game_version]).await?) {
                Some(dv) => {
                    queue.push_back(dv.clone());
                    planned.push((None, dv, format!("dependency of {}", v.project_id)));
                }
                None => report.warnings.push(format!("dependency {pid} has no build for {game_version}")),
            }
        }
    }

    // Drop anything another bundle mod declares incompatible (later entries lose).
    let index: HashMap<String, usize> = planned.iter().enumerate().map(|(i, (_, v, _))| (v.project_id.clone(), i)).collect();
    let mut banned: HashSet<usize> = HashSet::new();
    for (i, (_, v, _)) in planned.iter().enumerate() {
        if banned.contains(&i) {
            continue;
        }
        for d in v.dependencies.iter().filter(|d| d.dependency_type == "incompatible") {
            if let Some(j) = d.project_id.as_ref().and_then(|p| index.get(p)) {
                if *j > i {
                    banned.insert(*j);
                }
            }
        }
    }
    let mut i = 0;
    planned.retain(|(slug, v, _)| {
        let keep = !banned.contains(&i);
        if !keep {
            report.skipped.push(format!("{} - incompatible with another bundle mod", slug.as_deref().unwrap_or(&v.project_id)));
        }
        i += 1;
        keep
    });
    Ok(planned)
}

/// The overlay is built per Minecraft version (see mods/ember-overlay) and shipped as a
/// launcher resource: resources/overlay/ember-overlay-<mc>.jar
async fn install_overlay(ctx: &HookContext, cfg: &InstanceConfig, report: &mut HookReport) -> Result<()> {
    if !matches!(cfg.loader, Loader::Fabric | Loader::Quilt) {
        report.skipped.push("ember-overlay - only available for Fabric/Quilt".into());
        return Ok(());
    }
    let src = ctx.paths.bundled_resources().join("overlay").join(format!("ember-overlay-{}.jar", cfg.game_version));
    if tokio::fs::metadata(&src).await.is_err() {
        report.skipped.push(format!("ember-overlay - no build for {} in this launcher release", cfg.game_version));
        return Ok(());
    }
    let dest = ctx.instance_dir.join("mods").join("ember-overlay.jar");
    tokio::fs::copy(&src, &dest).await?;
    report.installed.push("ember-overlay (in-game menu: Right Shift)".into());
    Ok(())
}
