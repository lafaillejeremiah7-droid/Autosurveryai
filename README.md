# Brawl Hockey Tournament Dashboard

A local Python dashboard for 10 players, **Know Thy Nature** and **Adapt or Wither** cutting rounds, and **The Last Bloom** final. All calculations run in Python. No extra packages, accounts, or internet connection are needed to run it.

## Run

Install Python 3.10 or newer if it is not already installed, download this repository, and open a terminal in its folder:

```sh
python app.py
```

On macOS/Linux, use `python3 app.py`. On Windows, use `py app.py` if the `python` command is unavailable.

The dashboard opens at **http://127.0.0.1:8765**. Leave the terminal running while using it. Press Ctrl+C to stop. If the port is occupied, run `python app.py --port 8766`.

This runs on your computer. A GitHub repository stores the code; it does not host the running Python dashboard. For private GitHub Codespaces use, forward port 8765 privately and run `python app.py --no-browser` in its terminal. Do not expose the app as a public service.

## Three psychological trials

The round titles describe the mental development each competitor is challenged to demonstrate. These are narrative themes; **advancement is still determined by the recorded goals, wins, rankings and tie rules**, not by a separate psychological score.

| Round | Psychological requirement | What advancement means |
|---|---|---|
| **1 · Know Thy Nature** | Recognize personal shortcomings, confront mistakes and adjust your play instead of denying them | Be among the top **8 of 10** |
| **2 · Adapt or Wither** | Let go of rigid expectations and adapt to shifting teammates, pressure and limited options | Be among the top **6 of 8** |
| **3 · The Last Bloom** | Maintain composure, make decisive plays and stay committed under final-round pressure | Become the sole first-place champion and win all $30 |

The sequence moves from **self-awareness → adaptability → mental fortitude**. Round 3 is the final psychological test; the podium is its outcome, not a fourth competitive round.

The round names follow a nature-and-philosophy arc: **Know Thy Nature** (understand your roots and weaknesses), **Adapt or Wither** (natural selection rewards adaptation), and **The Last Bloom** (a single surviving champion). All ten competitors compete for the one **$30 winner-take-all prize**; second through tenth receive **$0**. Existing tournaments and restored backups automatically adopt the fixed payout without losing scores or round results.

## The Royal Garden

The landing screen is a live **royal hedge maze garden** rendered in WebGL with a static canvas fallback. The aerial first-person view floats above winding green hedges, rose arches, gravel paths, **five tournament pavilions**, fountains, and a distant palace. The 3D scene fills the **entire browser viewport**, without a boxed video frame. The tournament cards remain accessible over the garden. Open pavilions respond to click/keyboard navigation; closed pavilions remain locked until their qualifying round is settled.

The opening timer is **The Garden Opens**. Set the tournament's date and time under Players & rules, or use **Set start time** on the home screen. The countdown persists in the saved tournament state and survives page refreshes, backups, and Undo. Ambient birds and local sound effects accompany the opening. **Pause garden** and reduced-motion preferences stop decorative movement without stopping the countdown. **Garden sound off** silences the synthesized audio.

The flowers follow **The Garden Opens countdown**. Saving a new future start time begins at **0% bloom**. As time passes, the meter rises and roses open across the maze: halfway through the countdown is **50% bloom**, and **00:00:00:00 reaches 100% with all 112 roses open**. The meter and flowers never reach full bloom early. Progress updates at timed intervals and uses the saved start and end timestamps, so refreshing or returning after sleep restores the correct bloom. Scores, round completion, and ties do not affect it. Pause garden and reduced-motion mode keep the countdown and bloom advancing. Clearing the countdown returns to closed buds; setting a different future start time begins a new bloom cycle. A countdown that has already ended stays at full bloom.


### Player rose progression

Each of the three round screens shows the **same ten original player plants**, even though only eight advance to Adapt or Wither and six to The Last Bloom. Everyone starts with a small seedling at **0 goals**. As recorded goals accumulate, their plant advances through sprouts, rosebuds, young roses, blooming roses, royal roses, and full bloom. A player's cumulative count includes prior rounds and eligible tiebreaker goals. Each plant also shows goals in the current round. Eliminated players remain visible as **PRUNED** rather than disappearing; the sole final winner becomes **CHAMPION**. Clearing scores and Undo recalculate the display. The player plants are separate from the 112 maze roses, which still bloom only from the opening countdown.

