# Brawl Hockey Tournament Dashboard

A local Python dashboard for 10 players, **Like Never Before** and **What Do You Want?** cutting rounds, and the **You Wanted to Win, Right?** final. All calculations run in Python. No extra packages, accounts, or internet connection are needed to run it.

## Run

Install Python 3.10 or newer if it is not already installed, download this repository, and open a terminal in its folder:

```sh
python app.py
```

On macOS/Linux, use `python3 app.py`. On Windows, you can also double-click `start.bat`.

The dashboard opens at **http://127.0.0.1:8765**. Leave the terminal running while using it. Press Ctrl+C to stop. If the port is occupied, run `python app.py --port 8766`.

This runs on your computer. A GitHub repository stores the code; it does not host the running Python dashboard. For private GitHub Codespaces use, forward port 8765 privately and run `python app.py --no-browser` in its terminal. Do not expose the app as a public service.

## Cube-room headquarters

The landing screen is a locally rendered 3D city with five physical room entrances. Click a cube to fly into its room; use **Leave room** or Escape to return. No external graphics packages or downloads are needed. Browsers without WebGL receive a static projection of the city.

Set the tournament's date and time in **Players & rules → Doomsday countdown**, or click **Set start time** on the landing screen. The city begins clean and deteriorates in small timed steps throughout the saved countdown: darkening skies, damaged buildings, falling aircraft, missiles, fires, smoke, rubble, and background camera shakes. Damage updates every 1–30 seconds depending on the countdown length and reaches maximum destruction at zero. The server saves the countdown's starting point, so reloading or restarting keeps the correct damage level. Changing the deadline starts a new clean progression; clearing it restores a peaceful city. Backups and Undo preserve the saved timeline. Existing countdowns from older versions start their progression when first opened after upgrading.

**Pause world** and reduced-motion preferences stop movement and shakes, but the countdown and damage level continue updating. Camera shakes affect the city, never scoring panels.

When a round's final match is submitted and the round is settled, a skippable cartoon "into the furnace" cutscene plays before the standings appear: a crowd of stickman throwers walks each eliminated player (a labelled stickman carried overhead) across to a giant furnace and heaves them into the glowing mouth with a comic POOF, one victim at a time. Like Never Before and What Do You Want? carry the two cut players; You Wanted to Win, Right? carries the non-podium finishers. Each round triggers independently; finishing You Wanted to Win, Right? is not required for the Like Never Before or What Do You Want? cutscenes. If extra games are needed, the cutscene appears when saved scores settle that round. Cutscenes open above the scoring and result windows; Skip, Escape, or natural completion returns to that round's standings. Keyboard navigation, small-screen layouts, and reduced-motion preferences are supported (the ambient shake and the cutscene carry become a static ELIMINATED summary under reduced motion). A Doomsday panel lets you set and save the tournament start time; it counts down to the second and changes to **DOOMSDAY HAS ARRIVED** when the time passes.

- **Players & rules:** ten tournament names, scoring weights, multiplier, and prizes.
- **Like Never Before:** first cut, 10 players down to 8.
- **What Do You Want?:** eight rotating 3v3 matches, 8 players down to 6.
- **You Wanted to Win, Right?:** rotating 3v3 final, automatic points and standings.
- **Leaderboard:** cuts, podium, prizes, and CSV export.

## Survival path

A first-person, street-level 3D pathway connects Players & rules → Like Never Before → What Do You Want? → You Wanted to Win, Right?. The camera begins at standing height in the entrance lane and shows the next room ahead down the street. Players & rules is open first; ten unique names unlock Like Never Before. Settling Like Never Before unlocks What Do You Want?, and settling What Do You Want? unlocks You Wanted to Win, Right?. Locked rooms are dark and cannot be opened from the cubes, route, or navigation. The current round pulses, completed rounds show their cuts, and upcoming rooms have closed shutters until qualification is settled. When you return to headquarters after settling a round, a light travels along the road and the next room opens. Ties keep the next entrance sealed. Corrections and Undo update the path; reloading restores the correct stage without replaying unlocks. Locked rooms display the prerequisite needed to open them. Opening a room moves the camera down the street and through its doorway; Escape returns to the path entrance. The room cards remain below the street as accessible controls, and the tower and podium buttons open separate first-person plazas. Correcting earlier results can relock later rooms; the current screen then returns to the earliest required step. Players & rules and the Leaderboard stay accessible. Reduced motion shows the settled state immediately.

