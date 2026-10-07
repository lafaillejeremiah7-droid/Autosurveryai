"""Regression cases for corrections made after the first full tournament run."""
import json
import tempfile
import unittest
from pathlib import Path
from engine import IDS, TIE, evaluate, validate
from app import Store
from test_tournament import fixture, spread


class Regressions(unittest.TestCase):
    def test_partial_extra_keeps_each_cut_tied(self):
        for key,first,second in [('round1','p5','p9'),('round2','p4','p8')]:
            with self.subTest(round=key):
                s=fixture()
                if key=='round1':s[key]['players'][first]['goals']=spread(6)
                else:s[key]['players'][first]['goals']=[3 if g is not None else None for g in s[key]['players'][first]['goals']]
                e=dict.fromkeys(IDS);e[first]=10;s[key]['extras']=[e]
                v=evaluate(s)[key]
                self.assertFalse(v['complete']);self.assertEqual(v['survivors'],[])
                self.assertEqual({r['id'] for r in v['rows'] if r['status']==TIE},{first,second})
                # A later filled game must not bypass an earlier missing score.
                s[key]['extras'].append({**dict.fromkeys(IDS),first:5,second:0})
                self.assertFalse(evaluate(s)[key]['complete'])
                e[second]=0
                self.assertTrue(evaluate(s)[key]['complete'])

    def test_partial_final_extra_withholds_prizes_and_counts_points(self):
        s=fixture();s['settings']['win_points']=0;s['final']['players']['p2']['goals']=[5]*10
        e={p:{'goals':None,'result':''} for p in IDS}
        e['p1']={'goals':2,'result':'W'};s['final']['extras']=[e]
        v=evaluate(s)['final'];rows={r['id']:r for r in v['rows']}
        self.assertFalse(v['complete'])
        for p in ['p1','p2']:
            self.assertEqual(rows[p]['status'],TIE);self.assertIsNone(rows[p]['prize'])
        p1=rows['p1']
        self.assertEqual((p1['goals'],p1['played'],p1['wins']),(52,11,11))
        self.assertEqual(p1['total'],p1['win_points']+p1['goal_points'])
        e['p2']={'goals':0,'result':''}
        self.assertFalse(evaluate(s)['final']['complete'])
        e['p2']['result']='L'
        self.assertTrue(evaluate(s)['final']['complete'])
        self.assertEqual(evaluate(s)['awarded'],30)

    def test_later_extra_does_not_displace_a_settled_cut_player(self):
        s=fixture()
        for p in ['p8','p9','p5']:s['round1']['players'][p]['goals']=spread(6)
        s['round1']['extras']=[{**dict.fromkeys(IDS),'p8':4,'p9':0,'p5':0},
                               {**dict.fromkeys(IDS),'p9':100,'p5':1}]
        v=evaluate(s)['round1'];rows={r['id']:r for r in v['rows']}
        self.assertTrue(v['complete'])
        self.assertEqual((rows['p8']['rank'],rows['p8']['played']),(7,6))
        self.assertEqual((rows['p9']['rank'],rows['p9']['played']),(8,7))
        self.assertEqual(rows['p5']['status'],'CUT')

    def test_later_final_extra_keeps_first_place_and_components(self):
        s=fixture();s['settings']['win_points']=0
        for p in ['p2','p3']:s['final']['players'][p]['goals']=[5]*10
        def extra(scores):return {p:{'goals':scores.get(p),'result':'L' if p in scores else ''} for p in IDS}
        s['final']['extras']=[extra({'p1':4,'p2':0,'p3':0}),extra({'p2':100,'p3':1})]
        v=evaluate(s)['final'];rows={r['id']:r for r in v['rows']}
        self.assertTrue(v['complete'])
        self.assertEqual((rows['p1']['rank'],rows['p1']['prize'],rows['p1']['played']),(1,18,11))
        self.assertEqual((rows['p2']['rank'],rows['p2']['prize'],rows['p2']['played']),(2,8,12))
        for row in v['rows']:self.assertEqual(row['total'],row['win_points']+row['goal_points'])

    def test_startup_persists_new_and_migrated_lineups(self):
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'state.json';first=Store(path)
            self.assertTrue(path.exists());self.assertEqual(first.revision,0)
            self.assertEqual(Store(path).state,first.state)
            s=fixture();s['round1'].pop('lineups');s['names']['p1']='Jay 🏒'
            path.write_text(json.dumps(s,ensure_ascii=False),encoding='utf-8')
            loaded=Store(path)
            self.assertEqual(Store(path).state,loaded.state)
            self.assertEqual(loaded.state['names']['p1'],'Jay 🏒')
            self.assertEqual(validate(json.loads(path.read_text(encoding='utf-8'))),loaded.state)


if __name__=='__main__':unittest.main()
