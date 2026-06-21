@echo off
setlocal enabledelayedexpansion

echo ============================================
echo   Convertisseur M4A vers MP3 320 kbps
echo ============================================
echo.

where ffmpeg >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERREUR] ffmpeg introuvable dans le PATH.
    echo Installez ffmpeg et ajoutez-le au PATH.
    pause
    exit /b 1
)

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

for %%f in ("%SOURCE_DIR%\*.m4a") do (
    echo Conversion : %%~nxf
    ffmpeg -i "%%f" -vn -codec:a libmp3lame -b:a 320k -q:a 0 "%OUTPUT_DIR%\%%~nf.mp3" -y -loglevel error
    if !errorlevel! equ 0 (
        set /a count+=1
        echo   [OK]
    ) else (
        set /a errors+=1
        echo   [ECHEC]
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
