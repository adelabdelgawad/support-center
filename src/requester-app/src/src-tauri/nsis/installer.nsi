; Custom NSIS template for IT Support Center
; Adds system-wide auto-start on installation
;
; This template extends the default Tauri NSIS installer with:
; - Auto-start registry entry in HKLM for all users
; - Clean removal of auto-start entry on uninstall
;
; Registry Key: HKLM\Software\Microsoft\Windows\CurrentVersion\Run
; Value Name: supportcenter.requester
; Value Data: Path to installed executable

!macro customInstall
  ; Add auto-start registry entry for all users (HKLM)
  ; This ensures the app starts automatically on Windows login for any user
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Run" \
    "supportcenter.requester" '"$INSTDIR\IT Support Center.exe"'
!macroend

!macro customUnInstall
  ; Remove auto-start registry entry on uninstall
  ; Clean up to prevent orphaned registry entries
  DeleteRegValue HKLM "Software\Microsoft\Windows\CurrentVersion\Run" \
    "supportcenter.requester"
!macroend
