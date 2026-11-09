//! Builds the java command line and spawns the game with `--gameDir` = instance folder.
use crate::install::{library_path, Prepared};
use crate::instance::InstanceConfig;
use crate::paths::LauncherPaths;
use crate::rules::{allowed, RuleContext};
use crate::version_json::Argument;
use crate::{Result, LAUNCHER_NAME, LAUNCHER_VERSION};
use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Stdio;

#[derive(Debug, Clone)]
pub struct LaunchIdentity {
    pub username: String,
    pub uuid: String,
    pub access_token: String,
    pub xuid: String,
}

#[derive(Debug, Clone, Default)]
pub struct LaunchOptions {
    pub resolution: Option<(u32, u32)>,
    /// Join a server directly (powers the overlay's quick server switcher on relaunch).
    pub quick_play_server: Option<String>,
}

pub struct LaunchCommand {
    pub java: PathBuf,
    pub args: Vec<String>,
    pub cwd: PathBuf,
}

/// G1 tuned for low pause times on Java 21/25. No -XX:+DisableExplicitGC, so the
/// overlay's "memory cleaner" (System.gc on demand) still works.
pub const DEFAULT_JVM_FLAGS: &[&str] = &[
    "-XX:+UseG1GC",
    "-XX:+ParallelRefProcEnabled",
    "-XX:MaxGCPauseMillis=50",
    "-XX:+UnlockExperimentalVMOptions",
    "-XX:G1NewSizePercent=30",
    "-XX:G1MaxNewSizePercent=40",
    "-XX:G1HeapRegionSize=8M",
    "-XX:G1ReservePercent=20",
    "-XX:+UseStringDeduplication",
];

pub fn build(paths: &LauncherPaths, inst: &InstanceConfig, prepared: &Prepared, java: PathBuf, who: &LaunchIdentity, opts: &LaunchOptions) -> LaunchCommand {
    let json = &prepared.json;
    let game_dir = paths.instance(&inst.id);
    let natives = paths.instance_natives(&inst.id);
    let sep = if cfg!(windows) { ";" } else { ":" };

    let mut ctx = RuleContext::current();
    if opts.resolution.is_some() {
        ctx = ctx.with_feature("has_custom_resolution", true);
    }
    if opts.quick_play_server.is_some() {
        ctx = ctx.with_feature("is_quick_play_multiplayer", true);
    }

    let mut classpath: Vec<String> = json
        .libraries
        .iter()
        .filter(|l| allowed(&l.rules, &ctx))
        .filter_map(|l| library_path(paths, l))
        .map(|p| p.display().to_string())
        .collect();
    classpath.push(paths.version_jar(&prepared.vanilla_id).display().to_string());

    let (w, h) = opts.resolution.unwrap_or((1280, 720));
    let vars: HashMap<&str, String> = HashMap::from([
        ("auth_player_name", who.username.clone()),
        ("version_name", json.id.clone()),
        ("game_directory", game_dir.display().to_string()),
        ("assets_root", paths.assets().display().to_string()),
        ("assets_index_name", json.asset_index.as_ref().map(|a| a.id.clone()).or(json.assets.clone()).unwrap_or_default()),
        ("auth_uuid", who.uuid.clone()),
        ("auth_access_token", who.access_token.clone()),
        ("auth_xuid", who.xuid.clone()),
        ("clientid", String::new()),
        ("user_type", "msa".into()),
        ("version_type", json.kind.clone().unwrap_or_else(|| "release".into())),
        ("resolution_width", w.to_string()),
        ("resolution_height", h.to_string()),
        ("quickPlayMultiplayer", opts.quick_play_server.clone().unwrap_or_default()),
        ("natives_directory", natives.display().to_string()),
        ("launcher_name", LAUNCHER_NAME.into()),
        ("launcher_version", LAUNCHER_VERSION.into()),
        ("classpath", classpath.join(sep)),
        ("classpath_separator", sep.into()),
        ("library_directory", paths.libraries().display().to_string()),
    ]);

    let mut args: Vec<String> = vec![format!("-Xms{}m", (inst.memory_mb / 2).max(512)), format!("-Xmx{}m", inst.memory_mb)];
    args.extend(DEFAULT_JVM_FLAGS.iter().map(|s| s.to_string()));
    args.extend(inst.jvm_args.iter().cloned());
    args.extend(expand(&json.arguments.jvm, &ctx, &vars));
    if let Some(log) = json.logging.as_ref().and_then(|l| l.client.as_ref()) {
        let path = paths.assets().join("log_configs").join(&log.file.id);
        args.push(log.argument.replace("${path}", &path.display().to_string()));
    }
    args.push(json.main_class.clone());
    args.extend(expand(&json.arguments.game, &ctx, &vars));

    LaunchCommand { java: inst.java_path.clone().unwrap_or(java), args, cwd: game_dir }
}