## Player towers and the rising podium

The Survivor District gives every tournament player a named, illuminated 3D tower. Once Like Never Before is settled, its two cut players lose their lights and their towers collapse into rubble. What Do You Want? drops two more, leaving six finalist towers. Countdown damage never eliminates a player. Score corrections and Undo restore the correct towers; reloads show saved results without replaying collapses. Animations wait until the district is visible and pause with Pause world.

The live podium appears at headquarters, in You Wanted to Win, Right?, and on the Leaderboard. It updates from saved final points and animates position changes. Tied positions show everyone sharing that rank, with no arbitrary winner or awarded prize. All three platforms rise and show the winners' names, points, and prizes only when the whole final is settled. Reduced motion shows results immediately. The existing furnace cutscene still plays independently after each settled round.

## Like Never Before per-game teams

Players are entered directly in **Players & rules**. There is no standalone name wheel, team-draw wheel, **Open team wheel** button, per-player Team dropdown, or **Reset spin** control.

Each of the five Like Never Before games gets its own **fresh random 5v5 split**, generated automatically on the server with cryptographic randomness. Advancement is decided by each player's **total goals** (and goals-per-match average) across all five games. Teams define which players share each game's three-goal limit; qualification is still ranked across all ten players.

The five splits are generated once, saved, and included in backups, so they stay stable across reloads. If you want to vary the matchups for a specific game, use its **Reshuffle teams** button on the Like Never Before screen to draw a new random split for that game. Reshuffling is **locked once a game has any score entered**, so it can never silently invalidate recorded goals; clear the game's scores first if you need to reshuffle it.

## What Do You Want? — five reshuffleable 4v4 games

1. After Like Never Before, choose **Generate balanced 4v4 games**. This draws five saved 4v4 matchups for the eight survivors, varying teammates and opponents across games.
2. Before scoring the current game, click **Reshuffle teams** if you want a different 4v4 lineup. The new draw replaces *only that game's* teams and prioritizes balanced teammate exposure across the whole five-game schedule.
3. Once any player has a score entered for the game, the reshuffle button locks. Clear that game's scores to re-enable reshuffling. Past completed games cannot be reshuffled.
4. Enter scores for all eight players in each of **five games**, including explicit zeroes; nobody sits out. Teams must obey the three-goal combined limit and cannot tie 3–3.
5. Click **Match N done** to unlock the next game. Individual average goals per game determines advancement: top six survive; bottom two are eliminated; a sixth/seventh tie requires extra games.

Lineups are saved, so reloads do not change them. The reshuffle action does not erase goals or change the teams of any other game. Randomization reduces structural teammate bias but cannot guarantee equally strong teams.

## Tournament flow

