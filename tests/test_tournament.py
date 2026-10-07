import json, tempfile, threading, unittest
from unittest.mock import patch
from copy import deepcopy
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from engine import IDS, TIE, new_state, validate, evaluate, bind_rosters, order_groups, final_schedule, round2_schedule, round2_draw_action, round1_lineups, round1_lineup_action, blank_round
from app import Store, make_server

def spread(total, games=5):
    """Distinct whole-number per-game goals that sum to `total`."""
    base,extra=divmod(total,games)
    return [base+(1 if j<extra else 0) for j in range(games)]

def _shuffle_split(seed):
    """A deterministic but seed-varying valid 5/5 partition of all ten IDS."""
    order=IDS[seed%10:]+IDS[:seed%10]
    return {'A':order[:5],'B':order[5:]}

# Distinct To Live totals so the top-8-by-total-goals survivors are unambiguous.
# Ranked descending: p1>p2>p3>p4>p6>p7>p8>p9 advance; p5 and p10 are the clear
# bottom two cut at the 8th/9th line. Order matches the old per-team survivor
# order (p1,p2,p3,p4,p6,p7,p8,p9) so the downstream To Die/Rebirth chain is
# unchanged. Teams are cosmetic per-game splits now, so no 'team' field.
ROUND1_TOTALS={'p1':30,'p2':25,'p3':20,'p4':15,'p6':12,'p7':10,'p8':8,'p9':6,'p5':4,'p10':2}

def fixture(final=True):
    s=new_state();s['names']={p:'Player '+str(i+1) for i,p in enumerate(IDS)}
    for p in IDS:s['round1']['players'][p]={'goals':spread(ROUND1_TOTALS[p])}
    round1_lineups(s)
    v=evaluate(s);players=v['round1']['survivors']
    schedule=round2_schedule(players)
    s['round2']['roster']=players.copy();s['round2']['draw']={'order':players.copy(),'revealed':8,'completed':8,'mode':'random'}
    for i,p in enumerate(players):s['round2']['players'][p]={'goals':[None if p in g['sit'] else [8,7,6,2,5,4,3,1][i] for g in schedule]}
    bind_rosters(s)
    if final:
        roster=evaluate(s)['round2']['survivors']
        for i,p in enumerate(roster):s['final']['players'][p]={'goals':[5-i]*10,'results':['W' if p in g['A'] else 'L' for g in final_schedule(roster)]}
    return bind_rosters(s)

def legacy_fixture(version=2):
    s=fixture();s['version']=version
    players=evaluate(s)['round1']['survivors']
    for i,p in enumerate(IDS):
        s['round2']['players'][p]={'team':'','goals':[None]*5}
    for i,p in enumerate(players):
        s['round2']['players'][p]={'team':'A' if i<4 else 'B','goals':[None if i%4==g%4 else 4-i%4 for g in range(5)]}
    return s

