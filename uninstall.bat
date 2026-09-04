@echo off
setlocal EnableExtensions
title GameTracker - Uninstall

rem ================================================================
rem  GameTracker - full uninstall
rem
rem  What this script can touch - and nothing else:
rem    1. Closes GameTracker.exe, but only if you answer Y
rem    2. READS (never writes/deletes) three fixed registry keys to
rem       find the uninstaller registered by GameTracker's installer;
rem       launches it only if it looks like a real uninstaller AND
rem       you answer Y
rem    3. Deletes exactly two folders and nothing else:
rem         %APPDATA%\com.gametracker.desktop
rem         %LOCALAPPDATA%\com.gametracker.desktop
rem
rem  No other files, no registry writes, no network access.
rem  Safe to run even if GameTracker was never installed or is
rem  already removed - it simply wipes whatever data remains.
rem ================================================================

rem ---- safety guard: refuse to run without the expected paths ----
if not defined APPDATA goto :env_error
if not defined LOCALAPPDATA goto :env_error

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
echo  Nothing outside these two folders is deleted. Deleted data
echo  CANNOT be recovered - back the folders up first if you want
echo  to keep your library.
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
    call :looks_like_uninstaller
    if errorlevel 1 (
        echo        This does not look like a standard uninstaller,
        echo        so it will NOT be started. If GameTracker is still
        echo        installed, remove it via Windows Settings ^> Apps
        echo        ^> Installed apps.
        goto :data
    )
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
goto :done

:env_error
echo.
echo  ERROR: APPDATA / LOCALAPPDATA are not set in this environment.
echo  Refusing to guess where GameTracker's data lives - nothing was
echo  deleted.

:done
echo.
pause
endlocal
exit /b 0

rem ---- helper: read an NSIS UninstallString, if present ------------

:find_uninst
for /f "skip=2 tokens=2*" %%A in ('reg query "%~1" /v UninstallString 2^>nul') do if not defined UNINST set "UNINST=%%~B"
goto :eof

rem ---- helper: sanity-check UNINST (0 = safe to offer, 1 = refuse) -
rem  Accepts only strings that mention uninstall.exe or msiexec.exe
rem  once surrounding quotes are stripped. Anything else (scripts,
rem  unknown binaries, odd registry values) is never executed.

:looks_like_uninstaller
set "CHECK=%UNINST:"=%"
if not defined CHECK exit /b 1
set "STRIPPED=%CHECK%"
set "CHECK=%CHECK:uninstall.exe=%"
if not "%CHECK%"=="%STRIPPED%" exit /b 0
set "CHECK=%STRIPPED:msiexec.exe=%"
if not "%CHECK%"=="%STRIPPED%" exit /b 0
exit /b 1

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
