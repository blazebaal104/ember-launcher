//! Microsoft account -> Xbox Live -> XSTS -> Minecraft services.
//!
//! Uses the OAuth 2.0 *device code* flow: no embedded browser, no redirect URI, works
//! well in a desktop app ("go to microsoft.com/link and enter ABCD-EFGH").
//!
//! REQUIREMENTS (outside the code):
//!  * Register an Azure app (personal Microsoft accounts, public client, "Allow public
//!    client flows" ON) and put its client id in `EMBER_MSA_CLIENT_ID`.
//!  * New Azure apps must be approved by Mojang for the Minecraft services API
//!    (https://aka.ms/mce-reviewappid). Until approved, `login_with_xbox` returns 403.
//!  * Store refresh tokens in the OS keychain (the Tauri shell does this), never in plain JSON.
use crate::{Error, Result};
use serde::{Deserialize, Serialize};
use serde_json::json;

const MS_DEVICE_CODE: &str = "https://login.microsoftonline.com/consumers/oauth2/v2.0/devicecode";
const MS_TOKEN: &str = "https://login.microsoftonline.com/consumers/oauth2/v2.0/token";
const XBL_AUTH: &str = "https://user.auth.xboxlive.com/user/authenticate";
const XSTS_AUTH: &str = "https://xsts.auth.xboxlive.com/xsts/authorize";
const MC_LOGIN: &str = "https://api.minecraftservices.com/authentication/login_with_xbox";
const MC_ENTITLEMENTS: &str = "https://api.minecraftservices.com/entitlements/mcstore";
const MC_PROFILE: &str = "https://api.minecraftservices.com/minecraft/profile";
const SCOPE: &str = "XboxLive.signin offline_access";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceCode {
    pub device_code: String,
    pub user_code: String,
    pub verification_uri: String,
    pub expires_in: u64,
    pub interval: u64,
    pub message: String,
}

#[derive(Debug, Clone, Deserialize)]
struct MsToken {
    access_token: String,
    refresh_token: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Account {
    pub uuid: String,
    pub username: String,
    pub xuid: String,
    pub mc_access_token: String,
    /// Unix seconds.
    pub mc_expires_at: i64,
    /// Persist this one (keychain) to sign in silently next time.
    pub ms_refresh_token: String,
    pub skin_url: Option<String>,
}

pub struct MicrosoftAuth {
    client: reqwest::Client,
    client_id: String,
}

impl MicrosoftAuth {
    pub fn new(client: reqwest::Client, client_id: impl Into<String>) -> Self {
        Self { client, client_id: client_id.into() }
    }

    /// Step 1: show `user_code` + `verification_uri` to the user.
    pub async fn start_device_flow(&self) -> Result<DeviceCode> {
        if !is_valid_client_id(&self.client_id) {
            return Err(Error::NoClientId);
        }
        let res = self
            .client
            .post(MS_DEVICE_CODE)
            .form(&[("client_id", self.client_id.as_str()), ("scope", SCOPE)])
            .send()
            .await?;
        if !res.status().is_success() {
            let body: serde_json::Value = res.json().await.unwrap_or_default();
            return Err(classify_ms_error(body["error"].as_str().unwrap_or(""), body["error_description"].as_str().unwrap_or("")));
        }
        Ok(res.json().await?)
    }

    /// Step 2: poll until the user finished signing in, then run the full chain.
    pub async fn complete_device_flow(&self, code: &DeviceCode) -> Result<Account> {
        let mut interval = code.interval.max(1);
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(code.expires_in);
        loop {
            if std::time::Instant::now() > deadline {
                return Err(Error::Auth("device code expired, please try again".into()));
            }
            tokio::time::sleep(std::time::Duration::from_secs(interval)).await;
            let res = self
                .client
                .post(MS_TOKEN)
                .form(&[
                    ("client_id", self.client_id.as_str()),
                    ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
                    ("device_code", code.device_code.as_str()),
                ])
                .send()
                .await?;
            if res.status().is_success() {
                let token: MsToken = res.json().await?;
                return self.minecraft_login(token).await;
            }
            let err: serde_json::Value = res.json().await.unwrap_or_default();
            match err["error"].as_str() {
                Some("authorization_pending") => continue,
                Some("slow_down") => interval += 5,
                Some(other) => return Err(classify_ms_error(other, err["error_description"].as_str().unwrap_or(""))),
                None => return Err(Error::Auth("unexpected token response".into())),
            }
        }
    }