1. **Players & rules:** enter 10 unique names. Win points default to 1, goal points to 1.5, and the games 1–2 multiplier to 2. Prizes default to $18, $8, and $4.
2. **Like Never Before:** each of the five games gets an automatic fresh random 5v5 split. Ranking is by individual total goals rather than team wins; an optional per-game **Reshuffle teams** button draws a new split and locks once that game has any score. Enter all five games, with a score for every one of the ten players each game including explicit zeroes. Rank all ten players together by total goals (and goals per match): the top eight advance, the bottom two are cut. A tie across eighth and ninth requires extra games.
3. **What Do You Want?:** the eight survivors play five 4v4 matches with balanced, changing teammates and opponents. A **Reshuffle teams** button is available before recording any goals for the current game; completed games and saved scores are protected. No player sits out. Enter eight scores including zeroes per game. Rank all individuals by average goals per match: the top six advance, bottom two are cut, and ties across sixth/seventh require extra games.
4. **You Wanted to Win, Right?:** the six survivors start at zero. Follow the displayed schedule of eight balanced 3v3 matches. Every player plays eight matches; teammate and opponent counts are kept as even as possible. Keep the finalist slots and game order fixed before play. Select a game, type goals or use the +/− counters, then mark the winning team. This adds one win for each teammate and a loss for each opponent; it cannot assign mixed outcomes to the same team. All points in games 1 and 2 receive the multiplier; games 3–8 use normal points. Goal points and win points update independently as each value is entered. The table also displays raw goals, wins, and completed matches. Missing scores or results keep prizes provisional until all eight games are complete.
5. **Leaderboard:** follow cuts, final standings, and prizes. Prizes appear after all regulation results are entered. Tied podium prizes remain unassigned.

Yellow controls are editable. Gray cells are calculated. Advance is green, cut is red, and relevant ties display **TIE - EXTRA GAMES NEEDED**. Rankings during incomplete rounds are provisional; nobody advances until the round is complete.

### Team goal limit

Every scheduled game in Like Never Before, What Do You Want?, and You Wanted to Win, Right? allows **at most three goals per team**, summed across its players. Once either team reaches three, its opponents can have at most two. A 3–0, 3–1, or 3–2 score is valid; 3–3 and any total above three are rejected. Scores below three can still be entered normally.

The match screen shows the current team totals. **When either team scores its third goal, all remaining blank player goal fields on BOTH teams automatically become 0**. Existing goal entries are preserved, other games remain unchanged, and the zeroes are saved with the other scores. This applies to all three scheduled rounds (5v5, 4v4, and 3v3); extra-game inputs are unaffected. Goal inputs and + buttons use the remaining team allowance immediately, including the Like Never Before score table. Lowering or clearing a score reopens the allowance; use **Clear this game** to reset all goal entries for that match. The server enforces the same goal limits for saves and backup restores, so a direct request cannot bypass the caps.

Old saved scores above these limits are retained for correction. They block round completion; lower or clear the incorrect scores before continuing. Extra-game entries are capped at three per player; team-total validation uses the assigned teams in the scheduled matches.

### Per-match submit, standings popup, and final fullscreen

Each round has a per-match **Submit Match N of X** control: Like Never Before has five games, What Do You Want? has five matches, and You Wanted to Win, Right? has eight games. The control stays disabled until that match is ready (every active player in it has a score, including explicit zeroes) and the stage is not stale.

- **Submitting a non-final match** opens a dismissible popup with the cumulative round standings through that match. It lists each player's rank, name, running total, average, and provisional status. The totals and averages are summed over the matches played so far, not just the one match you submitted. Close the popup to continue to the next match.
- **Submitting the final match** of a round opens a fullscreen total round ranking for all players, with totals, an average column, and a status badge each. For the two cutting rounds (Like Never Before and What Do You Want?) the badge is **ADVANCE**, **CUT**, or **TIE** and the average column shows goals per match. For You Wanted to Win, Right?, which decides the podium rather than a cut, the badge is **FINAL** or **TIE** (there is no "cut" to a next round) and the average column shows average points per game (total points / games played). When no tie exists the fullscreen reports that the round is settled. When a tie sits across the cut line, the fullscreen states that extra games are needed and hosts the **Add extra game** controls directly. As you enter and save extra scores the fullscreen recomputes live and flips **TIE** to the settled badge as the bubble resolves; if players stay tied it asks for another extra game. Close the fullscreen to return to the dashboard.

What Do You Want? uses a **Match N of 5 done** server flow, advancing the saved per-game team match, and then shows the same popup or fullscreen. Like Never Before and You Wanted to Win, Right? use client-side submit controls that read the already-entered per-game scores, so no extra server round-trip is needed to show their standings.

