//! Just enough NBT to read a world's level.dat for the Worlds tab (name, mode, version,
//! seed, play time). Unknown tags are skipped; a damaged file yields an empty summary.
use flate2::read::GzDecoder;
use serde::Serialize;
use std::io::Read;

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LevelInfo {
    pub name: Option<String>,
    /// survival / creative / adventure / spectator
    pub game_mode: Option<String>,
    pub hardcore: bool,
    pub cheats: bool,
    pub difficulty: Option<String>,
    pub version: Option<String>,
    pub seed: Option<String>,
    /// In-game days survived (world time / 24000).
    pub days: Option<i64>,
    pub last_played: Option<i64>,
}

struct Cur<'a> {
    b: &'a [u8],
    i: usize,
}

impl<'a> Cur<'a> {
    fn take(&mut self, n: usize) -> Option<&'a [u8]> {
        let s = self.b.get(self.i..self.i + n)?;
        self.i += n;
        Some(s)
    }
    fn u8(&mut self) -> Option<u8> {
        Some(self.take(1)?[0])
    }
    fn i16(&mut self) -> Option<i16> {
        Some(i16::from_be_bytes(self.take(2)?.try_into().ok()?))
    }
    fn i32(&mut self) -> Option<i32> {
        Some(i32::from_be_bytes(self.take(4)?.try_into().ok()?))
    }
    fn i64(&mut self) -> Option<i64> {
        Some(i64::from_be_bytes(self.take(8)?.try_into().ok()?))
    }
    fn string(&mut self) -> Option<String> {
        let n = self.i16()? as u16 as usize;
        Some(String::from_utf8_lossy(self.take(n)?).into_owned())
    }
}

#[derive(Debug)]
enum Val {
    Int(i64),
    Str(String),
    Other,
}

/// Walk a payload of `tag`, calling `f(path, value)` for scalar leaves.
fn walk(c: &mut Cur, tag: u8, path: &mut Vec<String>, depth: usize, f: &mut dyn FnMut(&[String], Val)) -> Option<()> {
    if depth > 64 {
        return None;
    }
    match tag {
        1 => f(path, Val::Int(c.u8()? as i8 as i64)),
        2 => f(path, Val::Int(c.i16()? as i64)),
        3 => f(path, Val::Int(c.i32()? as i64)),
        4 => f(path, Val::Int(c.i64()?)),
        5 => {
            c.take(4)?;
            f(path, Val::Other)
        }
        6 => {
            c.take(8)?;
            f(path, Val::Other)
        }
        7 => {
            let n = c.i32()?.max(0) as usize;
            c.take(n)?;
        }
        8 => f(path, Val::Str(c.string()?)),
        9 => {
            let inner = c.u8()?;
            let n = c.i32()?.max(0) as usize;
            for _ in 0..n {
                walk(c, inner, path, depth + 1, f)?;
            }
        }
        10 => loop {
            let t = c.u8()?;
            if t == 0 {
                break;
            }
            let name = c.string()?;
            path.push(name);
            walk(c, t, path, depth + 1, f)?;
            path.pop();
        },
        11 => {
            let n = c.i32()?.max(0) as usize;
            c.take(n * 4)?;
        }
        12 => {
            let n = c.i32()?.max(0) as usize;
            c.take(n * 8)?;
        }
        _ => return None,
    }
    Some(())
}

/// Parse a (gzipped) level.dat into a summary.
pub fn level_info(gz: &[u8]) -> LevelInfo {
    let mut raw = Vec::new();
    if GzDecoder::new(gz).take(16 * 1024 * 1024).read_to_end(&mut raw).is_err() {
        raw = gz.to_vec(); // maybe uncompressed
    }
    let mut info = LevelInfo::default();
    let mut c = Cur { b: &raw, i: 0 };
    let Some(root) = c.u8() else { return info };
    if root != 10 || c.string().is_none() {
        return info;
    }
    let mut time = None;
    let mut path = Vec::new();
    let _ = walk(&mut c, 10, &mut path, 0, &mut |p, v| {
        let key = p.iter().map(String::as_str).collect::<Vec<_>>();
        let last = key.last().copied().unwrap_or("");
        match (last, v) {
            ("LevelName", Val::Str(s)) => info.name = Some(s),
            ("GameType", Val::Int(n)) => info.game_mode = Some(["survival", "creative", "adventure", "spectator"].get(n as usize).unwrap_or(&"survival").to_string()),
            ("hardcore", Val::Int(n)) => info.hardcore = n != 0,
            ("allowCommands", Val::Int(n)) => info.cheats = n != 0,
            ("Difficulty", Val::Int(n)) => info.difficulty = Some(["peaceful", "easy", "normal", "hard"].get(n as usize).unwrap_or(&"normal").to_string()),
            ("difficulty", Val::Str(s)) if info.difficulty.is_none() => info.difficulty = Some(s),
            ("Name", Val::Str(s)) if key.len() >= 2 && key[key.len() - 2] == "Version" => info.version = Some(s),
            ("seed", Val::Int(n)) | ("RandomSeed", Val::Int(n)) => info.seed = Some(n.to_string()),
            ("DayTime", Val::Int(n)) => time = Some(n),
            ("Time", Val::Int(n)) if time.is_none() => time = Some(n),
            ("LastPlayed", Val::Int(n)) => info.last_played = Some(n),
            _ => {}
        }
    });
    info.days = time.map(|t| t / 24000);
    info
}

#[cfg(test)]
mod tests {
    use super::*;
    use flate2::{write::GzEncoder, Compression};
    use std::io::Write;

    fn s(out: &mut Vec<u8>, v: &str) {
        out.extend((v.len() as u16).to_be_bytes());
        out.extend(v.as_bytes());
    }

    #[test]
    fn reads_level_dat() {
        let mut b = vec![10];
        s(&mut b, "");
        b.push(10);
        s(&mut b, "Data");
        b.push(8);
        s(&mut b, "LevelName");
        s(&mut b, "My World");
        b.push(3);
        s(&mut b, "GameType");
        b.extend(1i32.to_be_bytes());
        b.push(4);
        s(&mut b, "DayTime");
        b.extend(240_000i64.to_be_bytes());
        b.push(10);
        s(&mut b, "Version");
        b.push(8);
        s(&mut b, "Name");
        s(&mut b, "26.3");
        b.push(0);
        b.push(9); // empty list
        s(&mut b, "Players");
        b.push(10);
        b.extend(0i32.to_be_bytes());
        b.push(0);
        b.push(0);
        let mut gz = GzEncoder::new(Vec::new(), Compression::fast());
        gz.write_all(&b).unwrap();
        let info = level_info(&gz.finish().unwrap());
        assert_eq!(info.name.as_deref(), Some("My World"));
        assert_eq!(info.game_mode.as_deref(), Some("creative"));
        assert_eq!(info.version.as_deref(), Some("26.3"));
        assert_eq!(info.days, Some(10));
    }
}