class Rules(unittest.TestCase):
    def test_blank(self):
        v=evaluate(new_state());self.assertFalse(v['round1']['complete']);self.assertEqual(v['round2']['rows'],[])
        self.assertTrue(all(r['average']==0 and r['played']==0 for r in v['round1']['rows']))
    def test_full_tournament(self):
        s=fixture();v=evaluate(s)
        self.assertEqual(v['round1']['survivors'],['p1','p2','p3','p4','p6','p7','p8','p9'])
        self.assertEqual(v['round2']['survivors'],['p1','p2','p3','p6','p7','p8'])
        self.assertEqual([r['prize'] for r in v['final']['rows']],[18,8,4,0,0,0]);self.assertEqual(v['awarded'],30)
        first=v['final']['rows'][0];self.assertEqual(first['win_points'],12);self.assertEqual(first['goal_points'],90);self.assertEqual(first['total'],102)
        self.assertEqual(first['game_points'],[17,17]+[8.5]*8)
    def test_blank_zero_and_fresh_average(self):
        s=fixture();row=lambda: next(r for r in evaluate(s)['round2']['rows'] if r['id']=='p1')
        self.assertEqual((row()['played'],row()['average']),(6,8))
        s['round2']['players']['p1']['goals'][1]=0
        self.assertEqual(row()['played'],6);self.assertAlmostEqual(row()['average'],40/6)
        s['round2']['players']['p1']['goals'][1]=None
        self.assertEqual((row()['played'],row()['average']),(5,8))
        self.assertFalse(evaluate(s)['round2']['complete'])
    def test_cut_tie_and_incomplete_extra(self):
        # To Live all-10 8th/9th boundary bubble. p9 (8th, advancing) and p5
        # (9th, cut) both total 30 goals -> tied at average 6.0 across the cut.
        # Approved fold model: an extra game where BOTH score equally keeps them
        # tied on effective average, so another extra game is requested; once
        # their effective averages differ the bubble resolves and a cut player
        # can overtake the tied-advancing one. The clear top finisher (p1) is
        # never disturbed.
        s=fixture();s['round1']['players']['p5']['goals']=spread(6)  # Ties p9 at 6 total (ranks 8-9).
        v=evaluate(s)['round1'];self.assertEqual(v['survivors'],[])
        self.assertEqual({r['id'] for r in v['rows'] if r['status']==TIE},{'p5','p9'})
        e=dict.fromkeys(IDS);e['p5']=2;e['p9']=2;s['round1']['extras']=[e]
        v=evaluate(s)['round1']  # Equal extra goals -> still exactly tied on average.
        self.assertFalse(v['complete'])
        self.assertEqual({r['id'] for r in v['rows'] if r['status']==TIE},{'p5','p9'})
        p9=next(r for r in v['rows'] if r['id']=='p9')  # Folded: (6+2)/(5+1).
        self.assertEqual((p9['goals'],p9['played']),(8,6));self.assertAlmostEqual(p9['average'],8/6)
        e2=dict.fromkeys(IDS);e2['p5']=5;e2['p9']=1;s['round1']['extras']=[e,e2]
        v=evaluate(s)['round1']  # p5 pulls ahead on effective average and overtakes.
        self.assertTrue(v['complete'])
        p5=next(r for r in v['rows'] if r['id']=='p5');p9=next(r for r in v['rows'] if r['id']=='p9')
        self.assertEqual((p5['goals'],p5['played'],p5['status']),(13,7,'ADVANCE'))
        self.assertEqual((p9['goals'],p9['played'],p9['status']),(9,7,'CUT'))
        p1=next(r for r in v['rows'] if r['id']=='p1')  # Clear top finisher undisturbed.
        self.assertEqual((p1['rank'],p1['status'],p1['goals'],p1['played']),(1,'ADVANCE',30,5))
    def test_multigame_tie_preserves_resolved_positions(self):
        group=order_groups(['a','b','c'],dict(a=5,b=5,c=5),[dict(a=2,b=0,c=0),dict(b=4,c=3)])
        self.assertEqual(group,[['a'],['b'],['c']])
    def test_final_podium_tie(self):
        s=fixture();s['settings']['win_points']=0;s['final']['players']['p2']['goals']=[5]*10;v=evaluate(s)
        self.assertEqual([r['status'] for r in v['final']['rows'][:2]],[TIE,TIE]);self.assertIsNone(v['final']['rows'][0]['prize'])
        e={p:{'goals':None,'result':''} for p in IDS};e['p1']={'goals':1,'result':'W'};e['p2']={'goals':0,'result':'L'};s['final']['extras']=[e]
        self.assertEqual(evaluate(s)['final']['rows'][0]['prize'],18)
    def test_final_podium_bubble_fold_and_safe_finalist(self):
        # Approved model for Rebirth: fold the extra game's points (NORMAL scoring,
        # no games 1-2 multiplier) into the tied podium bubble's total and re-rank
        # only the bubble. A safe non-bubble finalist keeps its rank/prize.
        s=fixture();s['settings']['win_points']=0;s['final']['players']['p2']['goals']=[5]*10
        p3_before=next(r for r in evaluate(s)['final']['rows'] if r['id']=='p3')
        e={p:{'goals':None,'result':''} for p in IDS}
        e['p1']={'goals':2,'result':'W'};e['p2']={'goals':0,'result':'L'};s['final']['extras']=[e]
        v=evaluate(s)['final']
        p1=next(r for r in v['rows'] if r['id']=='p1');p2=next(r for r in v['rows'] if r['id']=='p2')
        self.assertEqual(p1['total'],93.0);self.assertEqual(p1['prize'],18)  # 90 + 2*1.5, no multiplier.
        self.assertEqual(p2['total'],90.0);self.assertEqual(p2['prize'],8)
        p3=next(r for r in v['rows'] if r['id']=='p3')  # Safe finalist untouched.
        self.assertEqual((p3['rank'],p3['prize'],p3['total']),(3,4,p3_before['total']))
        self.assertTrue(v['complete'])
    def test_final_podium_still_tied_asks_again(self):
        # Equal extra-game points keep the bubble tied -> prizes stay unassigned
        # and another extra game is requested.
        s=fixture();s['settings']['win_points']=0;s['final']['players']['p2']['goals']=[5]*10
        e={p:{'goals':None,'result':''} for p in IDS}
        e['p1']={'goals':2,'result':'W'};e['p2']={'goals':2,'result':'L'};s['final']['extras']=[e]
        v=evaluate(s)['final']
        p1=next(r for r in v['rows'] if r['id']=='p1');p2=next(r for r in v['rows'] if r['id']=='p2')
        self.assertEqual((p1['status'],p2['status']),(TIE,TIE))
        self.assertEqual((p1['total'],p2['total']),(93.0,93.0))  # Folded equally.
        self.assertIsNone(p1['prize']);self.assertIsNone(p2['prize'])
        self.assertFalse(v['complete'])
    def test_backward_compat_load_save_with_extras(self):
        # A persisted save that already carries bubble extras must still validate
        # round-trip through JSON on schema version 4 for all three stages.
        s=fixture()
        s['round1']['players']['p4']['goals']=[0]*5
        s['round1']['extras']=[{**dict.fromkeys(IDS),'p4':2,'p5':1}]
        s['round2']['extras']=[{**dict.fromkeys(IDS),'p4':1,'p8':3}]
        s['final']['extras']=[{p:{'goals':None,'result':''} for p in IDS}]
        s['final']['extras'][0]['p1']={'goals':1,'result':'W'}
        wire=json.loads(json.dumps(s));validated=validate(wire)
        self.assertEqual(validated['version'],4)
        self.assertEqual(validated['round1']['extras'],s['round1']['extras'])
        self.assertEqual(validated['round2']['extras'],s['round2']['extras'])
        self.assertEqual(validated['final']['extras'],s['final']['extras'])
        self.assertTrue(evaluate(validated)['round1']['rows'])  # Evaluates without error.
    def test_third_fourth_tie_and_nonpodium_tie(self):
        s=fixture();s['settings']['win_points']=0;s['final']['players']['p6']['goals']=[3]*10
        v=evaluate(s);self.assertEqual(v['final']['rows'][2]['status'],TIE);self.assertEqual(v['final']['rows'][3]['status'],TIE)
        s=fixture();s['settings']['win_points']=0;s['final']['players']['p8']['goals']=[1]*10;v=evaluate(s);self.assertTrue(v['final']['complete'])
    def test_multiplier_setting_and_partial_inputs(self):
        s=fixture();s['settings']['multiplier']=3;v=evaluate(s);self.assertEqual(v['final']['rows'][0]['total'],119)
        s['final']['players']['p1']['results'][0]='';r=next(r for r in evaluate(s)['final']['rows'] if r['id']=='p1')
        self.assertEqual(r['total'],116);self.assertIsNone(r['prize'])
    def test_rotation_balance_and_team_results(self):
        s=fixture();roster=evaluate(s)['round2']['survivors'];schedule=final_schedule(roster)
        self.assertEqual(len(schedule),10)
        self.assertEqual(len({frozenset([frozenset(g['A']),frozenset(g['B'])]) for g in schedule}),10)
        for p in roster:
            self.assertEqual(sum(p in g['A']+g['B'] for g in schedule),10)
            for q in roster:
                if p==q: continue
                together=sum(any(p in g[t] and q in g[t] for t in ['A','B']) for g in schedule)
                self.assertEqual(together,4);self.assertEqual(10-together,6)
        a,b=schedule[0]['A'][0],schedule[0]['B'][0]
        s['final']['players'][a]['results'][0]='L';s['final']['players'][b]['results'][0]='W'
        self.assertFalse(evaluate(s)['final']['ready'])  # Still 3 W / 3 L, but wrong teams.
    def test_tenth_game_and_migration(self):
        s=fixture();before=evaluate(s)['final']['rows'][0]['total']
        s['final']['players']['p1']['goals'][9]+=2
        self.assertEqual(evaluate(s)['final']['rows'][0]['total'],before+3)
        old=legacy_fixture(1)
        for p in old['final']['players'].values():p['goals']=p['goals'][:5];p['results']=p['results'][:5]
        original=deepcopy(old);new=validate(old)
        self.assertEqual(old,original);self.assertEqual(new['legacy_final']['final'],original['final'])
        self.assertEqual(new['legacy_round2']['round2'],old['round2']);self.assertEqual(new['settings']['win_points'],1)
        self.assertEqual(new['final']['players']['p1']['goals'],[None]*10)
        self.assertEqual(validate(new),new)

    def test_round2_eight_game_rotation(self):
        roster=evaluate(fixture())['round1']['survivors'];schedule=round2_schedule(roster)
        self.assertEqual(len(schedule),8)
        self.assertEqual(len({tuple(sorted(g['sit'])) for g in schedule}),8)
        for g in schedule:
            self.assertEqual((len(g['A']),len(g['B']),len(g['sit'])),(3,3,2))
            self.assertEqual(set(g['A']+g['B']+g['sit']),set(roster))
        for p in roster:
            self.assertEqual(sum(p in g['sit'] for g in schedule),2)
            self.assertEqual(sum(p not in g['sit'] for g in schedule[:4]),3)
            self.assertEqual(sum(p not in g['sit'] for g in schedule[4:]),3)
            self.assertFalse(any(p in a['sit'] and p in b['sit'] for a,b in zip(schedule,schedule[1:])))
            for q in roster:
                if p==q:continue
                teammates=sum(any(p in g[t] and q in g[t] for t in ['A','B']) for g in schedule)
                opponents=sum(any(p in g[t] and q in g['B' if t=='A' else 'A'] for t in ['A','B']) for g in schedule)
                self.assertIn(teammates,[1,2]);self.assertIn(opponents,[2,3])
    def test_round2_overall_cut_tie_and_extras(self):
        # Approved boundary-bubble model: extra goals FOLD into the tied players'
        # total/average and only the 6th/7th bubble re-ranks. With p4 and p8 tied
        # at avg 3.0, giving BOTH an extra game where p8 outscores p4 overtakes
        # the previously-advancing p4. (Old lexicographic model expected a TIE
        # until every tied player had scored; the fold model resolves on average.)
        s=fixture();d=s['round2']['players']['p4'];d['goals']=[3 if n is not None else None for n in d['goals']]
        v=evaluate(s)['round2'];self.assertEqual(v['survivors'],[])
        self.assertEqual({r['id'] for r in v['rows'] if r['status']==TIE},{'p4','p8'})
        e=dict.fromkeys(IDS);e['p8']=5;e['p4']=1;s['round2']['extras']=[e];v=evaluate(s)['round2']
        self.assertTrue(v['complete'])
        self.assertIn('p8',v['survivors']);self.assertNotIn('p4',v['survivors'])
        p8=next(r for r in v['rows'] if r['id']=='p8');p4=next(r for r in v['rows'] if r['id']=='p4')
        self.assertEqual((p8['goals'],p8['played']),(23,7));self.assertAlmostEqual(p8['average'],23/7)
        self.assertEqual((p4['goals'],p4['played']),(19,7));self.assertAlmostEqual(p4['average'],19/7)
        self.assertEqual(p8['status'],'ADVANCE');self.assertEqual(p4['status'],'CUT')
        # A clear top advancer is never disturbed by the bubble recompute.
        p1=next(r for r in v['rows'] if r['id']=='p1')
        self.assertEqual((p1['status'],p1['rank'],p1['played'],p1['average']),('ADVANCE',1,6,8.0))
    def test_round2_eighth_match_and_invalid_rest_score(self):
        s=fixture();schedule=evaluate(s)['round2']['schedule'];p=schedule[7]['A'][0]
        s['round2']['players'][p]['goals'][7]=None
        self.assertFalse(evaluate(s)['round2']['complete'])
        s=fixture();p=schedule[0]['sit'][0]
        before=next(r for r in evaluate(s)['round2']['rows'] if r['id']==p)
        s['round2']['players'][p]['goals'][0]=999
        after=next(r for r in evaluate(s)['round2']['rows'] if r['id']==p)
        self.assertEqual((before['goals'],before['played']),(after['goals'],after['played']))
        self.assertFalse(evaluate(s)['round2']['complete'])
    def test_legacy_round2_archive_and_current_save_preservation(self):
        old=legacy_fixture();old['settings']['goal_points']=2;old['wheel']['text']='A\nB'
        original=deepcopy(old);new=validate(old)
        self.assertEqual(old,original);self.assertEqual(new['version'],4)
        self.assertEqual(new['legacy_round2']['round2'],old['round2'])
        self.assertEqual(new['legacy_round2']['final'],old['final'])
        for k in ['round1','names','settings','wheel']:self.assertEqual(new[k],old[k])
        self.assertEqual(new['round2']['players']['p1']['goals'],[None]*8)
        self.assertEqual(new['final']['players']['p1']['goals'],[None]*10)
        current=fixture();original=deepcopy(current);self.assertEqual(validate(current),original)

    def test_wheel_large_lists_migration_and_validation(self):
        s=fixture();s['wheel']={'text':'\n'.join('Entry '+str(i) for i in range(25000)), 'remove_winner':True}
        validate(s);self.assertEqual(len(s['wheel']['text'].splitlines()),25000)
        self.assertEqual(evaluate(s)['awarded'],30)
        old=deepcopy(s);del old['wheel'];migrated=validate(old)
        self.assertEqual(migrated['final'],s['final']);self.assertEqual(migrated['wheel']['text'],'')
        for value in [None,{'text':[],'remove_winner':False},{'text':'A','remove_winner':'yes'}]:
            s['wheel']=value
            with self.assertRaises(ValueError):validate(s)
    def test_independent_live_points_and_counts(self):
        s=fixture(False);p=evaluate(s)['round2']['survivors'][0]
        s['final']['players'][p]['goals'][0]=2
        r=next(r for r in evaluate(s)['final']['rows'] if r['id']==p)
        self.assertEqual((r['goals'],r['wins'],r['played'],r['total']),(2,0,0,6))
        s['final']['players'][p]['results'][0]='W'
        r=next(r for r in evaluate(s)['final']['rows'] if r['id']==p)
        self.assertEqual((r['goals'],r['wins'],r['played'],r['total']),(2,1,1,8))
        s['final']['players'][p]['goals'][0]=None
        r=next(r for r in evaluate(s)['final']['rows'] if r['id']==p)
        self.assertEqual((r['goals'],r['wins'],r['played'],r['total']),(0,1,0,2))
        self.assertIsNone(r['prize'])

    def test_names_and_validation(self):
        s=fixture();s['names']['p2']=' player 1 ';self.assertFalse(evaluate(s)['names_ok'])
        for invalid in [-1,1.5,True,float('nan'),'2']:
            s=fixture();s['round1']['players']['p1']['goals'][0]=invalid
            with self.assertRaises(ValueError):validate(s)
    def test_roster_change_and_rename(self):
        s=fixture();s['names']['p1']='New name';self.assertFalse(evaluate(s)['round2']['stale'])
        s['round1']['players']['p5']['goals']=[8]*5;v=evaluate(s);self.assertTrue(v['round2']['stale']);self.assertFalse(v['round2']['complete'])
    def test_incorrect_team_counts(self):
        s=fixture();s['round2']['players']['p1']['goals'][0]=0;self.assertFalse(evaluate(s)['round2']['complete'])

