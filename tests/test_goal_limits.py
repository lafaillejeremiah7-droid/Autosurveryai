import json
import tempfile
import unittest
from copy import deepcopy
from pathlib import Path
from app import Store
from engine import evaluate, stage_schedules, validate_goal_changes
from test_tournament import fixture


class GoalLimits(unittest.TestCase):
    def match(self,key):
        s=fixture();teams=stage_schedules(s)[key][0]
        for p in teams['A']+teams['B']:s[key]['players'][p]['goals'][0]=0
        return s,teams

    def test_team_totals_and_no_three_three_in_every_round(self):
        for key in ['round1','round2','final']:
            with self.subTest(round=key):
                s,t=self.match(key);a,b=t['A'],t['B'];players=s[key]['players']
                players[a[0]]['goals'][0]=2;players[a[1]]['goals'][0]=1
                players[b[0]]['goals'][0]=2
                validate_goal_changes(s)  # 2+1 versus 2 is legal.
                players[b[1]]['goals'][0]=1
                with self.assertRaisesRegex(ValueError,'Both teams cannot reach 3'):validate_goal_changes(s)
                players[b[1]]['goals'][0]=0;players[a[2]]['goals'][0]=1
                with self.assertRaisesRegex(ValueError,'at most 3'):validate_goal_changes(s)

    def test_corrections_unlock_opponents_and_blank_is_not_zero(self):
        for key in ['round1','round2','final']:
            with self.subTest(round=key):
                s,t=self.match(key);players=s[key]['players'];a,b=t['A'][0],t['B'][0]
                players[a]['goals'][0]=3;players[b]['goals'][0]=2;validate_goal_changes(s)
                players[a]['goals'][0]=2;players[b]['goals'][0]=3;validate_goal_changes(s)
                players[a]['goals'][0]=None;validate_goal_changes(s)
                self.assertIsNone(s[key]['players'][a]['goals'][0])

    def test_single_player_cannot_exceed_three(self):
        for key in ['round1','round2','final']:
            s,t=self.match(key);s[key]['players'][t['A'][0]]['goals'][0]=4
            with self.subTest(round=key),self.assertRaises(ValueError):validate_goal_changes(s)

    def test_server_save_rejects_invalid_score_and_keeps_disk(self):
        with tempfile.TemporaryDirectory() as tmp:
            store=Store(Path(tmp)/'data.json');s,t=self.match('round1')
            s['round1']['players'][t['A'][0]]['goals'][0]=3
            s['round1']['players'][t['B'][0]]['goals'][0]=2
            store.save(s,allow_draw=True);disk=store.path.read_bytes();revision=store.revision
            bad=deepcopy(s);bad['round1']['players'][t['B'][1]]['goals'][0]=1
            with self.assertRaises(ValueError):store.save(bad)
            with self.assertRaises(ValueError):store.save(bad,allow_draw=True,restore=True)
            self.assertEqual(store.revision,revision);self.assertEqual(store.path.read_bytes(),disk)

    def test_old_invalid_goals_load_and_can_be_repaired_without_erasure(self):
        with tempfile.TemporaryDirectory() as tmp:
            s,t=self.match('round1');a=t['A'][0];s['round1']['players'][a]['goals'][0]=5
            path=Path(tmp)/'old.json';path.write_text(json.dumps(s),encoding='utf-8');store=Store(path)
            self.assertEqual(store.state['round1']['players'][a]['goals'][0],5)
            self.assertFalse(store.payload()['view']['round1']['complete'])
            self.assertIn('at most 3',store.payload()['view']['round1']['games'][0]['score_error'])
            for value in [4,3]:
                fixed=deepcopy(store.state);fixed['round1']['players'][a]['goals'][0]=value;store.save(fixed)
            self.assertEqual(store.state['round1']['players'][a]['goals'][0],3)
            self.assertTrue(store.payload()['view']['round1']['games'][0]['ready'])

    def test_each_extra_game_player_is_limited_to_three(self):
        for key in ['round1','round2','final']:
            s=fixture();s[key]['extras']=[{p:({'goals':None,'result':''} if key=='final' else None) for p in s['names']}]
            s[key]['extras'][0]['p1']={'goals':4,'result':'W'} if key=='final' else 4
            with self.subTest(round=key),self.assertRaises(ValueError):validate_goal_changes(s)


if __name__=='__main__':unittest.main()
