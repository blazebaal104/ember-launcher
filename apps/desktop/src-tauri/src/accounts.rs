//! Minecraft accounts: Microsoft sign-in (device code), several accounts with one active,
//! and everything on the Account page (profile, skins, capes, name, privileges, skin library).
//!
//! Each account's Microsoft refresh token is kept in the OS keychain under its own entry
//! ("refresh:<uuid>"), falling back to a file in the user's profile folder when the keychain
//! refuses it. The list of accounts (names only, no secrets) is auth/accounts.json.
use crate::state::{AppState, KEYRING_SERVICE, KEYRING_USER};
use base64::Engine;
use launcher_core::auth::{Account, DeviceCode};
use launcher_core::{mcapi, Error, Result};
use serde::{Deserialize, Serialize};
use tauri::State;

// ------------------------------------------------------------------ account list

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
struct StoredAccount {
    uuid: String,
    username: String,
    added_at: i64,
    last_used: i64,
    /// The refresh token stopped working (password change, removed app): sign in again.
    #[serde(default)]
    needs_sign_in: bool,
}

#[derive(Serialize, Deserialize, Default)]
struct Store {
    active: Option<String>,
    accounts: Vec<StoredAccount>,
}

fn now() -> i64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs() as i64).unwrap_or(0)
}

fn auth_dir(state: &AppState) -> std::path::PathBuf {
    state.paths.root().join("auth")
}

async fn load_store(state: &AppState) -> Store {
    match tokio::fs::read(auth_dir(state).join("accounts.json")).await {
        Ok(b) => serde_json::from_slice(&b).unwrap_or_default(),
        Err(_) => Store::default(),
    }
}

async fn save_store(state: &AppState, store: &Store) {
    let dir = auth_dir(state);
    let _ = tokio::fs::create_dir_all(&dir).await;
    let _ = tokio::fs::write(dir.join("accounts.json"), serde_json::to_vec_pretty(store).unwrap_or_default()).await;
}

// ------------------------------------------------------------------ tokens

fn token_file(state: &AppState, uuid: &str) -> std::path::PathBuf {
    auth_dir(state).join("tokens").join(uuid.replace(|c: char| !c.is_ascii_alphanumeric(), ""))
}

async fn store_token(state: &AppState, uuid: &str, token: &str) {
    let key = format!("refresh:{uuid}");
    match keyring::Entry::new(KEYRING_SERVICE, &key).and_then(|e| e.set_password(token)) {
        Ok(()) => {
            let _ = tokio::fs::remove_file(token_file(state, uuid)).await;
        }
        Err(e) => {
            // Windows Credential Manager caps secrets at ~2.5 KB; keep it in the profile folder.
            tracing::warn!(error = %e, "keychain refused the refresh token, storing it in the profile folder");
            let path = token_file(state, uuid);
            if let Some(dir) = path.parent() {
                let _ = tokio::fs::create_dir_all(dir).await;
            }
            if tokio::fs::write(&path, token).await.is_ok() {
                #[cfg(unix)]
                {
                    use std::os::unix::fs::PermissionsExt;
                    let _ = tokio::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600)).await;
                }
            }
        }
    }
}

async fn load_token(state: &AppState, uuid: &str) -> Option<String> {
    if let Ok(t) = keyring::Entry::new(KEYRING_SERVICE, &format!("refresh:{uuid}")).and_then(|e| e.get_password()) {
        return Some(t);
    }
    tokio::fs::read_to_string(token_file(state, uuid)).await.ok().map(|t| t.trim().to_string()).filter(|t| !t.is_empty())
}

async fn delete_token(state: &AppState, uuid: &str) {
    if let Ok(e) = keyring::Entry::new(KEYRING_SERVICE, &format!("refresh:{uuid}")) {
        let _ = e.delete_credential();
    }
    let _ = tokio::fs::remove_file(token_file(state, uuid)).await;
}

