use std::ffi::OsStr;
use std::process::Command;

#[cfg(windows)]
pub const CREATE_NO_WINDOW: u32 = 0x0800_0000;

pub fn cmd<S: AsRef<OsStr>>(program: S) -> Command {
    let mut c = Command::new(program);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt as _;
        c.creation_flags(CREATE_NO_WINDOW);
    }
    c
}

pub fn tokio_cmd<S: AsRef<OsStr>>(program: S) -> tokio::process::Command {
    let mut c = tokio::process::Command::new(program);
    #[cfg(windows)]
    {
        c.creation_flags(CREATE_NO_WINDOW);
    }
    c
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cmd_menjalankan_program() {
        let out = cmd("cmd").args(["/c", "echo zephyr"]).output();
        #[cfg(windows)]
        {
            let out = out.expect("cmd harus jalan");
            assert!(String::from_utf8_lossy(&out.stdout).contains("zephyr"));
        }
        #[cfg(not(windows))]
        {
            let _ = out;
        }
    }
}