Normal final points = **1.5 × goals + 1 for a win**. Games 1–2 double the entire score. Rotation balances match counts, but double games mean weighted exposure is not identical. Set the multiplier to 1 before play if all matches should have equal weight.

### Easier controls: clear a round, next-step guide, self-explaining buttons, and Undo

A few quality-of-life controls make the dashboard easier to operate:

- **Clear this round.** Every round screen has a visible **Clear this round** panel, available at any time (not only when a round is out of sync). It clears that round and every later round, but never an earlier one:
  - **Clear Like Never Before** clears Like Never Before, What Do You Want?, and You Wanted to Win, Right?.
  - **Clear What Do You Want?** clears What Do You Want? and You Wanted to Win, Right?, keeping Like Never Before.
  - **Clear You Wanted to Win, Right?** clears You Wanted to Win, Right? only, keeping Like Never Before and What Do You Want?.
  The panel copy states exactly which rounds it clears, and the action can be undone immediately afterwards.
- **Clear names and clear scoring (Players & rules).** The Players & rules screen has two separate controls so you can reset the roster or the scoring independently:
  - **Clear player names** blanks all ten name slots only. Scoring, prizes, and every round score stay exactly as they are. (With the roster empty, the rounds show the usual "enter 10 unique names" state until you refill it.)
  - **Clear scoring** resets the point values that apply to all rounds back to defaults: win points to 1, goal points to 1.5, and the games 1-2 multiplier to 2. Names, prizes, and round scores are untouched.
  Each is a separate button with copy stating exactly what it clears, and both can be undone immediately afterwards.
- **What to do next.** The Leaderboard shows a prominent next-step banner that names the next concrete action (enter 10 names, score and submit Like Never Before, resolve a tie, draw and play What Do You Want?, play You Wanted to Win, Right?, or review the podium) and includes a button that opens the relevant screen. The wording follows the current stage and its first unmet requirement, and the round path still highlights the next step.
- **Self-explaining disabled controls.** When a primary action is disabled (a per-match **Submit**, the Like Never Before **Reshuffle teams**, the What Do You Want? **Generate balanced 4v4 games** / **Reshuffle teams** / **Match N done** / match tabs, or the You Wanted to Win, Right? **Mark win**), it shows a short reason next to it and as a tooltip, for example "Enter a score for every player in Game 3 first", "This game already has scores. Clear them before reshuffling.", or "Finish Match 2 before opening the next." No control silently does nothing.
- **One-level Undo.** Every destructive action (clear a round, clear a single game, reshuffle Like Never Before teams, clear player names, clear scoring, or clear the whole tournament) now acts immediately and then offers an **Undo** button near the save status. Clicking it restores the exact prior state and saves it. Undo is one level deep: taking a second destructive action replaces what Undo would restore.


## What Do You Want? matchup balancing

Each game independently contains four players on Team A and four on Team B. The system saves five different team compositions, tries to avoid repeated teammate pairings, and balances appearances on the A and B sides. The **Reshuffle teams** button replaces the upcoming unscored game's matchup with another division of the same eight players. Existing matchups are untouched.

## Extra games

Extra games use a boundary-bubble model. Only the players tied across the cut line play extra games: the cluster straddling 8th and 9th across all ten players in Like Never Before, the cluster straddling 6th and 7th in What Do You Want?, and the tied podium group in You Wanted to Win, Right?. Players who were never in the tie are not disturbed. A clear advancer, such as a unique rank 1 or 2, keeps its place, and a clear cut stays cut.

Click **Add extra game** after regulation play for the tied group. Enter a score for every player in that tied group. For a final extra game, enter both goals and W/L; it uses normal scoring without the games 1–2 multiplier.

Extra-game goals fold into the tied players' numbers rather than acting as a separate tiebreak. For each bubble player the average recomputes with the exact formula:

```
average = (regulation goals + extra goals) / (regulation matches + extra matches)
```

