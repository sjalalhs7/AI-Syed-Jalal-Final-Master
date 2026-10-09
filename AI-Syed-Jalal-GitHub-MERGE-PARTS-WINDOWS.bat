@echo off
setlocal
copy /b AI-Syed-Jalal-Master.part00+AI-Syed-Jalal-Master.part01+AI-Syed-Jalal-Master.part02+AI-Syed-Jalal-Master.part03+AI-Syed-Jalal-Master.part04+AI-Syed-Jalal-Master.part05+AI-Syed-Jalal-Master.part06+AI-Syed-Jalal-Master.part07+AI-Syed-Jalal-Master.part08 AI-Syed-Jalal-FINAL-RECOVERED-MASTER.zip
if errorlevel 1 (
  echo MERGE FAILED. Check that all 9 part files are in this folder.
  pause
  exit /b 1
)
echo Merge complete. Verify SHA-256:
echo 21dc9b76289706ea12640cd6579e7efedb8215ca50d7c70f411b2fe09649369c
certutil -hashfile AI-Syed-Jalal-FINAL-RECOVERED-MASTER.zip SHA256
pause
