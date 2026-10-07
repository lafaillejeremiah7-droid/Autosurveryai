# Brawl Hockey Tournament Dashboard

A local Python dashboard for 10 players, **To Live** and **To Die** cutting rounds, and the **Rebirth** final. All calculations run in Python. No extra packages, accounts, or internet connection are needed to run it.

## Run

Install Python 3.10 or newer if it is not already installed, download this repository, and open a terminal in its folder:

```sh
python app.py
```

On macOS/Linux, use `python3 app.py`. On Windows, you can also double-click `start.bat`.

The dashboard opens at **http://127.0.0.1:8765**. Leave the terminal running while using it. Press Ctrl+C to stop. If the port is occupied, run `python app.py --port 8766`.

This runs on your computer. A GitHub repository stores the code; it does not host the running Python dashboard. For private GitHub Codespaces use, forward port 8765 privately and run `python app.py --no-browser` in its terminal. Do not expose the app as a public service.

## Cube-room headquarters

The landing screen is a six-room cube headquarters inspired by the supplied futuristic reference. Click a cube to zoom into its room. Use **Leave room** or Escape to zoom back out. The skyline animates with missiles, falling aircraft, fire, smoke, and embers, plus ambient nukes and explosions that flare every 1–5 seconds with a camera shake applied to the background world only (never the panels you type in); **Pause world** freezes that background while you enter scores. When a round's final match is submitted and the round is settled, a skippable cartoon "into the furnace" cutscene throws that round's eliminated players (stickmen labelled with their names) before the standings appear — To Live and To Die show the two cut players, Rebirth shows the non-podium finishers. Keyboard navigation, small-screen layouts, and reduced-motion preferences are supported (the ambient shake and the cutscene toss become a static summary under reduced motion). A Doomsday panel lets you set and save the tournament start time; it counts down to the second and changes to **DOOMSDAY HAS ARRIVED** when the time passes.

- **Name your fate:** editable random name wheel, separate from the tournament roster.
- **Players & rules:** ten tournament names, scoring weights, multiplier, and prizes.
- **To Live:** first cut, 10 players down to 8.
- **To Die:** eight rotating 3v3 matches, 8 players down to 6.
- **Rebirth:** rotating 3v3 final, automatic points and standings.
- **Leaderboard:** cuts, podium, prizes, and CSV export.

## Name wheel

Type or paste one name per line. Edit a line to rename it; delete the line to remove it. There is no fixed entry-count limit or ten-name restriction on the wheel. Very large lists remain subject to device memory and the existing 2 MB backup/save size limit. With more than 60 entries, labels are hidden; with more than 360, the wheel uses a decorative overview. Selection still includes every entry equally using browser cryptographic randomness. Duplicate lines receive separate chances.

Spin, optionally remove each winner automatically, remove a selected entry manually, shuffle the list, or copy the tournament names. **Add to tournament roster** fills the next empty tournament slot without changing the wheel. The tournament format itself remains ten players. The wheel list and removal preference are saved and included in backups.

## To Live per-game teams

To Live no longer assigns fixed teams from a wheel. The main **Name wheel** is an ordinary name draw with no team-assignment behaviour, and there is no team-draw wheel, **Open team wheel** button, per-player Team dropdown, or **Reset spin** control.

Instead, each of the five To Live games gets its own **fresh random 5v5 split**, generated automatically on the server with cryptographic randomness. Advancement is decided by each player's **total goals** (and goals-per-match average) across all five games. Teams define which players share each game's three-goal limit; qualification is still ranked across all ten players.

The five splits are generated once, saved, and included in backups, so they stay stable across reloads. If you want to vary the matchups for a specific game, use its **Reshuffle teams** button on the To Live screen to draw a new random split for that game. Reshuffling is **locked once a game has any score entered**, so it can never silently invalidate recorded goals; clear the game's scores first if you need to reshuffle it.

## Automatic Round 2 sit-out wheel

1. After To Live is complete, open **To Die** and click **Draw Match 1 sit-outs**. The wheel automatically uses the eight survivors.
2. Enter the six active players' goal counts, including zeroes. Leave the two sit-outs blank.
3. Click **Match 1 of 8 done — draw next sit-outs**. The app saves completion and opens the wheel with Match 2's pair. Repeat through Match 8.

