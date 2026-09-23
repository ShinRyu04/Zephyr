#[cfg(test)]
mod tests {
    use crate::credential;
    use crate::git::{parse_status_v2, scrub_url_credentials};

    fn rec(parts: &[&str]) -> String {
        parts.join("\0")
    }

    #[test]
    fn status_branch_dan_ahead_behind() {
        let raw = rec(&[
            "# branch.oid abc123",
            "# branch.head main",
            "# branch.upstream origin/main",
            "# branch.ab +2 -1",
            "",
        ]);
        let (branch, upstream, ahead, behind, changes) = parse_status_v2(&raw);
        assert_eq!(branch.as_deref(), Some("main"));
        assert_eq!(upstream.as_deref(), Some("origin/main"));
        assert_eq!(ahead, 2);
        assert_eq!(behind, 1);
        assert!(changes.is_empty());
    }

    #[test]
    fn status_modified_di_worktree_dan_index() {
        let raw = rec(&[
            "# branch.head main",
            "1 .M N... 100644 100644 100644 aaa bbb src/a.ts",
            "1 M. N... 100644 100644 100644 aaa bbb src/b.ts",
            "1 MM N... 100644 100644 100644 aaa bbb src/c.ts",
            "",
        ]);
        let (_, _, _, _, ch) = parse_status_v2(&raw);

        let a: Vec<_> = ch.iter().filter(|c| c.path == "src/a.ts").collect();
        assert_eq!(a.len(), 1);
        assert!(!a[0].staged);
        assert_eq!(a[0].status, "M");

        let b: Vec<_> = ch.iter().filter(|c| c.path == "src/b.ts").collect();
        assert_eq!(b.len(), 1);
        assert!(b[0].staged);

        let c: Vec<_> = ch.iter().filter(|c| c.path == "src/c.ts").collect();
        assert_eq!(c.len(), 2, "MM harus muncul di staged DAN unstaged");
        assert!(c.iter().any(|x| x.staged));
        assert!(c.iter().any(|x| !x.staged));
    }

    #[test]
    fn status_untracked_dan_deleted() {
        let raw = rec(&[
            "# branch.head main",
            "? baru.txt",
            "1 D. N... 100644 000000 000000 aaa bbb hilang.txt",
            "",
        ]);
        let (_, _, _, _, ch) = parse_status_v2(&raw);
        let baru = ch.iter().find(|c| c.path == "baru.txt").unwrap();
        assert_eq!(baru.status, "?");
        assert!(baru.is_new);
        assert!(!baru.staged);

        let del = ch.iter().find(|c| c.path == "hilang.txt").unwrap();
        assert_eq!(del.status, "D");
        assert!(del.is_deleted);
        assert!(del.staged);
    }

    #[test]
    fn status_rename_membawa_path_lama() {
        let raw = rec(&[
            "# branch.head main",
            "2 R. N... 100644 100644 100644 aaa bbb R100 src/new.ts",
            "src/old.ts",
            "",
        ]);
        let (_, _, _, _, ch) = parse_status_v2(&raw);
        let r = ch.iter().find(|c| c.path == "src/new.ts").unwrap();
        assert_eq!(r.status, "R");
        assert!(r.staged);
        assert_eq!(r.orig_path.as_deref(), Some("src/old.ts"));
    }

    #[test]
    fn status_conflict_terdeteksi_sebagai_u() {
        let raw = rec(&[
            "# branch.head main",
            "u UU N... 100644 100644 100644 100644 aaa bbb ccc konflik.txt",
            "",
        ]);
        let (_, _, _, _, ch) = parse_status_v2(&raw);
        let c = ch.iter().find(|c| c.path == "konflik.txt").unwrap();
        assert_eq!(c.status, "U");
    }

    #[test]
    fn pesan_error_tidak_membocorkan_token_di_url() {
        let msg = "fatal: unable to access 'https://ShinRyu04:ghp_RAHASIA123@github.com/a/b.git/'";
        let clean = scrub_url_credentials(msg);
        assert!(
            !clean.contains("ghp_RAHASIA123"),
            "token masih ada: {clean}"
        );
        assert!(!clean.contains("ShinRyu04:"));
        assert!(clean.contains("github.com/a/b.git"));
    }

    #[test]
    fn scrub_membiarkan_url_biasa() {
        let s = "remote: https://github.com/ShinRyu04/Zephyr.git";
        assert_eq!(scrub_url_credentials(s), s);
    }

    #[test]
    fn credential_helper_hanya_github_dan_get() {
        let github = vec![
            ("protocol".to_string(), "https".to_string()),
            ("host".to_string(), "github.com".to_string()),
        ];
        let lain = vec![
            ("protocol".to_string(), "https".to_string()),
            ("host".to_string(), "example.com".to_string()),
        ];

        assert_eq!(credential::respond("get", &lain), "");

        assert_eq!(credential::respond("store", &github), "");
        assert_eq!(credential::respond("erase", &github), "");

        let out = credential::respond("get", &github);
        if !out.is_empty() {
            assert!(out.contains("username="), "format salah: {out}");
            assert!(out.contains("password="), "format salah: {out}");
            assert!(out.ends_with('\n'));
        }
    }

    #[test]
    fn credential_helper_menolak_protokol_non_https() {
        let ssh = vec![
            ("protocol".to_string(), "ssh".to_string()),
            ("host".to_string(), "github.com".to_string()),
        ];
        assert_eq!(credential::respond("get", &ssh), "");
    }
}
