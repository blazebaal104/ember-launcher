//! World tools for hosted servers: backups (zip), restore, import a singleplayer world,
//! reset, and the operator/whitelist/ban lists. All of these expect the server to be
//! stopped, except reading lists and taking a backup.
use crate::{Error, Result};
use serde::Serialize;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

/// How many automatic backups to keep (manual ones are never pruned).
pub const KEEP_AUTO: usize = 5;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Backup {
    pub file: String,
    /// Unix seconds.
    pub created: i64,
    pub size_mb: f64,
    /// "manual", "auto", "before-restore", "before-reset", "before-import", "before-c2me"…
    pub reason: String,
}

/// The world folder name from server.properties (`level-name`), default "world".
pub fn level_name(dir: &Path) -> String {
    std::fs::read_to_string(dir.join("server.properties"))
        .ok()
        .and_then(|t| t.lines().find_map(|l| l.strip_prefix("level-name=").map(|s| s.trim().to_string())))
        .filter(|s| !s.is_empty() && !s.contains(['/', '\\']) && s != "..")
        .unwrap_or_else(|| "world".into())
}

/// The world's folders that exist (Paper splits the Nether and End into their own).
pub fn world_dirs(dir: &Path) -> Vec<PathBuf> {
    let level = level_name(dir);
    [level.clone(), format!("{level}_nether"), format!("{level}_the_end")].into_iter().map(|n| dir.join(n)).filter(|p| p.is_dir()).collect()
}

pub fn has_world(dir: &Path) -> bool {
    dir.join(level_name(dir)).join("level.dat").exists()
}

fn backups_dir(dir: &Path) -> PathBuf {
    dir.join("backups")
}

fn add_dir(zip: &mut zip::ZipWriter<std::fs::File>, root: &Path, cur: &Path, opts: zip::write::SimpleFileOptions) -> Result<()> {
    for e in std::fs::read_dir(cur)? {
        let e = e?;
        let p = e.path();
        let rel = p.strip_prefix(root).map_err(|e| Error::Other(e.to_string()))?.to_string_lossy().replace('\\', "/");
        if e.file_type()?.is_dir() {
            zip.add_directory(format!("{rel}/"), opts).map_err(|e| Error::Other(e.to_string()))?;
            add_dir(zip, root, &p, opts)?;
        } else if e.file_name() != "session.lock" {
            zip.start_file(rel, opts).map_err(|e| Error::Other(e.to_string()))?;
            let mut f = std::fs::File::open(&p)?;
            std::io::copy(&mut f, zip)?;
        }
    }
    Ok(())
}

/// Zip the world folders into `backups/`. Returns `None` when there's no world yet.
pub fn backup(dir: &Path, reason: &str) -> Result<Option<Backup>> {
    let worlds = world_dirs(dir);
    if worlds.is_empty() {
        return Ok(None);
    }
    let reason: String = reason.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '-').collect();
    std::fs::create_dir_all(backups_dir(dir))?;
    let now = chrono::Local::now();
    let name = format!("{}_{}.zip", now.format("%Y-%m-%d_%H-%M-%S"), reason);
    let path = backups_dir(dir).join(&name);
    let mut zip = zip::ZipWriter::new(std::fs::File::create(&path)?);
    let opts = zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated).large_file(true);
    for w in &worlds {
        add_dir(&mut zip, dir, w, opts)?;
    }
    zip.finish().map_err(|e| Error::Other(e.to_string()))?;
    if reason == "auto" {
        prune(dir)?;
    }
    Ok(list(dir)?.into_iter().find(|b| b.file == name))
}

fn parse_name(name: &str) -> Option<(i64, String)> {
    let stem = name.strip_suffix(".zip")?;
    let (stamp, reason) = stem.split_at(stem.find('_').map(|i| i + 9).filter(|&i| i <= stem.len())?);
    let when = chrono::NaiveDateTime::parse_from_str(stamp, "%Y-%m-%d_%H-%M-%S").ok()?;
    let ts = when.and_local_timezone(chrono::Local).single()?.timestamp();
    Some((ts, reason.trim_start_matches('_').to_string()))
}