The server shuffles the eight players into a balanced rotation once and saves that order. Subsequent clicks reveal the next pair from this random schedule. Everyone plays six times, sits exactly twice, and never sits in consecutive matches. This preserves the teammate/opponent balance; unrestricted independent spins would not guarantee it.

Future match controls stay locked until the preceding match is marked done. Missing scores prevent advancement. Double-clicking cannot skip a match, and refreshing cannot reroll a pair. The draw and match progress are included in backups. The wheel has separate **Open name draw** and **To Die · sit-out draw** modes, so editing the unlimited list does not change the tournament draw.

Previously entered eight-match Round 2 scores keep their original schedule when upgraded; a new, unstarted round uses the randomized draw.

## Tournament flow

1. **Players & rules:** enter 10 unique names. Win points default to 1, goal points to 1.5, and the games 1–2 multiplier to 2. Prizes default to $18, $8, and $4.
2. **To Live:** each of the five games gets an automatic fresh random 5v5 split. Ranking is by individual total goals rather than team wins; an optional per-game **Reshuffle teams** button draws a new split and locks once that game has any score. Enter all five games, with a score for every one of the ten players each game including explicit zeroes. Rank all ten players together by total goals (and goals per match): the top eight advance, the bottom two are cut. A tie across eighth and ninth requires extra games.
3. **To Die:** the eight survivors enter the automatic sit-out draw and follow its eight-game rotation. Six play 3v3 and two sit out each match. Everyone plays six games and sits twice, with three appearances in each four-game half and no consecutive rests. Each pair are teammates once or twice and opponents two or three times. Enter all six scheduled goal scores, including zeroes; sit-out cells stay blank. A missing score for an active player prevents completion. Rank all eight together using only this round's goals per match: top six overall advance, bottom two are cut. A tie across sixth and seventh requires extra games. There are no permanent Round 2 teams. The app saves and locks the random slots before scoring.
4. **Rebirth:** the six survivors start at zero. Follow the displayed schedule of all ten unique 3v3 splits once each. Every player plays ten matches; each pair are teammates four times and opponents six times. Keep the finalist slots and game order fixed before play. Select a game, type goals or use the +/− counters, then mark the winning team. This adds one win for each teammate and a loss for each opponent; it cannot assign mixed outcomes to the same team. All points in games 1 and 2 receive the multiplier; games 3–10 use normal points. Goal points and win points update independently as each value is entered. The table also displays raw goals, wins, and completed matches. Missing scores or results keep prizes provisional until all ten games are complete.
5. **Leaderboard:** follow cuts, final standings, and prizes. Prizes appear after all regulation results are entered. Tied podium prizes remain unassigned.

Yellow controls are editable. Gray cells are calculated. Advance is green, cut is red, and relevant ties display **TIE - EXTRA GAMES NEEDED**. Rankings during incomplete rounds are provisional; nobody advances until the round is complete.

### Team goal limit

Every scheduled game in To Live, To Die, and Rebirth allows **at most three goals per team**, summed across its players. Once either team reaches three, its opponents can have at most two. A 3–0, 3–1, or 3–2 score is valid; 3–3 and any total above three are rejected. Scores below three can still be entered normally.

The match screen shows the current team totals. Goal inputs and + buttons use the remaining team allowance immediately, including the To Live score table. Lowering or clearing a score reopens the allowance. The server enforces the same rules for saves and backup restores, so a direct request cannot bypass the controls.

Old saved scores above these limits are retained for correction. They block round completion; lower or clear the incorrect scores before continuing. Extra-game entries are capped at three per player; team-total validation uses the assigned teams in the scheduled matches.

### Per-match submit, standings popup, and final fullscreen

Each round has a per-match **Submit Match N of X** control: To Live has five games, To Die has eight matches, and Rebirth has ten games. The control stays disabled until that match is ready (every active player in it has a score, including explicit zeroes) and the stage is not stale.

