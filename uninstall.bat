@echo off
setlocal EnableExtensions
title GameTracker - Uninstall

rem ================================================================
rem  GameTracker - full uninstall
rem
rem  1. Closes a running GameTracker instance (with your consent)
rem  2. Runs the installed program's own uninstaller, if registered
rem  3. Deletes ALL local app data:
rem       %APPDATA%\com.gametracker.desktop
rem         (database with library/ratings/notes, settings.json with
rem          your RAWG API key, downloaded cover-art cache)
rem       %LOCALAPPDATA%\com.gametracker.desktop
rem         (embedded browser data: web cache, localStorage)
rem
rem  Safe to run even if GameTracker was never installed or is
rem  already removed - it simply wipes whatever data remains.
rem ================================================================

echo.
echo  ==================================================
echo    GameTracker - full uninstall
echo  ==================================================
echo.
echo  This will remove:
echo    1. The GameTracker program, via its own uninstaller (if found)
echo    2. %APPDATA%\com.gametracker.desktop
echo       - your library, ratings, notes and the search cache
echo       - settings.json, which contains your RAWG API key
echo       - the downloaded cover-art cache
echo    3. %LOCALAPPDATA%\com.gametracker.desktop
echo       - the embedded browser's cache and localStorage
echo.
echo  Deleted data CANNOT be recovered. Back up the two folders
echo  above first if you want to keep your library.
echo.

choice /C YN /N /M "Proceed with the full uninstall? [Y/N] "
if errorlevel 2 goto :cancelled

rem ---- step 1: close a running instance ---------------------------

tasklist /FI "IMAGENAME eq GameTracker.exe" 2>nul | "%SystemRoot%\System32\findstr.exe" /I "GameTracker.exe" >nul
if errorlevel 1 goto :uninstaller

echo.
echo  GameTracker is currently running and must be closed before
echo  its data files can be removed.
choice /C YN /N /M "Close GameTracker now? [Y/N] "
if errorlevel 2 (
    echo  Aborting. Close GameTracker and run this script again.
    goto :done
)
taskkill /IM GameTracker.exe >nul 2>&1
ping -n 3 127.0.0.1 >nul

rem ---- step 2: the installed program ------------------------------

:uninstaller
set "UNINST="
call :find_uninst "HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\GameTracker"
call :find_uninst "HKLM\Software\Microsoft\Windows\CurrentVersion\Uninstall\GameTracker"
call :find_uninst "HKLM\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\GameTracker"

if not defined UNINST (
    echo.
    echo  [1/2] No installed GameTracker program was found in the registry.
    echo        If it was installed via the .msi installer, remove it
    echo        through Windows Settings ^> Apps ^> Installed apps.
) else (
    echo.
    echo  [1/2] Found the installed program:
    echo        %UNINST%
    choice /C YN /N /M "Run its uninstaller now? [Y/N] "
    if errorlevel 2 goto :data
    set "UNINST=%UNINST:/I{=/X{%"
    echo        Launching the uninstaller - follow its prompts...
    cmd /c %UNINST%
)

rem ---- step 3: application data ------------------------------------

:data
echo.
echo  [2/2] Removing application data...
call :wipe "%APPDATA%\com.gametracker.desktop"
call :wipe "%LOCALAPPDATA%\com.gametracker.desktop"

echo.
echo  GameTracker has been uninstalled. No local data remains.
goto :done

:cancelled
echo.
echo  Cancelled. Nothing was changed.

:done
echo.
pause
endlocal
exit /b 0

rem ---- helper: read an NSIS UninstallString, if present ------------

:find_uninst
for /f "skip=2 tokens=2*" %%A in ('reg query "%~1" /v UninstallString 2^>nul') do if not defined UNINST set "UNINST=%%~B"
goto :eof

rem ---- helper: delete a folder tree and report the result ----------

:wipe
if exist "%~1\" (
    rd /s /q "%~1"
    if exist "%~1\" (
        echo    FAILED    - %~1
        echo                close any program still using these files and rerun.
    ) else (
        echo    removed   - %~1
    )
) else (
    echo    not found - %~1
)
goto :eof