### Divine selection between cutting rounds

Finishing the fifth game or resolving a tiebreaker shows the standings without automatically starting an animation. From Know Thy Nature, **Continue to Adapt or Wither** opens a cinematic fullscreen judgement before the next scoring room. From Adapt or Wither, **Continue to The Last Bloom** does the same. The round navigation also triggers it on the first forward visit. All ten original plants are shown, preserving each plant's cumulative goal-based growth and showing prior eliminated plants as withered. A truly 3D glowing golden hand holding enormous articulated silver shears hovers above ten real 3D rose plants for **five seconds** before pruning only the **two new CUT players** selected by the scoring engine. Each cut has its own flash, falling plant, shears sound, and name. The scene fades and then opens the next round. Skip or Escape advances without changing scores. Repeated navigation in the same page session does not replay the animation; refreshing permits a replay. The Last Bloom uses the same 3D hand and plants to prune five losing finalists individually, then reveals the $30 champion. The cutscene WebGL environment has been fully rebuilt into a detailed palace-garden field with gold-edged marble paths, a hedge maze, royal pavilions and gazebos, fountains and water jets, rose-covered arches, sculpted topiary, lanterns, rose beds, palace towers and drifting petals. All ten player flowers have seven distinct low-poly growth stages, from a seedling at zero goals through the full-bloom royal rose. The portal is now a huge dimensional gateway physically **behind** the godly hand; a fragment clip plane hides the hand, fingers and shears until they move **forward through** the swirling opening. The arm and blades are five times the original hand's scale. The real WebGL canvas retains the garden's lit low-poly meshes and perspective projection. A gigantic rotating dimensional portal opens at the top center of the garden; after the portal starts opening, a golden hand and articulated shears more than 2.5 times their original size descend out of it over approximately 1.85 seconds, then hover over the plants until the five-second verdict. Flat CSS/SVG art remains only as a fallback when WebGL is unavailable.

### Elimination: the gardener's pruning verdict

After a settled round, an eliminated player's name is shown, the gardener raises **oversized shears**, the blades snap shut with an impact shake and metallic sound, and the player is **flung into the compost heap**. The verdict ends with **PRUNED**. Know Thy Nature and Adapt or Wither prune their two cut players. The final prunes the five non-winning finalists **one by one**: each gets a separate, indexed five-second scene showing their name, shears snapping shut, a flight into the compost, and the **PRUNED** verdict before the next person appears. Only after all five scenes does the sole **$30 champion** rise on the golden pedestal. All eliminated names and placements come from the existing scoring engine, not from the animation.

The cutscene appears above the scoring and results screens. **Skip**, **Escape**, or natural completion exits cleanly; reduced-motion preference keeps the first two rounds as a still summary, but the final plays five **separate, shorter static snipping scenes**, one player at a time. Once a round is pruned, its pavilion opens with a cascade of flowers. The normal standings and result dialogs remain available afterwards, including when ties are resolved through extra games.

### Pavilions and tournament path

- **Players & rules:** enter ten names, scoring weights, start time, and the fixed $30 champion prize.
- **Know Thy Nature:** five 5v5 games, cutting 10 players to 8.
- **Adapt or Wither:** five 4v4 games with reshuffle controls, cutting 8 to 6.
- **The Last Bloom:** eight 3v3 final games, goals and wins, culminating in one $30 champion.
- **Leaderboard:** advancing players, cuts, settled podium and CSV.

The path only unlocks the next playable pavilion after the preceding round is complete. Undo or an earlier score correction can reseal it. The royal podium reflects the actual final results, including unresolved ties.

## Know Thy Nature per-game teams

Enter the ten players directly in **Players & rules**.

Each of the five Know Thy Nature games gets its own **fresh random 5v5 split**, generated automatically on the server with cryptographic randomness. Advancement is decided by each player's **total goals** (and goals-per-match average) across all five games. Teams define which players share each game's three-goal limit; qualification is still ranked across all ten players.

The five splits are generated once, saved, and included in backups, so they stay stable across reloads. If you want to vary the matchups for a specific game, use its **Reshuffle teams** button on the Know Thy Nature screen to draw a new random split for that game. Reshuffling is **locked once a game has any score entered**, so it can never silently invalidate recorded goals; clear the game's scores first if you need to reshuffle it.

