@echo off
rem YaguKing cleanup - run daily by Windows Task Scheduler ("YaguKing cleanup", docs/deploy.md section 6).
rem Deletes rooms older than 24h, orphan seats, guests inactive for 30 days, admin logs older than 2 years (ops/cleanup.mjs),
rem then runs queued admin tasks and the account copy sync for the admin site (ops/admin-cli.mjs).
rem Credentials: gcloud Application Default Credentials of the operator. Log has counts only, no user IDs.
cd /d "%~dp0.."
if not exist ops\logs mkdir ops\logs
rem Redirection goes first: "echo ... 0>> file" would redirect handle 0 and drop the exit code.
>> ops\logs\cleanup.log echo [%date% %time%] start
node ops\cleanup-cli.mjs --project=yaguking-bc25c --apply >> ops\logs\cleanup.log 2>&1
>> ops\logs\cleanup.log echo [%date% %time%] cleanup exit %errorlevel%
rem Admin: process queued admin tasks, then refresh the account copy (accountMirror) for the admin site.
node ops\admin-cli.mjs tasks --project=yaguking-bc25c >> ops\logs\cleanup.log 2>&1
node ops\admin-cli.mjs sync --project=yaguking-bc25c >> ops\logs\cleanup.log 2>&1
rem Nightly stats: yesterday's games summarized into adminDaily/YYYYMMDD (the admin dashboard reads only this).
node ops\admin-cli.mjs daily --project=yaguking-bc25c >> ops\logs\cleanup.log 2>&1
rem Official round: grade yesterday, publish today/tomorrow from the local pool (answers stay on this PC), delete rounds older than 40 days.
node ops\admin-cli.mjs official --project=yaguking-bc25c --pool=ops\official\pool.csv >> ops\logs\cleanup.log 2>&1
rem Monthly ranking: attendance points through yesterday into leaderboards/YYYYMM; on the 1st, finalize last month and give titles.
node ops\admin-cli.mjs monthly --project=yaguking-bc25c >> ops\logs\cleanup.log 2>&1
>> ops\logs\cleanup.log echo [%date% %time%] admin exit %errorlevel%
