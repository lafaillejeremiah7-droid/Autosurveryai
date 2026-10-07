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
- **To Die:** eight rotating 3v3 matches, 8 players down to 6.
- **Rebirth:** rotating 3v3 final, automatic points and standings.
- **Leaderboard:** cuts, podium, prizes, and CSV export.

## Name wheel

Type or paste one name per line. Edit a line to rename it; delete the line to remove it. There is no fixed entry-count limit or ten-name restriction on the wheel. Very large lists remain subject to device memory and the existing 2 MB backup/save size limit. With more than 60 entries, labels are hidden; with more than 360, the wheel uses a decorative overview. Selection still includes every entry equally using browser cryptographic randomness. Duplicate lines receive separate chances.

Spin, optionally remove each winner automatically, remove a selected entry manually, shuffle the list, or copy the tournament names. **Add to tournament roster** fills the next empty tournament slot without changing the wheel. The tournament format itself remains ten players. The wheel list and removal preference are saved and included in backups.

## To Live teams from the Name wheel

There is a single wheel. Spinning the main **Name wheel** assigns To Live teams automatically; there is no separate team-draw wheel or **Open team wheel** button.

**Name to player rule.** The Name wheel spins over the entry list, while teams attach to the ten fixed tournament players in **Players & rules**. When the wheel lands on an entry, the dashboard matches it to a tournament player by name, ignoring surrounding spaces and letter case:

1. The landed name matches a tournament player who has **no team yet** → that exact player is instantly assigned a random Team A or B. The server flips an unbiased coin, saves it, and returns the result; the coin flip is never computed in the browser. No extra click is needed.
2. The landed name matches a tournament player who **already has a team** → nothing is reassigned; the winner is shown with a short note that they already have a team.
3. The landed name is **not** a tournament player → it behaves as an ordinary name draw (remove the entry or add it to an empty roster slot) and no team is assigned.

If several roster slots share the same name, the first still-unassigned match in player order is chosen. Teams are capped at five, so once a side already has five players every remaining assignment goes to the other side, and the draw always finishes exactly five A and five B.

You can still change any team by hand from the dropdown in the To Live score table. **Reset spin**, reachable from the **To Live** screen, is the only way to undo wheel draws: it clears every wheel-assigned team but keeps teams you set manually. The wheel assignments are saved and included in backups.

## Automatic Round 2 sit-out wheel

1. After To Live is complete, open **To Die** and click **Draw Match 1 sit-outs**. The wheel automatically uses the eight survivors.
2. Enter the six active players' goal counts, including zeroes. Leave the two sit-outs blank.
3. Click **Match 1 of 8 done — draw next sit-outs**. The app saves completion and opens the wheel with Match 2's pair. Repeat through Match 8.

The server shuffles the eight players into a balanced rotation once and saves that order. Subsequent clicks reveal the next pair from this random schedule. Everyone plays six times, sits exactly twice, and never sits in consecutive matches. This preserves the teammate/opponent balance; unrestricted independent spins would not guarantee it.

Future match controls stay locked until the preceding match is marked done. Missing scores prevent advancement. Double-clicking cannot skip a match, and refreshing cannot reroll a pair. The draw and match progress are included in backups. The wheel has separate **Open name draw** and **To Die · sit-out draw** modes, so editing the unlimited list does not change the tournament draw.

Previously entered eight-match Round 2 scores keep their original schedule when upgraded; a new, unstarted round uses the randomized draw.

## Tournament flow

1. **Players & rules:** enter 10 unique names. Win points default to 1, goal points to 1.5, and the games 1–2 multiplier to 2. Prizes default to $18, $8, and $4.
2. **To Live:** assign five players per team, by spinning the single Name wheel (landing on a tournament player auto-assigns them a capped random Team A/B) or picking teams by hand, then enter five games. Four from each team advance by goals per match. All players must have all five scores, including explicit zeroes.
3. **To Die:** the eight survivors enter the automatic sit-out draw and follow its eight-game rotation. Six play 3v3 and two sit out each match. Everyone plays six games and sits twice, with three appearances in each four-game half and no consecutive rests. Each pair are teammates once or twice and opponents two or three times. Enter all six scheduled goal scores, including zeroes; sit-out cells stay blank. A missing score for an active player prevents completion. Rank all eight together using only this round's goals per match: top six overall advance, bottom two are cut. A tie across sixth and seventh requires extra games. There are no permanent Round 2 teams. The app saves and locks the random slots before scoring.
4. **Rebirth:** the six survivors start at zero. Follow the displayed schedule of all ten unique 3v3 splits once each. Every player plays ten matches; each pair are teammates four times and opponents six times. Keep the finalist slots and game order fixed before play. Select a game, type goals or use the +/− counters, then mark the winning team. This adds one win for each teammate and a loss for each opponent; it cannot assign mixed outcomes to the same team. All points in games 1 and 2 receive the multiplier; games 3–10 use normal points. Goal points and win points update independently as each value is entered. The table also displays raw goals, wins, and completed matches. Missing scores or results keep prizes provisional until all ten games are complete.
5. **Leaderboard:** follow cuts, final standings, and prizes. Prizes appear after all regulation results are entered. Tied podium prizes remain unassigned.