## Adapt or Wither — five reshuffleable 4v4 games

1. After Know Thy Nature, choose **Generate balanced 4v4 games**. This draws five saved 4v4 matchups for the eight survivors, varying teammates and opponents across games.
2. Before scoring the current game, click **Reshuffle teams** if you want a different 4v4 lineup. The new draw replaces *only that game's* teams and prioritizes balanced teammate exposure across the whole five-game schedule.
3. Once any player has a score entered for the game, the reshuffle button locks. Clear that game's scores to re-enable reshuffling. Past completed games cannot be reshuffled.
4. Enter scores for all eight players in each of **five games**, including explicit zeroes; nobody sits out. Teams must obey the three-goal combined limit and cannot tie 3–3.
5. Click **Match N done** to unlock the next game. Individual average goals per game determines advancement: top six survive; bottom two are eliminated; a sixth/seventh tie requires extra games.

Lineups are saved, so reloads do not change them. The reshuffle action does not erase goals or change the teams of any other game. Randomization reduces structural teammate bias but cannot guarantee equally strong teams.

## Tournament flow

1. **Players & rules:** enter 10 unique names. Win points default to 1, goal points to 1.5, and the games 1–2 multiplier to 2. The single, fixed prize is $30 for first place; everyone else gets $0.
2. **Know Thy Nature:** each of the five games gets an automatic fresh random 5v5 split. Ranking is by individual total goals rather than team wins; an optional per-game **Reshuffle teams** button draws a new split and locks once that game has any score. Enter all five games, with a score for every one of the ten players each game including explicit zeroes. Rank all ten players together by total goals (and goals per match): the top eight advance, the bottom two are cut. A tie across eighth and ninth requires extra games.
3. **Adapt or Wither:** the eight survivors play five 4v4 matches with balanced, changing teammates and opponents. A **Reshuffle teams** button is available before recording any goals for the current game; completed games and saved scores are protected. No player sits out. Enter eight scores including zeroes per game. Rank all individuals by average goals per match: the top six advance, bottom two are cut, and ties across sixth/seventh require extra games.
4. **The Last Bloom:** the six survivors start at zero. Follow the displayed schedule of eight balanced 3v3 matches. Every player plays eight matches; teammate and opponent counts are kept as even as possible. Keep the finalist slots and game order fixed before play. Select a game, type goals or use the +/− counters, then mark the winning team. This adds one win for each teammate and a loss for each opponent; it cannot assign mixed outcomes to the same team. All points in games 1 and 2 receive the multiplier; games 3–8 use normal points. Goal points and win points update independently as each value is entered. The table also displays raw goals, wins, and completed matches. Missing scores or results keep prizes provisional until all eight games are complete.
5. **Leaderboard:** follow cuts, final standings, and prizes. The $30 prize appears only when the final is settled with a unique first-place champion. Second place and below receive $0.

Yellow controls are editable. Gray cells are calculated. Advance is green, cut is red, and relevant ties display **TIE - EXTRA GAMES NEEDED**. Rankings during incomplete rounds are provisional; nobody advances until the round is complete.

### Team goal limit

Every scheduled game in Know Thy Nature, Adapt or Wither, and The Last Bloom allows **at most three goals per team**, summed across its players. Once either team reaches three, its opponents can have at most two. A 3–0, 3–1, or 3–2 score is valid; 3–3 and any total above three are rejected. Scores below three can still be entered normally.

The match screen shows the current team totals. **When either team scores its third goal, all remaining blank player goal fields on BOTH teams automatically become 0**. Existing goal entries are preserved, other games remain unchanged, and the zeroes are saved with the other scores. This applies to all three scheduled rounds (5v5, 4v4, and 3v3); extra-game inputs are unaffected. Goal inputs and + buttons use the remaining team allowance immediately, including the Know Thy Nature score table. Lowering or clearing a score reopens the allowance; use **Clear this game** to reset all goal entries for that match. The server enforces the same goal limits for saves and backup restores, so a direct request cannot bypass the caps.

Old saved scores above these limits are retained for correction. They block round completion; lower or clear the incorrect scores before continuing. Extra-game entries are capped at three per player; team-total validation uses the assigned teams in the scheduled matches.

### Per-match submit, standings popup, and final fullscreen