class Draws(unittest.TestCase):
    def fresh(self):
        s=fixture(False);s['round2']=blank_round(8);s['final']=new_state()['final'];return bind_rosters(s)
    def test_balanced_random_draw_all_matches_and_repeat_clicks(self):
        s=self.fresh();original=deepcopy(s);roster=evaluate(s)['round1']['survivors']
        with patch('engine.secrets.SystemRandom.shuffle',side_effect=lambda a:a.reverse()) as shuffle:
            s=round2_draw_action(s,'start');shuffle.assert_called_once()
        self.assertEqual(original['round2']['draw']['order'],[])
        self.assertEqual(s['round2']['draw']['order'],list(reversed(roster)))
        self.assertEqual(round2_draw_action(s,'start'),s)
        draw_order=s['round2']['draw']['order'].copy();rests={p:0 for p in roster};previous=set()
        for game in range(1,9):
            v=evaluate(s)['round2'];g=v['schedule'][game-1]
            self.assertEqual(v['draw']['revealed'],game)
            self.assertFalse(previous.intersection(g['sit']))
            for p in g['sit']:rests[p]+=1;self.assertLessEqual(rests[p],2)
            with self.assertRaises(ValueError):round2_draw_action(s,'done',game)
            for p in g['A']+g['B']:s['round2']['players'][p]['goals'][game-1]=10-roster.index(p)
            s=round2_draw_action(s,'done',game)
            self.assertEqual(s['round2']['draw']['order'],draw_order)
            with self.assertRaises(ValueError):round2_draw_action(s,'done',game)
            self.assertEqual(validate(json.loads(json.dumps(s))),s)
            previous=set(g['sit'])
        self.assertTrue(all(n==2 for n in rests.values()))
        self.assertTrue(evaluate(s)['round2']['complete'])
        self.assertTrue(all(r['played']==6 for r in evaluate(s)['round2']['rows']))
        self.assertEqual(len(evaluate(s)['round2']['survivors']),6)
    def test_draw_guards_and_preserves_existing_version3_scores(self):
        with self.assertRaises(ValueError):round2_draw_action(new_state(),'start')
        s=self.fresh()
        with self.assertRaises(ValueError):round2_draw_action(s,'done',1)
        s=round2_draw_action(s,'start')
        with self.assertRaises(ValueError):round2_draw_action(s,'done',2)
        old=fixture();old['version']=3;del old['round2']['draw'];original=deepcopy(old)
        upgraded=validate(old)
        self.assertEqual(old,original)
        self.assertEqual(upgraded['round2']['players'],old['round2']['players'])
        self.assertEqual(upgraded['final'],old['final'])
        self.assertEqual(upgraded['round2']['draw']['mode'],'preserved')
        self.assertEqual(upgraded['round2']['draw']['completed'],8)
        self.assertEqual(evaluate(upgraded)['awarded'],30)
    def test_store_draw_cannot_be_changed_by_regular_save(self):
        with tempfile.TemporaryDirectory() as d:
            store=Store(Path(d)/'data.json');store.save(self.fresh(),allow_draw=True)
            store.save(round2_draw_action(store.state,'start'),allow_draw=True)
            original=deepcopy(store.state)
            edited=deepcopy(original);edited['round2']['draw']['order'].reverse()
            with self.assertRaises(ValueError):store.save(edited)
            edited=deepcopy(original);edited['round2']['draw']['completed']=1
            with self.assertRaises(ValueError):store.save(edited)
            self.assertEqual(store.state,original)
            self.assertEqual(Store(store.path).state['round2']['draw'],original['round2']['draw'])

