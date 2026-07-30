---
"spool.page": minor
---

You can change which machine is working from where you are typing, and find out when you are near a usage limit in the same place.

The composer's footer says which model is answering and how hard it is thinking, and it is a button now. The menu it opens is not a list spool ships. It asks your own installed agent what it offers, every time, so a model that appeared because you upgraded your CLI is simply there and one that was retired is simply gone. Each row carries the name and the sentence your agent wrote for it, and each model brings its own effort levels. A model that supports none has no effort control at all rather than a greyed one. The rows are names, one line each, and a single line at the bottom describes whatever the cursor is on.

Choosing one sends the same message that typing `/model sonnet` sends, and the readout follows the reply rather than the press, so it can never say a machine your agent refused. The choice belongs to the thread, so one conversation can run on Opus while another runs on Haiku, and switching between them shows what each is actually using. An effort level held by an exported `CLAUDE_CODE_EFFORT_LEVEL` says so and stays where it is, because the environment outranks anything spool draws. The name in the footer truncates with an ellipsis at narrow rail widths and is never shortened: two of the offered rows resolve to the same model with only a parenthetical between them, so a trimmed name would be the correct name of a different machine.

The usage window moved into that menu. It says which limit, how much of it is gone and when it comes back, whole at every rail width. In the footer the reset time was being clipped away, which is half of what the readout is for. It is absent until your agent warns, because below that there is no number to draw, and nothing is said about overage. When a limit is reached mid-turn the log says the work is winding down, which is why the agent finishes what it is holding and starts nothing new.

The footer holds the model and the stop and nothing else. The `enter to send` hint is gone from it, because which machine is answering matters more than a keyboard hint you learn once.
