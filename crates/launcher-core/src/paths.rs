use std::path::{Path, PathBuf};

/// Sub-folders every instance gets. `datapacks/` is a staging area: data packs are
/// per-world in vanilla, so the UI copies them into `saves/<world>/datapacks` on demand.
pub const INSTANCE_DIRS: &[&str] = &[
    "mods", "config", "saves", "resourcepacks", "shaderpacks", "datapacks", "screenshots", "logs", ".ember/natives",
];

#[derive(Debug, Clone)]
pub struct LauncherPaths {
    root: PathBuf,
    resources: Option<PathBuf>,
}

impl LauncherPaths {
    pub fn new(root: impl Into<PathBuf>) -> Self {
        Self { root: root.into(), resources: None }
    }

    /// Where the app bundle keeps read-only resources (Tauri's resource dir).
    pub fn with_resources(mut self, dir: impl Into<PathBuf>) -> Self {
        self.resources = Some(dir.into());
        self
    }

    pub fn root(&self) -> &Path {
        &self.root
    }
    pub fn shared(&self) -> PathBuf {
        self.root.join("shared")
    }
    pub fn versions(&self) -> PathBuf {
        self.shared().join("versions")
    }
    pub fn version_json(&self, id: &str) -> PathBuf {
        self.versions().join(id).join(format!("{id}.json"))
    }
    pub fn version_jar(&self, id: &str) -> PathBuf {
        self.versions().join(id).join(format!("{id}.jar"))
    }
    pub fn libraries(&self) -> PathBuf {
        self.shared().join("libraries")
    }
    pub fn assets(&self) -> PathBuf {
        self.shared().join("assets")
    }
    pub fn runtimes(&self) -> PathBuf {
        self.shared().join("runtimes")
    }
    pub fn instances(&self) -> PathBuf {
        self.root.join("instances")
    }
    pub fn instance(&self, id: &str) -> PathBuf {
        self.instances().join(id)
    }
    pub fn instance_mods(&self, id: &str) -> PathBuf {
        self.instance(id).join("mods")
    }
    pub fn instance_natives(&self, id: &str) -> PathBuf {
        self.instance(id).join(".ember").join("natives")
    }
    /// Bundled launcher resources (e.g. the overlay mod jars), set by the shell.
    pub fn bundled_resources(&self) -> PathBuf {
        self.resources.clone().unwrap_or_else(|| self.root.join("resources"))
    }
}

/// `group:artifact:version[:classifier][@ext]` -> `group/path/artifact/version/artifact-version[-classifier].ext`
pub fn maven_path(coord: &str) -> Option<String> {
    let (coord, ext) = match coord.split_once('@') {
        Some((c, e)) => (c, e),
        None => (coord, "jar"),
    };
    let mut parts = coord.split(':');
    let group = parts.next()?;
    let artifact = parts.next()?;
    let version = parts.next()?;
    let classifier = parts.next();
    let file = match classifier {
        Some(c) => format!("{artifact}-{version}-{c}.{ext}"),
        None => format!("{artifact}-{version}.{ext}"),
    };
    Some(format!("{}/{artifact}/{version}/{file}", group.replace('.', "/")))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn maven_paths() {
        assert_eq!(
            maven_path("net.fabricmc:fabric-loader:0.16.9").unwrap(),
            "net/fabricmc/fabric-loader/0.16.9/fabric-loader-0.16.9.jar"
        );
        assert_eq!(
            maven_path("org.lwjgl:lwjgl:3.3.3:natives-windows").unwrap(),
            "org/lwjgl/lwjgl/3.3.3/lwjgl-3.3.3-natives-windows.jar"
        );
        assert_eq!(maven_path("a.b:c:1@zip").unwrap(), "a/b/c/1/c-1.zip");
    }
}
