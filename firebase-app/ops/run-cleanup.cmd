@echo off
rem YaguKing cleanup - run daily by Windows Task Scheduler ("YaguKing cleanup", docs/deploy.md section 6).
rem Deletes rooms older than 24h, orphan seats, and guests inactive for 30 days (ops/cleanup.mjs).
rem Credentials: gcloud Application Default Credentials of the operator. Log has counts only, no user IDs.
cd /d "%~dp0.."
if not exist ops\logs mkdir ops\logs
rem Redirection goes first: "echo ... 0>> file" would redirect handle 0 and drop the exit code.
>> ops\logs\cleanup.log echo [%date% %time%] start
node ops\cleanup-cli.mjs --project=yaguking-bc25c --apply >> ops\logs\cleanup.log 2>&1
>> ops\logs\cleanup.log echo [%date% %time%] exit %errorlevel%
