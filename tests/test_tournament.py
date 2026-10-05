import json, tempfile, threading, unittest
from copy import deepcopy
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from engine import IDS, TIE, new_state, validate, evaluate, bind_rosters, order_groups
from app import Store, make_server

def fixture(final=True):
    s=new_state();s['names']={p:'Player '+str(i+1) for i,p in enumerate(IDS)}
    for i,p in enumerate(IDS):s['round1']['players'][p]={'team':'A' if i<5 else 'B','goals':[4-i%5]*5}
    v=evaluate(s);players=v['round1']['survivors']
    for i,p in enumerate(players):s['round2']['players'][p]={'team':'A' if i<4 else 'B','goals':[None if i%4==g%4 else 4-i%4 for g in range(5)]}
    bind_rosters(s)
    if final:
        for i,p in enumerate(evaluate(s)['round2']['survivors']):s['final']['players'][p]={'goals':[5-i]*5,'results':['W' if i<3 else 'L']*5}
    return bind_rosters(s)

class Rules(unittest.TestCase):
    def test_blank(self):
        v=evaluate(new_state());self.assertFalse(v['round1']['complete']);self.assertEqual(v['round2']['rows'],[])
        self.assertTrue(all(r['average']==0 and r['played']==0 for r in v['round1']['rows']))
    def test_full_tournament(self):
        s=fixture();v=evaluate(s)
        self.assertEqual(v['round1']['survivors'],['p1','p2','p3','p4','p6','p7','p8','p9'])
        self.assertEqual(v['round2']['survivors'],['p1','p2','p3','p6','p7','p8'])
        self.assertEqual([r['prize'] for r in v['final']['rows']],[18,8,4,0,0,0]);self.assertEqual(v['awarded'],30)
        first=v['final']['rows'][0];self.assertEqual(first['win_points'],10.5);self.assertEqual(first['goal_points'],52.5);self.assertEqual(first['total'],63)
        self.assertEqual(first['game_points'],[18,18,9,9,9])
    def test_blank_zero_and_fresh_average(self):
        s=fixture();r=evaluate(s)['round2']['rows'][0];self.assertEqual((r['played'],r['average']),(3,4))
        s['round2']['players']['p1']['goals'][1]=0;r=evaluate(s)['round2']['rows'][0]
        self.assertEqual(r['played'],3);self.assertAlmostEqual(r['average'],8/3)
        s['round2']['players']['p1']['goals'][1]=None;r=evaluate(s)['round2']['rows'][0];self.assertEqual(r['played'],2)
    def test_cut_tie_and_incomplete_extra(self):
        s=fixture();s['round1']['players']['p4']['goals']=[0]*5
        v=evaluate(s);self.assertEqual(v['round1']['rows'][3]['status'],TIE);self.assertEqual(v['round1']['survivors'],[])
        e=dict.fromkeys(IDS);e['p4']=1;s['round1']['extras']=[e];self.assertFalse(evaluate(s)['round1']['complete'])
        e['p5']=0;self.assertTrue(evaluate(s)['round1']['complete'])
    def test_multigame_tie_preserves_resolved_positions(self):
        group=order_groups(['a','b','c'],dict(a=5,b=5,c=5),[dict(a=2,b=0,c=0),dict(b=4,c=3)])
        self.assertEqual(group,[['a'],['b'],['c']])
    def test_final_podium_tie(self):
        s=fixture();s['final']['players']['p2']['goals']=[5]*5;v=evaluate(s)
        self.assertEqual([r['status'] for r in v['final']['rows'][:2]],[TIE,TIE]);self.assertIsNone(v['final']['rows'][0]['prize'])
        e={p:{'goals':None,'result':''} for p in IDS};e['p1']={'goals':0,'result':'W'};e['p2']={'goals':0,'result':'L'};s['final']['extras']=[e]
        self.assertEqual(evaluate(s)['final']['rows'][0]['prize'],18)
    def test_third_fourth_tie_and_nonpodium_tie(self):
        s=fixture();s['settings']['win_points']=0;s['final']['players']['p6']['goals']=[3]*5
        v=evaluate(s);self.assertEqual(v['final']['rows'][2]['status'],TIE);self.assertEqual(v['final']['rows'][3]['status'],TIE)
        s=fixture();s['final']['players']['p8']['goals']=[1]*5;v=evaluate(s);self.assertTrue(v['final']['complete'])
    def test_multiplier_setting_and_paired_inputs(self):
        s=fixture();s['settings']['multiplier']=3;v=evaluate(s);self.assertEqual(v['final']['rows'][0]['total'],81)
        s['final']['players']['p1']['results'][0]='';r=next(r for r in evaluate(s)['final']['rows'] if r['id']=='p1')
        self.assertEqual(r['total'],54);self.assertIsNone(r['prize'])
    def test_names_and_validation(self):
        s=fixture();s['names']['p2']=' player 1 ';self.assertFalse(evaluate(s)['names_ok'])
        for invalid in [-1,1.5,True,float('nan'),'2']:
            s=fixture();s['round1']['players']['p1']['goals'][0]=invalid
            with self.assertRaises(ValueError):validate(s)
    def test_roster_change_and_rename(self):
        s=fixture();s['names']['p1']='New name';self.assertFalse(evaluate(s)['round2']['stale'])
        s['round1']['players']['p5']['goals']=[8]*5;v=evaluate(s);self.assertTrue(v['round2']['stale']);self.assertFalse(v['round2']['complete'])
    def test_incorrect_team_counts(self):
        s=fixture();s['round1']['players']['p5']['team']='B';self.assertFalse(evaluate(s)['round1']['complete'])
        s=fixture();s['round2']['players']['p1']['goals'][0]=0;self.assertFalse(evaluate(s)['round2']['complete'])

class HTTP(unittest.TestCase):
    def test_persistence_and_revision_conflict(self):
        with tempfile.TemporaryDirectory() as d:
            path=Path(d)/'data.json';store=Store(path);server=make_server(store,0);thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
            url=f'http://127.0.0.1:{server.server_port}'
            try:
                data=json.load(urlopen(url+'/api/state'));headers={'Content-Type':'application/json','X-Session-Token':data['token']}
                body=json.dumps({'revision':0,'state':fixture()}).encode();req=Request(url+'/api/state',data=body,headers=headers,method='PUT')
                result=json.load(urlopen(req));self.assertEqual(result['revision'],1);self.assertEqual(evaluate(Store(path).state)['awarded'],30)
                with self.assertRaises(HTTPError) as cm:urlopen(req)
                self.assertEqual(cm.exception.code,409)
                self.assertEqual(json.load(urlopen(url+'/api/backup')),store.state)
                self.assertIn(b'Player 1',urlopen(url+'/api/standings.csv').read())
                req=Request(url+'/api/state',data=body,method='PUT')
                with self.assertRaises(HTTPError) as cm:urlopen(req)
                self.assertEqual(cm.exception.code,403)
            finally:server.shutdown();server.server_close();thread.join()

if __name__=='__main__':unittest.main()
