@echo off
setlocal enabledelayedexpansion

echo ============================================
echo   Convertisseur M4A vers MP3 320 kbps
echo ============================================
echo.

set "FFMPEG=%LOCALAPPDATA%\Microsoft\WinGet\Links\ffmpeg.exe"

if not exist "%FFMPEG%" (
    echo [ERREUR] FFmpeg WinGet introuvable : %FFMPEG%
    pause
    exit /b 1
)

echo [OK] FFmpeg utilise : %FFMPEG%
echo.

set "SOURCE_DIR=%~1"
if "%SOURCE_DIR%"=="" set "SOURCE_DIR=%cd%"

set "OUTPUT_DIR=%SOURCE_DIR%\mp3_output"
if not exist "%OUTPUT_DIR%" mkdir "%OUTPUT_DIR%"

echo Source  : %SOURCE_DIR%
echo Sortie  : %OUTPUT_DIR%
echo Qualite : MP3 320 kbps
echo.

set /a count=0
set /a errors=0

for %%f in ("%SOURCE_DIR%\*.m4a" "%SOURCE_DIR%\*.flac") do (
    if exist "%OUTPUT_DIR%\%%~nf.mp3" (
        echo Ignore (deja fait) : %%~nxf
    ) else (
        echo Conversion : %%~nxf
        "%FFMPEG%" -i "%%f" -vn -codec:a libmp3lame -b:a 320k -q:a 0 "%OUTPUT_DIR%\%%~nf.mp3" -loglevel warning
        if !errorlevel! equ 0 (
            set /a count+=1
            echo   [OK]
        ) else (
            set /a errors+=1
            echo   [ECHEC]
        )
    )
)

echo.
echo ============================================
if %count% equ 0 (
    if %errors% equ 0 (
        echo Aucun fichier .m4a trouve dans :
        echo %SOURCE_DIR%
    )
) else (
    echo Termine : %count% converti(s^), %errors% echec(s^)
    echo Fichiers dans : %OUTPUT_DIR%
)
echo ============================================
echo.
pause
