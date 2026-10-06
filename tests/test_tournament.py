import json, tempfile, threading, unittest
from copy import deepcopy
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from engine import IDS, TIE, new_state, validate, evaluate, bind_rosters, order_groups, final_schedule
from app import Store, make_server

def fixture(final=True):
    s=new_state();s['names']={p:'Player '+str(i+1) for i,p in enumerate(IDS)}
    for i,p in enumerate(IDS):s['round1']['players'][p]={'team':'A' if i<5 else 'B','goals':[4-i%5]*5}
    v=evaluate(s);players=v['round1']['survivors']
    for i,p in enumerate(players):s['round2']['players'][p]={'team':'A' if i<4 else 'B','goals':[None if i%4==g%4 else 4-i%4 for g in range(5)]}
    bind_rosters(s)
    if final:
        roster=evaluate(s)['round2']['survivors']
        for i,p in enumerate(roster):s['final']['players'][p]={'goals':[5-i]*10,'results':['W' if p in g['A'] else 'L' for g in final_schedule(roster)]}
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
        first=v['final']['rows'][0];self.assertEqual(first['win_points'],12);self.assertEqual(first['goal_points'],90);self.assertEqual(first['total'],102)
        self.assertEqual(first['game_points'],[17,17]+[8.5]*8)
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
        s=fixture();s['settings']['win_points']=0;s['final']['players']['p2']['goals']=[5]*10;v=evaluate(s)
        self.assertEqual([r['status'] for r in v['final']['rows'][:2]],[TIE,TIE]);self.assertIsNone(v['final']['rows'][0]['prize'])
        e={p:{'goals':None,'result':''} for p in IDS};e['p1']={'goals':1,'result':'W'};e['p2']={'goals':0,'result':'L'};s['final']['extras']=[e]
        self.assertEqual(evaluate(s)['final']['rows'][0]['prize'],18)
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
        old=deepcopy(s);old['version']=1
        for p in old['final']['players'].values():p['goals']=p['goals'][:5];p['results']=p['results'][:5]
        original=deepcopy(old);new=validate(old)
        self.assertEqual(old,original);self.assertEqual(new['legacy_final']['final'],original['final'])
        self.assertEqual(new['round2'],old['round2']);self.assertEqual(new['settings']['win_points'],1)
        self.assertEqual(new['final']['players']['p1']['goals'],[None]*10)
        self.assertEqual(validate(new),new)

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
        s=fixture();s['round1']['players']['p5']['team']='B';self.assertFalse(evaluate(s)['round1']['complete'])
        s=fixture();s['round2']['players']['p1']['goals'][0]=0;self.assertFalse(evaluate(s)['round2']['complete'])

class HTTP(unittest.TestCase):
    def test_persistence_and_revision_conflict(self):
        with tempfile.TemporaryDirectory() as d:
            path=Path(d)/'data.json';store=Store(path);server=make_server(store,0);thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
            url=f'http://127.0.0.1:{server.server_port}'
            try:
                data=json.load(urlopen(url+'/api/state'));headers={'Content-Type':'application/json','X-Session-Token':data['token']}
                data_state=fixture();data_state['wheel']['text']='Aaron\nGhost\nJay'
                body=json.dumps({'revision':0,'state':data_state}).encode();req=Request(url+'/api/state',data=body,headers=headers,method='PUT')
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
