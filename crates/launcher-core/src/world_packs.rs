//! World packs
//! ===========
//! A world pack is a reusable, version-independent list of content (mods, resource packs,
//! data packs, shaders, plus optional shader settings) that can be applied to any instance.
//! The launcher stores only *project ids*; when a pack is applied, every item is resolved
//! for that instance's exact game version and loader (done in the UI, which already talks
//! to Modrinth), so one pack works for 1.21.4 and 26.3 alike. Items with no build for the
//! version are skipped and reported.
//!
//! This module holds the store and the launch-time parts:
//! * [`Activation`] — resource packs / shader to switch on the next time the game starts
//!   (written to options.txt and Iris's config before launch, since the game only reads
//!   those at startup);
//! * [`sync_global_datapacks`] — data packs in the instance's `datapacks/` folder are
//!   copied into every world, so they apply everywhere without per-world setup.
use crate::{paths::LauncherPaths, Result};
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PackItem {
    pub project_id: String,
    pub slug: String,
    pub title: String,
    #[serde(default)]
    pub icon_url: Option<String>,
    /// "mods" | "resourcepacks" | "datapacks" | "shaders"
    pub category: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldPack {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub items: Vec<PackItem>,
    /// Iris settings for the pack's shader (contents of `shaderpacks/<shader>.txt`).
    #[serde(default)]
    pub shader_config: Option<String>,
    /// Optional game settings profile to use for instances created with this pack.
    #[serde(default)]
    pub game_profile: Option<String>,
    #[serde(default)]
    pub created: i64,
}

fn store_path(paths: &LauncherPaths) -> std::path::PathBuf {
    paths.root().join("world-packs.json")
}

pub async fn load(paths: &LauncherPaths) -> Vec<WorldPack> {
    tokio::fs::read(store_path(paths)).await.ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default()
}

pub async fn save(paths: &LauncherPaths, packs: &[WorldPack]) -> Result<()> {
    tokio::fs::create_dir_all(paths.root()).await?;
    tokio::fs::write(store_path(paths), serde_json::to_vec_pretty(packs)?).await?;
    Ok(())
}

/// Things to switch on at the next launch.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Activation {
    #[serde(default)]
    pub resource_packs: Vec<String>,
    #[serde(default)]
    pub shader: Option<String>,
    #[serde(default)]
    pub shader_config: Option<String>,
}

fn activation_path(instance_dir: &Path) -> std::path::PathBuf {
    instance_dir.join(".ember").join("activate.json")
}

fn safe_name(n: &str) -> bool {
    !n.is_empty() && !n.contains(['/', '\\', '"', '\n', '\r']) && !n.starts_with('.') && !n.contains("..")
}

/// Queue an activation (merged with anything already queued).
pub async fn queue_activation(instance_dir: &Path, add: Activation) -> Result<()> {
    let p = activation_path(instance_dir);
    let mut cur: Activation = tokio::fs::read(&p).await.ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default();
    for r in add.resource_packs.into_iter().filter(|r| safe_name(r)) {
        if !cur.resource_packs.contains(&r) {
            cur.resource_packs.push(r);
        }
    }
    if let Some(s) = add.shader.filter(|s| safe_name(s)) {
        cur.shader = Some(s);
        cur.shader_config = add.shader_config;
    }
    tokio::fs::create_dir_all(p.parent().unwrap()).await?;
    tokio::fs::write(&p, serde_json::to_vec_pretty(&cur)?).await?;
    Ok(())
}

/// Add `file/<name>` entries to options.txt's `resourcePacks:[…]` (keeps existing order).
pub fn merge_resource_packs(options: &str, packs: &[String]) -> String {
    let mut lines: Vec<String> = options.lines().map(str::to_string).collect();
    let idx = lines.iter().position(|l| l.starts_with("resourcePacks:"));
    let mut list: Vec<String> = idx
        .and_then(|i| serde_json::from_str::<Vec<String>>(lines[i].trim_start_matches("resourcePacks:")).ok())
        .unwrap_or_else(|| vec!["vanilla".into()]);
    for p in packs {
        let entry = format!("file/{p}");
        if !list.contains(&entry) {
            list.push(entry); // last = highest priority
        }
    }
    let line = format!("resourcePacks:{}", serde_json::to_string(&list).unwrap_or_else(|_| "[]".into()));
    match idx {
        Some(i) => lines[i] = line,
        None => lines.push(line),
    }
    let mut out = lines.join("\n");
    out.push('\n');
    out
}

/// Set `key=value` lines in a .properties file, keeping the rest.
pub fn set_properties(text: &str, pairs: &[(&str, &str)]) -> String {
    let mut lines: Vec<String> = text.lines().map(str::to_string).collect();
    for (k, v) in pairs {
        let line = format!("{k}={v}");
        match lines.iter().position(|l| l.split('=').next().map(str::trim) == Some(*k)) {
            Some(i) => lines[i] = line,
            None => lines.push(line),
        }
    }
    let mut out = lines.join("\n");
    out.push('\n');
    out
}

