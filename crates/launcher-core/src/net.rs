//! Automatic network setup for hosted servers: UPnP port mapping on the home router and
//! public-address lookup, so friends outside the house can join without router menus.
use crate::{Error, Result};
use igd_next::{aio::tokio::search_gateway, PortMappingProtocol, SearchOptions};
use serde::Serialize;
use std::net::{IpAddr, SocketAddr};
use std::time::Duration;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PortForward {
    pub port: u16,
    pub external_ip: Option<String>,
}

const DESCRIPTION: &str = "Ember Launcher Minecraft server";

fn search_opts() -> SearchOptions {
    let mut o = SearchOptions::default();
    o.timeout = Some(Duration::from_secs(4));
    o.single_search_timeout = Some(Duration::from_secs(2));
    o
}

/// Ask the router (UPnP IGD) to forward TCP `port` to this computer.
pub async fn open_port(port: u16) -> Result<PortForward> {
    let lan: IpAddr = crate::server::lan_ip().and_then(|s| s.parse().ok()).ok_or_else(|| Error::Other("not connected to a network".into()))?;
    let gw = search_gateway(search_opts()).await.map_err(|e| Error::Other(format!("no UPnP router found ({e})")))?;
    // Lease 0 = until removed; we remove it when the server stops. Some routers reject 0,
    // so fall back to a long lease that we refresh on every start.
    let local = SocketAddr::new(lan, port);
    if gw.add_port(PortMappingProtocol::TCP, port, local, 0, DESCRIPTION).await.is_err() {
        gw.add_port(PortMappingProtocol::TCP, port, local, 6 * 3600, DESCRIPTION)
            .await
            .map_err(|e| Error::Other(format!("the router refused the port mapping ({e})")))?;
    }
    let external_ip = gw.get_external_ip().await.ok().map(|ip| ip.to_string());
    Ok(PortForward { port, external_ip })
}

pub async fn close_port(port: u16) -> Result<()> {
    let gw = search_gateway(search_opts()).await.map_err(|e| Error::Other(e.to_string()))?;
    gw.remove_port(PortMappingProtocol::TCP, port).await.map_err(|e| Error::Other(e.to_string()))
}

/// This network's public IPv4 address, as seen from the internet.
pub async fn public_ip(client: &reqwest::Client) -> Option<String> {
    for url in ["https://api.ipify.org", "https://ipv4.icanhazip.com"] {
        if let Ok(r) = client.get(url).timeout(Duration::from_secs(5)).send().await {
            if let Ok(t) = r.text().await {
                let t = t.trim();
                if t.parse::<std::net::Ipv4Addr>().is_ok() {
                    return Some(t.to_string());
                }
            }
        }
    }
    None
}

/// True for addresses that can't be reached from the internet even with a port forward
/// (carrier-grade NAT, private ranges): then a tunnel like playit.gg is the way.
pub fn is_shared_address(ip: &str) -> bool {
    match ip.parse::<std::net::Ipv4Addr>() {
        Ok(a) => a.is_private() || a.is_loopback() || (a.octets()[0] == 100 && (64..128).contains(&a.octets()[1])),
        Err(_) => false,
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn detects_cgnat() {
        assert!(super::is_shared_address("100.72.1.4"));
        assert!(super::is_shared_address("192.168.1.2"));
        assert!(!super::is_shared_address("81.2.69.160"));
    }
}
