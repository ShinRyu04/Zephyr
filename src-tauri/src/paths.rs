use crate::errors::{ZResult, ZephyrError};
use std::path::{Component, Path, PathBuf};

#[derive(Debug, Clone)]
pub struct Normalized {
    pub absolute: PathBuf,

    pub relative: Option<String>,

    pub inside: bool,
}

pub fn long_path(p: &Path) -> PathBuf {
    let s = p.to_string_lossy();

    if s.starts_with(r"\\?\") || s.len() < 240 {
        return p.to_path_buf();
    }

    if let Some(rest) = s.strip_prefix(r"\\") {
        return PathBuf::from(format!(r"\\?\UNC\{rest}"));
    }
    if p.is_absolute() {
        return PathBuf::from(format!(r"\\?\{s}"));
    }
    p.to_path_buf()
}

pub fn is_drive_root(p: &Path) -> bool {
    let mut it = p.components();
    match (it.next(), it.next(), it.next()) {
        (Some(Component::Prefix(_)), Some(Component::RootDir), None) => true,

        (Some(Component::RootDir), None, _) => true,
        _ => false,
    }
}

pub fn strip_unc(p: &Path) -> PathBuf {
    let s = p.to_string_lossy();
    match s.strip_prefix(r"\\?\") {
        Some(rest) => PathBuf::from(rest),
        None => p.to_path_buf(),
    }
}

fn lexical_clean(p: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for c in p.components() {
        match c {
            Component::CurDir => {}
            Component::ParentDir => {
                if out
                    .components()
                    .next_back()
                    .map(|c| !matches!(c, Component::Prefix(_) | Component::RootDir))
                    .unwrap_or(false)
                {
                    out.pop();
                }
            }
            other => out.push(other.as_os_str()),
        }
    }
    out
}

pub fn canonical_or_parent(p: &Path) -> PathBuf {
    let cleaned = lexical_clean(p);
    if let Ok(c) = cleaned.canonicalize() {
        return strip_unc(&c);
    }

    let mut ancestor = cleaned.as_path();
    let mut rest: Vec<&std::ffi::OsStr> = Vec::new();
    while let Some(parent) = ancestor.parent() {
        if let Some(name) = ancestor.file_name() {
            rest.push(name);
        }
        if let Ok(c) = parent.canonicalize() {
            let mut out = strip_unc(&c);
            for name in rest.iter().rev() {
                out.push(name);
            }
            return out;
        }
        ancestor = parent;
    }
    cleaned
}

pub fn is_inside(root: &Path, child: &Path) -> bool {
    let root = normalize_cmp(root);
    let child = normalize_cmp(child);
    child == root || child.starts_with(&root)
}

pub fn is_same(a: &Path, b: &Path) -> bool {
    normalize_cmp(a) == normalize_cmp(b)
}

fn normalize_cmp(p: &Path) -> PathBuf {
    #[cfg(windows)]
    {
        PathBuf::from(p.to_string_lossy().to_lowercase().replace('/', "\\"))
    }
    #[cfg(not(windows))]
    {
        p.to_path_buf()
    }
}

pub fn normalize_workspace_path(workspace: Option<&Path>, input: &Path) -> ZResult<Normalized> {
    if input.as_os_str().is_empty() {
        return Err(ZephyrError::InvalidInput("path kosong".into()));
    }
    let absolute = canonical_or_parent(input);
    let (relative, inside) = match workspace {
        Some(ws) => {
            let ws = canonical_or_parent(ws);
            if is_inside(&ws, &absolute) {
                let rel = pathdiff(&ws, &absolute);
                (rel, true)
            } else {
                (None, false)
            }
        }
        None => (None, false),
    };
    Ok(Normalized {
        absolute,
        relative,
        inside,
    })
}

fn pathdiff(root: &Path, child: &Path) -> Option<String> {
    let r = root.to_string_lossy().len();
    let c = child.to_string_lossy();
    if c.len() <= r {
        return None;
    }
    let rest = c[r..].trim_start_matches(['\\', '/']).replace('\\', "/");
    if rest.is_empty() {
        None
    } else {
        Some(rest)
    }
}

pub fn warn_if_symlink_escapes(workspace: Option<&Path>, input: &Path) {
    let Some(ws) = workspace else { return };
    let Ok(meta) = std::fs::symlink_metadata(input) else {
        return;
    };
    if !meta.file_type().is_symlink() {
        return;
    }
    let target = canonical_or_parent(input);
    if !is_inside(&canonical_or_parent(ws), &target) {
        tracing::warn!(
            link = %input.to_string_lossy(),
            target = %target.to_string_lossy(),
            "symlink menunjuk keluar workspace — diikuti, tapi perlu diperhatikan"
        );
    }
}

pub fn validate_cwd(dir: &Path) -> ZResult<PathBuf> {
    let canon = canonical_or_parent(dir);
    if !canon.is_dir() {
        return Err(ZephyrError::InvalidInput(format!(
            "cwd bukan folder: {}",
            dir.to_string_lossy()
        )));
    }
    Ok(canon)
}

#[cfg(test)]
pub fn lexical_clean_for_test(p: &Path) -> PathBuf {
    lexical_clean(p)
}

#[cfg(test)]
pub fn pathdiff_for_test(root: &Path, child: &Path) -> Option<String> {
    pathdiff(root, child)
}
