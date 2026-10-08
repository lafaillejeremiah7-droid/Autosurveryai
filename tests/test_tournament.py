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

# All fixtures obey the real per-team limit. No match can finish 3-3.
def fixture(final=True):
    s=new_state();s['names']={p:'Player '+str(i+1) for i,p in enumerate(IDS)}
    s['round1']['lineups']=[{'A':IDS[:5],'B':IDS[5:]} for _ in range(5)]
    for p in IDS:s['round1']['players'][p]['goals']=[0]*5
    for g,(a,b) in enumerate([('p1','p6'),('p2','p7'),('p3','p8'),('p4','p9'),('p1','p6')]):
        s['round1']['players'][a]['goals'][g]=2 if g<4 else 1
        s['round1']['players'][b]['goals'][g]=1
    s['round1']['players']['p2']['goals'][4]=1
    players=evaluate(s)['round1']['survivors'];schedule=round2_schedule(players)
    s['round2']['roster']=players.copy();s['round2']['draw']={'order':players.copy(),'lineups':[{'A':players[:4],'B':players[4:]} for _ in range(5)],'revealed':5,'completed':5,'mode':'random'}
    for g,match in enumerate(schedule):
        for team in ['A','B']:
            eligible=[p for p in match[team] if p not in ['p4','p9']]
            limit=3 if team=='A' else 2
            scorers=[eligible[(g+j)%len(eligible)] for j in range(min(limit,len(eligible)))]
            for p in match[team]:s['round2']['players'][p]['goals'][g]=int(p in scorers)
    bind_rosters(s)
    if final:
        roster=evaluate(s)['round2']['survivors']
        for g,match in enumerate(final_schedule(roster)):
            for team in ['A','B']:
                for p in match[team]:
                    s['final']['players'][p]['goals'][g]=(2 if team=='A' else 1) if p==match[team][0] else 0
                    s['final']['players'][p]['results'][g]='W' if team=='A' else 'L'
    return bind_rosters(s)

def cut_tie_state(key='round1'):
    s=fixture()
    if key=='round1':
        s[key]['players']['p5']['goals'][0]=1
        s[key]['players']['p7']['goals'][1]=2
        s[key]['players']['p8']['goals'][2]=2
    else:
        remaining={'p1':2,'p2':2,'p3':2,'p4':1,'p6':2,'p7':2,'p8':1,'p9':0}
        for g,m in enumerate(round2_schedule(s[key]['draw']['order'])):
            for team in ['A','B']:
                scorers=[p for p in m[team] if remaining[p]>0][:2]
                for p in m[team]:s[key]['players'][p]['goals'][g]=int(p in scorers)
                for p in scorers:remaining[p]-=1
        assert not any(remaining.values())
    return s