- **Submitting a non-final match** opens a dismissible popup with the cumulative round standings through that match. It lists each player's rank, name, running total, average, and provisional status. The totals and averages are summed over the matches played so far, not just the one match you submitted. Close the popup to continue to the next match.
- **Submitting the final match** of a round opens a fullscreen total round ranking for all players, with totals, an average column, and a status badge each. For the two cutting rounds (To Live and To Die) the badge is **ADVANCE**, **CUT**, or **TIE** and the average column shows goals per match. For Rebirth, which decides the podium rather than a cut, the badge is **FINAL** or **TIE** (there is no "cut" to a next round) and the average column shows average points per game (total points / games played). When no tie exists the fullscreen reports that the round is settled. When a tie sits across the cut line, the fullscreen states that extra games are needed and hosts the **Add extra game** controls directly. As you enter and save extra scores the fullscreen recomputes live and flips **TIE** to the settled badge as the bubble resolves; if players stay tied it asks for another extra game. Close the fullscreen to return to the dashboard.

To Die keeps its existing **Match N of 8 done** server flow, which also advances the sit-out draw, and then shows the same popup or fullscreen. To Live and Rebirth use client-side submit controls that read the already-entered per-game scores, so no extra server round-trip is needed to show their standings.

Normal final points = **1.5 × goals + 1 for a win**. Games 1–2 double the entire score. Rotation balances match counts, but double games mean weighted exposure is not identical. Set the multiplier to 1 before play if all matches should have equal weight.

### Easier controls: clear a round, next-step guide, self-explaining buttons, and Undo

A few quality-of-life controls make the dashboard easier to operate:

- **Clear this round.** Every round screen has a visible **Clear this round** panel, available at any time (not only when a round is out of sync). It clears that round and every later round, but never an earlier one:
  - **Clear To Live** clears To Live, To Die, and Rebirth.
  - **Clear To Die** clears To Die and Rebirth, keeping To Live.
  - **Clear Rebirth** clears Rebirth only, keeping To Live and To Die.
  The panel copy states exactly which rounds it clears, and the action can be undone immediately afterwards.
- **Clear names and clear scoring (Players & rules).** The Players & rules screen has two separate controls so you can reset the roster or the scoring independently:
  - **Clear player names** blanks all ten name slots only. Scoring, prizes, and every round score stay exactly as they are. (With the roster empty, the rounds show the usual "enter 10 unique names" state until you refill it.)
  - **Clear scoring** resets the point values that apply to all rounds back to defaults: win points to 1, goal points to 1.5, and the games 1-2 multiplier to 2. Names, prizes, and round scores are untouched.
  Each is a separate button with copy stating exactly what it clears, and both can be undone immediately afterwards.
- **What to do next.** The Leaderboard shows a prominent next-step banner that names the next concrete action (enter 10 names, score and submit To Live, resolve a tie, draw and play To Die, play Rebirth, or review the podium) and includes a button that opens the relevant screen. The wording follows the current stage and its first unmet requirement, and the round path still highlights the next step.
- **Self-explaining disabled controls.** When a primary action is disabled (a per-match **Submit**, the To Live **Reshuffle teams**, the To Die **Draw sit-outs** / **Match N done** / match tabs, the Rebirth **Mark win**, or the wheel **Spin**), it shows a short reason next to it and as a tooltip, for example "Enter a score for every player in Game 3 first", "This game already has scores. Clear them before reshuffling.", "Finish Match 2 before opening the next.", or "Add at least one name to spin." No control silently does nothing.
- **One-level Undo.** Every destructive action (clear a round, clear a single game, reshuffle To Live teams, clear player names, clear scoring, or clear the whole tournament) now acts immediately and then offers an **Undo** button near the save status. Clicking it restores the exact prior state and saves it. Undo is one level deep: taking a second destructive action replaces what Undo would restore.


## To Die rotation schedule

Slots 1–8 are randomly assigned once when the first sit-out draw starts. The table is the balanced slot template; the dashboard reveals the actual names match by match. An already-started older save retains its existing slots.

