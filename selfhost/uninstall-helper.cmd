@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\configure-lan-autostart.ps1" -Uninstall
exit /b %ERRORLEVEL%
