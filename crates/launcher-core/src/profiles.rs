//! Game settings profiles: keybinds, FOV, video, sound... defined once in the launcher and
//! written into each instance's `options.txt`, so new instances start configured.
//!
//! `options.txt` is a `key:value` file. Keybinds are `key_<mapping id>:<input name>`, e.g.
//! `key_key.forward:key.keyboard.w`. FOV is stored normalised: `fov:(degrees - 70) / 40`.
use crate::paths::LauncherPaths;
use crate::{Error, Result};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::io::Read;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GameProfile {
    pub id: String,
    pub name: String,
    /// options.txt keys → values (already in Minecraft's format).
    #[serde(default)]
    pub options: BTreeMap<String, String>,
    /// Key mapping id (e.g. "key.forward") → input name (e.g. "key.keyboard.w").
    #[serde(default)]
    pub keybinds: BTreeMap<String, String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileStore {
    #[serde(default)]
    pub profiles: Vec<GameProfile>,
    /// Applied to new instances unless the user picks another.
    #[serde(default)]
    pub default_profile: Option<String>,
}

impl ProfileStore {
    fn path(paths: &LauncherPaths) -> std::path::PathBuf {
        paths.root().join("profiles.json")
    }

    pub async fn load(paths: &LauncherPaths) -> ProfileStore {
        match tokio::fs::read(Self::path(paths)).await {
            Ok(b) => serde_json::from_slice(&b).unwrap_or_default(),
            Err(_) => ProfileStore { profiles: vec![starter_profile()], default_profile: Some("default".into()) },
        }
    }

    pub async fn save(&self, paths: &LauncherPaths) -> Result<()> {
        tokio::fs::create_dir_all(paths.root()).await?;
        tokio::fs::write(Self::path(paths), serde_json::to_vec_pretty(self)?).await?;
        Ok(())
    }

    pub fn get(&self, id: &str) -> Option<&GameProfile> {
        self.profiles.iter().find(|p| p.id == id)
    }

    pub fn upsert(&mut self, mut profile: GameProfile) -> GameProfile {
        if profile.id.trim().is_empty() {
            profile.id = uuid::Uuid::new_v4().simple().to_string()[..10].to_string();
        }
        profile.options.retain(|k, _| is_safe_key(k));
        profile.keybinds.retain(|k, v| is_safe_key(k) && is_safe_value(v));
        profile.options.retain(|_, v| is_safe_value(v));
        match self.profiles.iter_mut().find(|p| p.id == profile.id) {
            Some(existing) => *existing = profile.clone(),
            None => self.profiles.push(profile.clone()),
        }
        profile
    }

    pub fn remove(&mut self, id: &str) {
        self.profiles.retain(|p| p.id != id);
        if self.default_profile.as_deref() == Some(id) {
            self.default_profile = None;
        }
    }
}

/// A sensible starting point that mirrors vanilla defaults, with a few quality-of-life tweaks.
pub fn starter_profile() -> GameProfile {
    let mut options = BTreeMap::new();
    for (k, v) in [
        ("fov", "0.0"),              // 70°
        ("renderDistance", "12"),
        ("simulationDistance", "10"),
        ("maxFps", "260"),           // 260 = unlimited
        ("enableVsync", "false"),
        ("guiScale", "0"),           // auto
        ("mouseSensitivity", "0.5"), // 100%
        ("autoJump", "false"),
        ("bobView", "true"),
        ("soundCategory_master", "1.0"),
        ("soundCategory_music", "0.5"),
    ] {
        options.insert(k.to_string(), v.to_string());
    }
    GameProfile { id: "default".into(), name: "My settings".into(), options, keybinds: BTreeMap::new() }
}

fn is_safe_key(k: &str) -> bool {
    !k.is_empty() && k.len() < 128 && k.chars().all(|c| c.is_ascii_alphanumeric() || "._-".contains(c))
}

fn is_safe_value(v: &str) -> bool {
    v.len() < 4096 && !v.contains('\n') && !v.contains('\r')
}

/// Ordered key → value view of an options.txt, preserving unknown lines.
pub fn parse_options(text: &str) -> Vec<(String, String)> {
    text.lines()
        .filter_map(|l| {
            let l = l.trim_end();
            let (k, v) = l.split_once(':')?;
            Some((k.to_string(), v.to_string()))
        })
        .collect()
}

pub fn render_options(entries: &[(String, String)]) -> String {
    let mut s = String::new();
    for (k, v) in entries {
        s.push_str(k);
        s.push(':');
        s.push_str(v);
        s.push('\n');
    }
    s
}

/// Merge a profile into existing options (or start a new file at `data_version`).
pub fn merge_profile(existing: Option<&str>, profile: &GameProfile, data_version: Option<i64>) -> String {
    let mut entries = existing.map(parse_options).unwrap_or_default();
    if !entries.iter().any(|(k, _)| k == "version") {
        if let Some(dv) = data_version {
            entries.insert(0, ("version".into(), dv.to_string()));
        }
    }
    let mut set = |key: String, value: &str| match entries.iter_mut().find(|(k, _)| *k == key) {
        Some(e) => e.1 = value.to_string(),
        None => entries.push((key, value.to_string())),
    };
    for (k, v) in &profile.options {
        if k != "version" {
            set(k.clone(), v);
        }
    }
    for (mapping, input) in &profile.keybinds {
        set(format!("key_{mapping}"), input);
    }
    render_options(&entries)
}

/// Build a profile from an instance's current options.txt ("save my settings as a profile").
pub fn profile_from_options(name: &str, text: &str) -> GameProfile {
    let mut options = BTreeMap::new();
    let mut keybinds = BTreeMap::new();
    for (k, v) in parse_options(text) {
        if k == "version" || k == "resourcePacks" || k == "incompatibleResourcePacks" || k == "lastServer" {
            continue; // instance-specific
        }
        match k.strip_prefix("key_") {
            Some(mapping) => {
                keybinds.insert(mapping.to_string(), v);
            }
            None => {
                options.insert(k, v);
            }
        }
    }
    GameProfile { id: String::new(), name: name.to_string(), options, keybinds }
}

/// The client jar's `version.json` holds the data version options.txt must declare;
/// without it Minecraft runs every options data-fixer from version 0.
pub fn data_version_from_jar(jar: &Path) -> Option<i64> {
    let file = std::fs::File::open(jar).ok()?;
    let mut zip = zip::ZipArchive::new(file).ok()?;
    let mut entry = zip.by_name("version.json").ok()?;
    let mut s = String::new();
    entry.read_to_string(&mut s).ok()?;
    let v: serde_json::Value = serde_json::from_str(&s).ok()?;
    v["world_version"].as_i64()
}

/// Apply a profile to an instance folder. Returns true if options.txt was written.
pub async fn apply_to_instance(instance_dir: &Path, profile: &GameProfile, client_jar: &Path) -> Result<bool> {
    let path = instance_dir.join("options.txt");
    let existing = tokio::fs::read_to_string(&path).await.ok();
    let jar = client_jar.to_path_buf();
    let dv = tokio::task::spawn_blocking(move || data_version_from_jar(&jar)).await.map_err(|e| Error::Other(e.to_string()))?;
    if existing.is_none() && dv.is_none() {
        // Without a data version we'd risk Minecraft "upgrading" our values; wait for the first launch.
        return Ok(false);
    }
    let merged = merge_profile(existing.as_deref(), profile, dv);
    tokio::fs::write(&path, merged).await?;
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn profile() -> GameProfile {
        let mut p = starter_profile();
        p.options.insert("fov".into(), "0.5".into());
        p.keybinds.insert("key.forward".into(), "key.keyboard.z".into());
        p
    }

    #[test]
    fn merges_into_existing_and_keeps_unknown_lines() {
        let existing = "version:4555\nfov:0.0\nlastServer:play.example.net\nkey_key.forward:key.keyboard.w\n";
        let out = merge_profile(Some(existing), &profile(), Some(9999));
        assert!(out.starts_with("version:4555\n"), "keeps the game's own data version");
        assert!(out.contains("fov:0.5\n"));
        assert!(out.contains("lastServer:play.example.net\n"));
        assert!(out.contains("key_key.forward:key.keyboard.z\n"));
        assert_eq!(out.matches("fov:").count(), 1);
    }

    #[test]
    fn new_file_gets_data_version_first() {
        let out = merge_profile(None, &profile(), Some(4700));
        assert!(out.starts_with("version:4700\n"));
    }

    #[test]
    fn round_trips_from_options() {
        let p = profile_from_options("Mine", "version:1\nfov:0.25\nresourcePacks:[\"vanilla\"]\nkey_key.jump:key.keyboard.space\n");
        assert_eq!(p.options.get("fov").unwrap(), "0.25");
        assert!(!p.options.contains_key("resourcePacks"));
        assert_eq!(p.keybinds.get("key.jump").unwrap(), "key.keyboard.space");
    }

    #[test]
    fn rejects_injection_in_values() {
        let mut store = ProfileStore::default();
        let mut p = profile();
        p.options.insert("evil".into(), "1\nkey_key.attack:key.mouse.right".into());
        let saved = store.upsert(p);
        assert!(!saved.options.contains_key("evil"));
    }
}
