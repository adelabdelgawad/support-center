#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// Main entry point - delegates to lib.rs
fn main() {
    requester_desktop_lib::run();
}
