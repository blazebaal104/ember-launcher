//! playit.gg integration: lets friends anywhere join a home-hosted server without router
//! setup. Ember talks to the playit API directly (claim + tunnel management) and runs the
//! official open-source playit agent (`playitd`, bundled with the app) to carry traffic.
//!
//! Flow: [`new_claim_code`] → user opens [`claim_url`] and approves → [`claim_status`]
//! polls until accepted → [`claim_exchange`] gives the agent secret → [`ensure_tunnel`]
//! creates (or reuses) a Minecraft Java tunnel for the server's port → the agent runs
//! while the server runs, and [`tunnel_address`] gives the address to share.
use crate::{Error, Result};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

pub const API: &str = "https://api.playit.gg";

/// Version of the bundled playit agent (CI builds playitd from this release). playit.gg
/// checks this during setup and rejects anything it doesn't recognise as AgentVersionTooOld,
/// so it must use the agent's own "playit <version>" format.
pub const AGENT_VERSION: &str = "2.0.2";

pub fn new_claim_code() -> String {
    let mut b = [0u8; 5];
    getrandom(&mut b);
    b.iter().map(|x| format!("{x:02x}")).collect()
}

fn getrandom(buf: &mut [u8]) {
    // Good enough for a short-lived claim code: mix the clock with a hash of the process.
    use std::hash::{BuildHasher, Hasher};
    let s = std::collections::hash_map::RandomState::new();
    for chunk in buf.chunks_mut(8) {
        let mut h = s.build_hasher();
        h.write_u128(std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0));
        let v = h.finish().to_le_bytes();
        chunk.copy_from_slice(&v[..chunk.len()]);
    }
}

pub fn claim_url(code: &str) -> String {
    format!("https://playit.gg/claim/{code}")
}

async fn call(client: &reqwest::Client, path: &str, secret: Option<&str>, body: Value) -> Result<Value> {
    let mut req = client.post(format!("{API}{path}")).json(&body).timeout(std::time::Duration::from_secs(15));
    if let Some(s) = secret {
        req = req.header(reqwest::header::AUTHORIZATION, format!("Agent-Key {}", s.trim()));
    }
    let res = req.send().await?;
    if res.status().as_u16() == 429 {
        return Err(Error::Other("playit.gg is busy, try again in a moment".into()));
    }
    let v: Value = res.json().await?;
    match v.get("status").and_then(Value::as_str) {
        Some("success") => Ok(v.get("data").cloned().unwrap_or(Value::Null)),
        Some("fail") => Err(Error::Other(format!("playit.gg: {}", describe(v.get("data"))))),
        _ => Err(Error::Other(format!("playit.gg error: {}", describe(v.get("data"))))),
    }
}

fn describe(v: Option<&Value>) -> String {
    match v {
        Some(Value::String(s)) => humanize(s),
        Some(o @ Value::Object(_)) => o.get("message").map(|m| describe(Some(m))).unwrap_or_else(|| o.to_string()),
        Some(other) => other.to_string(),
        None => "unknown error".into(),
    }
}

