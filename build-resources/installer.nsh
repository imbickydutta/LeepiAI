!macro customInstall
  ; Create a desktop shortcut to the Windows setup guide
  CreateShortCut "$DESKTOP\LeepiAI Windows Setup.lnk" "$INSTDIR\resources\WINDOWS_SETUP.md"
  
  ; Show setup instructions after installation
  MessageBox MB_OK|MB_ICONINFORMATION "LeepiAI has been installed successfully!$\r$\n$\r$\nFor Windows audio setup instructions, please read the 'LeepiAI Windows Setup' file on your desktop."
!macroend

!macro customUnInstall
  ; Remove the desktop shortcut
  Delete "$DESKTOP\LeepiAI Windows Setup.lnk"
!macroend 