/// Ember 0.5 and older kept one token under a fixed name; turn it into a listed account.
async fn migrate_single_account(state: &AppState, store: &mut Store) {
    if !store.accounts.is_empty() {
        return;
    }
    let old = match keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER).and_then(|e| e.get_password()) {
        Ok(t) => Some(t),
        Err(_) => tokio::fs::read_to_string(auth_dir(state).join("refresh_token")).await.ok().map(|t| t.trim().to_string()),
    };
    let Some(old) = old.filter(|t| !t.is_empty()) else { return };
    if let Ok(acc) = state.auth().await.refresh(&old).await {
        store_token(state, &acc.uuid, &acc.ms_refresh_token).await;
        store.accounts.push(StoredAccount { uuid: acc.uuid.clone(), username: acc.username.clone(), added_at: now(), last_used: now(), needs_sign_in: false });
        store.active = Some(acc.uuid.clone());
        save_store(state, store).await;
        *state.account.lock().await = Some(acc);
        if let Ok(e) = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER) {
            let _ = e.delete_credential();
        }
        let _ = tokio::fs::remove_file(auth_dir(state).join("refresh_token")).await;
    }
}

/// The active account with a fresh Minecraft token (refreshing silently when needed).
pub async fn ensure_account(state: &AppState) -> Result<Account> {
    let mut store = load_store(state).await;
    migrate_single_account(state, &mut store).await;
    let active = store.active.clone().or_else(|| store.accounts.first().map(|a| a.uuid.clone())).ok_or(Error::NotSignedIn)?;
    let mut guard = state.account.lock().await;
    if let Some(a) = guard.as_ref() {
        if a.uuid == active && a.mc_expires_at - 300 > now() {
            return Ok(a.clone());
        }
    }
    let refresh = match guard.as_ref().filter(|a| a.uuid == active) {
        Some(a) => a.ms_refresh_token.clone(),
        None => load_token(state, &active).await.ok_or(Error::NotSignedIn)?,
    };
    let fresh = match state.auth().await.refresh(&refresh).await {
        Ok(a) => a,
        Err(Error::NotSignedIn) => {
            *guard = None;
            if let Some(s) = store.accounts.iter_mut().find(|a| a.uuid == active) {
                s.needs_sign_in = true;
            }
            save_store(state, &store).await;
            return Err(Error::NotSignedIn);
        }
        Err(e) => return Err(e),
    };
    store_token(state, &fresh.uuid, &fresh.ms_refresh_token).await;
    if let Some(s) = store.accounts.iter_mut().find(|a| a.uuid == fresh.uuid) {
        s.username = fresh.username.clone();
        s.last_used = now();
        s.needs_sign_in = false;
    }
    save_store(state, &store).await;
    *guard = Some(fresh.clone());
    Ok(fresh)
}

// ------------------------------------------------------------------ sign-in

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AccountSummary {
    username: String,
    uuid: String,
    skin_url: Option<String>,
}

impl From<&Account> for AccountSummary {
    fn from(a: &Account) -> Self {
        Self { username: a.username.clone(), uuid: a.uuid.clone(), skin_url: a.skin_url.clone() }
    }
}

#[tauri::command]
pub async fn login_start(state: State<'_, AppState>) -> Result<DeviceCode> {
    let code = state.auth().await.start_device_flow().await?;
    *state.pending_login.lock().await = Some(code.clone());
    Ok(code)
}

/// Abandon a pending device-code sign-in (the poll stops at its next tick).
#[tauri::command]
pub async fn login_cancel(state: State<'_, AppState>) -> Result<()> {
    *state.pending_login.lock().await = None;
    Ok(())
}

async fn wait_cancelled(state: &AppState, device_code: &str) {
    loop {
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        let pending = state.pending_login.lock().await;
        if pending.as_ref().map(|p| p.device_code.as_str()) != Some(device_code) {
            return;
        }
    }
}

/// Finish signing in: the account is added to the list (or refreshed) and becomes active.
#[tauri::command]
pub async fn login_finish(state: State<'_, AppState>) -> Result<AccountSummary> {
    let code = state.pending_login.lock().await.clone().ok_or_else(|| Error::Auth("no sign-in in progress".into()))?;
    let auth = state.auth().await;
    let account = tokio::select! {
        r = auth.complete_device_flow(&code) => r?,
        _ = wait_cancelled(&state, &code.device_code) => return Err(Error::Auth("sign-in was cancelled".into())),
    };
    *state.pending_login.lock().await = None;
    store_token(&state, &account.uuid, &account.ms_refresh_token).await;
    let mut store = load_store(&state).await;
    match store.accounts.iter_mut().find(|a| a.uuid == account.uuid) {
        Some(s) => {
            s.username = account.username.clone();
            s.last_used = now();
            s.needs_sign_in = false;
        }
        None => store.accounts.push(StoredAccount { uuid: account.uuid.clone(), username: account.username.clone(), added_at: now(), last_used: now(), needs_sign_in: false }),
    }
    store.active = Some(account.uuid.clone());
    save_store(&state, &store).await;
    let summary = AccountSummary::from(&account);
    *state.account.lock().await = Some(account);
    Ok(summary)
}