fn humanize(code: &str) -> String {
    match code {
        "AgentVersionTooOld" => "playit.gg says this version of its program is too old; update Ember".into(),
        "CodeExpired" => "the setup link expired, start again".into(),
        "UserRejected" => "the request was declined in the browser".into(),
        "RequiresVerifiedAccount" | "RequiresPlayitPremium" => "your playit.gg account needs to be verified (check your email) for this".into(),
        "PortAllocated" | "AllocatedPortLimit" | "TooManyTunnels" => "your free playit.gg account already has its maximum number of tunnels; delete an old one on playit.gg".into(),
        other => other.to_string(),
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ClaimStatus {
    WaitingForVisit,
    WaitingForApproval,
    Approved,
    Rejected,
}

pub async fn claim_status(client: &reqwest::Client, code: &str) -> Result<ClaimStatus> {
    let v = call(client, "/claim/setup", None, json!({ "code": code, "agent_type": "self-managed", "version": format!("playit {AGENT_VERSION}") })).await?;
    Ok(match v.as_str() {
        Some("UserAccepted") => ClaimStatus::Approved,
        Some("UserRejected") => ClaimStatus::Rejected,
        Some("WaitingForUser") => ClaimStatus::WaitingForApproval,
        _ => ClaimStatus::WaitingForVisit,
    })
}

pub async fn claim_exchange(client: &reqwest::Client, code: &str) -> Result<String> {
    let v = call(client, "/claim/exchange", None, json!({ "code": code })).await?;
    v.get("secret_key").and_then(Value::as_str).map(String::from).ok_or_else(|| Error::Other("playit.gg didn't return a key".into()))
}

pub async fn agent_id(client: &reqwest::Client, secret: &str) -> Result<String> {
    let v = call(client, "/agents/rundata", Some(secret), json!({})).await?;
    v.get("agent_id").and_then(Value::as_str).map(String::from).ok_or_else(|| Error::Other("playit.gg didn't return the agent id".into()))
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Tunnel {
    pub id: String,
    pub name: Option<String>,
    pub local_port: Option<u16>,
    /// The address friends type in, once playit has assigned one.
    pub address: Option<String>,
    pub active: bool,
}

fn parse_tunnel(t: &Value) -> Tunnel {
    let alloc = t.get("alloc");
    let address = match alloc.and_then(|a| a.get("status")).and_then(Value::as_str) {
        Some("allocated") => alloc.and_then(|a| a.get("data")).map(|d| {
            let domain = d.get("assigned_domain").and_then(Value::as_str).unwrap_or_default();
            let port = d.get("port_start").and_then(Value::as_u64).unwrap_or(25565);
            // Minecraft tunnels get an SRV record, so the bare domain works without a port.
            match d.get("assigned_srv").and_then(Value::as_str) {
                Some(srv) if !srv.is_empty() => srv.to_string(),
                _ if port == 25565 => domain.to_string(),
                _ => format!("{domain}:{port}"),
            }
        }),
        _ => None,
    };
    let local_port = t.pointer("/origin/data/local_port").and_then(Value::as_u64).map(|p| p as u16);
    Tunnel {
        id: t.get("id").and_then(Value::as_str).unwrap_or_default().to_string(),
        name: t.get("name").and_then(Value::as_str).map(String::from),
        local_port,
        address: address.filter(|a| !a.is_empty()),
        active: t.get("active").and_then(Value::as_bool).unwrap_or(false),
    }
}

pub async fn tunnels(client: &reqwest::Client, secret: &str, agent: &str) -> Result<Vec<Tunnel>> {
    let v = call(client, "/tunnels/list", Some(secret), json!({ "tunnel_id": null, "agent_id": agent })).await?;
    Ok(v.get("tunnels").and_then(Value::as_array).map(|a| a.iter().map(parse_tunnel).collect()).unwrap_or_default())
}

pub fn tunnel_name(server_id: &str) -> String {
    format!("ember-{}", server_id.chars().take(24).collect::<String>())
}

/// Find this server's tunnel, creating it (or re-pointing it to a changed port).
pub async fn ensure_tunnel(client: &reqwest::Client, secret: &str, server_id: &str, port: u16) -> Result<Tunnel> {
    let agent = agent_id(client, secret).await?;
    let name = tunnel_name(server_id);
    let existing = tunnels(client, secret, &agent).await?;
    if let Some(t) = existing.iter().find(|t| t.name.as_deref() == Some(name.as_str())) {
        if t.local_port.is_none_or(|p| p == port) {
            return Ok(t.clone());
        }
        let _ = call(client, "/tunnels/delete", Some(secret), json!({ "tunnel_id": t.id })).await;
    }
    let id = call(
        client,
        "/tunnels/create",
        Some(secret),
        json!({
            "name": name,
            "tunnel_type": "minecraft-java",
            "port_type": "tcp",
            "port_count": 1,
            "origin": { "type": "agent", "data": { "agent_id": agent, "local_ip": "127.0.0.1", "local_port": port } },
            "enabled": true,
            "alloc": null,
            "firewall_id": null,
            "proxy_protocol": null
        }),
    )
    .await?;
    let id = id.get("id").and_then(Value::as_str).or(id.as_str()).unwrap_or_default().to_string();
    Ok(Tunnel { id, name: Some(name), local_port: Some(port), address: None, active: false })
}

/// Current state of this server's tunnel (address appears a few seconds after creation).
pub async fn tunnel_for(client: &reqwest::Client, secret: &str, server_id: &str) -> Result<Option<Tunnel>> {
    let agent = agent_id(client, secret).await?;
    let name = tunnel_name(server_id);
    Ok(tunnels(client, secret, &agent).await?.into_iter().find(|t| t.name.as_deref() == Some(name.as_str())))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn claim_codes_are_hex() {
        let c = new_claim_code();
        assert_eq!(c.len(), 10);
        assert!(c.chars().all(|ch| ch.is_ascii_hexdigit()));
        assert_eq!(claim_url("abc"), "https://playit.gg/claim/abc");
    }

    #[test]
    fn parses_tunnel_address() {
        let t = parse_tunnel(&json!({
            "id": "t1", "name": "ember-x", "active": true,
            "origin": { "type": "agent", "data": { "agent_id": "a", "local_ip": "127.0.0.1", "local_port": 25565 } },
            "alloc": { "status": "allocated", "data": { "assigned_domain": "bright-fox.joinmc.link", "assigned_srv": "bright-fox.joinmc.link", "port_start": 41234 } }
        }));
        assert_eq!(t.address.as_deref(), Some("bright-fox.joinmc.link"));
        assert_eq!(t.local_port, Some(25565));
        let p = parse_tunnel(&json!({ "id": "t2", "alloc": { "status": "allocated", "data": { "assigned_domain": "x.ply.gg", "port_start": 4000 } } }));
        assert_eq!(p.address.as_deref(), Some("x.ply.gg:4000"));
        let pending = parse_tunnel(&json!({ "id": "t3", "alloc": { "status": "pending" } }));
        assert!(pending.address.is_none());
    }
}