class Round1Lineups(unittest.TestCase):
    def test_lineups_are_valid_five_five_partitions_and_idempotent(self):
        s=new_state();first=round1_lineups(s)
        self.assertEqual(len(first),5)
        for e in first:
            self.assertEqual(set(e),{'A','B'})
            self.assertEqual((len(e['A']),len(e['B'])),(5,5))
            self.assertEqual(sorted(e['A']+e['B']),sorted(IDS))  # Covers all ten, no repeats.
        self.assertEqual(s['round1']['lineups'],first)  # Stored on the state.
        again=round1_lineups(s)  # Idempotent: never rerolls once valid splits exist.
        self.assertEqual(again,first)
        self.assertEqual(validate(deepcopy(s)),s)  # Round-trips through validation.
    def test_advancement_independent_of_ab_grouping(self):
        # Ranking is by TOTAL goals, so which players share Team A/B is cosmetic.
        s=fixture();round1_lineups(s)
        before=evaluate(s)['round1']['survivors']
        self.assertEqual(len(before),8)
        for g in range(5):s['round1']['lineups'][g]=_shuffle_split(g)  # Alter every split.
        after=evaluate(s)['round1']['survivors']
        self.assertEqual(before,after)  # Same eight advance regardless of grouping.
    def test_reroll_refuses_scored_game_and_succeeds_on_unscored(self):
        s=fixture()  # Every game is fully scored.
        with self.assertRaises(ValueError):round1_lineup_action(s,'reroll',1)
        with self.assertRaises(ValueError):round1_lineup_action(s,'reroll','nope')  # Bad game -> raises.
        with self.assertRaises(ValueError):round1_lineup_action(s,'reroll')  # Unknown action family.
        with self.assertRaises(ValueError):round1_lineup_action(new_state(),'spin',1)  # Unknown action.
        fresh=new_state();round1_lineups(fresh)  # No scores yet.
        before=deepcopy(fresh['round1']['lineups'])
        with patch('engine.secrets.SystemRandom.shuffle',side_effect=lambda a:a.reverse()):
            out=round1_lineup_action(fresh,'reroll',2)
        self.assertNotEqual(out['round1']['lineups'][1],before[1])  # Only game 2 rerolled.
        self.assertEqual(out['round1']['lineups'][0],before[0])     # Game 1 untouched.
        self.assertEqual(sorted(out['round1']['lineups'][1]['A']+out['round1']['lineups'][1]['B']),sorted(IDS))
    def test_old_save_migration_drops_team_and_assigned(self):
        # A legacy v4 save from the retired fixed-team wheel model carries a
        # per-player round1 'team' and a round1 'assigned' list; validate() must
        # drop both (preserving goals) and lineups regenerate afterward.
        s=new_state();s['names']={p:'Player '+str(i+1) for i,p in enumerate(IDS)}
        for i,p in enumerate(IDS):
            s['round1']['players'][p]={'team':'A' if i<5 else 'B','goals':[i%3]*5}
        s['round1']['assigned']=list(IDS)
        validated=validate(deepcopy(s))
        self.assertNotIn('assigned',validated['round1'])
        for i,p in enumerate(IDS):
            self.assertNotIn('team',validated['round1']['players'][p])  # Team dropped.
            self.assertEqual(validated['round1']['players'][p]['goals'],[i%3]*5)  # Goals preserved.
        lineups=round1_lineups(validated)
        self.assertEqual(len(lineups),5)
        self.assertTrue(all(sorted(e['A']+e['B'])==sorted(IDS) for e in lineups))
    def test_per_game_readiness_needs_all_ten_scores(self):
        s=fixture();round1_lineups(s)
        self.assertTrue(all(g['ready'] for g in evaluate(s)['round1']['games']))
        s['round1']['players']['p3']['goals'][2]=None  # One missing score in game 3.
        v=evaluate(s)['round1']
        self.assertFalse(v['games'][2]['ready'])  # That game is not ready.
        self.assertTrue(all(v['games'][g]['ready'] for g in (0,1,3,4)))  # Others still ready.
        self.assertFalse(v['complete'])  # Round is incomplete.