Yellow controls are editable. Gray cells are calculated. Advance is green, cut is red, and relevant ties display **TIE - EXTRA GAMES NEEDED**. Rankings during incomplete rounds are provisional; nobody advances until the round is complete.

### Per-match submit, standings popup, and final fullscreen

Each round has a per-match **Submit Match N of X** control: To Live has five games, To Die has eight matches, and Rebirth has ten games. The control stays disabled until that match is ready (every active player in it has a score, including explicit zeroes) and the stage is not stale.

- **Submitting a non-final match** opens a dismissible popup with the cumulative round standings through that match. It lists each player's rank, name, running total, average, and provisional status. The totals and averages are summed over the matches played so far, not just the one match you submitted. Close the popup to continue to the next match.
- **Submitting the final match** of a round opens a fullscreen total round ranking for all players, with totals, averages, and an **ADVANCE**, **CUT**, or **TIE** badge each. When no tie exists the fullscreen reports that the round is settled. When a tie sits across the cut line, the fullscreen states that extra games are needed and hosts the **Add extra game** controls directly. As you enter and save extra scores the fullscreen recomputes live and flips **TIE** to **ADVANCE** or **CUT** as the bubble resolves; if players stay tied it asks for another extra game. Close the fullscreen to return to the dashboard.

To Die keeps its existing **Match N of 8 done** server flow, which also advances the sit-out draw, and then shows the same popup or fullscreen. To Live and Rebirth use client-side submit controls that read the already-entered per-game scores, so no extra server round-trip is needed to show their standings.

Normal final points = **1.5 × goals + 1 for a win**. Games 1–2 double the entire score. Rotation balances match counts, but double games mean weighted exposure is not identical. Set the multiplier to 1 before play if all matches should have equal weight.


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

Extra games use a boundary-bubble model. Only the players tied across the cut line play extra games: the cluster straddling 4th and 5th within one team in To Live, the cluster straddling 6th and 7th in To Die, and the tied podium group in Rebirth. Players who were never in the tie are not disturbed. A clear advancer, such as a unique rank 1 or 2, keeps its place, and a clear cut stays cut.

Click **Add extra game** after regulation play for the tied group. Enter a score for every player in that tied group. For a final extra game, enter both goals and W/L; it uses normal scoring without the games 1–2 multiplier.

Extra-game goals fold into the tied players' numbers rather than acting as a separate tiebreak. For each bubble player the average recomputes with the exact formula:

```
average = (regulation goals + extra goals) / (regulation matches + extra matches)
```

So a player's displayed total and average visibly change as extra scores are entered. Re-ranking is contained to the tied bubble, which means a cut or tied player can overtake a tied-advancing player and take their spot, while players who were never in the tie keep their ranks. The Rebirth final folds the same way on points instead of goals: each extra game's points are scored normally, without the games 1–2 multiplier, and added to the bubble players' totals.

If players remain tied after an extra game, add another extra game and score only the remaining tied subgroup; already resolved places are preserved. The fullscreen total ranking recomputes live as extra scores are saved and flips **TIE** to **ADVANCE** or **CUT** as the bubble resolves. Up to 50 extra games per stage are supported.

## Saving and recovery

- Changes save automatically to `tournament.json` in this folder. Wait for **All changes saved** before closing the browser.
- Existing saves from the old fixed-team Round 2 are upgraded to the eight-match format. To Live, player names, wheel entries, and settings stay intact. Old Round 2 and final records are preserved under `legacy_round2` in the downloadable JSON backup. To Die and Rebirth restart with empty scores because the new rotation changes Round 2 qualification. Saves already using the eight-match format retain all data.
- Original five-game-final saves also archive their old final under `legacy_final`; scoring defaults become goal 1.5 / win 1. The archived records include the old scoring settings and remain in downloadable backups.
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

If Node.js is available, verify Round 2 UI controls with `node tests/test_ui.cjs`.

The tests cover advancement, team-local ranks, blank versus zero, exact averages, multiple extra games, final multipliers, podium ties, prize allocation, invalid input, roster changes, HTTP saves, persistence, revision conflicts, all ten unique splits, pair balance, team-consistent results, game-ten scoring, legacy-save migration, large wheel lists, wheel persistence, independent live goal/win points, eight-match Round 2 balance, overall cut ties, invalid sit-out entries, and preservation of archived stage scores, the complete eight-match draw flow, repeat-click guards, draw persistence, and match-done UI controls.