/// Silent sign-in on startup.
#[tauri::command]
pub async fn current_account(state: State<'_, AppState>) -> Result<Option<AccountSummary>> {
    Ok(ensure_account(&state).await.ok().map(|a| AccountSummary::from(&a)))
}

/// Sign out of the active account (removes it from Ember); switches to another if there is one.
#[tauri::command]
pub async fn logout(state: State<'_, AppState>) -> Result<()> {
    let store = load_store(&state).await;
    if let Some(uuid) = store.active.clone() {
        account_remove(state, uuid).await?;
    }
    Ok(())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountListItem {
    uuid: String,
    username: String,
    active: bool,
    needs_sign_in: bool,
    last_used: i64,
}

#[tauri::command]
pub async fn accounts_list(state: State<'_, AppState>) -> Result<Vec<AccountListItem>> {
    let mut store = load_store(&state).await;
    migrate_single_account(&state, &mut store).await;
    let active = store.active.clone();
    Ok(store
        .accounts
        .iter()
        .map(|a| AccountListItem { uuid: a.uuid.clone(), username: a.username.clone(), active: Some(&a.uuid) == active.as_ref(), needs_sign_in: a.needs_sign_in, last_used: a.last_used })
        .collect())
}

#[tauri::command]
pub async fn account_switch(state: State<'_, AppState>, uuid: String) -> Result<AccountSummary> {
    let mut store = load_store(&state).await;
    if !store.accounts.iter().any(|a| a.uuid == uuid) {
        return Err(Error::Other("that account isn't in Ember any more".into()));
    }
    store.active = Some(uuid);
    save_store(&state, &store).await;
    *state.account.lock().await = None;
    let a = ensure_account(&state).await?;
    Ok(AccountSummary::from(&a))
}

#[tauri::command]
pub async fn account_remove(state: State<'_, AppState>, uuid: String) -> Result<()> {
    let mut store = load_store(&state).await;
    store.accounts.retain(|a| a.uuid != uuid);
    if store.active.as_deref() == Some(uuid.as_str()) {
        store.active = store.accounts.first().map(|a| a.uuid.clone());
        *state.account.lock().await = None;
    }
    save_store(&state, &store).await;
    delete_token(&state, &uuid).await;
    Ok(())
}

// ------------------------------------------------------------------ profile

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountDetails {
    profile: mcapi::Profile,
    privileges: Option<mcapi::Privileges>,
    name_change: Option<mcapi::NameChange>,
    /// Active skin and cape as data: URLs for the 3D preview.
    skin_data: Option<String>,
    cape_data: Option<String>,
    slim: bool,
    /// Every cape the account owns, as data: URLs (id -> image).
    cape_images: std::collections::HashMap<String, String>,
}

async fn details_for(state: &AppState, token: &str, profile: mcapi::Profile) -> AccountDetails {
    let c = &state.client;
    let (privileges, name_change) = tokio::join!(mcapi::privileges(c, token), mcapi::name_change_info(c, token));
    let skin = profile.active_skin().cloned();
    let skin_data = match &skin {
        Some(s) => mcapi::texture_data_url(c, &s.url).await.ok(),
        None => None,
    };
    let mut cape_images = std::collections::HashMap::new();
    for cape in &profile.capes {
        if let Ok(d) = mcapi::texture_data_url(c, &cape.url).await {
            cape_images.insert(cape.id.clone(), d);
        }
    }
    let cape_data = profile.active_cape().and_then(|c| cape_images.get(&c.id).cloned());
    AccountDetails {
        slim: skin.as_ref().map(|s| s.variant.eq_ignore_ascii_case("slim")).unwrap_or(false),
        profile,
        privileges: privileges.ok(),
        name_change: name_change.ok(),
        skin_data,
        cape_data,
        cape_images,
    }
}

#[tauri::command]
pub async fn account_details(state: State<'_, AppState>) -> Result<AccountDetails> {
    let a = ensure_account(&state).await?;
    let profile = mcapi::profile(&state.client, &a.mc_access_token).await?;
    Ok(details_for(&state, &a.mc_access_token, profile).await)
}

fn decode_png(data: &str) -> Result<Vec<u8>> {
    let b64 = data.split_once("base64,").map(|(_, b)| b).unwrap_or(data);
    base64::engine::general_purpose::STANDARD.decode(b64.trim()).map_err(|_| Error::Other("couldn't read that image".into()))
}

/// Upload a skin (PNG as base64 / data: URL). Also keeps a copy in the skin library.
#[tauri::command]
pub async fn account_upload_skin(state: State<'_, AppState>, data: String, slim: bool, name: Option<String>) -> Result<AccountDetails> {
    let png = decode_png(&data)?;
    check_skin_png(&png)?;
    let a = ensure_account(&state).await?;
    let profile = mcapi::upload_skin(&state.client, &a.mc_access_token, png.clone(), slim).await?;
    let _ = library_add(&state, name.unwrap_or_else(|| "Uploaded skin".into()), &png, slim).await;
    Ok(details_for(&state, &a.mc_access_token, profile).await)
}

/// Switch the current skin between wide (classic) and slim arms.
#[tauri::command]
pub async fn account_set_variant(state: State<'_, AppState>, slim: bool) -> Result<AccountDetails> {
    let a = ensure_account(&state).await?;
    let profile = mcapi::profile(&state.client, &a.mc_access_token).await?;
    let skin = profile.active_skin().ok_or_else(|| Error::Other("you're using the default skin".into()))?;
    let bytes = state.client.get(skin.url.replacen("http://", "https://", 1)).send().await?.error_for_status()?.bytes().await?;
    let profile = mcapi::upload_skin(&state.client, &a.mc_access_token, bytes.to_vec(), slim).await?;
    Ok(details_for(&state, &a.mc_access_token, profile).await)
}

#[tauri::command]
pub async fn account_reset_skin(state: State<'_, AppState>) -> Result<AccountDetails> {
    let a = ensure_account(&state).await?;
    let profile = mcapi::reset_skin(&state.client, &a.mc_access_token).await?;
    Ok(details_for(&state, &a.mc_access_token, profile).await)
}

#[tauri::command]
pub async fn account_set_cape(state: State<'_, AppState>, cape_id: Option<String>) -> Result<AccountDetails> {
    let a = ensure_account(&state).await?;
    let profile = mcapi::set_cape(&state.client, &a.mc_access_token, cape_id.as_deref()).await?;
    Ok(details_for(&state, &a.mc_access_token, profile).await)
}

#[tauri::command]
pub async fn account_name_check(state: State<'_, AppState>, name: String) -> Result<String> {
    let a = ensure_account(&state).await?;
    mcapi::name_available(&state.client, &a.mc_access_token, name.trim()).await
}

#[tauri::command]
pub async fn account_name_change(state: State<'_, AppState>, name: String) -> Result<AccountDetails> {
    let a = ensure_account(&state).await?;
    let profile = mcapi::change_name(&state.client, &a.mc_access_token, name.trim()).await?;
    // Keep the account list and the in-memory account in step with the new name.
    let mut store = load_store(&state).await;
    if let Some(s) = store.accounts.iter_mut().find(|s| s.uuid == a.uuid) {
        s.username = profile.name.clone();
    }
    save_store(&state, &store).await;
    if let Some(acc) = state.account.lock().await.as_mut() {
        acc.username = profile.name.clone();
    }
    Ok(details_for(&state, &a.mc_access_token, profile).await)
}

// ------------------------------------------------------------------ skin library

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LibrarySkin {
    id: String,
    name: String,
    slim: bool,
    added_at: i64,
    /// Filled in when listing (not stored).
    #[serde(default, skip_deserializing)]
    data: String,
}

fn library_dir(state: &AppState) -> std::path::PathBuf {
    state.paths.root().join("skins")
}

async fn library_index(state: &AppState) -> Vec<LibrarySkin> {
    match tokio::fs::read(library_dir(state).join("index.json")).await {
        Ok(b) => serde_json::from_slice(&b).unwrap_or_default(),
        Err(_) => Vec::new(),
    }
}

async fn library_save_index(state: &AppState, list: &[LibrarySkin]) -> Result<()> {
    let dir = library_dir(state);
    tokio::fs::create_dir_all(&dir).await?;
    tokio::fs::write(dir.join("index.json"), serde_json::to_vec_pretty(list).unwrap_or_default()).await?;
    Ok(())
}

/// Skins must be 64x64 (or the old 64x32) PNGs.
fn check_skin_png(png: &[u8]) -> Result<()> {
    if png.len() < 24 || &png[..8] != b"\x89PNG\r\n\x1a\n" {
        return Err(Error::Other("that file isn't a PNG image".into()));
    }
    let w = u32::from_be_bytes([png[16], png[17], png[18], png[19]]);
    let h = u32::from_be_bytes([png[20], png[21], png[22], png[23]]);
    if w != 64 || (h != 64 && h != 32) {
        return Err(Error::Other(format!("Minecraft skins are 64x64 pixels; this image is {w}x{h}")));
    }
    Ok(())
}

async fn library_add(state: &AppState, name: String, png: &[u8], slim: bool) -> Result<LibrarySkin> {
    let mut list = library_index(state).await;
    // Same image already saved? Just bring it to the top.
    let hash = {
        use sha2::Digest;
        hex::encode(&sha2::Sha256::digest(png)[..8])
    };
    if let Some(pos) = list.iter().position(|s| s.id == hash) {
        let s = list.remove(pos);
        list.insert(0, s.clone());
        library_save_index(state, &list).await?;
        return Ok(s);
    }
    tokio::fs::create_dir_all(library_dir(state)).await?;
    tokio::fs::write(library_dir(state).join(format!("{hash}.png")), png).await?;
    let skin = LibrarySkin { id: hash, name: name.chars().take(40).collect(), slim, added_at: now(), data: String::new() };
    list.insert(0, skin.clone());
    library_save_index(state, &list).await?;
    Ok(skin)
}

#[tauri::command]
pub async fn skins_list(state: State<'_, AppState>) -> Result<Vec<LibrarySkin>> {
    let mut list = library_index(&state).await;
    for s in &mut list {
        if let Ok(b) = tokio::fs::read(library_dir(&state).join(format!("{}.png", s.id))).await {
            s.data = format!("data:image/png;base64,{}", base64::engine::general_purpose::STANDARD.encode(b));
        }
    }
    list.retain(|s| !s.data.is_empty());
    Ok(list)
}

/// Save a PNG to the library without wearing it.
#[tauri::command]
pub async fn skin_save(state: State<'_, AppState>, name: String, data: String, slim: bool) -> Result<()> {
    let png = decode_png(&data)?;
    check_skin_png(&png)?;
    library_add(&state, name, &png, slim).await.map(|_| ())
}

/// Save the skin you're wearing now to the library.
#[tauri::command]
pub async fn skin_save_current(state: State<'_, AppState>) -> Result<()> {
    let a = ensure_account(&state).await?;
    let profile = mcapi::profile(&state.client, &a.mc_access_token).await?;
    let skin = profile.active_skin().ok_or_else(|| Error::Other("you're using the default skin".into()))?;
    let bytes = state.client.get(skin.url.replacen("http://", "https://", 1)).send().await?.error_for_status()?.bytes().await?;
    library_add(&state, format!("{}'s skin", profile.name), &bytes, skin.variant.eq_ignore_ascii_case("slim")).await.map(|_| ())
}

#[tauri::command]
pub async fn skin_rename(state: State<'_, AppState>, id: String, name: String) -> Result<()> {
    let mut list = library_index(&state).await;
    if let Some(s) = list.iter_mut().find(|s| s.id == id) {
        s.name = name.chars().take(40).collect();
    }
    library_save_index(&state, &list).await
}

#[tauri::command]
pub async fn skin_delete(state: State<'_, AppState>, id: String) -> Result<()> {
    let mut list = library_index(&state).await;
    list.retain(|s| s.id != id);
    let _ = tokio::fs::remove_file(library_dir(&state).join(format!("{id}.png"))).await;
    library_save_index(&state, &list).await
}

/// Wear a skin from the library.
#[tauri::command]
pub async fn skin_apply(state: State<'_, AppState>, id: String) -> Result<AccountDetails> {
    let list = library_index(&state).await;
    let s = list.iter().find(|s| s.id == id).ok_or_else(|| Error::Other("that skin isn't in the library".into()))?;
    let png = tokio::fs::read(library_dir(&state).join(format!("{id}.png"))).await?;
    let a = ensure_account(&state).await?;
    let profile = mcapi::upload_skin(&state.client, &a.mc_access_token, png, s.slim).await?;
    Ok(details_for(&state, &a.mc_access_token, profile).await)
}
