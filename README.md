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

## Monitor control room

The landing screen is a six-monitor rig with metal mounts and pink cables, inspired by the supplied reference. Click a monitor to zoom into it. Use **Control room** or Escape to zoom back out. Keyboard navigation, small-screen layouts, and reduced-motion preferences are supported.

- **Name your fate:** editable random name wheel, separate from the tournament roster.
- **Players & rules:** ten tournament names, scoring weights, multiplier, and prizes.
- **To Live:** first cut, 10 players down to 8.
- **To Die:** second cut, 8 players down to 6.
- **Rebirth:** rotating 3v3 final, automatic points and standings.
- **Leaderboard:** cuts, podium, prizes, and CSV export.

## Name wheel

Type or paste one name per line. Edit a line to rename it; delete the line to remove it. There is no fixed entry-count limit or ten-name restriction on the wheel. Very large lists remain subject to device memory and the existing 2 MB backup/save size limit. With more than 60 entries, labels are hidden; with more than 360, the wheel uses a decorative overview. Selection still includes every entry equally using browser cryptographic randomness. Duplicate lines receive separate chances.

Spin, optionally remove each winner automatically, remove a selected entry manually, shuffle the list, or copy the tournament names. **Add to tournament roster** fills the next empty tournament slot without changing the wheel. The tournament format itself remains ten players. The wheel list and removal preference are saved and included in backups.

## Tournament flow

1. **Players & rules:** enter 10 unique names. Win points default to 1, goal points to 1.5, and the games 1–2 multiplier to 2. Prizes default to $18, $8, and $4.
2. **To Live:** assign five players per team and enter five games. Four from each team advance by goals per match. All players must have all five scores, including explicit zeroes.
3. **To Die:** the eight survivors appear automatically. Assign two new teams of four. Enter three goal scores per team per game and leave the sitting player's cell blank. A zero counts as played; a blank does not. Each player must play at least once to qualify. Three per team advance by this round's average.
4. **Rebirth:** the six survivors start at zero. Follow the displayed schedule of all ten unique 3v3 splits once each. Every player plays ten matches; each pair are teammates four times and opponents six times. Keep the finalist slots and game order fixed before play. Select a game, type goals or use the +/− counters, then mark the winning team. This adds one win for each teammate and a loss for each opponent; it cannot assign mixed outcomes to the same team. All points in games 1 and 2 receive the multiplier; games 3–10 use normal points. Goal points and win points update independently as each value is entered. The table also displays raw goals, wins, and completed matches. Missing scores or results keep prizes provisional until all ten games are complete.
5. **Leaderboard:** follow cuts, final standings, and prizes. Prizes appear after all regulation results are entered. Tied podium prizes remain unassigned.

Yellow controls are editable. Gray cells are calculated. Advance is green, cut is red, and relevant ties display **TIE - EXTRA GAMES NEEDED**. Rankings during incomplete rounds are provisional; nobody advances until the round is complete.

Normal final points = **1.5 × goals + 1 for a win**. Games 1–2 double the entire score. Rotation balances match counts, but double games mean weighted exposure is not identical. Set the multiplier to 1 before play if all matches should have equal weight.

## Extra games

Click **Add extra game** after regulation play for tied cut or podium groups. Enter a score for every player in that tied group. For a final extra game, enter both goals and W/L; it uses normal scoring without the games 1–2 multiplier.

If players remain tied, add another extra game and score only the remaining tied subgroup. Extra games are compared in sequence, so an already resolved place is preserved. Regulation totals and averages do not change. Up to 50 extra games per stage are supported.

## Saving and recovery

- Changes save automatically to `tournament.json` in this folder. Wait for **All changes saved** before closing the browser.
- Existing ten-game saves retain all scores, players, settings, and prizes; the new wheel starts empty.
- Older five-game saves are upgraded automatically: names and cutting rounds are kept, scoring defaults become goal 1.5 / win 1, and the final restarts with ten empty games. Any old final scores and their scoring settings are preserved under `legacy_final` in the downloadable JSON backup. They are not silently counted as rotation games.
- **Download backup** saves the full tournament as JSON. **Restore backup** validates and restores it.
- **Export CSV** downloads the player summary.
- Player records use permanent IDs, so renaming someone does not move their scores.
- If an earlier edit changes the survivor list, later scores are retained but blocked until you explicitly reset the affected stage. This prevents old scores from being silently assigned to new survivors.
- Simultaneous edits from another browser tab produce a conflict instead of silently overwriting progress. Reload the older tab.
- Tournament data and backups are excluded from git. The repository starts with blank player names, assignments, and results.

Use a custom save location with `python app.py --data path/to/tournament.json`.

## Test

```sh
python -m unittest discover -s tests -v
```

The tests cover advancement, team-local ranks, blank versus zero, exact averages, multiple extra games, final multipliers, podium ties, prize allocation, invalid input, roster changes, HTTP saves, persistence, revision conflicts, all ten unique splits, pair balance, team-consistent results, game-ten scoring, legacy-save migration, large wheel lists, wheel persistence, and independent live goal/win points.