class HTTP(unittest.TestCase):
    def test_round2_draw_endpoint_and_completion(self):
        with tempfile.TemporaryDirectory() as d:
            store=Store(Path(d)/'data.json');store.save(Draws().fresh(),allow_draw=True)
            server=make_server(store,0);thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
            url=f'http://127.0.0.1:{server.server_port}'
            try:
                info=json.load(urlopen(url+'/api/state'));headers={'Content-Type':'application/json','X-Session-Token':info['token']}
                def put(route,body):return json.load(urlopen(Request(url+route,data=json.dumps(body).encode(),headers=headers,method='PUT')))
                started=put('/api/round2-draw',{'revision':store.revision,'action':'start'})
                self.assertEqual(started['view']['round2']['draw']['revealed'],1)
                again=put('/api/round2-draw',{'revision':store.revision,'action':'start'})
                self.assertEqual(again['state']['round2']['draw'],started['state']['round2']['draw'])
                with self.assertRaises(HTTPError) as cm:put('/api/round2-draw',{'revision':store.revision,'action':'done','game':1})
                self.assertEqual(cm.exception.code,400)
                state=again['state'];g=again['view']['round2']['schedule'][0]
                for p in g['A']+g['B']:state['round2']['players'][p]['goals'][0]=0
                put('/api/state',{'revision':store.revision,'state':state})
                done=put('/api/round2-draw',{'revision':store.revision,'action':'done','game':1})
                self.assertEqual(done['state']['round2']['draw']['completed'],1)
                self.assertEqual(done['state']['round2']['draw']['revealed'],2)
                with self.assertRaises(HTTPError):put('/api/round2-draw',{'revision':store.revision,'action':'done','game':1})
                self.assertEqual(json.load(urlopen(url+'/api/backup'))['round2']['draw'],done['state']['round2']['draw'])
            finally:server.shutdown();server.server_close();thread.join()

    def test_round1_lineup_endpoint(self):
        with tempfile.TemporaryDirectory() as d:
            store=Store(Path(d)/'data.json');server=make_server(store,0);thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
            url=f'http://127.0.0.1:{server.server_port}'
            try:
                info=json.load(urlopen(url+'/api/state'));headers={'Content-Type':'application/json','X-Session-Token':info['token']}
                def put(route,body):return json.load(urlopen(Request(url+route,data=json.dumps(body).encode(),headers=headers,method='PUT')))
                state=json.load(urlopen(url+'/api/state'))['state']
                lineups=state['round1']['lineups']  # Server generates and persists the five splits.
                self.assertEqual(len(lineups),5)
                self.assertTrue(all(sorted(e['A']+e['B'])==sorted(IDS) for e in lineups))
                self.assertEqual(json.load(urlopen(url+'/api/backup'))['round1']['lineups'],lineups)
                before=lineups[0]
                result=put('/api/round1-lineup',{'revision':store.revision,'action':'reroll','game':1})
                self.assertEqual(len(result['state']['round1']['lineups']),5)
                self.assertTrue(all(sorted(e['A']+e['B'])==sorted(IDS) for e in result['state']['round1']['lineups']))
                self.assertEqual(result['state']['round1']['lineups'][1],before and lineups[1])  # Other games unchanged.
                with self.assertRaises(HTTPError):put('/api/round1-lineup',{'revision':store.revision,'action':'nope'})
            finally:server.shutdown();server.server_close();thread.join()

    def test_persistence_and_revision_conflict(self):
        with tempfile.TemporaryDirectory() as d:
            path=Path(d)/'data.json';store=Store(path);server=make_server(store,0);thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
            url=f'http://127.0.0.1:{server.server_port}'
            try:
                data=json.load(urlopen(url+'/api/state'));headers={'Content-Type':'application/json','X-Session-Token':data['token']}
                data_state=fixture();data_state['wheel']['text']='Aaron\nGhost\nJay'
                body=json.dumps({'revision':0,'state':data_state,'restore':True}).encode();req=Request(url+'/api/state',data=body,headers=headers,method='PUT')
                result=json.load(urlopen(req));self.assertEqual(result['revision'],1);self.assertEqual(evaluate(Store(path).state)['awarded'],30);self.assertEqual(Store(path).state['wheel']['text'],'Aaron\nGhost\nJay')
                with self.assertRaises(HTTPError) as cm:urlopen(req)
                self.assertEqual(cm.exception.code,409)
                self.assertEqual(json.load(urlopen(url+'/api/backup')),store.state)
                self.assertIn(b'Player 1',urlopen(url+'/api/standings.csv').read())
                req=Request(url+'/api/state',data=body,method='PUT')
                with self.assertRaises(HTTPError) as cm:urlopen(req)
                self.assertEqual(cm.exception.code,403)
            finally:server.shutdown();server.server_close();thread.join()

if __name__=='__main__':unittest.main()
