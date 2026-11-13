//! Play statistics for the Account page: a log of play sessions (recorded when a game exits)
//! and the servers you joined (read from the game's log). Stored in stats.json.
use crate::state::AppState;
use launcher_core::Result;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    /// Unix seconds when the game started.
    pub start: i64,
    pub minutes: u64,
    pub account: String,
    pub instance: String,
    pub instance_name: String,
    pub version: String,
    pub loader: String,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ServerVisit {
    pub address: String,
    pub last_joined: i64,
    pub joins: u32,
    pub instance_name: String,
    pub version: String,
    #[serde(default)]
    pub account: String,
    /// Instance id, so the Account page can offer "Play" on that server.
    #[serde(default)]
    pub instance: String,
}

#[derive(Serialize, Deserialize, Default)]
struct Stats {
    sessions: Vec<Session>,
    servers: Vec<ServerVisit>,
}

fn file(state: &AppState) -> std::path::PathBuf {
    state.paths.root().join("stats.json")
}

async fn load(state: &AppState) -> Stats {
    match tokio::fs::read(file(state)).await {
        Ok(b) => serde_json::from_slice(&b).unwrap_or_default(),
        Err(_) => Stats::default(),
    }
}

/// Server addresses the game connected to, from its log ("Connecting to host, port").
pub async fn servers_in_log(instance_dir: &std::path::Path) -> Vec<String> {
    let Ok(text) = tokio::fs::read_to_string(instance_dir.join("logs").join("latest.log")).await else { return Vec::new() };
    let mut out = Vec::new();
    for line in text.lines() {
        let Some(i) = line.find("Connecting to ") else { continue };
        let rest = &line[i + "Connecting to ".len()..];
        let Some((host, port)) = rest.split_once(", ") else { continue };
        let port: u16 = port.trim().parse().unwrap_or(25565);
        let host = host.trim();
        if host.is_empty() || host.contains(' ') {
            continue;
        }
        let addr = if port == 25565 { host.to_string() } else { format!("{host}:{port}") };
        if !out.contains(&addr) {
            out.push(addr);
        }
    }
    out
}

/// Called when a game exits.
pub async fn record(state: &AppState, session: Session, servers: Vec<String>) {
    let mut s = load(state).await;
    let when = session.start;
    for addr in servers {
        match s.servers.iter_mut().find(|v| v.address.eq_ignore_ascii_case(&addr) && v.account == session.account) {
            Some(v) => {
                v.last_joined = when;
                v.joins += 1;
                v.instance_name = session.instance_name.clone();
                v.version = session.version.clone();
                v.instance = session.instance.clone();
            }
            None => s.servers.push(ServerVisit {
                address: addr,
                last_joined: when,
                joins: 1,
                instance_name: session.instance_name.clone(),
                version: session.version.clone(),
                account: session.account.clone(),
                instance: session.instance.clone(),
            }),
        }
    }
    if session.minutes > 0 || !s.servers.is_empty() {
        s.sessions.push(session);
    }
    // Keep the file small: the last 2000 sessions are plenty for every chart.
    let n = s.sessions.len();
    if n > 2000 {
        s.sessions.drain(..n - 2000);
    }
    let _ = tokio::fs::write(file(state), serde_json::to_vec(&s).unwrap_or_default()).await;
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NamedMinutes {
    pub name: String,
    pub minutes: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountStats {
    /// Everything played in Ember (all accounts, including before stats were tracked).
    pub total_minutes: u64,
    /// Played on this account since Ember started tracking it.
    pub account_minutes: u64,
    pub sessions: usize,
    pub longest_session: u64,
    pub favourite_version: Option<String>,
    pub favourite_loader: Option<String>,
    pub most_played_instance: Option<String>,
    pub last_played: Option<i64>,
    pub tracked_since: Option<i64>,
    /// Minutes per day for the last 14 days, oldest first.
    pub days: Vec<u64>,
    pub versions: Vec<NamedMinutes>,
    pub instances: Vec<NamedMinutes>,
    pub servers: Vec<ServerVisit>,
    pub instance_count: usize,
}

fn top(map: HashMap<String, u64>, n: usize) -> Vec<NamedMinutes> {
    let mut v: Vec<_> = map.into_iter().filter(|(_, m)| *m > 0).map(|(name, minutes)| NamedMinutes { name, minutes }).collect();
    v.sort_by_key(|x| std::cmp::Reverse(x.minutes));
    v.truncate(n);
    v
}

pub async fn account_stats(state: &AppState, account: &str) -> Result<AccountStats> {
    let s = load(state).await;
    let instances = state.instances.list().await.unwrap_or_default();
    let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs() as i64).unwrap_or(0);

    // All-time totals come from each instance's own counter (kept since Ember 0.1).
    let total_minutes = instances.iter().map(|i| i.play_minutes).sum();
    let mut versions: HashMap<String, u64> = HashMap::new();
    let mut loaders: HashMap<String, u64> = HashMap::new();
    let mut per_instance: HashMap<String, u64> = HashMap::new();
    for i in &instances {
        *versions.entry(i.game_version.clone()).or_default() += i.play_minutes;
        *loaders.entry(format!("{:?}", i.loader)).or_default() += i.play_minutes;
        *per_instance.entry(i.name.clone()).or_default() += i.play_minutes;
    }
    let mine: Vec<&Session> = s.sessions.iter().filter(|x| x.account == account).collect();
    let mut days = vec![0u64; 14];
    let today = now / 86_400;
    for x in &mine {
        let d = today - x.start / 86_400;
        if (0..14).contains(&d) {
            days[13 - d as usize] += x.minutes;
        }
    }
    let versions = top(versions, 5);
    let loaders = top(loaders, 1);
    let instances_top = top(per_instance, 5);
    let mut servers: Vec<ServerVisit> = s.servers.iter().filter(|v| v.account == account || v.account.is_empty()).cloned().collect();
    servers.sort_by_key(|x| std::cmp::Reverse(x.last_joined));
    Ok(AccountStats {
        total_minutes,
        account_minutes: mine.iter().map(|x| x.minutes).sum(),
        sessions: mine.len(),
        longest_session: mine.iter().map(|x| x.minutes).max().unwrap_or(0),
        favourite_version: versions.first().map(|v| v.name.clone()),
        favourite_loader: loaders.first().map(|v| v.name.clone()),
        most_played_instance: instances_top.first().map(|v| v.name.clone()),
        last_played: instances.iter().filter_map(|i| i.last_played.map(|d| d.timestamp())).max(),
        tracked_since: mine.iter().map(|x| x.start).min(),
        days,
        versions,
        instances: instances_top,
        servers,
        instance_count: instances.len(),
    })
}

#[tauri::command]
pub async fn account_stats_cmd(state: tauri::State<'_, AppState>) -> Result<AccountStats> {
    let uuid = state.account.lock().await.as_ref().map(|a| a.uuid.clone()).unwrap_or_default();
    account_stats(&state, &uuid).await
}