pub fn list(dir: &Path) -> Result<Vec<Backup>> {
    let mut out = Vec::new();
    let Ok(rd) = std::fs::read_dir(backups_dir(dir)) else { return Ok(out) };
    for e in rd.flatten() {
        let name = e.file_name().to_string_lossy().into_owned();
        if let Some((created, reason)) = parse_name(&name) {
            let size_mb = e.metadata().map(|m| m.len() as f64 / 1_048_576.0).unwrap_or(0.0);
            out.push(Backup { file: name, created, size_mb, reason });
        }
    }
    out.sort_by_key(|b| std::cmp::Reverse(b.created));
    Ok(out)
}

fn prune(dir: &Path) -> Result<()> {
    for b in list(dir)?.into_iter().filter(|b| b.reason == "auto").skip(KEEP_AUTO) {
        let _ = std::fs::remove_file(backups_dir(dir).join(b.file));
    }
    Ok(())
}

/// Seconds since the newest backup of any kind (None if there are none).
pub fn last_backup_age(dir: &Path) -> Option<i64> {
    list(dir).ok()?.first().map(|b| chrono::Utc::now().timestamp() - b.created)
}

fn check_backup_name(file: &str) -> Result<()> {
    if parse_name(file).is_none() || file.contains(['/', '\\']) {
        return Err(Error::Other("unknown backup".into()));
    }
    Ok(())
}

pub fn delete_backup(dir: &Path, file: &str) -> Result<()> {
    check_backup_name(file)?;
    std::fs::remove_file(backups_dir(dir).join(file))?;
    Ok(())
}

fn remove_worlds(dir: &Path) -> Result<()> {
    for w in world_dirs(dir) {
        std::fs::remove_dir_all(w)?;
    }
    Ok(())
}

/// Replace the world with a backup (the current world is backed up first).
pub fn restore(dir: &Path, file: &str) -> Result<()> {
    check_backup_name(file)?;
    let src = backups_dir(dir).join(file);
    let mut zip = zip::ZipArchive::new(std::fs::File::open(&src)?).map_err(|e| Error::Other(format!("backup is damaged: {e}")))?;
    backup(dir, "before-restore")?;
    remove_worlds(dir)?;
    for i in 0..zip.len() {
        let mut f = zip.by_index(i).map_err(|e| Error::Other(e.to_string()))?;
        let Some(rel) = f.enclosed_name() else { continue };
        let out = dir.join(rel);
        if f.is_dir() {
            std::fs::create_dir_all(&out)?;
        } else {
            if let Some(p) = out.parent() {
                std::fs::create_dir_all(p)?;
            }
            let mut buf = Vec::new();
            f.read_to_end(&mut buf)?;
            std::fs::File::create(&out)?.write_all(&buf)?;
        }
    }
    Ok(())
}

/// Delete the world so a fresh one generates next start (backed up first).
pub fn reset(dir: &Path) -> Result<()> {
    backup(dir, "before-reset")?;
    remove_worlds(dir)
}

fn copy_dir(src: &Path, dest: &Path) -> Result<u64> {
    std::fs::create_dir_all(dest)?;
    let mut n = 0;
    for e in std::fs::read_dir(src)? {
        let e = e?;
        let to = dest.join(e.file_name());
        if e.file_type()?.is_dir() {
            n += copy_dir(&e.path(), &to)?;
        } else if e.file_name() != "session.lock" {
            n += std::fs::copy(e.path(), to)?;
        }
    }
    Ok(n)
}

