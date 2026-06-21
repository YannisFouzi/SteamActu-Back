@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul

echo ============================================
echo   Convertisseur M4A vers MP3 320 kbps
echo ============================================
echo.

:: Vérification de ffmpeg
where ffmpeg >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERREUR] ffmpeg n'est pas installé ou pas dans le PATH.
    echo.
    echo Installez ffmpeg :
    echo   1. Téléchargez depuis https://ffmpeg.org/download.html
    echo   2. Extrayez et ajoutez le dossier bin au PATH système
    echo.
    pause
    exit /b 1
)

:: Dossier source (argument ou dossier courant)
set "SOURCE_DIR=%~1"
if "%SOURCE_DIR%"=="" set "SOURCE_DIR=%cd%"

:: Dossier de sortie
set "OUTPUT_DIR=%SOURCE_DIR%\mp3_output"
if not exist "%OUTPUT_DIR%" mkdir "%OUTPUT_DIR%"

echo Source  : %SOURCE_DIR%
echo Sortie  : %OUTPUT_DIR%
echo Qualité : MP3 320 kbps
echo.

set /a count=0
set /a errors=0

for %%f in ("%SOURCE_DIR%\*.m4a") do (
    set "input=%%f"
    set "output=%OUTPUT_DIR%\%%~nf.mp3"

    echo Conversion : %%~nxf
    ffmpeg -i "%%f" -codec:a libmp3lame -b:a 320k -q:a 0 "%OUTPUT_DIR%\%%~nf.mp3" -y -loglevel error

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
        echo Aucun fichier .m4a trouvé dans :
        echo %SOURCE_DIR%
    )
) else (
    echo Terminé : %count% converti(s), %errors% échec(s)
    echo Fichiers disponibles dans : %OUTPUT_DIR%
)
echo ============================================
echo.
pause