fn expand(list: &[Argument], ctx: &RuleContext, vars: &HashMap<&str, String>) -> Vec<String> {
    list.iter()
        .flat_map(|a| match a {
            Argument::Plain(s) => vec![s.clone()],
            Argument::Conditional { rules, value } if allowed(rules, ctx) => value.values(),
            Argument::Conditional { .. } => vec![],
        })
        .map(|s| substitute(&s, vars))
        .collect()
}

pub fn substitute(s: &str, vars: &HashMap<&str, String>) -> String {
    let mut out = String::with_capacity(s.len());
    let mut rest = s;
    while let Some(start) = rest.find("${") {
        out.push_str(&rest[..start]);
        match rest[start..].find('}') {
            Some(end) => {
                let key = &rest[start + 2..start + end];
                match vars.get(key) {
                    Some(v) => out.push_str(v),
                    None => out.push_str(&rest[start..start + end + 1]),
                }
                rest = &rest[start + end + 1..];
            }
            None => {
                out.push_str(&rest[start..]);
                rest = "";
            }
        }
    }
    out.push_str(rest);
    out
}

/// Spawn the game. Logs are piped so the shell can stream them to the UI console.
pub fn spawn(cmd: &LaunchCommand) -> Result<tokio::process::Child> {
    let mut c = tokio::process::Command::new(&cmd.java);
    c.args(&cmd.args).current_dir(&cmd.cwd).stdout(Stdio::piped()).stderr(Stdio::piped()).kill_on_drop(false);
    #[cfg(windows)]
    {
        // CREATE_NO_WINDOW: don't flash a console next to javaw.
        c.creation_flags(0x0800_0000);
    }
    Ok(c.spawn()?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::instance::Loader;
    use crate::version_json::VersionJson;

    #[test]
    fn substitutes_known_and_keeps_unknown() {
        let vars = HashMap::from([("a", "1".to_string())]);
        assert_eq!(substitute("x=${a} y=${b} z", &vars), "x=1 y=${b} z");
    }

    #[test]
    fn builds_isolated_command() {
        let json: VersionJson = serde_json::from_str(
            r#"{
            "id":"fabric-loader-0.16.9-1.21.4","mainClass":"net.fabricmc.loader.impl.launch.knot.KnotClient",
            "arguments":{
              "game":["--username","${auth_player_name}","--gameDir","${game_directory}",
                      {"rules":[{"action":"allow","features":{"has_custom_resolution":true}}],"value":["--width","${resolution_width}"]}],
              "jvm":["-Djava.library.path=${natives_directory}","-cp","${classpath}"]},
            "libraries":[{"name":"net.fabricmc:fabric-loader:0.16.9","url":"https://maven.fabricmc.net/"},
                         {"name":"org.lwjgl:lwjgl:3.3.3:natives-windows","rules":[{"action":"allow","os":{"name":"windows"}}]}],
            "assetIndex":{"id":"19","url":"u","sha1":"s","size":1}
        }"#,
        )
        .unwrap();
        let paths = LauncherPaths::new("/data");
        let inst = InstanceConfig {
            id: "pvp-abc123".into(), name: "PvP".into(), game_version: "1.21.4".into(), loader: Loader::Fabric,
            loader_version: Some("0.16.9".into()), memory_mb: 4096, jvm_args: vec![], java_path: None,
            performance_bundle: true, overlay: true, created_at: chrono::Utc::now(), last_played: None, icon: None,
            game_profile: None, profile_applied: false, profile_every_launch: false, source: None, favorite: false, play_minutes: 0,
        };
        let who = LaunchIdentity { username: "Steve".into(), uuid: "u".into(), access_token: "t".into(), xuid: "x".into() };
        let cmd = build(&paths, &inst, &Prepared { json, vanilla_id: "1.21.4".into() }, "/java".into(), &who, &LaunchOptions::default());
        let joined = cmd.args.join(" ");
        assert!(joined.contains("-Xmx4096m"));
        assert!(joined.contains("--gameDir /data/instances/pvp-abc123"));
        assert!(joined.contains("fabric-loader-0.16.9.jar"));
        assert!(joined.contains("--username Steve"));
        assert!(!joined.contains("--width"), "feature-gated arg must be dropped");
        assert_eq!(cmd.cwd, PathBuf::from("/data/instances/pvp-abc123"));
        if !cfg!(windows) {
            assert!(!joined.contains("natives-windows"));
        }
    }
}
