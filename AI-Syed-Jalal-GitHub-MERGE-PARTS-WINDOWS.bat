@echo off
setlocal EnableExtensions DisableDelayedExpansion
pushd "%~dp0" || exit /b 1
set "OUTPUT=AI-Syed-Jalal-FINAL-RECOVERED-MASTER.zip"
set "EXPECTED=21dc9b76289706ea12640cd6579e7efedb8215ca50d7c70f411b2fe09649369c"
if not "%~2"=="" goto usage
if not "%~1"=="" if /i not "%~1"=="--no-pause" goto usage
set "TEMP_FILE=.recovery-%RANDOM%%RANDOM%.zip"
set "ACTUAL="
set "PARTS=AI-Syed-Jalal-Master.part00 AI-Syed-Jalal-Master.part01 AI-Syed-Jalal-Master.part02 AI-Syed-Jalal-Master.part03 AI-Syed-Jalal-Master.part04 AI-Syed-Jalal-Master.part05 AI-Syed-Jalal-Master.part06 AI-Syed-Jalal-Master.part07 AI-Syed-Jalal-Master.part08"
for %%P in (%PARTS%) do (
  if not exist "%%~P" (
    echo Missing archive part: %%~P
    goto failure
  )
)
if exist "%OUTPUT%" (
  echo Output already exists. Move it aside before rebuilding; it was not overwritten.
  goto failure
)
if exist "%TEMP_FILE%" goto failure
setlocal EnableDelayedExpansion
copy /b "AI-Syed-Jalal-Master.part00"+"AI-Syed-Jalal-Master.part01"+"AI-Syed-Jalal-Master.part02"+"AI-Syed-Jalal-Master.part03"+"AI-Syed-Jalal-Master.part04"+"AI-Syed-Jalal-Master.part05"+"AI-Syed-Jalal-Master.part06"+"AI-Syed-Jalal-Master.part07"+"AI-Syed-Jalal-Master.part08" "%TEMP_FILE%" >nul
if errorlevel 1 goto merge_failed
for /f "usebackq skip=1 delims=" %%H in (`certutil -hashfile "%TEMP_FILE%" SHA256`) do (
  if not defined ACTUAL set "ACTUAL=%%H"
)
if not defined ACTUAL goto hash_failed
set "ACTUAL=!ACTUAL: =!"
if /i not "!ACTUAL!"=="%EXPECTED%" goto hash_failed
if exist "%OUTPUT%" goto hash_failed
rem REN fails rather than replacing an existing destination.
ren "%TEMP_FILE%" "%OUTPUT%"
if errorlevel 1 goto merge_failed
echo VERIFIED: %OUTPUT%
echo SHA-256: %EXPECTED%
echo Integrity is verified; application code has NOT been executed or certified safe.
endlocal
endlocal
popd
if /i not "%~1"=="--no-pause" pause
exit /b 0

:usage
echo Usage: %~nx0 [--no-pause]
goto failure
:merge_failed
echo Merge failed. Check available disk space and file permissions.
goto failure
:hash_failed
echo VERIFICATION FAILED. The reconstructed ZIP will not be published.
goto failure
:failure
if exist "%TEMP_FILE%" del /q "%TEMP_FILE%"
endlocal
endlocal
popd
if /i not "%~1"=="--no-pause" pause
exit /b 1
