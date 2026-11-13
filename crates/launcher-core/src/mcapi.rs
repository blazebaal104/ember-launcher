//! The signed-in player's Minecraft profile (api.minecraftservices.com): skins, capes, name
//! changes and multiplayer privileges. Every call takes the Minecraft access token from
//! [`crate::auth::Account`].
use crate::{Error, Result};
use base64::Engine;
use serde::{Deserialize, Serialize};

const API: &str = "https://api.minecraftservices.com";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Skin {
    pub id: String,
    pub state: String,
    pub url: String,
    /// CLASSIC (wide arms, "Steve") or SLIM ("Alex").
    pub variant: String,
    #[serde(default)]
    pub alias: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Cape {
    pub id: String,
    pub state: String,
    pub url: String,
    #[serde(default)]
    pub alias: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub skins: Vec<Skin>,
    #[serde(default)]
    pub capes: Vec<Cape>,
}

impl Profile {
    pub fn active_skin(&self) -> Option<&Skin> {
        self.skins.iter().find(|s| s.state == "ACTIVE")
    }

    pub fn active_cape(&self) -> Option<&Cape> {
        self.capes.iter().find(|c| c.state == "ACTIVE")
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct NameChange {
    /// When the name was last changed (ISO 8601), if ever.
    #[serde(default)]
    pub changed_at: Option<String>,
    #[serde(default)]
    pub created_at: Option<String>,
    #[serde(default)]
    pub name_change_allowed: bool,
}

/// What the account is allowed to do in multiplayer, and any active ban.
#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Privileges {
    pub online_chat: bool,
    pub multiplayer_server: bool,
    pub multiplayer_realms: bool,
    pub telemetry: bool,
    pub profanity_filter: bool,
    /// e.g. "Multiplayer ban until 2026-12-01" (none when empty).
    pub bans: Vec<String>,
}

fn auth(req: reqwest::RequestBuilder, token: &str) -> reqwest::RequestBuilder {
    req.bearer_auth(token).header("Accept", "application/json")
}

async fn check(res: reqwest::Response) -> Result<reqwest::Response> {
    let status = res.status();
    if status.is_success() {
        return Ok(res);
    }
    let body = res.text().await.unwrap_or_default();
    let msg = serde_json::from_str::<serde_json::Value>(&body)
        .ok()
        .and_then(|v| v["errorMessage"].as_str().or(v["error"].as_str()).map(str::to_string))
        .unwrap_or(body);
    Err(match status.as_u16() {
        401 => Error::NotSignedIn,
        429 => Error::Other("Minecraft's servers say: too many requests. Wait a minute and try again.".into()),
        _ => Error::Other(if msg.trim().is_empty() { format!("Minecraft services answered {status}") } else { msg }),
    })
}

pub async fn profile(client: &reqwest::Client, token: &str) -> Result<Profile> {
    Ok(check(auth(client.get(format!("{API}/minecraft/profile")), token).send().await?).await?.json().await?)
}

/// Upload a 64x64 (or legacy 64x32) PNG as the new skin.
pub async fn upload_skin(client: &reqwest::Client, token: &str, png: Vec<u8>, slim: bool) -> Result<Profile> {
    if png.len() < 8 || &png[..8] != b"\x89PNG\r\n\x1a\n" {
        return Err(Error::Other("that file isn't a PNG image".into()));
    }
    let part = reqwest::multipart::Part::bytes(png).file_name("skin.png").mime_str("image/png").map_err(|e| Error::Other(e.to_string()))?;
    let form = reqwest::multipart::Form::new().text("variant", if slim { "slim" } else { "classic" }).part("file", part);
    Ok(check(auth(client.post(format!("{API}/minecraft/profile/skins")), token).multipart(form).send().await?).await?.json().await?)
}

/// Back to the default skin.
pub async fn reset_skin(client: &reqwest::Client, token: &str) -> Result<Profile> {
    Ok(check(auth(client.delete(format!("{API}/minecraft/profile/skins/active")), token).send().await?).await?.json().await?)
}

/// Show a cape you own, or hide it with `None`.
pub async fn set_cape(client: &reqwest::Client, token: &str, cape_id: Option<&str>) -> Result<Profile> {
    let req = match cape_id {
        Some(id) => client.put(format!("{API}/minecraft/profile/capes/active")).json(&serde_json::json!({ "capeId": id })),
        None => client.delete(format!("{API}/minecraft/profile/capes/active")),
    };
    Ok(check(auth(req, token).send().await?).await?.json().await?)
}

pub async fn name_change_info(client: &reqwest::Client, token: &str) -> Result<NameChange> {
    Ok(check(auth(client.get(format!("{API}/minecraft/profile/namechange")), token).send().await?).await?.json().await?)
}

/// "AVAILABLE", "DUPLICATE" (taken) or "NOT_ALLOWED" (invalid or blocked word).
pub async fn name_available(client: &reqwest::Client, token: &str, name: &str) -> Result<String> {
    if !valid_name(name) {
        return Ok("NOT_ALLOWED".into());
    }
    let v: serde_json::Value = check(auth(client.get(format!("{API}/minecraft/profile/name/{name}/available")), token).send().await?).await?.json().await?;
    Ok(v["status"].as_str().unwrap_or("NOT_ALLOWED").to_string())
}

pub async fn change_name(client: &reqwest::Client, token: &str, name: &str) -> Result<Profile> {
    if !valid_name(name) {
        return Err(Error::Other("names are 3 to 16 characters: letters, numbers and _".into()));
    }
    let res = auth(client.put(format!("{API}/minecraft/profile/name/{name}")), token).send().await?;
    match res.status().as_u16() {
        400 => Err(Error::Other("that name isn't allowed".into())),
        403 => Err(Error::Other("you can only change your name once every 30 days".into())),
        409 => Err(Error::Other("that name is already taken".into())),
        _ => Ok(check(res).await?.json().await?),
    }
}

pub fn valid_name(name: &str) -> bool {
    (3..=16).contains(&name.len()) && name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_')
}

pub async fn privileges(client: &reqwest::Client, token: &str) -> Result<Privileges> {
    let v: serde_json::Value = check(auth(client.get(format!("{API}/player/attributes")), token).send().await?).await?.json().await?;
    let p = &v["privileges"];
    let on = |k: &str| p[k]["enabled"].as_bool().unwrap_or(true);
    let mut bans = Vec::new();
    if let Some(scopes) = v["banStatus"]["bannedScopes"].as_object() {
        for (scope, ban) in scopes {
            let until = ban["expires"].as_i64().map(|ms| {
                crate::chrono::DateTime::<crate::chrono::Utc>::from_timestamp_millis(ms).map(|d| d.format("%Y-%m-%d").to_string()).unwrap_or_default()
            });
            let reason = ban["reason"].as_str().unwrap_or("").replace('_', " ").to_lowercase();
            bans.push(format!(
                "{} ban{}{}",
                scope.to_lowercase(),
                until.map(|u| format!(" until {u}")).unwrap_or_else(|| " (permanent)".into()),
                if reason.is_empty() { String::new() } else { format!(": {reason}") }
            ));
        }
    }
    Ok(Privileges {
        online_chat: on("onlineChat"),
        multiplayer_server: on("multiplayerServer"),
        multiplayer_realms: on("multiplayerRealms"),
        telemetry: on("telemetry"),
        profanity_filter: v["profanityFilterPreferences"]["profanityFilterOn"].as_bool().unwrap_or(false),
        bans,
    })
}

/// A skin/cape texture as a data: URL, so the app can show it without loading remote images.
pub async fn texture_data_url(client: &reqwest::Client, url: &str) -> Result<String> {
    if !(url.starts_with("http://textures.minecraft.net/") || url.starts_with("https://textures.minecraft.net/")) {
        return Err(Error::Other("not a Minecraft texture".into()));
    }
    let bytes = client.get(url.replacen("http://", "https://", 1)).send().await?.error_for_status()?.bytes().await?;
    Ok(format!("data:image/png;base64,{}", base64::engine::general_purpose::STANDARD.encode(&bytes)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names() {
        assert!(valid_name("Steve_42"));
        assert!(!valid_name("ab"));
        assert!(!valid_name("seventeen_chars_x"));
        assert!(!valid_name("bad name"));
    }

    #[test]
    fn profile_parses() {
        let p: Profile = serde_json::from_str(r#"{"id":"abc","name":"Elena","skins":[{"id":"1","state":"ACTIVE","url":"http://textures.minecraft.net/texture/x","variant":"SLIM","alias":"alex"}],"capes":[{"id":"c","state":"INACTIVE","url":"http://textures.minecraft.net/texture/y","alias":"Migrator"}]}"#).unwrap();
        assert_eq!(p.active_skin().unwrap().variant, "SLIM");
        assert!(p.active_cape().is_none());
    }
}
