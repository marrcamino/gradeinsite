fn main() {
    // tauri-build compiles icons/icon.ico into the Windows executable, but it
    // does not tell Cargo to watch that directory - so replacing an icon left
    // the old one embedded until the build cache was cleared by hand.
    println!("cargo:rerun-if-changed=icons");

    tauri_build::build()
}