    /// Silent sign-in with a stored refresh token.
    pub async fn refresh(&self, refresh_token: &str) -> Result<Account> {
        let res = self
            .client
            .post(MS_TOKEN)
            .form(&[
                ("client_id", self.client_id.as_str()),
                ("grant_type", "refresh_token"),
                ("refresh_token", refresh_token),
                ("scope", SCOPE),
            ])
            .send()
            .await?;
        if !res.status().is_success() {
            let body: serde_json::Value = res.json().await.unwrap_or_default();
            return Err(match body["error"].as_str() {
                // Revoked, expired (90 days unused) or issued to another client id.
                Some("invalid_grant") | Some("unauthorized_client") => Error::NotSignedIn,
                Some(e) => classify_ms_error(e, body["error_description"].as_str().unwrap_or("")),
                None => Error::NotSignedIn,
            });
        }
        self.minecraft_login(res.json().await?).await
    }

    async fn minecraft_login(&self, ms: MsToken) -> Result<Account> {
        // Xbox Live user token
        let xbl: serde_json::Value = self
            .client
            .post(XBL_AUTH)
            .json(&json!({
                "Properties": { "AuthMethod": "RPS", "SiteName": "user.auth.xboxlive.com", "RpsTicket": format!("d={}", ms.access_token) },
                "RelyingParty": "http://auth.xboxlive.com",
                "TokenType": "JWT"
            }))
            .send()
            .await?
            .error_for_status()?
            .json()
            .await?;
        let xbl_token = xbl["Token"].as_str().ok_or_else(|| Error::Auth("no XBL token".into()))?;

        // XSTS token for Minecraft services
        let res = self
            .client
            .post(XSTS_AUTH)
            .json(&json!({
                "Properties": { "SandboxId": "RETAIL", "UserTokens": [xbl_token] },
                "RelyingParty": "rp://api.minecraftservices.com/",
                "TokenType": "JWT"
            }))
            .send()
            .await?;
        if res.status() == reqwest::StatusCode::UNAUTHORIZED {
            let body: serde_json::Value = res.json().await.unwrap_or_default();
            return Err(Error::Auth(xsts_error(body["XErr"].as_u64().unwrap_or(0))));
        }
        let xsts: serde_json::Value = res.error_for_status()?.json().await?;
        let xsts_token = xsts["Token"].as_str().ok_or_else(|| Error::Auth("no XSTS token".into()))?;
        let uhs = xsts["DisplayClaims"]["xui"][0]["uhs"].as_str().ok_or_else(|| Error::Auth("no user hash".into()))?;
        let xuid = xsts["DisplayClaims"]["xui"][0]["xid"].as_str().unwrap_or_default().to_string();

        // Minecraft access token
        let res = self
            .client
            .post(MC_LOGIN)
            .json(&json!({ "identityToken": format!("XBL3.0 x={uhs};{xsts_token}") }))
            .send()
            .await?;
        if !res.status().is_success() {
            let status = res.status().as_u16();
            let body = res.text().await.unwrap_or_default();
            return Err(classify_mc_login(status, &body));
        }
        let mc: serde_json::Value = res.json().await?;
        let mc_token = mc["access_token"].as_str().ok_or_else(|| Error::Auth("no MC token".into()))?.to_string();
        let expires_in = mc["expires_in"].as_i64().unwrap_or(86_400);

        // Ownership + profile
        let ent: serde_json::Value =
            self.client.get(MC_ENTITLEMENTS).bearer_auth(&mc_token).send().await?.error_for_status()?.json().await?;
        if ent["items"].as_array().map(|a| a.is_empty()).unwrap_or(true) {
            return Err(Error::NoEntitlement);
        }
        let profile = self.client.get(MC_PROFILE).bearer_auth(&mc_token).send().await?;
        if profile.status() == reqwest::StatusCode::NOT_FOUND {
            return Err(Error::Auth("this account has no Minecraft profile yet - launch the official launcher once to create it".into()));
        }
        let profile: serde_json::Value = profile.error_for_status()?.json().await?;

        Ok(Account {
            uuid: profile["id"].as_str().unwrap_or_default().to_string(),
            username: profile["name"].as_str().unwrap_or_default().to_string(),
            xuid,
            mc_access_token: mc_token,
            mc_expires_at: chrono::Utc::now().timestamp() + expires_in,
            ms_refresh_token: ms.refresh_token,
            skin_url: profile["skins"][0]["url"].as_str().map(String::from),
        })
    }
}

fn xsts_error(code: u64) -> String {
    match code {
        2148916233 => "This Microsoft account has no Xbox profile. Sign in at xbox.com once to create one.".into(),
        2148916235 => "Xbox Live is not available in your country/region.".into(),
        2148916236 | 2148916237 => "This account needs adult verification on xbox.com (South Korea).".into(),
        2148916238 => "This is a child account - it must be added to a Microsoft Family by an adult.".into(),
        _ => format!("Xbox authorization failed (XErr {code})"),
    }
}

/// Azure client ids are GUIDs.
pub fn is_valid_client_id(id: &str) -> bool {
    let id = id.trim();
    id.len() == 36
        && id != "00000000-0000-0000-0000-000000000000"
        && id.chars().enumerate().all(|(i, c)| if [8, 13, 18, 23].contains(&i) { c == '-' } else { c.is_ascii_hexdigit() })
}

/// Turn Microsoft identity platform errors into something a player can act on.
pub fn classify_ms_error(error: &str, description: &str) -> Error {
    let d = description;
    if d.contains("AADSTS700016") {
        return Error::AppMisconfigured("Microsoft doesn't know this client ID. Copy the \"Application (client) ID\" from the app's Overview page in Azure.".into());
    }
    if d.contains("AADSTS7000218") || d.contains("AADSTS70002") {
        return Error::AppMisconfigured("Public client flows are off. In Azure open your app > Authentication > Advanced settings and set \"Allow public client flows\" to Yes, then Save.".into());
    }
    if d.contains("AADSTS50059") || d.contains("AADSTS9002331") || d.contains("not enabled for consumers") || d.contains("AADSTS700051") {
        return Error::AppMisconfigured("This app doesn't accept personal Microsoft accounts. Create the app registration with \"Personal Microsoft accounts\" (or \"any organizational directory and personal accounts\") as the supported account type.".into());
    }
    match error {
        "expired_token" => Error::Auth("the sign-in code expired, start again".into()),
        "authorization_declined" | "access_denied" => Error::Auth("sign-in was cancelled".into()),
        "bad_verification_code" => Error::Auth("the sign-in code wasn't recognised, start again".into()),
        "" => Error::Auth("Microsoft returned an unexpected error".into()),
        other => Error::Auth(format!("{other}: {}", d.lines().next().unwrap_or(""))),
    }
}

/// `api.minecraftservices.com/authentication/login_with_xbox` failure.
pub fn classify_mc_login(status: u16, body: &str) -> Error {
    if status == 403 && (body.contains("Invalid app registration") || body.contains("AppRegInfo")) {
        return Error::AppNotApproved;
    }
    if status == 429 {
        return Error::Auth("too many sign-in attempts, wait a minute and try again".into());
    }
    Error::Auth(format!("Minecraft services refused the login (HTTP {status})"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn client_id_validation() {
        assert!(is_valid_client_id("c36a9fb6-4f2a-41ff-90bd-ae7cc92031eb"));
        assert!(is_valid_client_id(" c36a9fb6-4f2a-41ff-90bd-ae7cc92031eb "));
        assert!(!is_valid_client_id("00000000-0000-0000-0000-000000000000"));
        assert!(!is_valid_client_id("not-a-guid"));
        assert!(!is_valid_client_id("c36a9fb6x4f2a-41ff-90bd-ae7cc92031eb"));
    }

    #[test]
    fn unapproved_app_is_recognised() {
        let body = r#"{"path":"/authentication/login_with_xbox","errorMessage":"Invalid app registration, see https://aka.ms/AppRegInfo for more information"}"#;
        assert!(matches!(classify_mc_login(403, body), Error::AppNotApproved));
        assert!(matches!(classify_mc_login(500, ""), Error::Auth(_)));
    }

    #[test]
    fn azure_misconfiguration_is_explained() {
        let e = classify_ms_error("invalid_client", "AADSTS7000218: The request body must contain the following parameter: 'client_assertion' or 'client_secret'.");
        assert!(e.to_string().contains("Allow public client flows"));
        let e = classify_ms_error("unauthorized_client", "AADSTS700016: Application with identifier 'x' was not found");
        assert!(e.to_string().contains("client ID"));
        assert!(matches!(classify_ms_error("expired_token", ""), Error::Auth(_)));
    }
}
