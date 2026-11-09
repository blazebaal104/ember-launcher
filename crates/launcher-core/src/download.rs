//! Parallel, verified, resumable-by-skip downloads.
use crate::{Error, Result};
use futures::{stream, TryStreamExt};
use sha1::{Digest, Sha1};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use tokio::io::AsyncWriteExt;

#[derive(Debug, Clone)]
pub struct DownloadJob {
    pub url: String,
    pub dest: PathBuf,
    pub sha1: Option<String>,
    pub size: Option<u64>,
}

/// Progress callback: (completed jobs, total jobs).
pub type Progress = Arc<dyn Fn(u64, u64) + Send + Sync>;

pub async fn sha1_file(path: &Path) -> Result<String> {
    let bytes = tokio::fs::read(path).await?;
    Ok(hex::encode(Sha1::digest(&bytes)))
}

/// True if the file exists and (when a hash is known) matches it.
pub async fn is_valid(path: &Path, sha1: Option<&str>, size: Option<u64>) -> bool {
    let Ok(meta) = tokio::fs::metadata(path).await else { return false };
    if let Some(s) = size {
        if meta.len() != s {
            return false;
        }
    }
    match sha1 {
        Some(expected) => sha1_file(path).await.map(|h| h.eq_ignore_ascii_case(expected)).unwrap_or(false),
        None => true,
    }
}

pub async fn download_one(client: &reqwest::Client, job: &DownloadJob) -> Result<()> {
    if is_valid(&job.dest, job.sha1.as_deref(), job.size).await {
        return Ok(());
    }
    if let Some(parent) = job.dest.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }
    let mut last_err = None;
    for attempt in 0..3u32 {
        match try_download(client, job).await {
            Ok(()) => return Ok(()),
            Err(e) => {
                tracing::warn!(url = %job.url, attempt, error = %e, "download failed");
                last_err = Some(e);
                tokio::time::sleep(std::time::Duration::from_millis(400 * 2u64.pow(attempt))).await;
            }
        }
    }
    Err(last_err.unwrap())
}

async fn try_download(client: &reqwest::Client, job: &DownloadJob) -> Result<()> {
    // Write to a temp file and rename, so a crash never leaves a half file that looks valid.
    let tmp = job.dest.with_extension("part");
    let mut res = client.get(&job.url).send().await?.error_for_status()?;
    let mut file = tokio::fs::File::create(&tmp).await?;
    let mut hasher = Sha1::new();
    while let Some(chunk) = res.chunk().await? {
        hasher.update(&chunk);
        file.write_all(&chunk).await?;
    }
    file.flush().await?;
    drop(file);
    let actual = hex::encode(hasher.finalize());
    if let Some(expected) = &job.sha1 {
        if !actual.eq_ignore_ascii_case(expected) {
            let _ = tokio::fs::remove_file(&tmp).await;
            return Err(Error::HashMismatch { path: job.dest.display().to_string(), expected: expected.clone(), actual });
        }
    }
    tokio::fs::rename(&tmp, &job.dest).await?;
    Ok(())
}

/// Download many files with bounded concurrency.
pub async fn download_all(client: &reqwest::Client, jobs: Vec<DownloadJob>, concurrency: usize, progress: Option<Progress>) -> Result<()> {
    let total = jobs.len() as u64;
    let done = Arc::new(AtomicU64::new(0));
    stream::iter(jobs.into_iter().map(Ok::<_, Error>))
        .try_for_each_concurrent(concurrency, |job| {
            let client = client.clone();
            let done = done.clone();
            let progress = progress.clone();
            async move {
                download_one(&client, &job).await?;
                let n = done.fetch_add(1, Ordering::Relaxed) + 1;
                if let Some(p) = &progress {
                    p(n, total);
                }
                Ok(())
            }
        })
        .await
}

