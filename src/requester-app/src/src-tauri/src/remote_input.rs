/// Remote Input Injection Module
///
/// Provides Windows-specific input injection for remote control.
/// Uses Win32 APIs to inject mouse and keyboard events.

#[cfg(target_os = "windows")]
use windows::{
    Win32::UI::Input::KeyboardAndMouse::{
        keybd_event, SendInput, INPUT, INPUT_0, INPUT_MOUSE,
        KEYBD_EVENT_FLAGS, KEYEVENTF_KEYUP,
        MOUSEEVENTF_ABSOLUTE, MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP,
        MOUSEEVENTF_MIDDLEDOWN, MOUSEEVENTF_MIDDLEUP, MOUSEEVENTF_MOVE, MOUSEEVENTF_RIGHTDOWN,
        MOUSEEVENTF_RIGHTUP, MOUSEEVENTF_WHEEL,
        MOUSEINPUT, VK_CONTROL, VK_MENU, VK_SHIFT,
    },
};

#[cfg(target_os = "windows")]
/// Inject mouse move event with pre-calculated screen dimensions
/// This avoids redundant GetSystemMetrics calls for better performance
pub fn inject_mouse_move_with_dims(x: i32, y: i32, screen_width: i32, screen_height: i32) -> Result<(), String> {
    unsafe {
        // Convert to absolute coordinates (0-65535 range)
        let abs_x = (x * 65535) / screen_width;
        let abs_y = (y * 65535) / screen_height;

        let input = INPUT {
            r#type: INPUT_MOUSE,
            Anonymous: INPUT_0 {
                mi: MOUSEINPUT {
                    dx: abs_x,
                    dy: abs_y,
                    mouseData: 0,
                    dwFlags: MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE,
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        };

        let result = SendInput(&[input], std::mem::size_of::<INPUT>() as i32);
        if result == 0 {
            return Err("Failed to inject mouse move".to_string());
        }

        Ok(())
    }
}


#[cfg(target_os = "windows")]
/// Inject mouse button down event
pub fn inject_mouse_down(button: u32) -> Result<(), String> {
    unsafe {
        let flag = match button {
            0 => MOUSEEVENTF_LEFTDOWN,   // Left button
            1 => MOUSEEVENTF_MIDDLEDOWN, // Middle button
            2 => MOUSEEVENTF_RIGHTDOWN,  // Right button
            _ => return Err("Invalid button".to_string()),
        };

        let input = INPUT {
            r#type: INPUT_MOUSE,
            Anonymous: INPUT_0 {
                mi: MOUSEINPUT {
                    dx: 0,
                    dy: 0,
                    mouseData: 0,
                    dwFlags: flag,
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        };

        let result = SendInput(&[input], std::mem::size_of::<INPUT>() as i32);
        if result == 0 {
            return Err("Failed to inject mouse down".to_string());
        }

        Ok(())
    }
}

#[cfg(target_os = "windows")]
/// Inject mouse button up event
pub fn inject_mouse_up(button: u32) -> Result<(), String> {
    unsafe {
        let flag = match button {
            0 => MOUSEEVENTF_LEFTUP,   // Left button
            1 => MOUSEEVENTF_MIDDLEUP, // Middle button
            2 => MOUSEEVENTF_RIGHTUP,  // Right button
            _ => return Err("Invalid button".to_string()),
        };

        let input = INPUT {
            r#type: INPUT_MOUSE,
            Anonymous: INPUT_0 {
                mi: MOUSEINPUT {
                    dx: 0,
                    dy: 0,
                    mouseData: 0,
                    dwFlags: flag,
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        };

        let result = SendInput(&[input], std::mem::size_of::<INPUT>() as i32);
        if result == 0 {
            return Err("Failed to inject mouse up".to_string());
        }

        Ok(())
    }
}

#[cfg(target_os = "windows")]
/// Inject mouse click with pre-calculated screen dimensions
/// Uses SendInput batching for atomic, low-latency click injection
pub fn inject_mouse_click_with_dims(x: i32, y: i32, button: u32, screen_width: i32, screen_height: i32) -> Result<(), String> {
    unsafe {
        // Convert to absolute coordinates (0-65535 range)
        let abs_x = (x * 65535) / screen_width;
        let abs_y = (y * 65535) / screen_height;

        let (down_flag, up_flag) = match button {
            0 => (MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP),
            1 => (MOUSEEVENTF_MIDDLEDOWN, MOUSEEVENTF_MIDDLEUP),
            2 => (MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_RIGHTUP),
            _ => return Err("Invalid button".to_string()),
        };

        // Batch all three inputs (move + down + up) in a single SendInput call
        // This is atomic and much faster than sequential calls with sleeps
        let inputs = [
            // Move to position
            INPUT {
                r#type: INPUT_MOUSE,
                Anonymous: INPUT_0 {
                    mi: MOUSEINPUT {
                        dx: abs_x,
                        dy: abs_y,
                        mouseData: 0,
                        dwFlags: MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE,
                        time: 0,
                        dwExtraInfo: 0,
                    },
                },
            },
            // Mouse down
            INPUT {
                r#type: INPUT_MOUSE,
                Anonymous: INPUT_0 {
                    mi: MOUSEINPUT {
                        dx: 0,
                        dy: 0,
                        mouseData: 0,
                        dwFlags: down_flag,
                        time: 0,
                        dwExtraInfo: 0,
                    },
                },
            },
            // Mouse up
            INPUT {
                r#type: INPUT_MOUSE,
                Anonymous: INPUT_0 {
                    mi: MOUSEINPUT {
                        dx: 0,
                        dy: 0,
                        mouseData: 0,
                        dwFlags: up_flag,
                        time: 0,
                        dwExtraInfo: 0,
                    },
                },
            },
        ];

        let result = SendInput(&inputs, std::mem::size_of::<INPUT>() as i32);
        if result == 0 {
            return Err("Failed to inject mouse click".to_string());
        }

        Ok(())
    }
}


#[cfg(target_os = "windows")]
/// Inject mouse wheel scroll
pub fn inject_mouse_wheel(delta: i32) -> Result<(), String> {
    unsafe {
        let input = INPUT {
            r#type: INPUT_MOUSE,
            Anonymous: INPUT_0 {
                mi: MOUSEINPUT {
                    dx: 0,
                    dy: 0,
                    mouseData: delta as u32,
                    dwFlags: MOUSEEVENTF_WHEEL,
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        };

        let result = SendInput(&[input], std::mem::size_of::<INPUT>() as i32);
        if result == 0 {
            return Err("Failed to inject mouse wheel".to_string());
        }

        Ok(())
    }
}

#[cfg(target_os = "windows")]
/// Convert key code string to virtual key code
fn key_code_to_vk(code: &str) -> Option<u16> {
    // Map common key codes to virtual key codes
    match code {
        // Letters A-Z
        "KeyA" => Some(0x41),
        "KeyB" => Some(0x42),
        "KeyC" => Some(0x43),
        "KeyD" => Some(0x44),
        "KeyE" => Some(0x45),
        "KeyF" => Some(0x46),
        "KeyG" => Some(0x47),
        "KeyH" => Some(0x48),
        "KeyI" => Some(0x49),
        "KeyJ" => Some(0x4A),
        "KeyK" => Some(0x4B),
        "KeyL" => Some(0x4C),
        "KeyM" => Some(0x4D),
        "KeyN" => Some(0x4E),
        "KeyO" => Some(0x4F),
        "KeyP" => Some(0x50),
        "KeyQ" => Some(0x51),
        "KeyR" => Some(0x52),
        "KeyS" => Some(0x53),
        "KeyT" => Some(0x54),
        "KeyU" => Some(0x55),
        "KeyV" => Some(0x56),
        "KeyW" => Some(0x57),
        "KeyX" => Some(0x58),
        "KeyY" => Some(0x59),
        "KeyZ" => Some(0x5A),
        // Digits 0-9
        "Digit0" => Some(0x30),
        "Digit1" => Some(0x31),
        "Digit2" => Some(0x32),
        "Digit3" => Some(0x33),
        "Digit4" => Some(0x34),
        "Digit5" => Some(0x35),
        "Digit6" => Some(0x36),
        "Digit7" => Some(0x37),
        "Digit8" => Some(0x38),
        "Digit9" => Some(0x39),
        // Function keys F1-F12
        "F1" => Some(0x70),
        "F2" => Some(0x71),
        "F3" => Some(0x72),
        "F4" => Some(0x73),
        "F5" => Some(0x74),
        "F6" => Some(0x75),
        "F7" => Some(0x76),
        "F8" => Some(0x77),
        "F9" => Some(0x78),
        "F10" => Some(0x79),
        "F11" => Some(0x7A),
        "F12" => Some(0x7B),
        // Navigation keys
        "Enter" => Some(0x0D),
        "Escape" => Some(0x1B),
        "Backspace" => Some(0x08),
        "Tab" => Some(0x09),
        "Space" => Some(0x20),
        "ArrowLeft" => Some(0x25),
        "ArrowUp" => Some(0x26),
        "ArrowRight" => Some(0x27),
        "ArrowDown" => Some(0x28),
        "Insert" => Some(0x2D),
        "Delete" => Some(0x2E),
        "Home" => Some(0x24),
        "End" => Some(0x23),
        "PageUp" => Some(0x21),
        "PageDown" => Some(0x22),
        // Modifier keys (for explicit handling)
        "ShiftLeft" | "ShiftRight" => Some(0x10),
        "ControlLeft" | "ControlRight" => Some(0x11),
        "AltLeft" | "AltRight" => Some(0x12),
        "MetaLeft" | "MetaRight" => Some(0x5B), // Windows key
        "CapsLock" => Some(0x14),
        "NumLock" => Some(0x90),
        "ScrollLock" => Some(0x91),
        // Punctuation and symbols
        "Minus" => Some(0xBD),
        "Equal" => Some(0xBB),
        "BracketLeft" => Some(0xDB),
        "BracketRight" => Some(0xDD),
        "Backslash" => Some(0xDC),
        "Semicolon" => Some(0xBA),
        "Quote" => Some(0xDE),
        "Backquote" => Some(0xC0),
        "Comma" => Some(0xBC),
        "Period" => Some(0xBE),
        "Slash" => Some(0xBF),
        // Numpad keys
        "Numpad0" => Some(0x60),
        "Numpad1" => Some(0x61),
        "Numpad2" => Some(0x62),
        "Numpad3" => Some(0x63),
        "Numpad4" => Some(0x64),
        "Numpad5" => Some(0x65),
        "Numpad6" => Some(0x66),
        "Numpad7" => Some(0x67),
        "Numpad8" => Some(0x68),
        "Numpad9" => Some(0x69),
        "NumpadMultiply" => Some(0x6A),
        "NumpadAdd" => Some(0x6B),
        "NumpadSubtract" => Some(0x6D),
        "NumpadDecimal" => Some(0x6E),
        "NumpadDivide" => Some(0x6F),
        "NumpadEnter" => Some(0x0D),
        // Print screen, pause
        "PrintScreen" => Some(0x2C),
        "Pause" => Some(0x13),
        _ => None,
    }
}

#[cfg(target_os = "windows")]
/// Inject keyboard key down event
pub fn inject_key_down(code: &str, ctrl: bool, shift: bool, alt: bool) -> Result<(), String> {
    unsafe {
        let vk = key_code_to_vk(code).ok_or("Unknown key code")?;

        // Press modifier keys first
        if ctrl {
            keybd_event(VK_CONTROL.0 as u8, 0, KEYBD_EVENT_FLAGS(0), 0);
        }
        if shift {
            keybd_event(VK_SHIFT.0 as u8, 0, KEYBD_EVENT_FLAGS(0), 0);
        }
        if alt {
            keybd_event(VK_MENU.0 as u8, 0, KEYBD_EVENT_FLAGS(0), 0);
        }

        // Press the main key
        keybd_event(vk as u8, 0, KEYBD_EVENT_FLAGS(0), 0);

        Ok(())
    }
}

#[cfg(target_os = "windows")]
/// Inject keyboard key up event
pub fn inject_key_up(code: &str, ctrl: bool, shift: bool, alt: bool) -> Result<(), String> {
    unsafe {
        let vk = key_code_to_vk(code).ok_or("Unknown key code")?;

        // Release the main key
        keybd_event(vk as u8, 0, KEYEVENTF_KEYUP, 0);

        // Release modifier keys
        if alt {
            keybd_event(VK_MENU.0 as u8, 0, KEYEVENTF_KEYUP, 0);
        }
        if shift {
            keybd_event(VK_SHIFT.0 as u8, 0, KEYEVENTF_KEYUP, 0);
        }
        if ctrl {
            keybd_event(VK_CONTROL.0 as u8, 0, KEYEVENTF_KEYUP, 0);
        }

        Ok(())
    }
}

// Stub implementations for non-Windows platforms
#[cfg(not(target_os = "windows"))]
pub fn inject_mouse_move_with_dims(_x: i32, _y: i32, _screen_width: i32, _screen_height: i32) -> Result<(), String> {
    Err("Input injection is only supported on Windows".to_string())
}

#[cfg(not(target_os = "windows"))]
pub fn inject_mouse_move(_x: i32, _y: i32) -> Result<(), String> {
    Err("Input injection is only supported on Windows".to_string())
}

#[cfg(not(target_os = "windows"))]
pub fn inject_mouse_down(_button: u32) -> Result<(), String> {
    Err("Input injection is only supported on Windows".to_string())
}

#[cfg(not(target_os = "windows"))]
pub fn inject_mouse_up(_button: u32) -> Result<(), String> {
    Err("Input injection is only supported on Windows".to_string())
}

#[cfg(not(target_os = "windows"))]
pub fn inject_mouse_click_with_dims(_x: i32, _y: i32, _button: u32, _screen_width: i32, _screen_height: i32) -> Result<(), String> {
    Err("Input injection is only supported on Windows".to_string())
}

#[cfg(not(target_os = "windows"))]
pub fn inject_mouse_click(_x: i32, _y: i32, _button: u32) -> Result<(), String> {
    Err("Input injection is only supported on Windows".to_string())
}

#[cfg(not(target_os = "windows"))]
pub fn inject_mouse_wheel(_delta: i32) -> Result<(), String> {
    Err("Input injection is only supported on Windows".to_string())
}

#[cfg(not(target_os = "windows"))]
pub fn inject_key_down(_code: &str, _ctrl: bool, _shift: bool, _alt: bool) -> Result<(), String> {
    Err("Input injection is only supported on Windows".to_string())
}

#[cfg(not(target_os = "windows"))]
pub fn inject_key_up(_code: &str, _ctrl: bool, _shift: bool, _alt: bool) -> Result<(), String> {
    Err("Input injection is only supported on Windows".to_string())
}