/// Apply a queued activation, if any. Call right before launching.
pub async fn apply_pending(instance_dir: &Path) -> Result<bool> {
    let p = activation_path(instance_dir);
    let Ok(bytes) = tokio::fs::read(&p).await else { return Ok(false) };
    let act: Activation = serde_json::from_slice(&bytes).unwrap_or_default();
    if !act.resource_packs.is_empty() {
        let opt = instance_dir.join("options.txt");
        let cur = tokio::fs::read_to_string(&opt).await.unwrap_or_default();
        tokio::fs::write(&opt, merge_resource_packs(&cur, &act.resource_packs)).await?;
    }
    if let Some(shader) = &act.shader {
        let cfg = instance_dir.join("config");
        tokio::fs::create_dir_all(&cfg).await?;
        let props = cfg.join("iris.properties");
        let cur = tokio::fs::read_to_string(&props).await.unwrap_or_default();
        tokio::fs::write(&props, set_properties(&cur, &[("shaderPack", shader), ("enableShaders", "true")])).await?;
        if let Some(conf) = &act.shader_config {
            let dir = instance_dir.join("shaderpacks");
            tokio::fs::create_dir_all(&dir).await?;
            tokio::fs::write(dir.join(format!("{shader}.txt")), conf).await?;
        }
    }
    tokio::fs::remove_file(&p).await?;
    Ok(true)
}

/// Copy data packs from the instance's `datapacks/` into every world that lacks them.
/// Returns how many copies were made.
pub async fn sync_global_datapacks(instance_dir: &Path) -> Result<usize> {
    let src = instance_dir.join("datapacks");
    let Ok(mut rd) = tokio::fs::read_dir(&src).await else { return Ok(0) };
    let mut packs = Vec::new();
    while let Some(e) = rd.next_entry().await? {
        let name = e.file_name().to_string_lossy().into_owned();
        if e.file_type().await?.is_file() && name.ends_with(".zip") {
            packs.push(name);
        }
    }
    if packs.is_empty() {
        return Ok(0);
    }
    let mut copied = 0;
    let Ok(mut worlds) = tokio::fs::read_dir(instance_dir.join("saves")).await else { return Ok(0) };
    while let Some(w) = worlds.next_entry().await? {
        if tokio::fs::metadata(w.path().join("level.dat")).await.is_err() {
            continue;
        }
        let dest = w.path().join("datapacks");
        tokio::fs::create_dir_all(&dest).await?;
        for p in &packs {
            if tokio::fs::metadata(dest.join(p)).await.is_err() {
                tokio::fs::copy(src.join(p), dest.join(p)).await?;
                copied += 1;
            }
        }
    }
    Ok(copied)
}

/// The shader currently selected in an instance and its settings (for "create from instance").
#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShaderState {
    pub shader: Option<String>,
    pub config: Option<String>,
}

pub async fn shader_state(instance_dir: &Path) -> ShaderState {
    let props = tokio::fs::read_to_string(instance_dir.join("config").join("iris.properties")).await.unwrap_or_default();
    let shader = props
        .lines()
        .find_map(|l| l.strip_prefix("shaderPack="))
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty() && safe_name(s));
    let config = match &shader {
        Some(s) => tokio::fs::read_to_string(instance_dir.join("shaderpacks").join(format!("{s}.txt"))).await.ok(),
        None => None,
    };
    ShaderState { shader, config }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn merges_resource_packs() {
        let out = merge_resource_packs("fov:0.5\nresourcePacks:[\"vanilla\",\"file/a.zip\"]\n", &["b.zip".into(), "a.zip".into()]);
        assert!(out.contains(r#"resourcePacks:["vanilla","file/a.zip","file/b.zip"]"#));
        assert!(out.starts_with("fov:0.5\n"));
        let fresh = merge_resource_packs("", &["x.zip".into()]);
        assert_eq!(fresh.trim(), r#"resourcePacks:["vanilla","file/x.zip"]"#);
    }

    #[test]
    fn sets_properties() {
        let out = set_properties("# iris\nshaderPack=old.zip\nmaxShadowRenderDistance=8\n", &[("shaderPack", "new.zip"), ("enableShaders", "true")]);
        assert!(out.contains("shaderPack=new.zip"));
        assert!(out.contains("enableShaders=true"));
        assert!(out.contains("maxShadowRenderDistance=8"));
        assert!(!out.contains("old.zip"));
    }

    #[tokio::test]
    async fn activation_and_datapacks() {
        let dir = tempfile::tempdir().unwrap();
        let d = dir.path();
        queue_activation(d, Activation { resource_packs: vec!["rp.zip".into(), "../evil".into()], shader: Some("bsl.zip".into()), shader_config: Some("SHADOW=true\n".into()) }).await.unwrap();
        assert!(apply_pending(d).await.unwrap());
        let opts = std::fs::read_to_string(d.join("options.txt")).unwrap();
        assert!(opts.contains("file/rp.zip") && !opts.contains("evil"));
        assert!(std::fs::read_to_string(d.join("config/iris.properties")).unwrap().contains("shaderPack=bsl.zip"));
        assert_eq!(std::fs::read_to_string(d.join("shaderpacks/bsl.zip.txt")).unwrap(), "SHADOW=true\n");
        assert!(!apply_pending(d).await.unwrap());
        let st = shader_state(d).await;
        assert_eq!(st.shader.as_deref(), Some("bsl.zip"));

        std::fs::create_dir_all(d.join("datapacks")).unwrap();
        std::fs::write(d.join("datapacks/dp.zip"), b"x").unwrap();
        std::fs::create_dir_all(d.join("saves/W")).unwrap();
        std::fs::write(d.join("saves/W/level.dat"), b"").unwrap();
        assert_eq!(sync_global_datapacks(d).await.unwrap(), 1);
        assert_eq!(sync_global_datapacks(d).await.unwrap(), 0);
        assert!(d.join("saves/W/datapacks/dp.zip").exists());
    }
}
