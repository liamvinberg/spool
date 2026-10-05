---
"spool.page": minor
---

A team's projects that aren't on this Mac yet show dimmed on its page in Home, each with Get it. Get it puts the project in a clone of its repo you already have here, in another folder you pick, or just on this Mac under your projects folder, and it syncs live from then on. Spool never clones a repo for you: the sheet shows the command to clone it yourself.

An existing project can now become a team project with Move to team… in its cover menu or in Settings. Spool uploads the whole project first and changes nothing until the team has every file. Then it makes one commit on your current branch, "design: moved to Spool Cloud", that takes `design/` out of git, keeps the files on disk and adds `spool.json`. The commit runs no hooks, waits for any merge or rebase to finish, and is never pushed. History from before the move stays in git. Teammates who pull that commit get their `design/` filled again from the team instead of losing it.

Team projects now record which repo their code lives in, read from `origin`. An ssh and an https remote for the same repo count as one repo.