| Game | Team A | Team B | Sit out |
| --- | --- | --- | --- |
| 1 | 3, 4, 7 | 5, 6, 8 | 1, 2 |
| 2 | 5, 6, 1 | 7, 8, 2 | 3, 4 |
| 3 | 7, 8, 3 | 1, 2, 4 | 5, 6 |
| 4 | 1, 2, 5 | 3, 4, 6 | 7, 8 |
| 5 | 4, 5, 8 | 6, 7, 1 | 2, 3 |
| 6 | 6, 7, 2 | 8, 1, 3 | 4, 5 |
| 7 | 8, 1, 4 | 2, 3, 5 | 6, 7 |
| 8 | 2, 3, 6 | 4, 5, 7 | 8, 1 |

## Extra games

Extra games use a boundary-bubble model. Only the players tied across the cut line play extra games: the cluster straddling 8th and 9th across all ten players in To Live, the cluster straddling 6th and 7th in To Die, and the tied podium group in Rebirth. Players who were never in the tie are not disturbed. A clear advancer, such as a unique rank 1 or 2, keeps its place, and a clear cut stays cut.

Click **Add extra game** after regulation play for the tied group. Enter a score for every player in that tied group. For a final extra game, enter both goals and W/L; it uses normal scoring without the games 1–2 multiplier.

Extra-game goals fold into the tied players' numbers rather than acting as a separate tiebreak. For each bubble player the average recomputes with the exact formula:

```
average = (regulation goals + extra goals) / (regulation matches + extra matches)
```

A player's displayed total and average update as extra scores are entered, but the entire unresolved group stays marked **TIE** until everyone has a score (and W/L in Rebirth). Later extra games cannot bypass missing entries. Final win points, goal points, goal/win counts, and games played include the same scored extra games as the total. Re-ranking is contained to the tied bubble, which means a cut or tied player can overtake a tied-advancing player and take their spot, while players who were never in the tie keep their ranks. The Rebirth final folds the same way on points instead of goals: each extra game's points are scored normally, without the games 1–2 multiplier, and added to the bubble players' totals.

If players remain tied after an extra game, add another extra game and score only the remaining tied subgroup; already resolved places are preserved. The fullscreen total ranking recomputes live as extra scores are saved and flips **TIE** to **ADVANCE** or **CUT** as the bubble resolves. Up to 50 extra games per stage are supported.

## Saving and recovery

- Changes save automatically to `tournament.json` in this folder. Wait for **All changes saved** before closing the browser. Save status, **Retry save**, and **Undo** stay accessible inside whichever monitor or results window is open.
- Initial and migrated To Live lineups are saved at startup, so restarting before the first score cannot reshuffle them.
- Existing saves from the old fixed-team Round 2 are upgraded to the eight-match format. To Live, player names, wheel entries, and settings stay intact. Old Round 2 and final records are preserved under `legacy_round2` in the downloadable JSON backup. To Die and Rebirth restart with empty scores because the new rotation changes Round 2 qualification. Saves already using the eight-match format retain all data.
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

For the optional real-browser checks, install Playwright and its Chromium browser in your development environment, then run `node tests/test_browser.cjs`. This covers all six monitors at desktop and phone sizes, cursor preservation, changed-roster recovery, extra-game entry and correction, Undo, failed-save recovery, all eight Round 2 draws, and overlapping wheel clicks. `PLAYWRIGHT_MODULE` and `CHROMIUM_EXECUTABLE` can select existing installations. Browser-test dependencies are not required to run the dashboard.

The tests cover advancement, top-eight-of-ten To Live ranking by total goals, the per-game 5v5 splits (valid 5/5 partitions, idempotent generation, advancement independent of valid A/B grouping, and the reshuffle guard that refuses a scored game), per-game readiness requiring all ten scores, blank versus zero, exact averages, multiple extra games, the 8th/9th boundary-bubble fold, final multipliers, podium ties, prize allocation, invalid input, roster changes, HTTP saves, persistence, revision conflicts, all ten unique splits, pair balance, team-consistent results, game-ten scoring, legacy-save migration (including old fixed-team To Live saves that drop their per-player team and assignment fields), large wheel lists, wheel persistence, independent live goal/win points, eight-match Round 2 balance, overall cut ties, invalid sit-out entries, and preservation of archived stage scores, the complete eight-match draw flow, repeat-click guards, draw persistence, and match-done UI controls.