def final_tie_state(count=2):
    s=fixture();s['settings']['win_points']=0
    for p in s['final']['roster']:s['final']['players'][p]['goals']=[int(p in s['final']['roster'][:count])]*8
    if count==2:s['final']['players']['p3']['goals'][0]=1
    return s

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
        first=v['final']['rows'][0];self.assertEqual(first['win_points'],10);self.assertEqual(first['goal_points'],30);self.assertEqual(first['total'],40)
        self.assertEqual(first['game_points'],[8,8]+[4]*6)
    def test_blank_zero_and_fresh_average(self):
        s=fixture();row=lambda: next(r for r in evaluate(s)['round2']['rows'] if r['id']=='p1')
        self.assertEqual((row()['played'],row()['average']),(5,1.0))
        s['round2']['players']['p1']['goals'][2]=0
        self.assertEqual(row()['played'],5);self.assertAlmostEqual(row()['average'],4/5)
        s['round2']['players']['p1']['goals'][2]=None
        self.assertEqual((row()['played'],row()['average']),(4,1.0))
        self.assertFalse(evaluate(s)['round2']['complete'])
    def test_cut_tie_and_incomplete_extra(self):
        # Like Never Before all-10 8th/9th boundary bubble. p9 (8th, advancing) and p5
        # (9th, cut) both total 1 goal -> tied at average 0.2 across the cut.
        # Approved fold model: an extra game where BOTH score equally keeps them
        # tied on effective average, so another extra game is requested; once
        # their effective averages differ the bubble resolves and a cut player
        # can overtake the tied-advancing one. The clear top finisher (p1) is
        # never disturbed.
        s=cut_tie_state('round1')  # Ties p9 at 1 total (ranks 8-9).
        v=evaluate(s)['round1'];self.assertEqual(v['survivors'],[])
        self.assertEqual({r['id'] for r in v['rows'] if r['status']==TIE},{'p5','p9'})
        e=dict.fromkeys(IDS);e['p5']=2;e['p9']=2;s['round1']['extras']=[e]
        v=evaluate(s)['round1']  # Equal extra goals -> still exactly tied on average.
        self.assertFalse(v['complete'])
        self.assertEqual({r['id'] for r in v['rows'] if r['status']==TIE},{'p5','p9'})
        p9=next(r for r in v['rows'] if r['id']=='p9')  # Folded: (1+2)/(5+1).
        self.assertEqual((p9['goals'],p9['played']),(3,6));self.assertAlmostEqual(p9['average'],3/6)
        e2=dict.fromkeys(IDS);e2['p5']=3;e2['p9']=1;s['round1']['extras']=[e,e2]
        v=evaluate(s)['round1']  # p5 pulls ahead on effective average and overtakes.
        self.assertTrue(v['complete'])
        p5=next(r for r in v['rows'] if r['id']=='p5');p9=next(r for r in v['rows'] if r['id']=='p9')
        self.assertEqual((p5['goals'],p5['played'],p5['status']),(6,7,'ADVANCE'))
        self.assertEqual((p9['goals'],p9['played'],p9['status']),(4,7,'CUT'))
        p1=next(r for r in v['rows'] if r['id']=='p1')  # Clear top finisher undisturbed.
        self.assertEqual((p1['rank'],p1['status'],p1['goals'],p1['played']),(1,'ADVANCE',3,5))
    def test_multigame_tie_preserves_resolved_positions(self):
        group=order_groups(['a','b','c'],dict(a=5,b=5,c=5),[dict(a=2,b=0,c=0),dict(b=4,c=3)])
        self.assertEqual(group,[['a'],['b'],['c']])
    def test_final_podium_tie(self):
        s=final_tie_state();v=evaluate(s)
        self.assertEqual([r['status'] for r in v['final']['rows'][:2]],[TIE,TIE]);self.assertIsNone(v['final']['rows'][0]['prize'])
        e={p:{'goals':None,'result':''} for p in IDS};e['p1']={'goals':1,'result':'W'};e['p2']={'goals':0,'result':'L'};s['final']['extras']=[e]
        self.assertEqual(evaluate(s)['final']['rows'][0]['prize'],18)
    def test_final_podium_bubble_fold_and_safe_finalist(self):
        # Approved model for You Wanted to Win, Right?: fold the extra game's points (NORMAL scoring,
        # no games 1-2 multiplier) into the tied podium bubble's total and re-rank
        # only the bubble. A safe non-bubble finalist keeps its rank/prize.
        s=final_tie_state()
        p3_before=next(r for r in evaluate(s)['final']['rows'] if r['id']=='p3')
        e={p:{'goals':None,'result':''} for p in IDS}
        e['p1']={'goals':2,'result':'W'};e['p2']={'goals':0,'result':'L'};s['final']['extras']=[e]
        v=evaluate(s)['final']
        p1=next(r for r in v['rows'] if r['id']=='p1');p2=next(r for r in v['rows'] if r['id']=='p2')
        self.assertEqual(p1['total'],18.0);self.assertEqual(p1['prize'],18)  # 18 + 2*1.5, no multiplier.
        self.assertEqual(p2['total'],15.0);self.assertEqual(p2['prize'],8)
        p3=next(r for r in v['rows'] if r['id']=='p3')  # Safe finalist untouched.
        self.assertEqual((p3['rank'],p3['prize'],p3['total']),(3,4,p3_before['total']))
        self.assertTrue(v['complete'])
    def test_final_podium_still_tied_asks_again(self):
        # Equal extra-game points keep the bubble tied -> prizes stay unassigned
        # and another extra game is requested.
        s=final_tie_state()
        e={p:{'goals':None,'result':''} for p in IDS}
        e['p1']={'goals':2,'result':'W'};e['p2']={'goals':2,'result':'L'};s['final']['extras']=[e]
        v=evaluate(s)['final']
        p1=next(r for r in v['rows'] if r['id']=='p1');p2=next(r for r in v['rows'] if r['id']=='p2')
        self.assertEqual((p1['status'],p2['status']),(TIE,TIE))
        self.assertEqual((p1['total'],p2['total']),(18.0,18.0))  # Folded equally.
        self.assertIsNone(p1['prize']);self.assertIsNone(p2['prize'])
        self.assertFalse(v['complete'])
    def test_backward_compat_load_save_with_extras(self):
        # A persisted save that already carries bubble extras must still validate
        # round-trip through JSON on schema version 6 for all three stages.
        s=fixture()
        s['round1']['players']['p4']['goals']=[0]*5
        s['round1']['extras']=[{**dict.fromkeys(IDS),'p4':2,'p5':1}]
        s['round2']['extras']=[{**dict.fromkeys(IDS),'p4':1,'p8':3}]
        s['final']['extras']=[{p:{'goals':None,'result':''} for p in IDS}]
        s['final']['extras'][0]['p1']={'goals':1,'result':'W'}
        wire=json.loads(json.dumps(s));validated=validate(wire)
        self.assertEqual(validated['version'],6)
        self.assertEqual(validated['round1']['extras'],s['round1']['extras'])
        self.assertEqual(validated['round2']['extras'],s['round2']['extras'])
        self.assertEqual(validated['final']['extras'],s['final']['extras'])
        self.assertTrue(evaluate(validated)['round1']['rows'])  # Evaluates without error.
    def test_third_fourth_tie_and_nonpodium_tie(self):
        s=final_tie_state();s['final']['players']['p6']['goals'][1]=1
        v=evaluate(s);rows={r['id']:r for r in v['final']['rows']}
        self.assertEqual(rows['p3']['status'],TIE);self.assertEqual(rows['p6']['status'],TIE)
        s=fixture();v=evaluate(s);self.assertTrue(v['final']['complete'])
        self.assertEqual([r['rank'] for r in v['final']['rows'][-2:]],[5,6])
    def test_multiplier_setting_and_partial_inputs(self):
        s=fixture();s['settings']['multiplier']=3;v=evaluate(s);self.assertEqual(v['final']['rows'][0]['total'],48)
        s['final']['players']['p1']['results'][0]='';r=next(r for r in evaluate(s)['final']['rows'] if r['id']=='p1')
        self.assertEqual(r['total'],45);self.assertIsNone(r['prize'])
    def test_rotation_balance_and_team_results(self):
        s=fixture();roster=evaluate(s)['round2']['survivors'];schedule=final_schedule(roster)
        self.assertEqual(len(schedule),8)
        self.assertEqual(len({frozenset([frozenset(g['A']),frozenset(g['B'])]) for g in schedule}),8)
        for p in roster:
            self.assertEqual(sum(p in g['A']+g['B'] for g in schedule),8)
            for q in roster:
                if p==q: continue
                together=sum(any(p in g[t] and q in g[t] for t in ['A','B']) for g in schedule)
                self.assertIn(together,(2,3,4));self.assertIn(8-together,(4,5,6))
        a,b=schedule[0]['A'][0],schedule[0]['B'][0]
        s['final']['players'][a]['results'][0]='L';s['final']['players'][b]['results'][0]='W'
        self.assertFalse(evaluate(s)['final']['ready'])  # Still 3 W / 3 L, but wrong teams.
    def test_tenth_game_and_migration(self):
        s=fixture();before=evaluate(s)['final']['rows'][0]['total']
        s['final']['players']['p1']['goals'][7]+=1
        self.assertEqual(evaluate(s)['final']['rows'][0]['total'],before+1.5)
        old=legacy_fixture(1)
        for p in old['final']['players'].values():p['goals']=p['goals'][:5];p['results']=p['results'][:5]
        original=deepcopy(old);new=validate(old)
        self.assertEqual(old,original);self.assertEqual(new['legacy_final']['final'],original['final'])
        self.assertEqual(new['legacy_round2']['round2'],old['round2']);self.assertEqual(new['settings']['win_points'],1)
        self.assertEqual(new['final']['players']['p1']['goals'],[None]*8)
        self.assertEqual(validate(new),new)

    def test_round2_five_varied_four_vs_four_games(self):
        s=Draws().fresh()
        s=round2_draw_action(s,'start')
        roster=s['round2']['roster'];schedule=round2_schedule(s['round2']['draw'])
        self.assertEqual(len(schedule),5)
        self.assertEqual([m['game'] for m in schedule],[1,2,3,4,5])
        pairs=set()
        for game in schedule:
            self.assertEqual((len(game['A']),len(game['B'])),(4,4))
            self.assertEqual(set(game['A']+game['B']),set(roster))
            self.assertNotIn('sit',game)
            pairs.add(frozenset((frozenset(game['A']),frozenset(game['B']))))
        self.assertGreaterEqual(len(pairs),4)
        for p in roster:
            self.assertEqual(sum(p in g['A']+g['B'] for g in schedule),5)
        self.assertEqual(validate(s),s)
    def test_round2_overall_cut_tie_and_extras(self):
        # Approved boundary-bubble model: extra goals FOLD into the tied players'
        # total/average and only the 6th/7th bubble re-ranks. With p4 and p8 tied
        # at avg 1/5, giving BOTH an extra game where p8 outscores p4 overtakes
        # the previously-advancing p4. (Old lexicographic model expected a TIE
        # until every tied player had scored; the fold model resolves on average.)
        s=cut_tie_state('round2')
        v=evaluate(s)['round2'];self.assertEqual(v['survivors'],[])
        self.assertEqual({r['id'] for r in v['rows'] if r['status']==TIE},{'p4','p8'})
        e=dict.fromkeys(IDS);e['p8']=3;e['p4']=1;s['round2']['extras']=[e];v=evaluate(s)['round2']
        self.assertTrue(v['complete'])
        self.assertIn('p8',v['survivors']);self.assertNotIn('p4',v['survivors'])
        p8=next(r for r in v['rows'] if r['id']=='p8');p4=next(r for r in v['rows'] if r['id']=='p4')
        self.assertEqual((p8['goals'],p8['played']),(4,6));self.assertAlmostEqual(p8['average'],4/6)
        self.assertEqual((p4['goals'],p4['played']),(2,6));self.assertAlmostEqual(p4['average'],2/6)
        self.assertEqual(p8['status'],'ADVANCE');self.assertEqual(p4['status'],'CUT')
        # A clear top advancer is never disturbed by the bubble recompute.
        p1=next(r for r in v['rows'] if r['id']=='p1')
        self.assertEqual((p1['status'],p1['rank'],p1['played'],p1['average']),('ADVANCE',1,5,2/5))
    def test_round2_fifth_match_required_and_team_goal_limit(self):
        s=fixture();schedule=evaluate(s)['round2']['schedule'];p=schedule[4]['A'][0]
        s['round2']['players'][p]['goals'][4]=None
        self.assertFalse(evaluate(s)['round2']['complete'])
        s=fixture();p=schedule[0]['A'][0]
        s['round2']['players'][p]['goals'][0]=999
        self.assertIn('score_error',evaluate(s)['round2']['games'][0])
        self.assertFalse(evaluate(s)['round2']['complete'])
        with self.assertRaises(ValueError):validate(s)
    def test_legacy_round2_archive_and_current_save_preservation(self):
        old=legacy_fixture();old['settings']['goal_points']=2;old['wheel']['text']='A\nB'
        original=deepcopy(old);new=validate(old)
        self.assertEqual(old,original);self.assertEqual(new['version'],6)
        self.assertEqual(new['legacy_round2']['round2'],old['round2'])
        self.assertEqual(new['legacy_round2']['final'],old['final'])
        for k in ['round1','names','settings','wheel']:self.assertEqual(new[k],old[k])
        self.assertEqual(new['round2']['players']['p1']['goals'],[None]*5)
        self.assertEqual(new['final']['players']['p1']['goals'],[None]*8)
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

    def test_removed_name_wheel_backward_compat(self):
        """The Name wheel UI is gone, but old backups carrying a populated `wheel`
        object must still load, and fresh state must still carry the inert default."""
        import json
        # A fresh state carries the inert wheel default and validates at schema v4.
        fresh=new_state()
        self.assertEqual(fresh['wheel'],{'text':'','remove_winner':False})
        self.assertEqual(validate(deepcopy(fresh))['version'],6)
        # An old backup with a populated wheel object survives a JSON round-trip,
        # validate() and evaluate() without the wheel being stripped or rejected.
        s=new_state()
        s['names']={p:'Player '+str(i+1) for i,p in enumerate(IDS)}
        s['wheel']={'text':'Aaron\nGhost\nJay','remove_winner':True}
        roundtripped=json.loads(json.dumps(s))
        validated=validate(roundtripped)
        self.assertEqual(validated['wheel'],{'text':'Aaron\nGhost\nJay','remove_winner':True})
        self.assertEqual(validated['version'],6)
        evaluate(validated)  # Must not raise with a populated legacy wheel present.
        # A backup missing the `wheel` key entirely still validates, defaulting the
        # inert wheel block (proves validate() tolerates absence, not just presence).
        no_wheel=json.loads(json.dumps(s));del no_wheel['wheel']
        self.assertNotIn('wheel',no_wheel)
        defaulted=validate(no_wheel)
        self.assertEqual(defaulted['wheel'],{'text':'','remove_winner':False})

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
        s=fixture();s['round2']['players']['p1']['goals'][0]=None;self.assertFalse(evaluate(s)['round2']['complete'])