/// Copy a singleplayer world in as the server's world (the old one is backed up first).
pub fn import(dir: &Path, world: &Path) -> Result<()> {
    if !world.join("level.dat").exists() {
        return Err(Error::Other("that folder isn't a Minecraft world".into()));
    }
    backup(dir, "before-import")?;
    remove_worlds(dir)?;
    copy_dir(world, &dir.join(level_name(dir)))?;
    Ok(())
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerLists {
    pub ops: Vec<String>,
    pub whitelist: Vec<String>,
    pub banned: Vec<String>,
    pub whitelist_on: bool,
}

fn names(path: PathBuf) -> Vec<String> {
    std::fs::read(path)
        .ok()
        .and_then(|b| serde_json::from_slice::<Vec<serde_json::Value>>(&b).ok())
        .unwrap_or_default()
        .into_iter()
        .filter_map(|v| v.get("name").and_then(|n| n.as_str()).map(String::from))
        .collect()
}

pub fn player_lists(dir: &Path) -> PlayerLists {
    let props = std::fs::read_to_string(dir.join("server.properties")).unwrap_or_default();
    PlayerLists {
        ops: names(dir.join("ops.json")),
        whitelist: names(dir.join("whitelist.json")),
        banned: names(dir.join("banned-players.json")),
        whitelist_on: props.lines().any(|l| l.trim() == "white-list=true"),
    }
}

/// Folder size in MB.
pub fn size_mb(p: &Path) -> f64 {
    fn walk(p: &Path) -> u64 {
        std::fs::read_dir(p).map(|rd| rd.flatten().map(|e| if e.file_type().map(|t| t.is_dir()).unwrap_or(false) { walk(&e.path()) } else { e.metadata().map(|m| m.len()).unwrap_or(0) }).sum()).unwrap_or(0)
    }
    walk(p) as f64 / 1_048_576.0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn backup_restore_import() {
        let d = tempfile::tempdir().unwrap();
        let dir = d.path();
        std::fs::write(dir.join("server.properties"), "level-name=world\n").unwrap();
        assert!(backup(dir, "manual").unwrap().is_none());
        std::fs::create_dir_all(dir.join("world/region")).unwrap();
        std::fs::write(dir.join("world/level.dat"), b"v1").unwrap();
        std::fs::write(dir.join("world/region/r.0.0.mca"), b"chunks").unwrap();
        std::fs::write(dir.join("world/session.lock"), b"x").unwrap();
        let b = backup(dir, "manual").unwrap().unwrap();
        assert_eq!(b.reason, "manual");
        std::fs::write(dir.join("world/level.dat"), b"v2").unwrap();
        restore(dir, &b.file).unwrap();
        assert_eq!(std::fs::read(dir.join("world/level.dat")).unwrap(), b"v1");
        assert!(!dir.join("world/session.lock").exists());
        assert!(list(dir).unwrap().iter().any(|b| b.reason == "before-restore"));
        assert!(restore(dir, "../evil.zip").is_err());

        let sp = tempfile::tempdir().unwrap();
        std::fs::write(sp.path().join("level.dat"), b"sp").unwrap();
        import(dir, sp.path()).unwrap();
        assert_eq!(std::fs::read(dir.join("world/level.dat")).unwrap(), b"sp");
        assert!(has_world(dir));
        reset(dir).unwrap();
        assert!(!has_world(dir));
    }

    #[test]
    fn prunes_auto_backups() {
        let d = tempfile::tempdir().unwrap();
        let dir = d.path();
        std::fs::create_dir_all(dir.join("backups")).unwrap();
        for i in 0..8 {
            std::fs::write(dir.join(format!("backups/2026-01-0{}_10-00-00_auto.zip", i + 1)), b"z").unwrap();
        }
        std::fs::write(dir.join("backups/2025-01-01_10-00-00_manual.zip"), b"z").unwrap();
        prune(dir).unwrap();
        let l = list(dir).unwrap();
        assert_eq!(l.iter().filter(|b| b.reason == "auto").count(), KEEP_AUTO);
        assert!(l.iter().any(|b| b.reason == "manual"));
        assert_eq!(l[0].file, "2026-01-08_10-00-00_auto.zip");
    }

    #[test]
    fn reads_lists() {
        let d = tempfile::tempdir().unwrap();
        std::fs::write(d.path().join("ops.json"), r#"[{"uuid":"x","name":"Alex","level":4}]"#).unwrap();
        std::fs::write(d.path().join("server.properties"), "white-list=true\n").unwrap();
        let l = player_lists(d.path());
        assert_eq!(l.ops, vec!["Alex"]);
        assert!(l.whitelist_on);
    }
}