Each round has a per-match **Submit Match N of X** control: Know Thy Nature has five games, Adapt or Wither has five matches, and The Last Bloom has eight games. The control stays disabled until that match is ready (every active player in it has a score, including explicit zeroes) and the stage is not stale.

- **Submitting a non-final match** opens a dismissible popup with the cumulative round standings through that match. It lists each player's rank, name, running total, average, and provisional status. The totals and averages are summed over the matches played so far, not just the one match you submitted. Close the popup to continue to the next match.
- **Submitting the final match** of a round opens a fullscreen total round ranking for all players, with totals, an average column, and a status badge each. For the two cutting rounds (Know Thy Nature and Adapt or Wither) the badge is **ADVANCE**, **CUT**, or **TIE** and the average column shows goals per match. For The Last Bloom, which decides a sole $30 champion rather than another advancement cut, the badge is **FINAL** or **TIE** (there is no "cut" to a next round) and the average column shows average points per game (total points / games played). When no tie exists the fullscreen reports that the round is settled. When a tie sits across the cut line, the fullscreen states that extra games are needed and hosts the **Add extra game** controls directly. As you enter and save extra scores the fullscreen recomputes live and flips **TIE** to the settled badge as the bubble resolves; if players stay tied it asks for another extra game. Close the fullscreen to return to the dashboard.

Adapt or Wither uses a **Match N of 5 done** server flow, advancing the saved per-game team match, and then shows the same popup or fullscreen. Know Thy Nature and The Last Bloom use client-side submit controls that read the already-entered per-game scores, so no extra server round-trip is needed to show their standings.

Normal final points = **1.5 × goals + 1 for a win**. Games 1–2 double the entire score. Rotation balances match counts, but double games mean weighted exposure is not identical. Set the multiplier to 1 before play if all matches should have equal weight.

### Easier controls: clear a round, next-step guide, self-explaining buttons, and Undo

A few quality-of-life controls make the dashboard easier to operate:

- **Clear this round.** Every round screen has a visible **Clear this round** panel, available at any time (not only when a round is out of sync). It clears that round and every later round, but never an earlier one:
  - **Clear Know Thy Nature** clears Know Thy Nature, Adapt or Wither, and The Last Bloom.
  - **Clear Adapt or Wither** clears Adapt or Wither and The Last Bloom, keeping Know Thy Nature.
  - **Clear The Last Bloom** clears The Last Bloom only, keeping Know Thy Nature and Adapt or Wither.
  The panel copy states exactly which rounds it clears, and the action can be undone immediately afterwards.
- **Clear names and clear scoring (Players & rules).** The Players & rules screen has two separate controls so you can reset the roster or the scoring independently:
  - **Clear player names** blanks all ten name slots only. Scoring, prizes, and every round score stay exactly as they are. (With the roster empty, the rounds show the usual "enter 10 unique names" state until you refill it.)
  - **Clear scoring** resets the point values that apply to all rounds back to defaults: win points to 1, goal points to 1.5, and the games 1-2 multiplier to 2. Names, prizes, and round scores are untouched.
  Each is a separate button with copy stating exactly what it clears, and both can be undone immediately afterwards.
- **What to do next.** The Leaderboard shows a prominent next-step banner that names the next concrete action (enter 10 names, score and submit Know Thy Nature, resolve a tie, draw and play Adapt or Wither, play The Last Bloom, or review the podium) and includes a button that opens the relevant screen. The wording follows the current stage and its first unmet requirement, and the round path still highlights the next step.
- **Self-explaining disabled controls.** When a primary action is disabled (a per-match **Submit**, the Know Thy Nature **Reshuffle teams**, the Adapt or Wither **Generate balanced 4v4 games** / **Reshuffle teams** / **Match N done** / match tabs, or The Last Bloom **Mark win**), it shows a short reason next to it and as a tooltip, for example "Enter a score for every player in Game 3 first", "This game already has scores. Clear them before reshuffling.", or "Finish Match 2 before opening the next." No control silently does nothing.
- **One-level Undo.** Every destructive action (clear a round, clear a single game, reshuffle Know Thy Nature teams, clear player names, clear scoring, or clear the whole tournament) now acts immediately and then offers an **Undo** button near the save status. Clicking it restores the exact prior state and saves it. Undo is one level deep: taking a second destructive action replaces what Undo would restore.