class Draws(unittest.TestCase):
    def fresh(self):
        s=fixture(False);s['round2']=blank_round(5,is_round2=True);s['final']=new_state()['final'];return bind_rosters(s)
    def test_fixed_random_draw_five_matches_and_repeat_clicks(self):
        s=self.fresh();original=deepcopy(s);roster=evaluate(s)['round1']['survivors']
        with patch('engine.secrets.SystemRandom.shuffle',side_effect=lambda a:a.reverse()) as shuffle:
            s=round2_draw_action(s,'start');shuffle.assert_called()
        self.assertEqual(original['round2']['draw']['order'],[])
        self.assertEqual(s['round2']['draw']['order'],list(reversed(roster)))
        self.assertEqual(round2_draw_action(s,'start'),s)
        draw_order=s['round2']['draw']['order'].copy()
        initial_lineups=deepcopy(evaluate(s)['round2']['schedule'])
        self.assertGreater(len({frozenset(map(frozenset,(m['A'],m['B']))) for m in initial_lineups}),1)
        for game in range(1,6):
            v=evaluate(s)['round2'];g=v['schedule'][game-1]
            self.assertEqual(v['draw']['revealed'],game)
            self.assertEqual(g['A'],initial_lineups[game-1]['A']);self.assertEqual(g['B'],initial_lineups[game-1]['B'])
            with self.assertRaises(ValueError):round2_draw_action(s,'done',game)
            for team in ['A','B']:
                eligible=[p for p in g[team] if p not in ['p4','p9']]
                limit=3 if team=='A' else 2
                scorers=[eligible[(game-1+j)%len(eligible)] for j in range(min(limit,len(eligible)))]
                for p in g[team]:s['round2']['players'][p]['goals'][game-1]=int(p in scorers)
            s=round2_draw_action(s,'done',game)
            self.assertEqual(s['round2']['draw']['order'],draw_order)
            with self.assertRaises(ValueError):round2_draw_action(s,'done',game)
            self.assertEqual(validate(json.loads(json.dumps(s))),s)
        self.assertTrue(evaluate(s)['round2']['complete'])
        self.assertTrue(all(r['played']==5 for r in evaluate(s)['round2']['rows']))
        self.assertEqual(len(evaluate(s)['round2']['survivors']),6)
        with self.assertRaises(ValueError):round2_draw_action(s,'done',6)
    def test_round2_reshuffle_only_current_unscored_match(self):
        s=round2_draw_action(self.fresh(),'start')
        before=deepcopy(s['round2']['draw']['lineups'])
        with self.assertRaises(ValueError):round2_draw_action(s,'reroll',2)
        with self.assertRaises(ValueError):round2_draw_action(s,'reroll',0)
        rerolled=round2_draw_action(s,'reroll',1)
        self.assertNotEqual({frozenset(rerolled['round2']['draw']['lineups'][0]['A']),
                             frozenset(rerolled['round2']['draw']['lineups'][0]['B'])},
                            {frozenset(before[0]['A']),frozenset(before[0]['B'])})
        self.assertEqual(rerolled['round2']['draw']['lineups'][1:],before[1:])
        self.assertEqual(s['round2']['draw']['lineups'],before)
        p=rerolled['round2']['draw']['lineups'][0]['A'][0]
        rerolled['round2']['players'][p]['goals'][0]=0
        with self.assertRaises(ValueError):round2_draw_action(rerolled,'reroll',1)
        self.assertEqual(validate(rerolled),rerolled)
    def test_version5_saved_scores_survive_upgrade(self):
        s=fixture();s['version']=5
        s['round2']['draw'].pop('lineups')
        old=deepcopy(s);new=validate(s)
        self.assertEqual(s,old)
        self.assertEqual(new['version'],6)
        self.assertEqual(new['round2']['players'],old['round2']['players'])
        self.assertEqual(new['final'],old['final'])
        self.assertEqual(new['round2']['draw']['lineups'][0]['A'],old['round2']['draw']['order'][:4])
        self.assertEqual(new['round2']['draw']['lineups'][0]['B'],old['round2']['draw']['order'][4:])
        self.assertEqual(validate(new),new)
    def test_draw_guards_and_archives_old_rotations(self):
        with self.assertRaises(ValueError):round2_draw_action(new_state(),'start')
        s=self.fresh()
        with self.assertRaises(ValueError):round2_draw_action(s,'done',1)
        s=round2_draw_action(s,'start')
        with self.assertRaises(ValueError):round2_draw_action(s,'done',2)
        old=fixture();old['version']=4
        for p in old['round2']['players']:
            old['round2']['players'][p]['goals'] += [0]*3
        old['round2']['draw']['revealed']=8;old['round2']['draw']['completed']=8
        original=deepcopy(old);upgraded=validate(old)
        self.assertEqual(old,original)
        self.assertEqual(upgraded['version'],6)
        self.assertEqual(upgraded['legacy_round2_rotation']['round2'],old['round2'])
        self.assertEqual(upgraded['legacy_round2_rotation']['final'],old['final'])
        self.assertEqual(upgraded['round2']['players']['p1']['goals'],[None]*5)
        self.assertEqual(upgraded['round2']['draw']['order'],[])
        self.assertEqual(upgraded['final']['players']['p1']['goals'],[None]*8)
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
