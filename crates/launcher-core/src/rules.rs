//! Mojang's `rules` evaluation for libraries and arguments.
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Rule {
    pub action: RuleAction,
    #[serde(default)]
    pub os: Option<OsRule>,
    #[serde(default)]
    pub features: Option<HashMap<String, bool>>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RuleAction {
    Allow,
    Disallow,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OsRule {
    pub name: Option<String>,
    pub arch: Option<String>,
    /// Regex on OS version, rarely used in modern manifests; ignored here.
    pub version: Option<String>,
}

/// The environment rules are evaluated against.
#[derive(Debug, Clone)]
pub struct RuleContext {
    /// "windows" | "osx" | "linux"
    pub os_name: &'static str,
    /// "x86" | "x86_64" | "arm64"
    pub arch: &'static str,
    pub features: HashMap<String, bool>,
}

impl RuleContext {
    pub fn current() -> Self {
        let os_name = match std::env::consts::OS {
            "windows" => "windows",
            "macos" => "osx",
            _ => "linux",
        };
        let arch = match std::env::consts::ARCH {
            "x86" => "x86",
            "aarch64" => "arm64",
            _ => "x86_64",
        };
        Self { os_name, arch, features: HashMap::new() }
    }

    pub fn with_feature(mut self, key: &str, value: bool) -> Self {
        self.features.insert(key.to_string(), value);
        self
    }
}

/// Mojang semantics: no rules = allowed; otherwise the LAST matching rule wins, default disallow.
pub fn allowed(rules: &[Rule], ctx: &RuleContext) -> bool {
    if rules.is_empty() {
        return true;
    }
    let mut result = false;
    for rule in rules {
        if matches(rule, ctx) {
            result = rule.action == RuleAction::Allow;
        }
    }
    result
}

fn matches(rule: &Rule, ctx: &RuleContext) -> bool {
    if let Some(os) = &rule.os {
        if let Some(name) = &os.name {
            if name != ctx.os_name {
                return false;
            }
        }
        if let Some(arch) = &os.arch {
            if arch != ctx.arch {
                return false;
            }
        }
    }
    if let Some(features) = &rule.features {
        for (k, v) in features {
            if ctx.features.get(k).copied().unwrap_or(false) != *v {
                return false;
            }
        }
    }
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ctx(os: &'static str) -> RuleContext {
        RuleContext { os_name: os, arch: "x86_64", features: HashMap::new() }
    }

    #[test]
    fn os_specific_library() {
        let rules: Vec<Rule> = serde_json::from_str(r#"[{"action":"allow","os":{"name":"windows"}}]"#).unwrap();
        assert!(allowed(&rules, &ctx("windows")));
        assert!(!allowed(&rules, &ctx("linux")));
    }

    #[test]
    fn allow_all_except_osx() {
        let rules: Vec<Rule> =
            serde_json::from_str(r#"[{"action":"allow"},{"action":"disallow","os":{"name":"osx"}}]"#).unwrap();
        assert!(allowed(&rules, &ctx("linux")));
        assert!(!allowed(&rules, &ctx("osx")));
    }

    #[test]
    fn feature_rules() {
        let rules: Vec<Rule> =
            serde_json::from_str(r#"[{"action":"allow","features":{"has_custom_resolution":true}}]"#).unwrap();
        assert!(!allowed(&rules, &ctx("linux")));
        assert!(allowed(&rules, &ctx("linux").with_feature("has_custom_resolution", true)));
    }
}
