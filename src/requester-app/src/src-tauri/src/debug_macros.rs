//! Debug logging macros - compile to no-ops in release builds.
//!
//! These macros provide println!/eprintln! functionality that is automatically
//! stripped from release builds, ensuring no console output in production.
//!
//! Usage:
//!   use crate::{debug_println, debug_eprintln};
//!
//!   debug_println!("[module] Debug message: {}", value);
//!   debug_eprintln!("[module] Error: {}", error);

/// Print to stdout only in debug builds
///
/// In release builds (when `debug_assertions` is false), this macro
/// compiles to nothing, producing zero overhead.
#[macro_export]
macro_rules! debug_println {
    ($($arg:tt)*) => {
        #[cfg(debug_assertions)]
        println!($($arg)*);
    };
}

/// Print to stderr only in debug builds
///
/// In release builds (when `debug_assertions` is false), this macro
/// compiles to nothing, producing zero overhead.
#[macro_export]
macro_rules! debug_eprintln {
    ($($arg:tt)*) => {
        #[cfg(debug_assertions)]
        eprintln!($($arg)*);
    };
}
