// tests_browser.rs — unit test keputusan embed pane browser (fase 12).
//
// Yang diuji: `browser::decide` — pemetaan header respons ke "boleh di-embed
// atau tidak". Jalan tanpa jaringan, jadi cepat dan tidak flaky.

#![cfg(test)]

use crate::browser::decide;

#[test]
fn tanpa_header_boleh_embed() {
    let (ok, alasan, header) = decide(None, None);
    assert!(ok, "tanpa header pembatas harus boleh di-embed");
    assert_eq!(alasan, "Boleh di-embed");
    assert!(header.is_none());
}

#[test]
fn xfo_deny_ditolak() {
    let (ok, alasan, header) = decide(Some("DENY"), None);
    assert!(!ok);
    assert!(
        alasan.contains("DENY"),
        "alasan harus menyebut DENY: {alasan}"
    );
    assert_eq!(header.unwrap(), "X-Frame-Options: DENY");
}

#[test]
fn xfo_sameorigin_ditolak_apapun_besar_kecilnya() {
    for v in ["SAMEORIGIN", "sameorigin", "SameOrigin"] {
        let (ok, _, _) = decide(Some(v), None);
        assert!(!ok, "{v} harus ditolak");
    }
}

#[test]
fn xfo_allow_from_ditolak() {
    let (ok, alasan, _) = decide(Some("ALLOW-FROM https://contoh.test"), None);
    assert!(!ok);
    assert!(alasan.contains("ALLOW-FROM"));
}

#[test]
fn csp_frame_ancestors_none_ditolak() {
    let (ok, alasan, header) = decide(None, Some("default-src 'self'; frame-ancestors 'none'"));
    assert!(!ok);
    assert!(alasan.contains("'none'"), "alasan: {alasan}");
    assert!(header.unwrap().contains("frame-ancestors"));
}

#[test]
fn csp_frame_ancestors_terbatas_ditolak() {
    let (ok, alasan, _) = decide(
        None,
        Some("frame-ancestors https://situs.test; script-src *"),
    );
    assert!(!ok);
    assert!(
        alasan.contains("situs.test"),
        "alasan harus menyebut daftar origin-nya: {alasan}"
    );
}

#[test]
fn csp_frame_ancestors_bintang_boleh() {
    let (ok, _, header) = decide(None, Some("frame-ancestors *"));
    assert!(ok, "frame-ancestors * berarti siapa pun boleh embed");
    assert!(header.is_none());
}

#[test]
fn csp_tanpa_frame_ancestors_tidak_relevan() {
    // Direktif lain (mis. script-src) tidak boleh dianggap melarang embed.
    let (ok, _, _) = decide(None, Some("default-src 'self'; script-src 'unsafe-inline'"));
    assert!(ok);
}

#[test]
fn xfo_menang_atas_csp_permisif() {
    // Kalau XFO melarang, CSP yang permisif tidak menyelamatkan.
    let (ok, alasan, _) = decide(Some("DENY"), Some("frame-ancestors *"));
    assert!(!ok);
    assert!(alasan.contains("DENY"));
}

#[test]
fn dev_server_lokal_khas_boleh() {
    // Vite/webpack dev server tidak mengirim header pembatas → harus lolos,
    // karena ini justru kasus pemakaian utama pane browser.
    let (ok, _, _) = decide(None, Some("connect-src 'self' ws:"));
    assert!(ok);
}