## Adapt or Wither matchup balancing

Each game independently contains four players on Team A and four on Team B. The system saves five different team compositions, tries to avoid repeated teammate pairings, and balances appearances on the A and B sides. The **Reshuffle teams** button replaces the upcoming unscored game's matchup with another division of the same eight players. Existing matchups are untouched.

## Extra games

Extra games use a boundary-bubble model. Only the players tied across the cut line play extra games: the cluster straddling 8th and 9th across all ten players in Know Thy Nature, the cluster straddling 6th and 7th in Adapt or Wither, and the group tied for first place in The Last Bloom. Players who were never in the tie are not disturbed. A clear advancer, such as a unique rank 1 or 2, keeps its place, and a clear cut stays cut.

Click **Add extra game** after regulation play for the tied group. Enter a score for every player in that tied group. For a final extra game, enter both goals and W/L; it uses normal scoring without the games 1–2 multiplier.

Extra-game goals fold into the tied players' numbers rather than acting as a separate tiebreak. For each bubble player the average recomputes with the exact formula:

```
average = (regulation goals + extra goals) / (regulation matches + extra matches)
```

A player's displayed total and average update as extra scores are entered, but the entire unresolved group stays marked **TIE** until everyone has a score (and W/L in The Last Bloom). Later extra games cannot bypass missing entries. Final win points, goal points, goal/win counts, and games played include the same scored extra games as the total. Re-ranking is contained to the tied bubble, which means a cut or tied player can overtake a tied-advancing player and take their spot, while players who were never in the tie keep their ranks. The The Last Bloom final folds the same way on points instead of goals: each extra game's points are scored normally, without the games 1–2 multiplier, and added to the bubble players' totals.

If players remain tied after an extra game, add another extra game and score only the remaining tied subgroup; already resolved places are preserved. The fullscreen total ranking recomputes live as extra scores are saved and flips **TIE** to **ADVANCE** or **CUT** as the bubble resolves. Up to 50 extra games per stage are supported.

## Saving and recovery

- Changes save automatically to `tournament.json` in this folder. Wait for **All changes saved** before closing the browser. Save status, **Retry save**, and **Undo** stay accessible inside whichever round or results window is open.
- Initial and migrated Know Thy Nature lineups are saved at startup, so restarting before the first score cannot reshuffle them.
- **Existing eight-match sit-out rotation saves are not silently reinterpreted.** Their Round 2 scores, final scores, and prior settings are copied to `legacy_round2_rotation` in the downloadable backup. The five-game 4v4 Round 2 and dependent final restart with blank scores and new team assignments. Player names, Know Thy Nature results, and settings are retained.
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

If Node.js is available, verify the dashboard, audio, cutscene, timeline, 3D garden and theme copy with:

```sh
node tests/test_ui.cjs
node tests/test_sound.cjs
node tests/test_verdict_cutscene.cjs
node tests/test_round_cutscenes.cjs
node tests/test_city_timeline.cjs
node tests/test_arena_static.cjs
node tests/test_theme_copy.cjs
```

For the optional real-browser checks, install Playwright and its Chromium browser in your development environment, then run `node tests/test_browser.cjs`. This covers all five screens at desktop and phone sizes, cursor preservation, changed-roster recovery, extra-game entry and correction, Undo, failed-save recovery, and all five rotating 4v4 games. `PLAYWRIGHT_MODULE` and `CHROMIUM_EXECUTABLE` can select existing installations. Browser-test dependencies are not required to run the dashboard.

The tests cover the current five-game Know Thy Nature, five-game Adapt or Wither, and eight-game final formats: advancement, balanced and saved lineups, score-entry guards, blank versus zero, team goal limits, independent round totals, final multipliers, cut and first-place ties, extra-game scoring, prizes, autosave, revision conflicts, Undo, and backup migration. Older formats and wheel data remain covered as compatibility cases for existing saves.

Run `node tests/test_cutscene_browser.cjs` with the same optional Playwright/Chromium environment to check all three round verdict cutscenes, the pavilion bloom ceremony, tie settlement, native-dialog visibility, and skip behavior.

Run `node tests/test_bloom_browser.cjs` with the same browser setup to verify countdown bloom, arrival at zero, reload, pause, clear/Undo, rescheduling, and independence from match scores.