A player's displayed total and average update as extra scores are entered, but the entire unresolved group stays marked **TIE** until everyone has a score (and W/L in You Wanted to Win, Right?). Later extra games cannot bypass missing entries. Final win points, goal points, goal/win counts, and games played include the same scored extra games as the total. Re-ranking is contained to the tied bubble, which means a cut or tied player can overtake a tied-advancing player and take their spot, while players who were never in the tie keep their ranks. The You Wanted to Win, Right? final folds the same way on points instead of goals: each extra game's points are scored normally, without the games 1–2 multiplier, and added to the bubble players' totals.

If players remain tied after an extra game, add another extra game and score only the remaining tied subgroup; already resolved places are preserved. The fullscreen total ranking recomputes live as extra scores are saved and flips **TIE** to **ADVANCE** or **CUT** as the bubble resolves. Up to 50 extra games per stage are supported.

## Saving and recovery

- Changes save automatically to `tournament.json` in this folder. Wait for **All changes saved** before closing the browser. Save status, **Retry save**, and **Undo** stay accessible inside whichever monitor or results window is open.
- Initial and migrated Like Never Before lineups are saved at startup, so restarting before the first score cannot reshuffle them.
- **Existing eight-match sit-out rotation saves are not silently reinterpreted.** Their Round 2 scores, final scores, and prior settings are copied to `legacy_round2_rotation` in the downloadable backup. The five-game 4v4 Round 2 and dependent final restart with blank scores and new team assignments. Player names, Like Never Before results, and settings are retained.
- Version 5 saves with already scored fixed-team Round 2 matches upgrade without losing scored games or final results. Completed/scored matches keep their original teams, while future unscored games receive balanced lineups.
- Original five-game-final saves also archive their old final under `legacy_final`; scoring defaults become goal 1.5 / win 1. The archived records include the old scoring settings and remain in downloadable backups.
- **Download backup** saves the full tournament as JSON. **Restore backup** validates and restores it.
- **Export CSV** downloads the player summary.
- Player records use permanent IDs, so renaming someone does not move their scores.
- If an earlier edit changes the survivor list, later scores are retained but blocked until you explicitly reset the affected stage. This prevents old scores from being silently assigned to new survivors.
- Simultaneous edits from another browser tab produce a conflict instead of silently overwriting progress. Reload the older tab.
- Tournament data and backups are excluded from git. The repository starts with blank player names, scores, and results.

Use a custom save location with `python app.py --data path/to/tournament.json`.

## Test

```sh
python -m unittest discover -s tests -v
```

If Node.js is available, verify the dashboard controls with `node tests/test_ui.cjs`.

For the optional real-browser checks, install Playwright and its Chromium browser in your development environment, then run `node tests/test_browser.cjs`. This covers all five monitors at desktop and phone sizes, cursor preservation, changed-roster recovery, extra-game entry and correction, Undo, failed-save recovery, and all five rotating 4v4 games. `PLAYWRIGHT_MODULE` and `CHROMIUM_EXECUTABLE` can select existing installations. Browser-test dependencies are not required to run the dashboard.

The tests cover advancement, top-eight-of-ten Like Never Before ranking by total goals, the per-game 5v5 splits (valid 5/5 partitions, idempotent generation, advancement independent of valid A/B grouping, and the reshuffle guard that refuses a scored game), per-game readiness requiring all ten scores, blank versus zero, exact averages, multiple extra games, the 8th/9th boundary-bubble fold, final multipliers, podium ties, prize allocation, invalid input, roster changes, HTTP saves, persistence, revision conflicts, all ten unique splits, pair balance, team-consistent results, game-ten scoring, legacy-save migration (including old fixed-team Like Never Before saves that drop their per-player team and assignment fields), large wheel lists, wheel persistence, independent live goal/win points, five-match fixed Round 2 validation, overall cut ties, invalid sit-out entries, and preservation of archived stage scores, the complete eight-match draw flow, repeat-click guards, draw persistence, and match-done UI controls.

Run `node tests/test_cutscene_browser.cjs` with the same optional Playwright/Chromium environment to check all three round cutscenes, tie settlement, native-dialog visibility, and skip behavior.
